const { app, BrowserWindow, ipcMain, dialog, Menu, shell, screen } = require('electron');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { pathToFileURL } = require('url');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const { spawn, execFile } = require('child_process');
const { rewriteForWindows, parseStrings } = require('./buildtools');

const IGNORED_DIRS = new Set(['.build', '.git', '.swiftpm', 'node_modules', '.vs', '.vscode', '.idea']);

// the app was renamed (SwiftCode → WinSwift Studio): keep settings, recent projects and the built runtime where they were
app.setName('WinSwift Studio');
app.setPath('userData', path.join(app.getPath('appData'), 'SwiftCode'));

let win = null;
let toolEnv = null;          // process env refreshed from the registry (new installs show up without a reboot)
let job = null;              // { proc, kind: 'build' | 'run' }
let watcher = null;

// ---------------------------------------------------------------- state

const stateFile = () => path.join(app.getPath('userData'), 'state.json');

function loadState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return {}; }
}

function saveState(patch) {
  const s = { ...loadState(), ...patch };
  try {
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
    fs.writeFileSync(stateFile(), JSON.stringify(s, null, 2));
  } catch {}
  return s;
}

// ---------------------------------------------------------------- toolchain / env

function readRegistryEnv() {
  const ps = "$o=@{m=[Environment]::GetEnvironmentVariables('Machine');u=[Environment]::GetEnvironmentVariables('User')};$o|ConvertTo-Json -Compress -Depth 3";
  return new Promise(resolve => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps],
      { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
        if (err) return resolve(null);
        try { resolve(JSON.parse(stdout)); } catch { resolve(null); }
      });
  });
}

function globDirs(base, sub) {
  // base/<any>/sub  for every child of base
  const out = [];
  try {
    for (const d of fs.readdirSync(base)) {
      const p = path.join(base, d, sub);
      if (fs.existsSync(p)) out.push(p);
    }
  } catch {}
  return out.sort().reverse();
}

function knownSwiftDirs() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const roots = [
    path.join(local, 'Programs', 'Swift'),
    'C:\\Program Files\\Swift',
    'C:\\Library',
  ];
  const dirs = [];
  for (const r of roots) {
    dirs.push(...globDirs(path.join(r, 'Toolchains'), 'usr\\bin'));
    dirs.push(...globDirs(path.join(r, 'Runtimes'), 'usr\\bin'));
    dirs.push(...globDirs(path.join(r, 'Developer', 'Toolchains'), 'usr\\bin'));
  }
  return dirs;
}

function knownSdkRoot() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  for (const r of [path.join(local, 'Programs', 'Swift'), 'C:\\Program Files\\Swift', 'C:\\Library\\Developer']) {
    const sdks = globDirs(path.join(r, 'Platforms'), 'Windows.platform\\Developer\\SDKs\\Windows.sdk');
    if (sdks.length) return sdks[0];
  }
  return null;
}

async function refreshEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) env[k] = v;
  const reg = await readRegistryEnv();
  const pathParts = [];
  if (reg) {
    for (const scope of [reg.m || {}, reg.u || {}]) {
      for (const [k, v] of Object.entries(scope)) {
        if (k.toLowerCase() === 'path') pathParts.push(String(v));
        else env[k] = String(v);
      }
    }
  }
  const procPath = Object.entries(process.env).find(([k]) => k.toLowerCase() === 'path');
  if (procPath) pathParts.push(procPath[1]);
  pathParts.push(...knownSwiftDirs());
  for (const k of Object.keys(env)) if (k.toLowerCase() === 'path') delete env[k];
  const seen = new Set();
  env.Path = pathParts.join(';').split(';').filter(p => {
    const key = p.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(';');
  if (!env.SDKROOT) {
    const sdk = knownSdkRoot();
    if (sdk) env.SDKROOT = sdk + '\\';
  }
  applyMsvcEnv(env);
  toolEnv = env;
  return env;
}

// Swift links against MSVC + the Windows SDK. When they aren't registered system-wide (e.g. the SDK was
// unpacked per-user by scripts/fetch-winsdk.js) we set up the same variables vcvars64.bat would.
function findMsvc() {
  const bases = ['C:\\Program Files (x86)\\Microsoft Visual Studio', 'C:\\Program Files\\Microsoft Visual Studio'];
  const found = [];
  for (const base of bases) {
    for (const ver of safeReaddir(base)) {
      for (const edition of safeReaddir(path.join(base, ver))) {
        const msvc = path.join(base, ver, edition, 'VC', 'Tools', 'MSVC');
        for (const v of safeReaddir(msvc)) {
          const dir = path.join(msvc, v);
          if (fs.existsSync(path.join(dir, 'lib', 'x64', 'msvcrt.lib'))) found.push(dir);
        }
      }
    }
  }
  return found.sort().pop() || null;
}

function findWindowsSdk() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  try {
    const j = JSON.parse(fs.readFileSync(path.join(local, 'SwiftCode', 'WinSDK', 'sdk.json'), 'utf8'));
    if (fs.existsSync(path.join(j.root, 'Include', j.version, 'ucrt'))) return j;
  } catch {}
  const root = 'C:\\Program Files (x86)\\Windows Kits\\10';
  const v = safeReaddir(path.join(root, 'Include')).filter(d => fs.existsSync(path.join(root, 'Include', d, 'ucrt')) && fs.existsSync(path.join(root, 'Lib', d, 'um', 'x64'))).sort().pop();
  return v ? { root, version: v } : null;
}

function safeReaddir(p) { try { return fs.readdirSync(p); } catch { return []; } }

let vfsOverlay = null;     // module-map overlay for a per-user SDK (the Swift installer can't patch it without admin)

function swiftFlags() {
  return vfsOverlay ? ['-vfsoverlay', vfsOverlay, '-Xcc', '-ivfsoverlay', '-Xcc', vfsOverlay] : [];
}

function writeOverlay(env, vc, sdk) {
  vfsOverlay = null;
  if (!env.SDKROOT) return;
  const share = path.join(env.SDKROOT, 'usr', 'share');
  if (!fs.existsSync(path.join(share, 'ucrt.modulemap'))) return;
  const inc = d => path.join(sdk.root, 'Include', sdk.version, d);
  const file = (name, src) => ({ name, type: 'file', 'external-contents': path.join(share, src) });
  const roots = [
    { name: inc('ucrt'), type: 'directory', contents: [file('module.modulemap', 'ucrt.modulemap')] },
    { name: inc('um'), type: 'directory', contents: [file('module.modulemap', 'winsdk_um.modulemap')] },
    { name: inc('shared'), type: 'directory', contents: [file('module.modulemap', 'winsdk_shared.modulemap')] },
    { name: path.join(vc, 'include'), type: 'directory', contents: [file('module.modulemap', 'vcruntime.modulemap'), file('vcruntime.apinotes', 'vcruntime.apinotes')] },
  ];
  const out = path.join(app.getPath('userData'), 'swift-overlay.yaml');
  fs.writeFileSync(out, JSON.stringify({ version: 0, 'case-sensitive': 'false', roots }, null, 2));
  vfsOverlay = out;
}

function applyMsvcEnv(env) {
  vfsOverlay = null;
  if (env.INCLUDE && env.LIB) return;
  const vc = findMsvc();
  const sdk = findWindowsSdk();
  if (!vc || !sdk) return;
  // lib.exe / link.exe are needed for static libraries (the SwiftUI runtime)
  const msvcBin = path.join(vc, 'bin', 'Hostx64', 'x64');
  if (fs.existsSync(msvcBin)) env.Path = msvcBin + ';' + env.Path;
  // a system-wide SDK already got its module maps from the Swift installer
  if (!sdk.root.toLowerCase().startsWith('c:\\program files')) writeOverlay(env, vc, sdk);
  const inc = d => path.join(sdk.root, 'Include', sdk.version, d);
  const lib = d => path.join(sdk.root, 'Lib', sdk.version, d, 'x64');
  env.INCLUDE = [path.join(vc, 'include'), inc('ucrt'), inc('um'), inc('shared'), inc('winrt'), inc('cppwinrt')].join(';');
  env.LIB = [path.join(vc, 'lib', 'x64'), lib('ucrt'), lib('um')].join(';');
  env.UniversalCRTSdkDir = sdk.root + '\\';
  env.UCRTVersion = sdk.version;
  env.WindowsSdkDir = sdk.root + '\\';
  env.WindowsSDKVersion = sdk.version + '\\';
  env.VCToolsInstallDir = vc + '\\';
  env.VSCMD_ARG_TGT_ARCH = 'x64';
}

function findOnPath(exe) {
  for (const dir of (toolEnv?.Path || '').split(';')) {
    const p = path.join(dir, exe);
    try { if (fs.statSync(p).isFile()) return p; } catch {}
  }
  return null;
}

async function toolchainInfo() {
  if (!toolEnv) await refreshEnv();
  const swiftc = findOnPath('swiftc.exe');
  if (!swiftc) return { found: false };
  return new Promise(resolve => {
    execFile(swiftc, ['--version'], { env: toolEnv, windowsHide: true }, (err, stdout, stderr) => {
      const text = (stdout || '') + (stderr || '');
      const m = text.match(/Swift version ([^\s]+)/);
      resolve({ found: true, path: swiftc, version: m ? m[1] : null, raw: text.trim(), sdk: toolEnv.SDKROOT || null });
    });
  });
}

// ---------------------------------------------------------------- filesystem

async function readTree(dir, depth = 0) {
  const node = { name: path.basename(dir), path: dir, type: 'dir', children: [] };
  if (depth > 12) return node;
  let entries = [];
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return node; }
  for (const e of entries) {
    if (e.name.startsWith('.') || IGNORED_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) node.children.push(await readTree(p, depth + 1));
    else if (e.isFile()) node.children.push({ name: e.name, path: p, type: 'file' });
  }
  node.children.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.type === 'dir' ? -1 : 1));
  return node;
}

async function collectFiles(root, filter) {
  const out = [];
  async function walk(dir) {
    let entries = [];
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') || IGNORED_DIRS.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile() && filter(p)) out.push(p);
    }
  }
  await walk(root);
  return out;
}

const TEXT_EXT = /\.(swift|md|txt|json|ya?ml|toml|plist|xml|html|css|js|ts|c|h|cpp|hpp|m|mm|py|sh|bat|ps1|cfg|ini|gitignore|resolved)$/i;

function watchProject(root) {
  if (watcher) { try { watcher.close(); } catch {} watcher = null; }
  if (!root) return;
  let timer = null;
  try {
    watcher = fs.watch(root, { recursive: true }, (_ev, file) => {
      if (!file) return;
      const top = String(file).split(/[\\/]/)[0];
      if (IGNORED_DIRS.has(top)) return;
      clearTimeout(timer);
      timer = setTimeout(() => { send('project:changed', root); lspFilesChanged(root); }, 250);
    });
  } catch {}
}

// ---------------------------------------------------------------- templates

function fileHeader(fileName, projectName) {
  const d = new Date();
  const date = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  let user = 'Me';
  try { user = os.userInfo().username; } catch {}
  return `//\n//  ${fileName}\n//  ${projectName}\n//\n//  Created by ${user} on ${date}.\n//\n\n`;
}

const EXAMPLE_FILES = {
  'main.swift': `import Foundation

print("Hello, World!")

let shapes: [Shape] = [
    Circle(radius: 2),
    Rectangle(width: 3, height: 4),
    Circle(radius: 0.5),
]

for shape in shapes {
    print("\\(shape.name): area = \\(String(format: "%.2f", shape.area))")
}

let total = shapes.map(\\.area).reduce(0, +)
print("Total area: \\(String(format: "%.2f", total))")

print("What's your name?", terminator: " ")
if let name = readLine(), !name.isEmpty {
    print("Nice to meet you, \\(name)! 👋")
}
`,
  'Shapes.swift': `import Foundation

protocol Shape {
    var name: String { get }
    var area: Double { get }
}

struct Circle: Shape {
    let radius: Double
    var name: String { "Circle" }
    var area: Double { .pi * radius * radius }
}

struct Rectangle: Shape {
    let width: Double
    let height: Double
    var name: String { "Rectangle" }
    var area: Double { width * height }
}
`,
};

async function createProject({ template, name, org, location }) {
  const safe = name.trim();
  const root = path.join(location, safe);
  if (fs.existsSync(root) && fs.readdirSync(root).length) throw new Error(`Folder "${root}" already exists and is not empty.`);
  await fsp.mkdir(root, { recursive: true });
  if (template === 'ios-app' || template === 'ios-sample') return createIOSProject(root, safe, org, template);
  if (template === 'package') {
    const ident = safe.replace(/[^A-Za-z0-9_]/g, '_');
    await fsp.writeFile(path.join(root, 'Package.swift'),
`// swift-tools-version: 5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "${safe}",
    targets: [
        .executableTarget(
            name: "${ident}",
            path: "Sources/${ident}"
        ),
    ]
)
`);
    const src = path.join(root, 'Sources', ident);
    await fsp.mkdir(src, { recursive: true });
    await fsp.writeFile(path.join(src, 'main.swift'), fileHeader('main.swift', safe) + 'print("Hello, World!")\n');
    return { root, open: path.join(src, 'main.swift') };
  }
  const group = path.join(root, safe);
  await fsp.mkdir(group, { recursive: true });
  if (template === 'example') {
    for (const [f, body] of Object.entries(EXAMPLE_FILES)) await fsp.writeFile(path.join(group, f), fileHeader(f, safe) + body);
  } else if (template === 'empty') {
    await fsp.writeFile(path.join(group, 'main.swift'), fileHeader('main.swift', safe));
  } else {
    await fsp.writeFile(path.join(group, 'main.swift'), fileHeader('main.swift', safe) + 'import Foundation\n\nprint("Hello, World!")\n');
  }
  await fsp.writeFile(path.join(root, '.swiftcode.json'), JSON.stringify({ name: safe, organization: org || '', bundleId: `${org || 'com.example'}.${safe}` }, null, 2));
  return { root, open: path.join(group, 'main.swift') };
}

function swiftIdentifier(name) {
  let n = name.replace(/[^A-Za-z0-9_]/g, '');
  if (!n || /^\d/.test(n)) n = 'My' + n;
  return n[0].toUpperCase() + n.slice(1);
}

const IOS_SAMPLE = {
  'ContentView.swift': `import SwiftUI

struct ContentView: View {
    var body: some View {
        TabView {
            TasksView()
                .tabItem { Label("Tasks", systemImage: "checklist") }
            CounterView()
                .tabItem { Label("Counter", systemImage: "plus.circle") }
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gear") }
        }
    }
}

#Preview {
    ContentView()
}
`,
  'TaskStore.swift': `import SwiftUI

struct TaskItem: Identifiable, Hashable {
    let id = UUID()
    var title: String
    var notes: String = ""
    var isDone = false
}

@Observable
class TaskStore {
    var tasks: [TaskItem] = [
        TaskItem(title: "Learn SwiftUI", notes: "Views, state and navigation"),
        TaskItem(title: "Build my first app", isDone: true),
        TaskItem(title: "Ship it to the App Store"),
    ]

    var remaining: Int { tasks.filter { !$0.isDone }.count }

    func add(_ title: String) {
        tasks.append(TaskItem(title: title))
    }
}
`,
  'TasksView.swift': `import SwiftUI

struct TasksView: View {
    @State private var store = TaskStore()
    @State private var newTitle = ""
    @State private var showingAlert = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        TextField("New task", text: $newTitle)
                            .onSubmit(addTask)
                        Button(action: addTask) {
                            Image(systemName: "plus.circle.fill")
                                .font(.title2)
                        }
                        .disabled(newTitle.isEmpty)
                    }
                }
                Section("\\(store.remaining) remaining") {
                    ForEach($store.tasks) { $task in
                        NavigationLink {
                            TaskDetailView(task: $task)
                        } label: {
                            HStack {
                                Image(systemName: task.isDone ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(task.isDone ? .green : .secondary)
                                Text(task.title)
                                    .strikethrough(task.isDone)
                            }
                        }
                    }
                    .onDelete { store.tasks.remove(atOffsets: $0) }
                }
            }
            .navigationTitle("Tasks")
            .toolbar {
                Button("Clear") { showingAlert = true }
            }
            .alert("Remove finished tasks?", isPresented: $showingAlert) {
                Button("Remove", role: .destructive) { store.tasks.removeAll { $0.isDone } }
                Button("Cancel", role: .cancel) {}
            }
        }
    }

    func addTask() {
        guard !newTitle.isEmpty else { return }
        store.add(newTitle)
        newTitle = ""
    }
}

struct TaskDetailView: View {
    @Binding var task: TaskItem

    var body: some View {
        Form {
            TextField("Title", text: $task.title)
            Toggle("Done", isOn: $task.isDone)
            Section("Notes") {
                TextField("Notes", text: $task.notes, axis: .vertical)
            }
        }
        .navigationTitle(task.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    TasksView()
}
`,
  'CounterView.swift': `import SwiftUI

struct CounterView: View {
    @State private var count = 0
    @State private var step = 1

    var body: some View {
        VStack(spacing: 24) {
            Text("\\(count)")
                .font(.system(size: 96, weight: .bold, design: .rounded))
                .foregroundStyle(count >= 0 ? .blue : .red)

            Stepper("Step: \\(step)", value: $step, in: 1...10)
                .padding(.horizontal, 40)

            HStack(spacing: 16) {
                Button {
                    count -= step
                } label: {
                    Image(systemName: "minus")
                        .frame(width: 60, height: 44)
                }
                .buttonStyle(.bordered)

                Button {
                    count += step
                } label: {
                    Image(systemName: "plus")
                        .frame(width: 60, height: 44)
                }
                .buttonStyle(.borderedProminent)
            }

            Button("Reset", role: .destructive) { count = 0 }
        }
    }
}

#Preview {
    CounterView()
}
`,
  'SettingsView.swift': `import SwiftUI

struct SettingsView: View {
    @AppStorage("username") private var username = ""
    @State private var notifications = true
    @State private var volume = 0.5
    @State private var theme = 0

    var body: some View {
        NavigationStack {
            Form {
                Section("Profile") {
                    TextField("Your name", text: $username)
                    if !username.isEmpty {
                        Text("Hello, \\(username)! 👋")
                    }
                }
                Section("Preferences") {
                    Toggle("Notifications", isOn: $notifications)
                    Picker("Theme", selection: $theme) {
                        Text("System").tag(0)
                        Text("Light").tag(1)
                        Text("Dark").tag(2)
                    }
                    HStack {
                        Image(systemName: "speaker.fill")
                        Slider(value: $volume)
                        Image(systemName: "speaker.wave.3.fill")
                    }
                }
                Section {
                    Link("Swift documentation", destination: URL(string: "https://www.swift.org/documentation/")!)
                }
            }
            .navigationTitle("Settings")
        }
        .preferredColorScheme(theme == 1 ? .light : theme == 2 ? .dark : nil)
    }
}

#Preview {
    SettingsView()
}
`,
};

async function createIOSProject(root, name, org, template) {
  const ident = swiftIdentifier(name);
  const group = path.join(root, name);
  await fsp.mkdir(group, { recursive: true });
  await fsp.writeFile(path.join(group, `${ident}App.swift`), fileHeader(`${ident}App.swift`, name) +
`import SwiftUI

@main
struct ${ident}App: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
`);
  if (template === 'ios-sample') {
    for (const [f, body] of Object.entries(IOS_SAMPLE)) await fsp.writeFile(path.join(group, f), fileHeader(f, name) + body);
  } else {
    await fsp.writeFile(path.join(group, 'ContentView.swift'), fileHeader('ContentView.swift', name) +
`import SwiftUI

struct ContentView: View {
    var body: some View {
        VStack {
            Image(systemName: "globe")
                .imageScale(.large)
                .foregroundStyle(.tint)
            Text("Hello, world!")
        }
        .padding()
    }
}

#Preview {
    ContentView()
}
`);
  }
  // asset catalog laid out like Xcode's
  const assets = path.join(group, 'Assets.xcassets');
  const info = { info: { author: 'xcode', version: 1 } };
  await fsp.mkdir(path.join(assets, 'AccentColor.colorset'), { recursive: true });
  await fsp.mkdir(path.join(assets, 'AppIcon.appiconset'), { recursive: true });
  await fsp.writeFile(path.join(assets, 'Contents.json'), JSON.stringify(info, null, 2));
  await fsp.writeFile(path.join(assets, 'AccentColor.colorset', 'Contents.json'), JSON.stringify({ colors: [{ idiom: 'universal' }], ...info }, null, 2));
  await fsp.writeFile(path.join(assets, 'AppIcon.appiconset', 'Contents.json'), JSON.stringify({ images: [{ idiom: 'universal', platform: 'ios', size: '1024x1024' }], ...info }, null, 2));
  await fsp.mkdir(path.join(group, 'Preview Content', 'Preview Assets.xcassets'), { recursive: true });
  await fsp.writeFile(path.join(group, 'Preview Content', 'Preview Assets.xcassets', 'Contents.json'), JSON.stringify(info, null, 2));
  await fsp.writeFile(path.join(root, '.swiftcode.json'), JSON.stringify({
    name, organization: org || '', bundleId: `${org || 'com.example'}.${name.replace(/[^A-Za-z0-9.-]/g, '-')}`, platform: 'ios',
    displayName: name, version: '1.0', build: '1', deploymentTarget: '18.0',
    developmentRegion: 'en', knownRegions: ['en', 'Base'], info: {}, scheme: { appLanguage: 'system', appRegion: 'system' },
  }, null, 2));
  return { root, open: path.join(group, 'ContentView.swift') };
}

// ---------------------------------------------------------------- build & run

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function ev(type, data) { send('build:event', { type, ...data }); }

const DIAG_RE = /^(.+?):(\d+):(\d+): (error|warning|note|remark): (.*)$/;

function lineSplitter(onLine) {
  let buf = '';
  return {
    push(chunk) {
      buf += chunk;
      let i;
      while ((i = buf.search(/\r?\n/)) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(buf[i] === '\r' ? i + 2 : i + 1);
        onLine(line);
      }
    },
    flush() { if (buf) { onLine(buf); buf = ''; } },
  };
}

function runTool(cmd, args, cwd, { hideWarningsFrom } = {}) {
  // compiler-ish process: every line goes to the build log, diagnostics are parsed out
  return new Promise(resolve => {
    let hiding = false;
    ev('log', { text: `> ${path.basename(cmd)} ${args.map(a => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}` });
    let proc;
    try {
      proc = spawn(cmd, args, { cwd, env: toolEnv, windowsHide: true });
    } catch (e) {
      ev('log', { text: String(e) });
      return resolve(-1);
    }
    job = { proc, kind: 'build' };
    const onLine = raw => {
      const line = raw.replace(/\r+$/, '');
      const m = line.match(DIAG_RE);
      // warnings caused by SwiftCode's own entry wrapper (e.g. about #sourceLocation) are noise for the user
      if (m) hiding = !!hideWarningsFrom && m[4] !== 'error' && m[1].replace(/\\\\/g, '\\').toLowerCase().startsWith(hideWarningsFrom.toLowerCase());
      // SwiftCode's NSDataDetector does return links, so corelibs' deprecation of .link is noise
      if (m && /These types of result will not be returned by swift-corelibs-foundation/.test(m[5])) hiding = true;
      if (hiding) return;
      if (/^\s*(Trwa tworzenie biblioteki|Creating library) .*\.(lib|exp)/i.test(line)) return;
      if (/unable to create symbolic link at .*\.build|'--build-system native' has been deprecated/.test(line)) return;
      if (process.env.SWIFTCODE_DEBUG) console.log('[build]', line);
      ev('log', { text: line });
      // paths that came through #sourceLocation are printed with escaped backslashes
      if (m) ev('diag', { file: m[1].replace(/\\\\/g, '\\'), line: +m[2], col: +m[3], severity: m[4], message: m[5] });
    };
    const out = lineSplitter(onLine), err = lineSplitter(onLine);
    proc.stdout.setEncoding('utf8'); proc.stderr.setEncoding('utf8');
    proc.stdout.on('data', d => out.push(d));
    proc.stderr.on('data', d => err.push(d));
    proc.on('error', e => { ev('log', { text: String(e) }); });
    proc.on('close', code => { out.flush(); err.flush(); job = null; resolve(code ?? -1); });
  });
}

function moduleName(name) {
  let n = name.replace(/[^A-Za-z0-9_]/g, '_');
  if (!n || /^\d/.test(n)) n = '_' + n;
  if (n.toLowerCase() === 'main' || n === 'Swift' || n === 'Foundation') n = n + 'App';
  return n;
}

// Pipes make the C runtime fully buffer stdout, so print() would only show up when the program exits
// and readLine() prompts would be invisible. The entry file gets a tiny prelude that switches buffering off;
// #sourceLocation keeps every diagnostic pointing at the user's real file and line.
// The prelude also holds the program at the start while the debugger attaches and installs breakpoints
// (SwiftCode then creates the gate file named by SWIFTCODE_DEBUG_GATE).
const PRELUDE = `import CRT
_ = setvbuf(__acrt_iob_func(1), nil, _IONBF, 0)
_ = setvbuf(__acrt_iob_func(2), nil, _IONBF, 0)
@_silgen_name("Sleep") func __swiftcodeSleep(_ ms: UInt32)
if let __gate = getenv("SWIFTCODE_DEBUG_GATE") { var __n = 0; while __n < 1000 { if let __f = fopen(__gate, "r") { fclose(__f); break }; __swiftcodeSleep(10); __n += 1 } }
`;

/** Debug builds carry DWARF (LLDB on Windows reads it reliably; it needs lld to keep it in the .exe). */
function debugFlags() {
  return findOnPath('lld-link.exe') ? ['-g', '-debug-info-format=dwarf', '-use-ld=lld', '-Xlinker', '-debug:dwarf'] : [];
}

/** Edit Scheme ▸ Run ▸ Build Configuration: Debug (-Onone + debug info) or Release (-O). */
function configFlags(root, withDebugInfo = true) {
  if ((readProjectSettings(root).scheme || {}).configuration === 'release') return ['-O'];
  return ['-Onone', ...(withDebugInfo ? debugFlags() : [])];
}

// ---------------------------------------------------------------- SwiftUI for Windows

const SWIFTUI_SRC = path.join(__dirname, 'runtime', 'SwiftUI');

// Apple frameworks whose API lives in SwiftCode's SwiftUI module. Each gets a tiny module that re-exports SwiftUI,
// so `import UIKit` resolves for SourceKit exactly like the build's import rewriting does.
const APPLE_STUB_MODULES = ['UIKit', 'Combine', 'CoreLocation', 'CoreLocationUI', 'MapKit', 'AVFoundation', 'PhotosUI'];

let runtimeBuild = null;   // in-flight runtime build, shared by the build and SourceKit

function runtimeDirFor(swiftVersion) {
  const files = safeReaddir(SWIFTUI_SRC).filter(f => f.endsWith('.swift')).sort().map(f => path.join(SWIFTUI_SRC, f));
  const hash = crypto.createHash('sha1');
  hash.update(String(swiftVersion));
  for (const f of files) hash.update(fs.readFileSync(f));
  return { dir: path.join(app.getPath('userData'), 'swiftui', hash.digest('hex').slice(0, 12)), files };
}

function quietTool(cmd, args, cwd) {
  return new Promise(resolve => {
    execFile(cmd, args, { cwd, env: toolEnv, windowsHide: true, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) =>
      resolve({ code: err ? (err.code ?? 1) : 0, output: String(stdout || '') + String(stderr || '') }));
  });
}

async function ensureStubModules(dir) {
  const swiftc = findOnPath('swiftc.exe');
  const stub = path.join(dir, 'stub.swift');
  if (!fs.existsSync(stub)) await fsp.writeFile(stub, '@_exported import SwiftUI\n');
  for (const m of APPLE_STUB_MODULES) {
    if (fs.existsSync(path.join(dir, `${m}.swiftmodule`))) continue;
    await quietTool(swiftc, ['-parse-as-library', '-module-name', m, '-swift-version', '5', ...swiftFlags(), '-I', dir,
      '-emit-module', '-emit-module-path', path.join(dir, `${m}.swiftmodule`), stub], dir);
  }
}

async function ensureSwiftUIRuntime(swiftVersion, { silent = false } = {}) {
  const { dir, files } = runtimeDirFor(swiftVersion);
  if (fs.existsSync(path.join(dir, 'SwiftUI.lib')) && fs.existsSync(path.join(dir, 'SwiftUI.swiftmodule'))) return dir;
  if (runtimeBuild) return runtimeBuild;
  runtimeBuild = (async () => {
    await fsp.mkdir(dir, { recursive: true });
    if (!silent) ev('log', { text: 'Building SwiftUI for Windows runtime (first build only, takes a minute)…' });
    ev('phase', { text: 'Preparing SwiftUI' });
    const args = [
      '-parse-as-library', '-module-name', 'SwiftUI', '-swift-version', '5', '-diagnostic-style=llvm', ...swiftFlags(),
      '-emit-module', '-emit-module-path', path.join(dir, 'SwiftUI.swiftmodule'),
      '-emit-library', '-static', '-o', path.join(dir, 'SwiftUI.lib'), ...files,
    ];
    const code = silent ? (await quietTool(findOnPath('swiftc.exe'), args, dir)).code : await runTool(findOnPath('swiftc.exe'), args, dir);
    ev('phase', { text: '' });
    return code === 0 ? dir : null;
  })();
  try { return await runtimeBuild; } finally { runtimeBuild = null; }
}

const SWIFTUI_IMPORT = /^\s*(@preconcurrency\s+)?import\s+SwiftUI\b/m;

/** Blank out `#Preview { … }` blocks (keeping newlines so line numbers stay put) and return their bodies. */
function stripPreviews(src) {
  const chars = src.split('');
  const previews = [];
  const re = /#Preview\b/g;
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    const skipWs = () => { while (i < src.length && /\s/.test(src[i])) i++; };
    const matchBlock = (open, close) => {
      let depth = 0;
      for (; i < src.length; i++) {
        const c = src[i];
        if (c === '"') { i++; while (i < src.length && src[i] !== '"') { if (src[i] === '\\') i++; i++; } continue; }
        if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
        if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2); if (i < 0) i = src.length; i++; continue; }
        if (c === open) depth++;
        else if (c === close) { depth--; if (depth === 0) { i++; return true; } }
      }
      return false;
    };
    skipWs();
    let title = null;
    if (src[i] === '(') {
      const s = i;
      if (!matchBlock('(', ')')) continue;
      const t = src.slice(s, i).match(/^\(\s*"([^"]*)"/);
      if (t) title = t[1];
      skipWs();
    }
    if (src[i] !== '{') continue;
    const bodyStart = i;
    if (!matchBlock('{', '}')) continue;
    const body = src.slice(bodyStart + 1, i - 1);
    previews.push({ title, body, line: src.slice(0, m.index).split('\n').length });
    for (let k = m.index; k < i; k++) if (chars[k] !== '\n') chars[k] = ' ';
    re.lastIndex = i;
  }
  return { code: chars.join(''), previews };
}

async function isSwiftUIProject(root) {
  const files = await collectFiles(root, p => p.toLowerCase().endsWith('.swift'));
  for (const f of files.slice(0, 200)) {
    try { if (SWIFTUI_IMPORT.test(await fsp.readFile(f, 'utf8'))) return true; } catch {}
  }
  return false;
}

async function buildSwiftUIProject(root, files, swiftVersion, preview, opts = {}) {
  const quiet = !!opts.quiet;    // canvas previews build in the background without touching the build log or issues
  const rt = await ensureSwiftUIRuntime(swiftVersion, { silent: quiet });
  if (!rt) {
    const message = 'Could not build the SwiftUI for Windows runtime (see the build log).';
    if (quiet) return { ok: false, errors: [{ message }] };
    ev('diag', { file: null, line: 0, col: 0, severity: 'error', message });
    return { ok: false };
  }
  if (!quiet) ev('phase', { text: '' });
  const name = path.basename(root);
  const outDir = path.join(root, '.build', 'swiftcode');
  const srcDir = path.join(outDir, preview ? (quiet ? 'canvas-src' : 'preview-src') : 'src');
  await fsp.rm(srcDir, { recursive: true, force: true });
  await fsp.mkdir(srcDir, { recursive: true });
  // resources are checked like Xcode's "Copy Bundle Resources" phase does
  if (!quiet && !(await validateResources(root))) return { ok: false };
  const inputs = [];
  let hasMain = false;
  let previewFound = null;
  let mainType = null;
  const state = { windowClasses: [] };
  let i = 0;
  for (const f of (files)) {
    // the canvas previews what's in the editor, saved or not
    const override = opts.overrides && opts.overrides[f.toLowerCase()];
    let src = override != null ? override : await fsp.readFile(f, 'utf8');
    if (path.basename(f).toLowerCase() === 'main.swift') hasMain = true;
    const { code, previews } = stripPreviews(src);
    if (preview && !previewFound && norm(f) === norm(preview.file) && previews.length) previewFound = previews[Math.min(preview.index || 0, previews.length - 1)];
    let body = rewriteForWindows(code, state);
    const m = body.match(/^[ \t]*@main\b[\s\S]*?\b(?:struct|class|enum)\s+(\w+)/m);
    // the preview build (and an app with UIKit overrides) gets SwiftCode's own entry point instead of the app's @main
    if (m) { mainType = mainType || m[1]; body = body.replace(/^([ \t]*)@main\b/m, '$1/*@main*/'); }
    const literal = f.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const base = path.basename(f).toLowerCase() === 'main.swift' ? 'main.swift' : `${i++}_${path.basename(f)}`;
    const target = path.join(srcDir, base);
    // every file sees SwiftUI (it carries the Foundation fixes and the UIKit/Combine/CoreLocation types)
    await fsp.writeFile(target, `import SwiftUI\n#sourceLocation(file: "${literal}", line: 1)\n${body}\n#sourceLocation()\n`);
    inputs.push(target);
  }
  const windowClass = state.windowClasses[state.windowClasses.length - 1];
  const setup = windowClass ? `_UIKit.windowClass = ${windowClass}.self; ` : '';
  if (preview) {
    if (!previewFound) {
      if (quiet) return { ok: false, errors: [{ file: preview.file, line: 1, message: 'No #Preview found in this file.' }] };
      ev('diag', { file: preview.file, line: 1, col: 1, severity: 'error', message: 'No #Preview found in this file.' });
      return { ok: false };
    }
    const literal = preview.file.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    await fsp.writeFile(path.join(srcDir, '__SwiftCodePreview.swift'),
      `import SwiftUI\n@main\nstruct __SwiftCodePreviewApp: App {\n    init() { ${setup}}\n    var body: some Scene {\n        WindowGroup {\n#sourceLocation(file: "${literal}", line: ${previewFound.line})\n${previewFound.body}\n#sourceLocation()\n        }\n    }\n}\n`);
    inputs.push(path.join(srcDir, '__SwiftCodePreview.swift'));
  } else if (mainType && !hasMain) {
    await fsp.writeFile(path.join(srcDir, '__SwiftCodeEntry.swift'),
      `import SwiftUI\n@main\nenum __SwiftCodeEntry {\n    @MainActor static func main() { ${setup}${mainType}.main() }\n}\n`);
    inputs.push(path.join(srcDir, '__SwiftCodeEntry.swift'));
  }
  const exe = path.join(outDir, moduleName(name) + (preview ? (quiet ? '-Canvas' : '-Preview') : '') + '.exe');
  const args = [...(quiet ? ['-Onone'] : configFlags(root)), '-diagnostic-style=llvm', ...swiftFlags(), '-swift-version', '5', '-enable-bare-slash-regex',
    '-I', rt, '-L', rt, '-lSwiftUI', '-module-name', moduleName(name), '-o', exe];
  if (!hasMain) args.push('-parse-as-library');
  args.push(...inputs);
  if (quiet) {
    const r = await quietTool(findOnPath('swiftc.exe'), args, root);
    const errors = [];
    for (const line of r.output.split(/\r?\n/)) {
      const m = line.match(DIAG_RE);
      if (m && m[4] === 'error') errors.push({ file: m[1].replace(/\\\\/g, '\\'), line: +m[2], col: +m[3], message: m[5] });
    }
    if (r.code !== 0 && !errors.length) errors.push({ message: r.output.trim().split(/\r?\n/).slice(-3).join('\n') || 'Build failed' });
    return { ok: r.code === 0, exe, ios: true, errors };
  }
  const code = await runTool(findOnPath('swiftc.exe'), args, root, { hideWarningsFrom: srcDir });
  return { ok: code === 0, exe, ios: true };
}

function norm(p) { return path.resolve(p).toLowerCase(); }

function readStringsFile(p) {
  const buf = fs.readFileSync(p);
  if ((buf[0] === 0xff && buf[1] === 0xfe)) return buf.slice(2).toString('utf16le');
  return buf.toString('utf8');
}

async function validateResources(root) {
  const files = await collectFiles(root, p => /\.(strings|xcstrings)$/i.test(p));
  let ok = true;
  for (const f of files) {
    try {
      const text = readStringsFile(f);
      if (/\.xcstrings$/i.test(f)) JSON.parse(text); else parseStrings(text);
    } catch (e) {
      ok = false;
      const line = e.line || 1;
      ev('log', { text: `${f}:${line}: error: ${e.message}` });
      ev('diag', { file: f, line, col: 1, severity: 'error', message: `${path.basename(f)}: ${e.message}. Couldn’t parse property list because the input data was in an invalid format` });
    }
  }
  return ok;
}

function safeReaddirEnt(p) { try { return fs.readdirSync(p, { withFileTypes: true }); } catch { return []; } }

function addKnownRegion(root, lang) {
  const s = readProjectSettings(root);
  const known = s.knownRegions || ['en', 'Base'];
  if (!known.includes(lang)) writeProjectSettings(root, { knownRegions: [...known, lang] });
}

/** Languages of the project: every *.lproj folder plus knownRegions, with the files each one localizes. */
function projectLocalizations(root) {
  const s = readProjectSettings(root);
  const langs = {};
  for (const r of s.knownRegions || ['en']) langs[r] = [];
  (function walk(d) {
    for (const e of safeReaddirEnt(d)) {
      if (!e.isDirectory() || IGNORED_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      const m = e.name.match(/^(.+)\.lproj$/i);
      if (m) {
        const files = safeReaddirEnt(p).filter(f => f.isFile()).map(f => path.join(p, f.name));
        langs[m[1]] = (langs[m[1]] || []).concat(files);
      } else walk(p);
    }
  })(root);
  return { developmentRegion: s.developmentRegion || 'en', useBase: s.useBase !== false, langs };
}

/** File Inspector ▸ Localize…: moves the file into <lang>.lproj next to it. */
async function localizeFile(root, file, lang) {
  const dir = path.dirname(file);
  const target = path.join(dir, `${lang}.lproj`, path.basename(file));
  await fsp.mkdir(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) throw new Error(`${lang}.lproj/${path.basename(file)} already exists.`);
  await fsp.rename(file, target);
  addKnownRegion(root, lang);
  return target;
}

// ---------------------------------------------------------------- asset catalogs

const XCODE_INFO = { author: 'xcode', version: 1 };

async function newAssetCatalog(dir) {
  await fsp.mkdir(path.join(dir, 'AccentColor.colorset'), { recursive: true });
  await fsp.writeFile(path.join(dir, 'Contents.json'), JSON.stringify({ info: XCODE_INFO }, null, 2));
  await fsp.writeFile(path.join(dir, 'AccentColor.colorset', 'Contents.json'), JSON.stringify({ colors: [{ idiom: 'universal' }], info: XCODE_INFO }, null, 2));
}

function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

function listAssets(dir) {
  const out = [];
  for (const e of safeReaddirEnt(dir)) {
    if (!e.isDirectory()) continue;
    const p = path.join(dir, e.name);
    const ext = path.extname(e.name).toLowerCase();
    const name = e.name.slice(0, -ext.length || undefined);
    const json = readJSON(path.join(p, 'Contents.json')) || {};
    if (ext === '.imageset' || ext === '.appiconset') {
      const images = (json.images || []).map(i => ({ ...i, path: i.filename ? path.join(p, i.filename) : null }));
      out.push({ kind: ext === '.imageset' ? 'image' : 'appicon', name, path: p, images });
    } else if (ext === '.colorset') {
      out.push({ kind: 'color', name, path: p, colors: json.colors || [] });
    } else if (!ext) {
      out.push({ kind: 'folder', name, path: p, children: listAssets(p) });
    }
  }
  return out.sort((a, b) => (a.kind === 'appicon' ? -1 : b.kind === 'appicon' ? 1 : a.name.localeCompare(b.name)));
}

async function newImageSet(dir, name, file) {
  let base = name.replace(/@[23]x$/, '');
  let set = path.join(dir, base + '.imageset');
  for (let i = 2; fs.existsSync(set); i++) set = path.join(dir, `${base} ${i}.imageset`);
  await fsp.mkdir(set, { recursive: true });
  const images = [{ idiom: 'universal', scale: '1x' }, { idiom: 'universal', scale: '2x' }, { idiom: 'universal', scale: '3x' }];
  if (file) {
    const scale = /@3x\.\w+$/.test(file) ? 2 : /@2x\.\w+$/.test(file) ? 1 : 0;
    await fsp.copyFile(file, path.join(set, path.basename(file)));
    images[scale].filename = path.basename(file);
  }
  await fsp.writeFile(path.join(set, 'Contents.json'), JSON.stringify({ images, info: XCODE_INFO }, null, 2));
  return set;
}

/** Dropping image files into the catalog: one image set per name, @2x/@3x files fill their slots. */
async function importAssets(dir, files) {
  const sets = [];
  const byName = new Map();
  for (const f of files) {
    const n = path.basename(f).replace(/\.[^.]+$/, '').replace(/@[23]x$/, '');
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(f);
  }
  for (const [n, list] of byName) {
    const existing = path.join(dir, n + '.imageset');
    const set = fs.existsSync(existing) ? existing : await newImageSet(dir, n);
    for (const f of list) await setAssetImage(set, /@3x\.\w+$/.test(f) ? '3x' : /@2x\.\w+$/.test(f) ? '2x' : '1x', f);
    sets.push(set);
  }
  return sets;
}

async function setAssetImage(set, scale, file) {
  const cj = path.join(set, 'Contents.json');
  const json = readJSON(cj) || { images: [], info: XCODE_INFO };
  json.images = json.images && json.images.length ? json.images : [{ idiom: 'universal', scale: '1x' }, { idiom: 'universal', scale: '2x' }, { idiom: 'universal', scale: '3x' }];
  let slot = json.images.find(i => i.scale === scale);
  if (!slot) { slot = { idiom: 'universal', scale }; json.images.push(slot); }
  if (slot.filename && file !== null) { try { await fsp.rm(path.join(set, slot.filename)); } catch {} }
  if (file) {
    const name = path.basename(file);
    if (norm(path.dirname(file)) !== norm(set)) await fsp.copyFile(file, path.join(set, name));
    slot.filename = name;
  } else {
    if (slot.filename) { try { await fsp.rm(path.join(set, slot.filename)); } catch {} }
    delete slot.filename;
  }
  await fsp.writeFile(cj, JSON.stringify(json, null, 2));
  return true;
}

async function newColorSet(dir, name) {
  let set = path.join(dir, name + '.colorset');
  for (let i = 2; fs.existsSync(set); i++) set = path.join(dir, `${name} ${i}.colorset`);
  await fsp.mkdir(set, { recursive: true });
  await fsp.writeFile(path.join(set, 'Contents.json'), JSON.stringify({ colors: [{ idiom: 'universal', color: { 'color-space': 'srgb', components: { red: '1.000', green: '1.000', blue: '1.000', alpha: '1.000' } } }], info: XCODE_INFO }, null, 2));
  return set;
}

async function setColorSet(set, rgba, appearance) {
  const cj = path.join(set, 'Contents.json');
  const json = readJSON(cj) || { colors: [], info: XCODE_INFO };
  json.colors = json.colors || [];
  const isDark = c => (c.appearances || []).some(a => a.value === 'dark');
  let entry = json.colors.find(c => (appearance === 'dark') === isDark(c));
  if (!entry) { entry = { idiom: 'universal' }; if (appearance === 'dark') entry.appearances = [{ appearance: 'luminosity', value: 'dark' }]; json.colors.push(entry); }
  const f = v => v.toFixed(3);
  entry.color = { 'color-space': 'srgb', components: { red: f(rgba.r), green: f(rgba.g), blue: f(rgba.b), alpha: f(rgba.a ?? 1) } };
  await fsp.writeFile(cj, JSON.stringify(json, null, 2));
  return true;
}

// ---------------------------------------------------------------- file templates (File ▸ New ▸ File from Template)

function fileTemplate(name, projectName, kind) {
  const base = name.replace(/\.[^.]+$/, '');
  const ident = swiftIdentifier(base);
  const header = fileHeader(name, projectName);
  const block = header.replace(/^\/\/\n/, '/* \n').replace(/\n\/\/\n\n$/, '\n*/\n\n').replace(/^\/\/  /gm, '  ');
  switch (kind) {
    case 'swiftui':
      return header + `import SwiftUI\n\nstruct ${ident}: View {\n    var body: some View {\n        Text("Hello, World!")\n    }\n}\n\n#Preview {\n    ${ident}()\n}\n`;
    case 'strings': return block;
    case 'stringsdict':
      return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n\t<key>%d items</key>\n\t<dict>\n\t\t<key>NSStringLocalizedFormatKey</key>\n\t\t<string>%#@items@</string>\n\t\t<key>items</key>\n\t\t<dict>\n\t\t\t<key>NSStringFormatSpecTypeKey</key>\n\t\t\t<string>NSStringPluralRuleType</string>\n\t\t\t<key>NSStringFormatValueTypeKey</key>\n\t\t\t<string>d</string>\n\t\t\t<key>one</key>\n\t\t\t<string>%d item</string>\n\t\t\t<key>other</key>\n\t\t\t<string>%d items</string>\n\t\t</dict>\n\t</dict>\n</dict>\n</plist>\n`;
    case 'xcstrings': return JSON.stringify({ sourceLanguage: 'en', strings: {}, version: '1.0' }, null, 2) + '\n';
    case 'plist':
      return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict/>\n</plist>\n`;
    case 'empty': return name.endsWith('.swift') ? header : '';
    default:
      return name.endsWith('.swift') ? header + 'import Foundation\n\n' : '';
  }
}

function readProjectSettings(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, '.swiftcode.json'), 'utf8')); } catch { return {}; }
}
function writeProjectSettings(root, patch) {
  const s = { ...readProjectSettings(root), ...patch };
  fs.writeFileSync(path.join(root, '.swiftcode.json'), JSON.stringify(s, null, 2));
  return s;
}

/** Info.plist keys: a real Info.plist in the project plus what the project editor stored. */
function projectInfo(root) {
  const info = {};
  const plist = path.join(root, path.basename(root), 'Info.plist');
  for (const p of [plist, path.join(root, 'Info.plist')]) {
    try {
      const xml = fs.readFileSync(p, 'utf8');
      const re = /<key>([^<]+)<\/key>\s*<string>([^<]*)<\/string>/g;
      let m;
      while ((m = re.exec(xml))) info[m[1]] = m[2];
    } catch {}
  }
  return { ...info, ...(readProjectSettings(root).info || {}) };
}

async function buildFolderProject(root, swiftVersion, preview) {
  const files = await collectFiles(root, p => p.toLowerCase().endsWith('.swift'));
  if (!files.length) {
    ev('diag', { file: root, line: 0, col: 0, severity: 'error', message: 'No Swift source files in project.' });
    return { ok: false };
  }
  for (const f of files) {
    if (SWIFTUI_IMPORT.test(await fsp.readFile(f, 'utf8'))) return buildSwiftUIProject(root, files, swiftVersion, preview);
  }
  const name = path.basename(root);
  const outDir = path.join(root, '.build', 'swiftcode');
  await fsp.mkdir(path.join(outDir, 'entry'), { recursive: true });
  const exe = path.join(outDir, moduleName(name) + '.exe');

  let entry = files.find(f => path.basename(f).toLowerCase() === 'main.swift') || null;
  let hasMainAttr = false;
  if (!entry) {
    for (const f of files) {
      const src = await fsp.readFile(f, 'utf8');
      if (/^\s*@main\b/m.test(src)) { hasMainAttr = true; break; }
    }
    if (!hasMainAttr && files.length === 1) entry = files[0];
  }

  const inputs = [];
  for (const f of files) {
    if (f === entry) {
      const src = await fsp.readFile(f, 'utf8');
      const literal = f.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const wrapped = `${PRELUDE}#sourceLocation(file: "${literal}", line: 1)\n${src}\n#sourceLocation()\n`;
      const target = path.join(outDir, 'entry', 'main.swift');
      await fsp.writeFile(target, wrapped);
      inputs.push(target);
    } else {
      inputs.push(f);
    }
  }
  const args = [...configFlags(root), '-diagnostic-style=llvm', ...swiftFlags(), '-module-name', moduleName(name), '-o', exe];
  if (!entry && hasMainAttr) args.push('-parse-as-library');
  args.push(...inputs);
  const swiftc = findOnPath('swiftc.exe');
  const code = await runTool(swiftc, args, root, { hideWarningsFrom: path.join(outDir, 'entry', 'main.swift') });
  return { ok: code === 0, exe };
}

// Packages can't get the entry-file prelude, so a CRT initializer object does the same job at link time.
const UNBUFFER_C = `#include <stdio.h>
static void __cdecl swiftcode_unbuffer(void) { setvbuf(stdout, NULL, _IONBF, 0); setvbuf(stderr, NULL, _IONBF, 0); }
#pragma section(".CRT$XCU", read)
__declspec(allocate(".CRT$XCU")) void (__cdecl *swiftcode_unbuffer_init)(void) = swiftcode_unbuffer;
#pragma comment(linker, "/include:swiftcode_unbuffer_init")
`;

async function unbufferObject() {
  const dir = app.getPath('userData');
  const obj = path.join(dir, 'unbuffer.obj');
  if (fs.existsSync(obj)) return obj;
  const clang = findOnPath('clang.exe');
  if (!clang) return null;
  const src = path.join(dir, 'unbuffer.c');
  await fsp.writeFile(src, UNBUFFER_C);
  return new Promise(resolve => {
    execFile(clang, ['--target=x86_64-unknown-windows-msvc', '-c', '-O2', src, '-o', obj], { env: toolEnv, windowsHide: true },
      err => resolve(err ? null : obj));
  });
}

async function buildPackage(root) {
  const swift = findOnPath('swift.exe');
  const extra = swiftFlags().flatMap(f => ['-Xswiftc', f]);
  const obj = await unbufferObject();
  if (obj) extra.push('-Xlinker', obj);
  // the native build system honours INCLUDE/LIB, which a per-user Windows SDK relies on
  const native = vfsOverlay ? ['--build-system', 'native'] : [];
  const release = (readProjectSettings(root).scheme || {}).configuration === 'release';
  const code = await runTool(swift, ['build', ...native, ...(release ? ['-c', 'release'] : []), '-Xswiftc', '-diagnostic-style=llvm', ...extra], root);
  return { ok: code === 0, exe: code === 0 ? await newestPackageExe(root, release) : null };
}

// .build/debug is a symlink that Windows only allows in Developer Mode, so look for the product directly
async function newestPackageExe(root, release = false) {
  const build = path.join(root, '.build');
  let best = null;
  for (const triple of safeReaddir(build)) {
    for (const cfg of release ? ['release', path.join('out', 'Products', 'Release-windows-x86_64')] : ['debug', path.join('out', 'Products', 'Debug-windows-x86_64')]) {
      const dir = path.join(build, triple, cfg);
      for (const f of safeReaddir(dir)) {
        if (!f.toLowerCase().endsWith('.exe')) continue;
        const p = path.join(dir, f);
        const t = fs.statSync(p).mtimeMs;
        if (!best || t > best.t) best = { p, t };
      }
    }
  }
  return best && best.p;
}

/** Splits "a 'b c' \"d\"" into argv words the way a shell would. */
function splitArgs(s) {
  const out = [];
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(s))) out.push(m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : m[2] !== undefined ? m[2] : m[3]);
  return out;
}

function runProgram(cmd, args, cwd, debugRun, extraEnv = {}) {
  return new Promise(resolve => {
    let proc;
    try {
      proc = spawn(cmd, args, { cwd, env: { ...toolEnv, ...extraEnv, ...(debugRun?.env || {}) }, windowsHide: true });
    } catch (e) {
      ev('stderr', { text: String(e) + '\n' });
      return resolve(-1);
    }
    job = { proc, kind: 'run' };
    ev('running', { pid: proc.pid, debug: !!debugRun });
    if (debugRun) debugRun.attach(proc.pid);
    proc.once('close', () => debugStop());
    proc.stdout.setEncoding('utf8'); proc.stderr.setEncoding('utf8');
    proc.stdout.on('data', d => ev('stdout', { text: d }));
    proc.stderr.on('data', d => ev('stderr', { text: d }));
    proc.on('error', e => ev('stderr', { text: String(e) + '\n' }));
    proc.on('close', (code, signal) => { job = null; resolve(signal ? signal : code); });
  });
}

// ---------------------------------------------------------------- iPhone simulator window

const UI_MARK = '\u001eUI ';
// Product ▸ Destination: the simulated iPhone models (screen size in points)
const SIM_MODELS = {
  'iPhone 16 Pro': [402, 874], 'iPhone 16 Pro Max': [440, 956], 'iPhone 16': [393, 852], 'iPhone 16 Plus': [430, 932],
  'iPhone 16e': [390, 844], 'iPhone SE (3rd generation)': [375, 667],
};
const simModel = () => (SIM_MODELS[device().model] ? device().model : 'iPhone 16 Pro');
/** Window width that fits the device bezel at the given window height (same padding as simulator.css). */
function simWindowWidth(height) {
  const [w, h] = SIM_MODELS[simModel()];
  const home = /SE/.test(simModel());
  const devW = w + (home ? 44 : 32), devH = h + (home ? 192 : 32);
  return Math.round((height - 38 - 20) * devW / devH) + 44;
}
function setSimModel(name) {
  if (!SIM_MODELS[name]) return;
  setDevice({ model: name });
  simSend('sim:model', name);
  if (simWin && !simWin.isDestroyed()) { const [, h] = simWin.getSize(); simWin.setSize(simWindowWidth(h), h); }
  // apps read the screen size at launch, like a real device switch
  if (job && job.ios && lastIOSRun) send('app:command', 'run');
}
let simWin = null;
let simReady = false;
let simQueue = [];
let simApp = 'App';
let lucideNames = null;

function ensureSimWindow(show = true) {
  if (simWin && !simWin.isDestroyed()) {
    if (show) { if (simWin.isMinimized()) simWin.restore(); if (!simWin.isVisible()) simWin.showInactive(); }
    return simWin;
  }
  const { workArea } = screen.getPrimaryDisplay();
  const height = Math.min(workArea.height - 8, 980);
  const width = simWindowWidth(height);
  simWin = new BrowserWindow({
    width, height,
    x: workArea.x + workArea.width - width - 6,
    y: workArea.y + 4,
    minWidth: 240, minHeight: 420,
    frame: false, transparent: true, resizable: true, show: false,
    title: 'Simulator', backgroundColor: '#00000000',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'sim-preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  simReady = false;
  simWin.loadFile(path.join(__dirname, 'src', 'simulator.html'));
  simWin.once('ready-to-show', () => { if (show) simWin.showInactive(); });
  simWin.on('closed', () => { simWin = null; simReady = false; simQueue = []; });
  if (process.env.SWIFTCODE_DEBUG) {
    simWin.webContents.on('console-message', (_e, level, message, line, source) => console.log(`[sim:${level}] ${message} (${path.basename(source || '')}:${line})`));
  }
  if (process.env.SWIFTCODE_SIMSHOT) {
    const shots = process.env.SWIFTCODE_SIMSHOT.split(';');
    const delay = +(process.env.SWIFTCODE_SHOT_DELAY || 5000);
    shots.forEach((file, i) => setTimeout(async () => {
      if (!simWin) return;
      const img = await simWin.webContents.capturePage();
      fs.writeFileSync(file, img.toPNG());
      console.log('sim screenshot', file);
    }, delay * (i + 1)));
  }
  return simWin;
}

function simSend(channel, payload) {
  if (!simWin || simWin.isDestroyed()) return;
  if (!simReady) {
    // only the newest frame matters while the window is loading
    if (channel === 'sim:frame') simQueue = simQueue.filter(([c]) => c !== 'sim:frame');
    simQueue.push([channel, payload]);
    return;
  }
  simWin.webContents.send(channel, payload);
}

// ---------------------------------------------------------------- simulated device state

const LOCATION_PRESETS = {
  apple: { label: 'Apple', lat: 37.33233141, lon: -122.0312186 },
  infinite: { label: 'Apple (Infinite Loop)', lat: 37.33165776, lon: -122.03069996 },
  pb: { label: 'Politechnika Białostocka', lat: 53.11741, lon: 23.14652 },
  warsaw: { label: 'Warszawa', lat: 52.22977, lon: 21.01178 },
};
// offline answers for the presets, so the classic exercise works without internet
const GEOCODE_PRESETS = [
  { lat: 37.3317, lon: -122.0307, en: { name: '1 Infinite Loop', thoroughfare: 'Infinite Loop', subThoroughfare: '1', locality: 'Cupertino', subAdministrativeArea: 'Santa Clara', administrativeArea: 'CA', postalCode: '95014', isoCountryCode: 'US', country: 'United States' }, pl: { country: 'Stany Zjednoczone' } },
  { lat: 37.3323, lon: -122.0312, en: { name: 'Apple Park', thoroughfare: 'Apple Park Way', subThoroughfare: '1', locality: 'Cupertino', subAdministrativeArea: 'Santa Clara', administrativeArea: 'CA', postalCode: '95014', isoCountryCode: 'US', country: 'United States', areasOfInterest: ['Apple Park'] }, pl: { country: 'Stany Zjednoczone' } },
  { lat: 53.1174, lon: 23.1465, en: { name: 'Wiejska 45A', thoroughfare: 'Wiejska', subThoroughfare: '45A', locality: 'Białystok', subAdministrativeArea: 'Białystok', administrativeArea: 'Podlaskie', postalCode: '15-351', isoCountryCode: 'PL', country: 'Poland', areasOfInterest: ['Politechnika Białostocka'] }, pl: { country: 'Polska', administrativeArea: 'Województwo podlaskie' } },
  { lat: 52.2298, lon: 21.0118, en: { name: 'Plac Defilad 1', thoroughfare: 'Plac Defilad', subThoroughfare: '1', locality: 'Warsaw', subAdministrativeArea: 'Warsaw', administrativeArea: 'Masovian Voivodeship', postalCode: '00-901', isoCountryCode: 'PL', country: 'Poland' }, pl: { locality: 'Warszawa', subAdministrativeArea: 'Warszawa', administrativeArea: 'Województwo mazowieckie', country: 'Polska' } },
];
const ROUTES = { run: { speed: 3.2 }, bike: { speed: 6.5 }, drive: { speed: 28 } };

function device() {
  const s = loadState();
  return { language: 'en', region: '', location: 'infinite', custom: null, perms: {}, ...(s.device || {}) };
}
function setDevice(patch) {
  const d = { ...device(), ...patch };
  saveState({ device: d });
  return d;
}

/** Where the simulated iPhone is right now (routes move around Apple Park). */
function currentLocation() {
  const d = device();
  if (d.location === 'none') return null;
  if (d.location === 'custom' && d.custom) return { lat: d.custom.lat, lon: d.custom.lon, acc: 5, speed: -1, course: -1 };
  const route = ROUTES[d.location];
  if (route) {
    const c = LOCATION_PRESETS.apple, r = 450;
    const t = Date.now() / 1000;
    const angle = (t * route.speed / r) % (2 * Math.PI);
    const lat = c.lat + (r * Math.sin(angle)) / 111320;
    const lon = c.lon + (r * Math.cos(angle)) / (111320 * Math.cos(c.lat * Math.PI / 180));
    return { lat, lon, acc: 5, speed: route.speed, course: ((90 - angle * 180 / Math.PI) % 360 + 360) % 360 };
  }
  const p = LOCATION_PRESETS[d.location] || LOCATION_PRESETS.infinite;
  return { lat: p.lat, lon: p.lon, acc: 5, speed: -1, course: -1 };
}

let locTimer = null;
function setLocationFeed(on) {
  clearInterval(locTimer);
  locTimer = null;
  simSend('sim:locationInUse', !!on);
  if (!on) return;
  const tick = () => sendToApp({ k: 'loc', id: '', v: currentLocation() });
  setTimeout(tick, 400);
  locTimer = setInterval(tick, 1000);
}

function sendToApp(ev) {
  if (job && job.ios && job.proc.stdin.writable) job.proc.stdin.write('\u001eEV ' + JSON.stringify(ev) + '\n');
}

function httpsJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'WinSwiftStudio Simulator (education)' }, timeout: 6000 }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', d => { body += d; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

function placemarkFromOSM(r) {
  const a = r.address || {};
  return {
    name: [a.road, a.house_number].filter(Boolean).join(' ') || r.name || undefined,
    thoroughfare: a.road || a.pedestrian || a.footway, subThoroughfare: a.house_number,
    locality: a.city || a.town || a.village || a.hamlet, subLocality: a.suburb || a.neighbourhood || a.quarter,
    subAdministrativeArea: (a.county || a.city || '').replace(/ County$/, '') || undefined,
    administrativeArea: a.state, postalCode: a.postcode,
    isoCountryCode: a.country_code ? a.country_code.toUpperCase() : undefined, country: a.country,
    areasOfInterest: r.name && r.name !== a.road ? [r.name] : undefined,
    lat: +r.lat, lon: +r.lon,
  };
}

async function geocode(rq) {
  const lang = rq.lang || 'en';
  if (rq.k === 'geocode') {
    const near = GEOCODE_PRESETS.find(p => Math.abs(p.lat - rq.lat) < 0.002 && Math.abs(p.lon - rq.lon) < 0.002);
    try {
      const r = await httpsJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${rq.lat}&lon=${rq.lon}&accept-language=${encodeURIComponent(lang)}`);
      if (r && r.address) return [placemarkFromOSM(r)];
    } catch {}
    if (near) return [{ ...near.en, ...(lang.startsWith('pl') ? near.pl : {}), lat: rq.lat, lon: rq.lon }];
    return { error: 'network' };
  }
  try {
    const list = await httpsJSON(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(rq.q)}&accept-language=${encodeURIComponent(lang)}`);
    return Array.isArray(list) ? list.map(placemarkFromOSM) : [];
  } catch { return { error: 'network' }; }
}

/** Requests the running app sends (`\u001eRQ {json}`): permission prompts, GPS, geocoding, URLs. */
async function handleAppRequest(rq, appName) {
  const reply = v => sendToApp({ k: 'rs', id: rq.rid, v });
  switch (rq.k) {
    case 'permission': {
      const prev = device().perms[appName]?.[rq.kind];
      if (prev) { reply(prev); return; }
      simSend('sim:permission', { rid: rq.rid, kind: rq.kind, message: rq.message, always: rq.always, app: appName });
      return;
    }
    case 'location': setLocationFeed(rq.on); return;
    case 'geocode': case 'geocodeAddress': reply(await geocode(rq)); return;
    case 'openURL':
      if (/^app-settings:/i.test(rq.url)) simSend('sim:openSettings', appName);
      else if (/^(https?|mailto|tel|maps):/i.test(rq.url)) shell.openExternal(rq.url);
      return;
    case 'endEditing': simSend('sim:endEditing'); return;
    default: return;
  }
}

let lastIOSRun = null;

function doShake() {
  simSend('sim:shook');
  sendToApp({ k: 'shake', id: '' });
}

const SIM_LANGUAGES = [['en', 'English'], ['pl', 'Polski'], ['de', 'Deutsch'], ['fr', 'Français'], ['es', 'Español'], ['it', 'Italiano'], ['uk', 'Українська']];

/** Settings ▸ General ▸ Language & Region: iOS restarts the running app in the new language. */
async function setSimLanguage(lang) {
  if (device().language === lang) return;
  setDevice({ language: lang });
  simSend('sim:language', lang);
  if (job && job.ios && lastIOSRun) {
    const { exe, root, appName } = lastIOSRun;
    await stopJob();
    const code = await runIOSApp(exe, root, appName);
    ev('exit', { code });
    ev('done', { ok: true, phase: 'run' });
  }
}

function setSimLocation(loc) {
  if (typeof loc === 'string') setDevice({ location: loc });
  else if (loc && isFinite(loc.lat) && isFinite(loc.lon)) setDevice({ location: 'custom', custom: { lat: +loc.lat, lon: +loc.lon } });
  if (locTimer) sendToApp({ k: 'loc', id: '', v: currentLocation() });
}

function showSimMenu(x, y) {
  const d = device();
  const loc = (id, label) => ({ label, type: 'radio', checked: d.location === id, click: () => setSimLocation(id) });
  const template = [
    { label: 'File', submenu: [
      { label: 'Open Simulator', submenu: Object.keys(SIM_MODELS).map(name => ({ label: name, type: 'radio', checked: simModel() === name, click: () => { setSimModel(name); send('sim:modelChanged', name); } })) },
    ] },
    { label: 'Device', submenu: [
      { label: 'Shake', accelerator: 'Ctrl+Alt+Z', registerAccelerator: false, click: doShake },
      { label: 'Home', accelerator: 'Ctrl+Shift+H', registerAccelerator: false, click: () => simSend('sim:home') },
      { type: 'separator' },
      { label: 'Reset Location & Privacy Permissions', click: () => { setDevice({ perms: {} }); sendToApp({ k: 'locStatus', id: '', v: 'notDetermined' }); } },
      { label: 'Erase All Content and Settings…', click: () => {
        setDevice({ perms: {}, language: 'en', location: 'infinite' });
        try { fs.rmSync(path.join(app.getPath('userData'), 'simulator-data'), { recursive: true, force: true }); } catch {}
        simSend('sim:language', 'en');
      } },
    ] },
    { label: 'Features', submenu: [
      { label: 'Toggle Appearance', accelerator: 'Ctrl+Shift+A', registerAccelerator: false, click: () => simSend('sim:toggleAppearance') },
      { label: 'Location', submenu: [
        loc('none', 'None'),
        { label: 'Custom Location…', type: 'radio', checked: d.location === 'custom', click: () => simSend('sim:customLocation', d.custom || currentLocation() || LOCATION_PRESETS.pb) },
        { type: 'separator' },
        loc('apple', 'Apple'), loc('infinite', 'Apple (Infinite Loop)'), loc('pb', 'Politechnika Białostocka'), loc('warsaw', 'Warszawa'),
        { type: 'separator' },
        loc('bike', 'City Bicycle Ride'), loc('run', 'City Run'), loc('drive', 'Freeway Drive'),
      ] },
    ] },
    { label: 'Language', submenu: SIM_LANGUAGES.map(([id, label]) => ({ label, type: 'radio', checked: d.language === id, click: () => setSimLanguage(id) })) },
    { type: 'separator' },
    { label: 'Save Screenshot', accelerator: 'Ctrl+S', registerAccelerator: false, click: () => simSend('sim:screenshot') },
  ];
  Menu.buildFromTemplate(template).popup({ window: simWin, x: Math.round(x), y: Math.round(y) });
}

function runIOSApp(exe, root, appName, debugRun, launch = {}) {
  return new Promise(resolve => {
    simApp = appName;
    lastIOSRun = { exe, root, appName };
    ensureSimWindow(true);
    const dev = device();
    const settings = readProjectSettings(root);
    // Edit Scheme ▸ Run ▸ Options ▸ App Language wins over the device language, like in Xcode
    const lang = settings.scheme?.appLanguage && settings.scheme.appLanguage !== 'system' ? settings.scheme.appLanguage : dev.language;
    const region = settings.scheme?.appRegion && settings.scheme.appRegion !== 'system' ? settings.scheme.appRegion : dev.region;
    simSend('sim:state', { state: 'launching', app: appName, device: simModel(), language: dev.language });
    const granted = dev.perms[appName] || {};
    const env = {
      ...toolEnv,
      SWIFTCODE_PROJECT: root,
      SWIFTCODE_APPDATA: path.join(app.getPath('userData'), 'simulator-data', appName),
      SWIFTCODE_LANG: lang,
      SWIFTCODE_REGION: region || '',
      SWIFTCODE_DEVREGION: settings.developmentRegion || 'en',
      SWIFTCODE_TZ: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      SWIFTCODE_INFO: JSON.stringify({ name: appName, info: projectInfo(root), location: granted.location || null }),
      SWIFTCODE_SCREEN: SIM_MODELS[simModel()].join('x'),
      ...(launch.env || {}),
      ...(debugRun?.env || {}),
    };
    let proc;
    try {
      proc = spawn(exe, launch.args || [], { cwd: root, env, windowsHide: true });
    } catch (e) {
      ev('stderr', { text: String(e) + '\n' });
      return resolve(-1);
    }
    job = { proc, kind: 'run', ios: true };
    ev('running', { pid: proc.pid, ios: true, debug: !!debugRun });
    if (debugRun) debugRun.attach(proc.pid);
    proc.once('close', () => debugStop());
    simSend('sim:state', { state: 'running', app: appName });
    proc.stdout.setEncoding('utf8'); proc.stderr.setEncoding('utf8');
    let buf = '';
    proc.stdout.on('data', d => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        if (line.startsWith(UI_MARK)) simSend('sim:frame', line.slice(UI_MARK.length));
        else if (line.startsWith('\u001eRQ ')) { try { handleAppRequest(JSON.parse(line.slice(4)), appName); } catch {} }
        else ev('stdout', { text: line + '\n' });
      }
      // partial console output (print without newline) shows up immediately; frames always end with \n
      if (buf && !buf.startsWith('\u001e')) { ev('stdout', { text: buf }); buf = ''; }
    });
    proc.stderr.on('data', d => ev('stderr', { text: d }));
    proc.on('error', e => ev('stderr', { text: String(e) + '\n' }));
    proc.on('close', (code, signal) => {
      job = null;
      setLocationFeed(false);
      simSend('sim:state', { state: 'exited', code: signal ? 0 : code, stopped: !!stopRequested });
      stopRequested = false;
      resolve(signal ? signal : code);
    });
  });
}

let stopRequested = false;

let jobSeq = 0;

async function startJob({ root, action, preview, debug, breakpoints }) {
  if (job) await stopJob();
  const id = ++jobSeq;
  await refreshEnv();
  const tc = await toolchainInfo();
  if (!tc.found) {
    ev('toolchain-missing', {});
    ev('done', { id, action, ok: false, phase: 'build' });
    return;
  }
  const isPackage = fs.existsSync(path.join(root, 'Package.swift'));
  ev('build-start', { id, action, toolchain: tc.version });
  if (!isPackage && await isSwiftUIProject(root)) {
    ev('platform', { ios: true, device: simModel() });
    ensureSimWindow(action === 'run');
    simSend('sim:state', { state: 'building', app: path.basename(root) });
  }
  const t0 = Date.now();
  const res = isPackage ? await buildPackage(root) : await buildFolderProject(root, tc.version, preview);
  ev('build-end', { id, ok: res.ok, ms: Date.now() - t0 });
  if (!res.ok || action !== 'run' || id !== jobSeq) {
    ev('done', { id, action, ok: res.ok, phase: 'build' });
    return;
  }
  if (!res.exe) {
    ev('stderr', { text: 'Could not find the built executable.\n' });
    ev('done', { id, action, ok: false, phase: 'run' });
    return;
  }
  // like Xcode, Run goes through the debugger (Edit Scheme ▸ Run ▸ Debug executable)
  const scheme = readProjectSettings(root).scheme || {};
  const debugRun = !isPackage && debug && scheme.debugExecutable !== false ? debugPrepare({ debug, breakpoints }) : null;
  // Edit Scheme ▸ Run ▸ Arguments: "Arguments Passed On Launch" and "Environment Variables"
  const launchArgs = (scheme.arguments || []).filter(a => a.enabled !== false && a.value).flatMap(a => splitArgs(a.value));
  const launchEnv = Object.fromEntries((scheme.environment || []).filter(e => e.enabled !== false && e.name).map(e => [e.name, e.value || '']));
  const code = res.ios
    ? await runIOSApp(res.exe, root, preview ? `${path.basename(root)} Preview` : path.basename(root), debugRun, { args: launchArgs, env: launchEnv })
    : await runProgram(res.exe, launchArgs, root, debugRun, launchEnv);
  ev('exit', { id, code });
  ev('done', { id, action, ok: true, phase: 'run' });
}

async function stopJob() {
  // a program paused in LLDB can't exit until the debugger lets go: end the session first (Xcode's Stop does the same)
  if (job && dbg) await debugStop(true);
  return new Promise(resolve => {
    if (!job) return resolve(false);
    const { proc } = job;
    stopRequested = true;
    const done = () => resolve(true);
    proc.once('close', done);
    execFile('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true }, () => {
      setTimeout(() => { if (job && job.proc === proc) { job = null; resolve(true); } }, 1500);
    });
  });
}

// ---------------------------------------------------------------- Debugger: LLDB through lldb-dap (breakpoints, stepping, variables)

let dbg = null;   // { proc, buf, seq, pending, waiters, pid }

function dapWrite(state, msg) {
  if (!state || state.proc.exitCode !== null) return;
  const s = JSON.stringify(msg);
  state.proc.stdin.write(`Content-Length: ${Buffer.byteLength(s, 'utf8')}\r\n\r\n${s}`);
}

function dapRequest(state, command, args, timeout = 20000) {
  return new Promise(resolve => {
    if (!state) return resolve(null);
    const seq = state.seq++;
    const t = setTimeout(() => { state.pending.delete(seq); resolve(null); }, timeout);
    state.pending.set(seq, r => { clearTimeout(t); resolve(r); });
    dapWrite(state, { seq, type: 'request', command, arguments: args });
  });
}

function dapWaitEvent(state, name, timeout = 10000) {
  return new Promise(resolve => {
    const t = setTimeout(() => { state.waiters.delete(w); resolve(null); }, timeout);
    const w = m => { if (m.event === name) { clearTimeout(t); state.waiters.delete(w); resolve(m); } };
    state.waiters.add(w);
  });
}

function onDapData(state, chunk) {
  state.buf = Buffer.concat([state.buf, chunk]);
  for (;;) {
    const sep = state.buf.indexOf('\r\n\r\n');
    if (sep < 0) return;
    const m = /Content-Length:\s*(\d+)/i.exec(state.buf.slice(0, sep).toString('ascii'));
    if (!m) { state.buf = state.buf.slice(sep + 4); continue; }
    const len = +m[1];
    if (state.buf.length < sep + 4 + len) return;
    let msg = null;
    try { msg = JSON.parse(state.buf.slice(sep + 4, sep + 4 + len).toString('utf8')); } catch {}
    state.buf = state.buf.slice(sep + 4 + len);
    if (!msg) continue;
    if (msg.type === 'response') {
      const p = state.pending.get(msg.request_seq);
      if (p) { state.pending.delete(msg.request_seq); p(msg); }
    } else if (msg.type === 'event') {
      for (const w of [...state.waiters]) w(msg);
      onDapEvent(state, msg);
    }
  }
}

async function onDapEvent(state, msg) {
  if (dbg !== state) return;
  const b = msg.body || {};
  switch (msg.event) {
    case 'stopped': {
      // gather what the debug area shows: threads, the stopped thread's frames
      const th = await dapRequest(state, 'threads', {});
      const threads = (th?.body?.threads || []).map(t => ({ id: t.id, name: t.name }));
      const tid = b.threadId || threads[0]?.id;
      const st = tid ? await dapRequest(state, 'stackTrace', { threadId: tid, startFrame: 0, levels: 40 }) : null;
      const frames = (st?.body?.stackFrames || []).map(f => ({
        id: f.id, name: f.name, line: f.line, column: f.column,
        path: f.source?.path || null, module: f.moduleId || null, hint: f.presentationHint || null,
      }));
      // attaching on Windows breaks in a helper thread (DbgBreakPoint, 0x80000003) with no code of ours on it:
      // that's not something to show — Swift traps are 0xC000001D (ud2), not int3
      if (b.reason === 'exception' && /0x80000003/i.test(`${b.description || ''} ${b.text || ''}`) && !frames.some(f => /^[A-Za-z]:[\\/][^`]*$/.test(f.path || ''))) {
        await dapRequest(state, 'continue', { threadId: tid });
        break;
      }
      send('debug:event', { event: 'stopped', reason: b.reason, description: b.description, text: b.text, threadId: tid, threads, frames, hitBreakpointIds: b.hitBreakpointIds || [] });
      break;
    }
    case 'continued': send('debug:event', { event: 'continued', threadId: b.threadId }); break;
    case 'breakpoint': send('debug:event', { event: 'breakpoint', breakpoint: b.breakpoint, reason: b.reason }); break;
    case 'exited': case 'terminated': send('debug:event', { event: 'ended' }); debugStop(); break;
    case 'output':
      // LLDB's own console messages (not the program's output, which SwiftCode already captures)
      if (b.category === 'console' && b.output && !/^Process \d+ (exited|resuming|stopped|launched)/.test(b.output)) send('debug:event', { event: 'console', text: b.output });
      break;
  }
}

function openGate(gate) { if (gate) try { fs.writeFileSync(gate, '1'); } catch {} }

/** Attaches LLDB to a process SwiftCode started (it keeps its pipes), installs breakpoints, then lets it run. */
async function debugAttach(pid, breakpoints, gate) {
  await debugStop();
  const exe = findOnPath('lldb-dap.exe');
  if (!exe) { openGate(gate); return false; }
  let proc;
  try { proc = spawn(exe, [], { env: toolEnv, windowsHide: true }); } catch { openGate(gate); return false; }
  const state = { proc, buf: Buffer.alloc(0), seq: 1, pending: new Map(), waiters: new Set(), pid };
  dbg = state;
  proc.stdout.on('data', d => onDapData(state, d));
  proc.stderr.on('data', () => {});
  proc.on('error', () => {});
  proc.on('exit', () => { for (const p of state.pending.values()) p(null); state.pending.clear(); if (dbg === state) { dbg = null; send('debug:event', { event: 'ended' }); } });
  const init = await dapRequest(state, 'initialize', { clientID: 'swiftcode', clientName: 'WinSwift Studio', adapterID: 'lldb-dap', linesStartAt1: true, columnsStartAt1: true, pathFormat: 'path', supportsVariableType: true, supportsVariablePaging: true });
  if (!init?.success) { openGate(gate); await debugStop(); return false; }
  const initialized = dapWaitEvent(state, 'initialized', 15000);
  const attach = dapRequest(state, 'attach', { pid, stopOnEntry: false }, 30000);
  await initialized;
  await debugSetBreakpoints(breakpoints, state);
  await dapRequest(state, 'setExceptionBreakpoints', { filters: [] });
  await dapRequest(state, 'configurationDone', {});
  const ok = (await attach)?.success;
  openGate(gate);
  send('debug:event', { event: ok ? 'attached' : 'failed', pid });
  return !!ok;
}

/** breakpoints: [{ path, line, enabled, condition }] — sent per file like Xcode's breakpoint list. */
async function debugSetBreakpoints(breakpoints, state = dbg) {
  if (!state) return [];
  const byFile = new Map();
  for (const b of breakpoints || []) {
    if (!b.path) continue;
    const k = b.path.toLowerCase();
    if (!byFile.has(k)) byFile.set(k, { path: b.path, list: [] });
    if (b.enabled !== false) byFile.get(k).list.push({ line: b.line, condition: b.condition || undefined });
  }
  // files that no longer have breakpoints must be cleared too
  for (const k of state.files || []) if (!byFile.has(k.toLowerCase())) byFile.set(k.toLowerCase(), { path: k, list: [] });
  const results = [];
  for (const { path: p, list } of byFile.values()) {
    const r = await dapRequest(state, 'setBreakpoints', { source: { path: p }, breakpoints: list });
    (r?.body?.breakpoints || []).forEach((bp, i) => results.push({ path: p, line: list[i]?.line, id: bp.id, verified: bp.verified }));
  }
  state.files = [...byFile.values()].filter(f => f.list.length).map(f => f.path);
  send('debug:event', { event: 'breakpoints', results });
  return results;
}

async function debugStop(terminate = false) {
  const state = dbg;
  dbg = null;
  if (!state) return;
  send('debug:event', { event: 'ended' });
  try { await dapRequest(state, 'disconnect', { terminateDebuggee: terminate }, terminate ? 4000 : 2000); } catch {}
  setTimeout(() => { try { state.proc.kill(); } catch {} }, 300);
}

/** A run under the debugger: env for the program (the gate) and what to do once it has a pid. */
function debugPrepare(opts) {
  if (!opts || !opts.debug || !findOnPath('lldb-dap.exe')) return null;
  const gate = path.join(os.tmpdir(), `swiftcode-gate-${process.pid}-${Date.now()}`);
  try { fs.rmSync(gate, { force: true }); } catch {}
  return { gate, env: { SWIFTCODE_DEBUG_GATE: gate }, attach: pid => debugAttach(pid, opts.breakpoints || [], gate).then(ok => { if (!ok) openGate(gate); }) };
}

// ---------------------------------------------------------------- Canvas: SwiftUI previews next to the editor

let canvasProc = null;
let canvasSeq = 0;

function canvasEvent(e) { send('preview:event', e); }

function canvasKill() {
  const p = canvasProc;
  canvasProc = null;
  if (!p) return Promise.resolve();
  return new Promise(resolve => {
    p.once('close', () => resolve());
    execFile('taskkill', ['/PID', String(p.pid), '/T', '/F'], { windowsHide: true }, () => setTimeout(resolve, 800));
  });
}

async function canvasStart({ root, file, index = 0, scheme, overrides }) {
  const seq = ++canvasSeq;
  await canvasKill();
  if (seq !== canvasSeq) return;
  canvasEvent({ type: 'building', seq });
  if (!toolEnv) await refreshEnv();
  const tc = await toolchainInfo();
  if (!tc.found) { canvasEvent({ type: 'error', seq, errors: [{ message: 'Swift toolchain not found' }] }); return; }
  const files = await collectFiles(root, p => p.toLowerCase().endsWith('.swift'));
  const t0 = Date.now();
  const res = await buildSwiftUIProject(root, files, tc.version, { file, index }, { quiet: true, overrides });
  if (seq !== canvasSeq) return;
  if (!res.ok) { canvasEvent({ type: 'error', seq, errors: res.errors || [] }); return; }
  const dev = device();
  const settings = readProjectSettings(root);
  const name = path.basename(root);
  const env = {
    ...toolEnv,
    SWIFTCODE_PROJECT: root,
    SWIFTCODE_APPDATA: path.join(app.getPath('userData'), 'canvas-data', name),
    SWIFTCODE_LANG: dev.language,
    SWIFTCODE_REGION: dev.region || '',
    SWIFTCODE_DEVREGION: settings.developmentRegion || 'en',
    SWIFTCODE_TZ: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    SWIFTCODE_INFO: JSON.stringify({ name, info: projectInfo(root), location: null }),
    SWIFTCODE_SCREEN: SIM_MODELS[simModel()].join('x'),
  };
  let proc;
  try { proc = spawn(res.exe, [], { cwd: root, env, windowsHide: true }); } catch (e) {
    canvasEvent({ type: 'error', seq, errors: [{ message: String(e) }] });
    return;
  }
  canvasProc = proc;
  canvasEvent({ type: 'running', seq, ms: Date.now() - t0 });
  if (scheme) proc.stdin.write('\u001eEV ' + JSON.stringify({ k: 'scheme', id: '', v: scheme }) + '\n');
  proc.stdout.setEncoding('utf8'); proc.stderr.setEncoding('utf8');
  let buf = '', errTail = '';
  proc.stdout.on('data', d => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, '');
      buf = buf.slice(i + 1);
      if (line.startsWith(UI_MARK)) canvasEvent({ type: 'frame', seq, json: line.slice(UI_MARK.length) });
    }
    if (buf && !buf.startsWith('\u001e')) buf = '';
  });
  proc.stderr.on('data', d => { errTail = (errTail + d).slice(-4000); });
  proc.on('error', () => {});
  proc.on('close', code => {
    if (canvasProc === proc) canvasProc = null;
    // a preview that dies on its own crashed (e.g. fatalError in the view)
    if (seq === canvasSeq && code !== null && code !== 0 && code !== 1) canvasEvent({ type: 'crashed', seq, code, message: errTail.trim().split(/\r?\n/).slice(-6).join('\n') });
  });
}

// ---------------------------------------------------------------- SourceKit-LSP (completion, live issues, Quick Help, refactoring)

let lsp = null;           // { proc, root, buf, pending, nextId, files }

/** compile_commands.json describing the project the way the build compiles it, so SourceKit sees the same module. */
async function writeCompileDatabase(root) {
  if (fs.existsSync(path.join(root, 'Package.swift'))) return null;   // SwiftPM projects describe themselves
  const files = await collectFiles(root, p => p.toLowerCase().endsWith('.swift'));
  if (!files.length) return null;
  const sources = await Promise.all(files.map(f => fsp.readFile(f, 'utf8').catch(() => '')));
  const ui = sources.some(s => SWIFTUI_IMPORT.test(s) || /^\s*import\s+(UIKit|Combine|CoreLocation|MapKit)\b/m.test(s));
  const hasMain = files.some(f => path.basename(f).toLowerCase() === 'main.swift');
  const args = ['swiftc', '-module-name', moduleName(path.basename(root)), ...swiftFlags()];
  if (ui) {
    const tc = await toolchainInfo();
    const rt = await ensureSwiftUIRuntime(tc.version, { silent: true });
    if (rt) {
      await ensureStubModules(rt);
      args.push('-swift-version', '5', '-enable-bare-slash-regex', '-I', rt, '-Xfrontend', '-import-module', '-Xfrontend', 'SwiftUI');
    }
    if (!hasMain) args.push('-parse-as-library');
  } else if (!hasMain && (files.length > 1 || sources.some(s => /^\s*@main\b/m.test(s)))) {
    args.push('-parse-as-library');
  }
  args.push(...files);
  const dir = path.join(root, '.build', 'swiftcode');
  await fsp.mkdir(dir, { recursive: true });
  const db = path.join(dir, 'compile_commands.json');
  await fsp.writeFile(db, JSON.stringify(files.map(f => ({ directory: root, file: f, arguments: args })), null, 1));
  return { db, files };
}

function lspWrite(state, msg) {
  if (!state || state.proc.exitCode !== null) return;
  const s = JSON.stringify(msg);
  state.proc.stdin.write(`Content-Length: ${Buffer.byteLength(s, 'utf8')}\r\n\r\n${s}`);
}

function lspRequest(state, method, params, timeout = 60000) {
  return new Promise(resolve => {
    if (!state) return resolve(null);
    const id = state.nextId++;
    const timer = setTimeout(() => { state.pending.delete(id); resolve(null); }, timeout);
    state.pending.set(id, { resolve: r => { clearTimeout(timer); resolve(r); } });
    lspWrite(state, { jsonrpc: '2.0', id, method, params });
  });
}

function onLspData(state, chunk) {
  state.buf = Buffer.concat([state.buf, chunk]);
  for (;;) {
    const sep = state.buf.indexOf('\r\n\r\n');
    if (sep < 0) return;
    const m = /Content-Length:\s*(\d+)/i.exec(state.buf.slice(0, sep).toString('ascii'));
    if (!m) { state.buf = state.buf.slice(sep + 4); continue; }
    const len = +m[1];
    if (state.buf.length < sep + 4 + len) return;
    let msg;
    try { msg = JSON.parse(state.buf.slice(sep + 4, sep + 4 + len).toString('utf8')); } catch { msg = null; }
    state.buf = state.buf.slice(sep + 4 + len);
    if (!msg) continue;
    if (msg.id != null && !msg.method) {
      const p = state.pending.get(msg.id);
      if (p) { state.pending.delete(msg.id); p.resolve(msg.error ? { error: msg.error } : { result: msg.result }); }
    } else if (msg.id != null && msg.method) {
      // requests from the server: answer what a simple client can
      let result = null;
      if (msg.method === 'workspace/configuration') result = (msg.params?.items || []).map(() => null);
      if (msg.method === 'workspace/applyEdit') { send('lsp:notification', { method: 'swiftcode/applyEdit', params: msg.params }); result = { applied: true }; }
      lspWrite(state, { jsonrpc: '2.0', id: msg.id, result });
    } else if (msg.method === 'textDocument/publishDiagnostics' || msg.method === '$/progress' || msg.method === 'window/showMessage') {
      send('lsp:notification', { method: msg.method, params: msg.params });
    }
  }
}

async function lspStop() {
  const state = lsp;
  lsp = null;
  if (!state) return;
  try {
    await Promise.race([lspRequest(state, 'shutdown', null, 3000), new Promise(r => setTimeout(r, 3000))]);
    lspWrite(state, { jsonrpc: '2.0', method: 'exit' });
  } catch {}
  setTimeout(() => { try { state.proc.kill(); } catch {} }, 500);
}

async function lspStart(root) {
  await lspStop();
  if (!toolEnv) await refreshEnv();
  const exe = findOnPath('sourcekit-lsp.exe');
  if (!exe || !root) return { ok: false, reason: 'sourcekit-lsp.exe not found' };
  send('lsp:notification', { method: 'swiftcode/status', params: { state: 'starting' } });
  const db = await writeCompileDatabase(root).catch(() => null);
  let proc;
  try { proc = spawn(exe, [], { cwd: root, env: toolEnv, windowsHide: true }); } catch (e) { return { ok: false, reason: String(e) }; }
  const state = { proc, root, buf: Buffer.alloc(0), pending: new Map(), nextId: 1, files: db ? db.files : null };
  lsp = state;
  proc.stdout.on('data', d => onLspData(state, d));
  proc.stderr.on('data', () => {});
  proc.on('error', () => {});
  proc.on('exit', () => {
    for (const p of state.pending.values()) p.resolve(null);
    state.pending.clear();
    if (lsp === state) { lsp = null; send('lsp:notification', { method: 'swiftcode/status', params: { state: 'stopped' } }); }
  });
  const rootUri = pathToFileURL(root).href;
  const init = await lspRequest(state, 'initialize', {
    processId: process.pid,
    rootUri,
    workspaceFolders: [{ uri: rootUri, name: path.basename(root) }],
    initializationOptions: { compilationDatabase: { searchPaths: ['.build/swiftcode'] } },
    capabilities: {
      workspace: { applyEdit: true, workspaceEdit: { documentChanges: true }, configuration: true, didChangeWatchedFiles: { dynamicRegistration: false } },
      window: { workDoneProgress: true },
      textDocument: {
        synchronization: { didSave: true, dynamicRegistration: false },
        completion: { completionItem: { snippetSupport: true, documentationFormat: ['markdown', 'plaintext'], labelDetailsSupport: true, insertReplaceSupport: false }, contextSupport: true },
        hover: { contentFormat: ['markdown', 'plaintext'] },
        signatureHelp: { signatureInformation: { documentationFormat: ['markdown', 'plaintext'], parameterInformation: { labelOffsetSupport: true } } },
        definition: { linkSupport: false }, references: {}, documentHighlight: {}, documentSymbol: { hierarchicalDocumentSymbolSupport: true },
        codeAction: { codeActionLiteralSupport: { codeActionKind: { valueSet: ['quickfix', 'refactor', 'refactor.extract', 'refactor.inline', 'refactor.rewrite', 'source'] } } },
        formatting: {}, rangeFormatting: {}, rename: { prepareSupport: true },
        publishDiagnostics: { relatedInformation: true, codeDescriptionSupport: true },
      },
    },
  }, 120000);
  if (!init || init.error || lsp !== state) return { ok: false, reason: init?.error?.message || 'SourceKit did not start' };
  lspWrite(state, { jsonrpc: '2.0', method: 'initialized', params: {} });
  send('lsp:notification', { method: 'swiftcode/status', params: { state: 'ready' } });
  return { ok: true, capabilities: init.result?.capabilities || {} };
}

/** Called when files appear or disappear: SourceKit needs a fresh compile_commands.json. */
const lspFilesChanged = (() => {
  let t = null;
  return root => {
    clearTimeout(t);
    t = setTimeout(async () => {
      if (!lsp || norm(lsp.root) !== norm(root)) return;
      const files = await collectFiles(root, p => p.toLowerCase().endsWith('.swift'));
      const key = files.map(f => f.toLowerCase()).sort().join('|');
      const old = (lsp.files || []).map(f => f.toLowerCase()).sort().join('|');
      if (key === old) return;
      const db = await writeCompileDatabase(root).catch(() => null);
      if (!db || !lsp) return;
      lsp.files = db.files;
      lspWrite(lsp, { jsonrpc: '2.0', method: 'workspace/didChangeWatchedFiles', params: { changes: [{ uri: pathToFileURL(db.db).href, type: 2 }] } });
    }, 800);
  };
})();

// ---------------------------------------------------------------- IPC

function registerIpc() {
  ipcMain.handle('debug:request', async (_e, command, args) => {
    if (!dbg) return null;
    // the first `po` warms up LLDB's Swift/Clang importer, which can take a while
    const r = await dapRequest(dbg, command, args, command === 'evaluate' ? 120000 : 20000);
    return r ? { success: r.success, body: r.body, message: r.message } : null;
  });
  ipcMain.handle('debug:setBreakpoints', (_e, list) => debugSetBreakpoints(list));
  ipcMain.handle('debug:active', () => !!dbg);
  ipcMain.handle('preview:start', (_e, opts) => { canvasStart(opts).catch(e => canvasEvent({ type: 'error', seq: canvasSeq, errors: [{ message: String(e?.message || e) }] })); return true; });
  ipcMain.handle('preview:stop', () => { canvasSeq++; return canvasKill(); });
  ipcMain.handle('preview:input', (_e, ev) => {
    if (canvasProc && canvasProc.stdin.writable) canvasProc.stdin.write('\u001eEV ' + JSON.stringify(ev) + '\n');
  });
  ipcMain.handle('preview:info', () => {
    const dir = path.join(__dirname, 'node_modules', 'lucide-static', 'icons');
    if (!lucideNames) lucideNames = safeReaddir(dir).filter(f => f.endsWith('.svg')).map(f => f.slice(0, -4));
    return { icons: lucideNames, iconBase: pathToFileURL(dir).href };
  });
  ipcMain.handle('lsp:start', (_e, root) => lspStart(root));
  ipcMain.handle('lsp:stop', () => lspStop());
  ipcMain.handle('lsp:request', async (_e, method, params) => {
    if (!lsp) return { error: { message: 'SourceKit is not running' } };
    return lspRequest(lsp, method, params, method === 'textDocument/completion' ? 20000 : 30000);
  });
  ipcMain.handle('lsp:notify', (_e, method, params) => { if (lsp) lspWrite(lsp, { jsonrpc: '2.0', method, params }); });

  ipcMain.handle('state:get', () => loadState());
  ipcMain.handle('state:set', (_e, patch) => saveState(patch));

  ipcMain.handle('dialog:openFolder', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Open Project Folder', properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('dialog:openFile', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Open File', properties: ['openFile'], filters: [{ name: 'Swift', extensions: ['swift'] }, { name: 'All Files', extensions: ['*'] }] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('dialog:chooseLocation', async (_e, name) => {
    const r = await dialog.showOpenDialog(win, { title: `Choose where to create "${name}"`, buttonLabel: 'Create', properties: ['openDirectory', 'createDirectory'], defaultPath: path.join(os.homedir(), 'Documents') });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('dialog:confirm', async (_e, { message, detail, buttons }) => {
    const r = await dialog.showMessageBox(win, { type: 'warning', message, detail, buttons, defaultId: 0, cancelId: buttons.length - 1, noLink: true });
    return r.response;
  });

  ipcMain.handle('project:create', (_e, opts) => createProject(opts));
  ipcMain.handle('project:tree', (_e, root) => readTree(root));
  ipcMain.handle('project:watch', (_e, root) => watchProject(root));
  ipcMain.handle('project:files', (_e, root) => collectFiles(root, p => TEXT_EXT.test(p) || !path.extname(p)));
  ipcMain.handle('project:exists', (_e, p) => fs.existsSync(p));

  ipcMain.handle('project:settings', (_e, root) => ({ ...readProjectSettings(root), info: readProjectSettings(root).info || {} }));
  ipcMain.handle('project:setSettings', (_e, root, patch) => writeProjectSettings(root, patch));
  ipcMain.handle('project:localizations', (_e, root) => projectLocalizations(root));
  ipcMain.handle('project:localize', (_e, root, file, lang) => localizeFile(root, file, lang));
  ipcMain.handle('project:copyLocalization', async (_e, root, file, lang) => {
    const target = path.join(path.dirname(path.dirname(file)), `${lang}.lproj`, path.basename(file));
    await fsp.mkdir(path.dirname(target), { recursive: true });
    if (!fs.existsSync(target)) await fsp.copyFile(file, target);
    addKnownRegion(root, lang);
    return target;
  });
  ipcMain.handle('project:addLanguage', async (_e, root, lang, files) => {
    for (const f of files || []) {
      const target = path.join(path.dirname(path.dirname(f)), `${lang}.lproj`, path.basename(f));
      await fsp.mkdir(path.dirname(target), { recursive: true });
      if (!fs.existsSync(target)) await fsp.copyFile(f, target);
    }
    addKnownRegion(root, lang);
    return true;
  });
  ipcMain.handle('project:removeLanguage', async (_e, root, lang) => {
    const dirs = [];
    (function walk(d) {
      for (const e of safeReaddirEnt(d)) {
        if (!e.isDirectory() || IGNORED_DIRS.has(e.name) || e.name.startsWith('.')) continue;
        const p = path.join(d, e.name);
        if (e.name.toLowerCase() === `${lang.toLowerCase()}.lproj`) dirs.push(p); else walk(p);
      }
    })(root);
    for (const d of dirs) await shell.trashItem(d);
    const s = readProjectSettings(root);
    writeProjectSettings(root, { knownRegions: (s.knownRegions || []).filter(r => r !== lang) });
    return dirs.length;
  });
  ipcMain.handle('assets:list', (_e, dir) => listAssets(dir));
  ipcMain.handle('assets:import', (_e, dir, files) => importAssets(dir, files));
  ipcMain.handle('assets:setImage', (_e, set, scale, file) => setAssetImage(set, scale, file));
  ipcMain.handle('assets:newColor', (_e, dir, name) => newColorSet(dir, name));
  ipcMain.handle('assets:newImageSet', (_e, dir, name) => newImageSet(dir, name));
  ipcMain.handle('assets:setColor', (_e, set, rgba, appearance) => setColorSet(set, rgba, appearance));
  ipcMain.handle('assets:rename', async (_e, set, name) => {
    const to = path.join(path.dirname(set), name + path.extname(set));
    if (fs.existsSync(to)) throw new Error(`"${name}" already exists.`);
    await fsp.rename(set, to);
    return to;
  });
  ipcMain.handle('fs:import', async (_e, dir, files) => {
    const out = [];
    for (const f of files) {
      const to = path.join(dir, path.basename(f));
      if (norm(f) === norm(to)) continue;
      await fsp.cp(f, to, { recursive: true, force: false, errorOnExist: false });
      out.push(to);
    }
    return out;
  });
  ipcMain.handle('dialog:openImages', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Import', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic', 'pdf', 'bmp'] }] });
    return r.canceled ? [] : r.filePaths;
  });
  ipcMain.handle('dialog:openFiles', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Add Files', properties: ['openFile', 'multiSelections'] });
    return r.canceled ? [] : r.filePaths;
  });

  ipcMain.handle('fs:read', async (_e, p) => {
    const buf = await fsp.readFile(p);
    // .strings files are often UTF-16
    if (buf[0] === 0xff && buf[1] === 0xfe) return { binary: false, content: buf.slice(2).toString('utf16le') };
    if (buf.includes(0)) return { binary: true, content: '' };
    return { binary: false, content: buf.toString('utf8') };
  });
  ipcMain.handle('fs:write', (_e, p, content) => fsp.writeFile(p, content, 'utf8'));
  ipcMain.handle('fs:newFile', async (_e, dir, name, projectName, kind) => {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) throw new Error(`"${name}" already exists.`);
    if (kind === 'assets') { await newAssetCatalog(p); return p; }
    await fsp.writeFile(p, fileTemplate(name, projectName, kind));
    return p;
  });
  ipcMain.handle('fs:newFolder', async (_e, dir, name) => {
    const p = path.join(dir, name);
    await fsp.mkdir(p, { recursive: true });
    return p;
  });
  ipcMain.handle('fs:rename', async (_e, from, toName) => {
    const to = path.join(path.dirname(from), toName);
    if (fs.existsSync(to)) throw new Error(`"${toName}" already exists.`);
    await fsp.rename(from, to);
    return to;
  });
  ipcMain.handle('fs:trash', (_e, p) => shell.trashItem(p));
  ipcMain.handle('fs:reveal', (_e, p) => shell.showItemInFolder(p));
  ipcMain.handle('fs:openPath', (_e, p) => shell.openPath(p));
  ipcMain.handle('fs:cleanBuild', async (_e, root) => {
    await fsp.rm(path.join(root, '.build'), { recursive: true, force: true });
    return true;
  });

  ipcMain.handle('search', async (_e, root, query, opts = {}) => {
    if (!query) return [];
    const files = await collectFiles(root, p => TEXT_EXT.test(p));
    let re;
    try {
      const src = opts.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      re = new RegExp(opts.word ? `\\b${src}\\b` : src, opts.caseSensitive ? 'g' : 'gi');
    } catch { return []; }
    const results = [];
    let total = 0;
    for (const f of files) {
      let text;
      try { text = await fsp.readFile(f, 'utf8'); } catch { continue; }
      const lines = text.split(/\r?\n/);
      const matches = [];
      lines.forEach((l, i) => {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(l)) && total < 2000) {
          matches.push({ line: i + 1, col: m.index + 1, len: m[0].length || 1, text: l });
          total++;
          if (!m[0].length) re.lastIndex++;
        }
      });
      if (matches.length) results.push({ file: f, matches });
    }
    return results;
  });

  ipcMain.handle('toolchain:info', async (_e, refresh) => { if (refresh) await refreshEnv(); return toolchainInfo(); });
  ipcMain.handle('build:start', (_e, opts) => { startJob(opts).catch(e => { ev('log', { text: String(e?.stack || e) }); ev('done', { ok: false, phase: 'build' }); }); return true; });
  ipcMain.handle('build:stop', () => stopJob());
  ipcMain.handle('sdk:install', () => new Promise(resolve => {
    // reuse Electron's bundled Node to run the per-user SDK fetcher
    const proc = spawn(process.execPath, [path.join(__dirname, 'scripts', 'fetch-winsdk.js')], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true,
    });
    proc.stdout.setEncoding('utf8'); proc.stderr.setEncoding('utf8');
    proc.stdout.on('data', d => ev('stdout', { text: d }));
    proc.stderr.on('data', d => ev('stderr', { text: d }));
    proc.on('close', async code => { await refreshEnv(); resolve(code === 0); });
  }));
  ipcMain.handle('build:stdin', (_e, text) => {
    if (job && job.kind === 'run' && job.proc.stdin.writable) { job.proc.stdin.write(text); return true; }
    return false;
  });
  ipcMain.handle('build:eof', () => { if (job && job.kind === 'run') job.proc.stdin.end(); });

  ipcMain.handle('menu:popup', (_e, { items, x, y }) => new Promise(resolve => {
    let chosen = null;
    const build = arr => arr.map(it => {
      if (it.type === 'separator') return { type: 'separator' };
      const item = { label: it.label, enabled: it.enabled !== false };
      if (it.accel) { item.accelerator = it.accel; item.registerAccelerator = false; }
      if (it.checked !== undefined) { item.type = 'checkbox'; item.checked = !!it.checked; }
      if (it.submenu) item.submenu = build(it.submenu);
      else item.click = () => { chosen = it.id; };
      return item;
    });
    const menu = Menu.buildFromTemplate(build(items));
    menu.popup({ window: win, x: Math.round(x), y: Math.round(y), callback: () => setTimeout(() => resolve(chosen), 0) });
  }));

  // ---- simulator
  ipcMain.handle('sim:info', () => {
    const dir = path.join(__dirname, 'node_modules', 'lucide-static', 'icons');
    if (!lucideNames) lucideNames = safeReaddir(dir).filter(f => f.endsWith('.svg')).map(f => f.slice(0, -4));
    return { icons: lucideNames, iconBase: pathToFileURL(dir).href, app: simApp };
  });
  ipcMain.on('sim:ready', () => {
    simReady = true;
    for (const [c, p] of simQueue) simWin?.webContents.send(c, p);
    simQueue = [];
    // test hook: SWIFTCODE_DEBUG=1 + SWIFTCODE_SIMSCRIPT="<js>" runs in the simulator page
    if (process.env.SWIFTCODE_DEBUG && process.env.SWIFTCODE_SIMSCRIPT && !simWin.__scripted) {
      simWin.__scripted = true;
      simWin.webContents.executeJavaScript(process.env.SWIFTCODE_SIMSCRIPT).catch(e => console.log('[simscript]', e));
    }
  });
  ipcMain.on('sim:event', (_e, payload) => {
    if (job && job.ios && job.proc.stdin.writable) job.proc.stdin.write('\u001eEV ' + JSON.stringify(payload) + '\n');
  });
  ipcMain.handle('sim:device', () => ({ ...device(), model: simModel(), presets: LOCATION_PRESETS, languages: SIM_LANGUAGES }));
  ipcMain.handle('sim:setModel', (_e, name) => { setSimModel(name); return simModel(); });
  ipcMain.on('sim:permissionResult', (_e, { rid, kind, v, app: appName }) => {
    // "Allow Once" isn't remembered, like iOS
    if (v !== 'once') {
      const d = device();
      setDevice({ perms: { ...d.perms, [appName]: { ...(d.perms[appName] || {}), [kind]: v } } });
    }
    // an answer from Settings ▸ Privacy changes a running app's status directly
    if (rid) sendToApp({ k: 'rs', id: rid, v }); else if (appName === simApp) sendToApp({ k: 'locStatus', id: '', v });
  });
  ipcMain.on('sim:shake', () => doShake());
  ipcMain.on('sim:scene', (_e, phase) => sendToApp({ k: 'scene', id: '', v: phase }));
  ipcMain.on('sim:setLanguage', (_e, lang) => setSimLanguage(lang));
  ipcMain.on('sim:setLocation', (_e, loc) => setSimLocation(loc));
  ipcMain.on('sim:resetPermissions', (_e, appName) => {
    const d = device();
    const perms = { ...d.perms };
    if (appName) delete perms[appName]; else for (const k of Object.keys(perms)) delete perms[k];
    setDevice({ perms });
    sendToApp({ k: 'locStatus', id: '', v: 'notDetermined' });
  });
  ipcMain.handle('sim:menu', (_e, { x, y }) => showSimMenu(x, y));
  ipcMain.on('sim:run', () => send('app:command', 'run'));
  ipcMain.on('sim:close', () => { if (job && job.ios) stopJob(); simWin?.hide(); });
  ipcMain.on('sim:minimize', () => simWin?.minimize());
  ipcMain.on('sim:openLink', (_e, url) => { if (/^https?:/i.test(url)) shell.openExternal(url); });
  ipcMain.handle('sim:screenshot', async (_e, rect) => {
    if (!simWin) return null;
    const img = await simWin.webContents.capturePage(rect);
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} at ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}.${String(d.getSeconds()).padStart(2, '0')}`;
    // test hook: SWIFTCODE_SHOTDIR keeps screenshots off the Desktop
    const file = path.join(process.env.SWIFTCODE_SHOTDIR || app.getPath('desktop'), `Simulator Screenshot - ${simModel()} - ${stamp}.png`);
    fs.writeFileSync(file, img.toPNG());
    return file;
  });
  ipcMain.handle('sim:show', () => { ensureSimWindow(true); simWin.show(); simWin.focus(); });

  ipcMain.handle('app:openExternal', (_e, url) => shell.openExternal(url));
  ipcMain.handle('app:devtools', () => win.webContents.toggleDevTools());
  ipcMain.handle('app:fullscreen', () => win.setFullScreen(!win.isFullScreen()));
  ipcMain.handle('app:version', () => app.getVersion());
  // the Swift toolchain + VS Build Tools installer script (winget) in its own console window
  ipcMain.handle('toolchain:install', async () => {
    const bat = path.join(__dirname, 'packaging', 'Zainstaluj-Swift-i-narzedzia.bat');
    if (!fs.existsSync(bat)) { shell.openExternal('https://www.swift.org/install/windows/'); return false; }
    return (await shell.openPath(bat)) === '';
  });
  // Help ▸ Check for Updates: the newest release on GitHub
  ipcMain.handle('app:checkUpdate', () => new Promise(resolve => {
    const req = https.get('https://api.github.com/repos/CpMiko2005pl/winswift-studio/releases/latest',
      { headers: { 'User-Agent': 'WinSwift-Studio', Accept: 'application/vnd.github+json' }, timeout: 8000 }, res => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', d => { body += d; });
        res.on('end', () => {
          try {
            const j = JSON.parse(body);
            const setup = (j.assets || []).find(a => /setup.*\.exe$/i.test(a.name));
            resolve({ current: app.getVersion(), latest: String(j.tag_name || '').replace(/^v/i, ''), url: j.html_url, setup: setup?.browser_download_url || null, notes: j.name || '' });
          } catch { resolve(null); }
        });
      });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  }));
  ipcMain.handle('app:initialPath', () => {
    const p = initialPath();
    if (!p) return null;
    return fs.statSync(p).isDirectory() ? { folder: p } : { folder: path.dirname(p), file: p };
  });
  ipcMain.handle('app:eval', (_e, js) => (process.env.SWIFTCODE_DEBUG ? js : null));
  ipcMain.handle('app:quit', () => app.quit());
}

// ---------------------------------------------------------------- window

function createWindow() {
  const s = loadState();
  const b = s.bounds || {};
  win = new BrowserWindow({
    width: b.width || 1440,
    height: b.height || 900,
    x: b.x, y: b.y,
    minWidth: 900,
    minHeight: 560,
    show: false,
    title: 'WinSwift Studio',
    backgroundColor: '#1f1f24',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#2b2b2f', symbolColor: '#d6d6d8', height: 52 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });
  if (s.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  const remember = () => {
    if (!win || win.isDestroyed()) return;
    const patch = { maximized: win.isMaximized() };
    if (!win.isMaximized() && !win.isMinimized()) patch.bounds = win.getBounds();
    saveState(patch);
  };
  win.on('closed', () => { if (simWin && !simWin.isDestroyed()) simWin.destroy(); });
  win.on('resize', remember);
  win.on('move', remember);
  win.on('close', e => {
    if (win.__forceClose) return;
    e.preventDefault();
    send('app:before-close');
  });
  ipcMain.removeHandler('app:close-confirmed');
  ipcMain.handle('app:close-confirmed', () => { win.__forceClose = true; stopJob(); win.close(); });

  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', e => e.preventDefault());

  // diagnostics: SWIFTCODE_DEBUG=1 mirrors renderer console, SWIFTCODE_SHOT=<png> captures the window
  if (process.env.SWIFTCODE_DEBUG) {
    win.webContents.on('console-message', (_e, level, message, line, source) => {
      console.log(`[renderer:${level}] ${message} (${path.basename(source || '')}:${line})`);
    });
    // test hook: a SWIFTCODE_SCRIPT can take screenshots (of the IDE or the simulator) and quit when done
    ipcMain.handle('app:testShot', async (_e, file, which) => {
      const w = which === 'sim' ? simWin : win;
      if (!w || w.isDestroyed()) return false;
      fs.writeFileSync(file, (await w.webContents.capturePage()).toPNG());
      return true;
    });
    ipcMain.handle('app:testQuit', () => { win.__forceClose = true; app.quit(); });
  }
  if (process.env.SWIFTCODE_SHOT) {
    const shots = process.env.SWIFTCODE_SHOT.split(';');
    const delay = +(process.env.SWIFTCODE_SHOT_DELAY || 5000);
    win.webContents.once('did-finish-load', () => {
      shots.forEach((file, i) => setTimeout(async () => {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(file, img.toPNG());
        console.log('screenshot', file);
        if (i === shots.length - 1 && process.env.SWIFTCODE_SHOT_QUIT) { win.__forceClose = true; app.quit(); }
      }, delay * (i + 1)));
    });
  }
}

function initialPath() {
  const args = process.argv.slice(app.isPackaged ? 1 : 2).filter(a => !a.startsWith('-'));
  for (const a of args) {
    const p = path.resolve(a);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

Menu.setApplicationMenu(null);
app.setAppUserModelId('local.swiftcode.ide');
// The transparent simulator window makes Chromium think the IDE window is occluded and it stops painting it.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

app.whenReady().then(async () => {
  registerIpc();
  refreshEnv();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  if (lsp) try { lsp.proc.kill(); } catch {}
  if (canvasProc) try { execFile('taskkill', ['/PID', String(canvasProc.pid), '/T', '/F'], { windowsHide: true }); } catch {}
});
