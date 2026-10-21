// SwiftUI for Windows — core: view protocol, render graph, JSON tree, run loop.
// The program renders its view hierarchy into a JSON tree that SwiftCode's iPhone simulator draws,
// and receives taps / text input back as JSON lines on stdin.

@_exported import Foundation
@_exported import Observation
#if canImport(CRT)
import CRT
#endif

// MARK: - JSON

public indirect enum _J {
    case s(String), n(Double), b(Bool), a([_J]), o([String: _J]), nodes([_Node]), null

    func write(into out: inout String) {
        switch self {
        case .s(let v): _jsonString(v, into: &out)
        case .n(let v):
            if v.isNaN { out += "0" }
            else if v.isInfinite { out += v > 0 ? "\"inf\"" : "\"-inf\"" }
            else if v == v.rounded() && abs(v) < 1e15 { out += String(Int64(v)) }
            else { out += String(v) }
        case .b(let v): out += v ? "true" : "false"
        case .a(let items):
            out += "["
            for (i, x) in items.enumerated() { if i > 0 { out += "," }; x.write(into: &out) }
            out += "]"
        case .o(let dict):
            out += "{"
            for (i, k) in dict.keys.sorted().enumerated() {
                if i > 0 { out += "," }
                _jsonString(k, into: &out); out += ":"; dict[k]!.write(into: &out)
            }
            out += "}"
        case .nodes(let ns):
            out += "["
            for (i, n) in ns.enumerated() { if i > 0 { out += "," }; n.write(into: &out) }
            out += "]"
        case .null: out += "null"
        }
    }
}

func _jsonString(_ s: String, into out: inout String) {
    out += "\""
    for u in s.unicodeScalars {
        switch u {
        case "\"": out += "\\\""
        case "\\": out += "\\\\"
        case "\n": out += "\\n"
        case "\r": out += "\\r"
        case "\t": out += "\\t"
        default:
            if u.value < 0x20 { out += String(format: "\\u%04x", u.value) } else { out.unicodeScalars.append(u) }
        }
    }
    out += "\""
}

extension _J {
    static func num<T: BinaryFloatingPoint>(_ v: T) -> _J { .n(Double(v)) }
    static func int<T: BinaryInteger>(_ v: T) -> _J { .n(Double(v)) }
    static func opt<T: BinaryFloatingPoint>(_ v: T?) -> _J { v.map { .n(Double($0)) } ?? .null }
}

/// One element of the rendered tree.
public final class _Node {
    var t: String
    var id: String
    var p: [String: _J]
    var c: [_Node]
    var m: [[String: _J]] = []
    var tag: AnyHashable?

    init(_ t: String, _ id: String, _ p: [String: _J] = [:], _ c: [_Node] = []) {
        self.t = t; self.id = id; self.p = p; self.c = c
    }

    func write(into out: inout String) {
        var o: [String: _J] = ["t": .s(t), "id": .s(id)]
        if !p.isEmpty { o["p"] = .o(p) }
        if !c.isEmpty { o["c"] = .nodes(c) }
        if !m.isEmpty { o["m"] = .a(m.map { .o($0) }) }
        _J.o(o).write(into: &out)
    }

    /// Plain text content (used for pickers, alerts, back buttons…)
    var plainText: String {
        if t == "text", case .a(let segs)? = p["segs"] {
            return segs.compactMap { if case .o(let d) = $0, case .s(let s)? = d["s"] { return s }; return nil }.joined()
        }
        return c.map(\.plainText).filter { !$0.isEmpty }.joined(separator: " ")
    }

    func findMod(_ k: String) -> [String: _J]? {
        for mod in m { if case .s(k)? = mod["k"] { return mod } }
        for child in c { if let f = child.findMod(k) { return f } }
        return nil
    }
}

// MARK: - View

@MainActor
public protocol View {
    associatedtype Body: View
    @ViewBuilder @MainActor var body: Body { get }
}

extension Never: View {
    public typealias Body = Never
    public var body: Never { fatalError("Never has no body") }
}

/// Views that render themselves directly instead of through `body`.
@MainActor
public protocol _PrimitiveView {
    func _render(_ ctx: _Ctx) -> [_Node]
}

extension _PrimitiveView {
    public var body: Never { fatalError("primitive view") }
}

@MainActor
public func _resolve<V: View>(_ view: V, _ ctx: _Ctx) -> [_Node] {
    if let p = view as? _PrimitiveView { return p._render(ctx) }
    if view is any UIViewRepresentable || view is any UIViewControllerRepresentable {
        // UIKit views can't be hosted in the simulator: show where they would be
        let name = String(describing: V.self)
        return [_Node("vstack", ctx.path, ["align": .s("center"), "spacing": .n(4), "placeholder": .s(name)], [
            _Node("symbol", ctx.path + "/i", ["name": .s("square.dashed"), "resizable": .b(false)]),
            _Node("text", ctx.path + "/t", ["segs": .a([.o(["s": .s(name), "st": .o(["fontSize": .s("13px"), "color": .s("var(--label2)")])])])]),
        ])]
    }
    _installDynamicProperties(view, ctx)
    let name = String(describing: V.self).split(separator: "<").first.map(String.init) ?? "V"
    return _resolve(view.body, ctx.child(name))
}

@MainActor
func _installDynamicProperties(_ value: Any, _ ctx: _Ctx) {
    for child in Mirror(reflecting: value).children {
        if let label = child.label, let p = child.value as? _DynamicProperty {
            p._install(key: label, ctx: ctx)
        }
    }
}

public protocol _DynamicProperty {
    func _install(key: String, ctx: _Ctx)
}

// MARK: - Render context

public final class _NavContext {
    var destinations: [ObjectIdentifier: (Any) -> AnyView] = [:]
    let push: (_NavEntry) -> Void
    init(push: @escaping (_NavEntry) -> Void) { self.push = push }
}

public final class _Ctx {
    public let path: String
    let graph: _Graph
    var env: EnvironmentValues
    var nav: _NavContext?
    var dismissOnTap: (() -> Void)?
    var parentAxis: String = "v"

    init(path: String, graph: _Graph, env: EnvironmentValues) {
        self.path = path; self.graph = graph; self.env = env
    }

    func child(_ component: String) -> _Ctx {
        let c = _Ctx(path: path + "/" + component, graph: graph, env: env)
        c.nav = nav; c.dismissOnTap = dismissOnTap; c.parentAxis = parentAxis
        return c
    }

    /// Same identity, separately modifiable environment.
    func copy() -> _Ctx {
        let c = _Ctx(path: path, graph: graph, env: env)
        c.nav = nav; c.dismissOnTap = dismissOnTap; c.parentAxis = parentAxis
        return c
    }

    func action(_ id: String, _ fn: @escaping @MainActor () -> Void) {
        if let dismiss = dismissOnTap {
            graph.actions[id] = { fn(); dismiss() }
        } else {
            graph.actions[id] = fn
        }
    }
}

// MARK: - Graph (persistent state between renders)

public final class _Box<T> {
    var value: T
    init(_ v: T) { value = v }
}

public enum _NavEntry {
    case view(AnyView, title: String)
    case value(AnyHashable)
}

public final class _Graph: @unchecked Sendable {
    var storage: [String: AnyObject] = [:]
    var actions: [String: @MainActor () -> Void] = [:]
    var textSetters: [String: @MainActor (String) -> Void] = [:]
    var boolSetters: [String: @MainActor (Bool) -> Void] = [:]
    var numSetters: [String: @MainActor (Double) -> Void] = [:]
    var indexSetters: [String: @MainActor (Int) -> Void] = [:]
    var gestures: [String: _GesturePart] = [:]
    var appeared: Set<String> = []
    var seenThisRender: Set<String> = []
    var pendingAfterRender: [@MainActor () -> Void] = []

    func box<T>(_ key: String, _ initial: () -> T) -> _Box<T> {
        if let b = storage[key] as? _Box<T> { return b }
        let b = _Box(initial())
        storage[key] = b
        return b
    }

    func removeStorage(prefix: String) {
        for k in storage.keys where k.hasPrefix(prefix) { storage.removeValue(forKey: k) }
        appeared = appeared.filter { !$0.hasPrefix(prefix) }
    }
}

// MARK: - Runtime

public final class _Runtime: @unchecked Sendable {
    nonisolated(unsafe) public static let shared = _Runtime()

    let graph = _Graph()
    var root: (@MainActor (_Ctx) -> [_Node])?
    var lastSent = ""
    var renderScheduled = false
    var rendering = false

    /// Called by @State / @Published / bindings whenever data changes.
    public static func setNeedsRender() {
        let rt = shared
        if rt.renderScheduled { return }
        rt.renderScheduled = true
        DispatchQueue.main.async {
            MainActor.assumeIsolated { rt.render() }
        }
    }

    @MainActor
    func render() {
        renderScheduled = false
        guard let root, !rendering else { return }
        rendering = true
        defer { rendering = false }
        var passes = 0
        repeat {
            passes += 1
            graph.actions = [:]; graph.textSetters = [:]; graph.boolSetters = [:]
            graph.numSetters = [:]; graph.indexSetters = [:]; graph.gestures = [:]
            graph.seenThisRender = []
            let ctx = _Ctx(path: "r", graph: graph, env: EnvironmentValues())
            let nodes = root(ctx)
            // onAppear / onChange handlers run after the tree is built, then we render again if needed
            let pending = graph.pendingAfterRender
            graph.pendingAfterRender = []
            var out = "\u{1E}UI "
            _J.nodes(nodes).write(into: &out)
            if pending.isEmpty || passes >= 4 {
                if out != lastSent {
                    lastSent = out
                    _emit(out)
                }
                for p in pending { p() }
                break
            }
            for p in pending { p() }
        } while true
        // handlers above may have changed state without a render in flight
        if renderScheduled == false, graph.pendingAfterRender.isEmpty == false { _Runtime.setNeedsRender() }
    }

    @MainActor
    func handle(_ line: String) {
        guard line.hasPrefix("\u{1E}EV ") else { return }
        let json = String(line.dropFirst(4))
        guard let data = json.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let kind = obj["k"] as? String, let id = obj["id"] as? String else { return }
        switch kind {
        case "tap": graph.actions[id]?()
        case "text": if let v = obj["v"] as? String { graph.textSetters[id]?(v) }
        case "bool": if let v = obj["v"] as? Bool { graph.boolSetters[id]?(v) }
        case "num":
            if let v = obj["v"] as? Double { graph.numSetters[id]?(v) }
            else if let v = obj["v"] as? Int { graph.numSetters[id]?(Double(v)) }
        case "index":
            if let v = obj["v"] as? Int { graph.indexSetters[id]?(v) }
            else if let v = obj["v"] as? Double { graph.indexSetters[id]?(Int(v)) }
        case "refresh": lastSent = ""
        case "scheme": _currentScheme = (obj["v"] as? String) == "dark" ? .dark : .light
        case "gesture": if let v = obj["v"] as? [String: Any] { _dispatchGesture(graph, id, v) }
        case "shake": _UIKit.shake()
        case "scene": _scenePhase = ScenePhase(rawValue: obj["v"] as? String ?? "active") ?? .active
        case "rs":
            // reply to a request the app made (geocoding, permission prompt…)
            if let f = requests.removeValue(forKey: id) { f(obj["v"]) }
        default:
            listeners[kind]?(obj["v"])
        }
        render()
    }

    // MARK: requests to SwiftCode (the "device": permission prompts, GPS, geocoding)

    var requests: [String: @MainActor (Any?) -> Void] = [:]
    var listeners: [String: @MainActor (Any?) -> Void] = [:]
    var requestSeq = 0

    /// Sends `\u{1E}RQ {json}` to SwiftCode; the answer comes back as an `rs` event.
    @MainActor
    public static func request(_ kind: String, _ payload: [String: Any] = [:], reply: (@MainActor (Any?) -> Void)? = nil) {
        let rt = shared
        rt.requestSeq += 1
        let rid = "rq\(rt.requestSeq)"
        if let reply { rt.requests[rid] = reply }
        var obj = payload
        obj["k"] = kind
        obj["rid"] = rid
        guard let data = try? JSONSerialization.data(withJSONObject: obj), let json = String(data: data, encoding: .utf8) else { return }
        _emit("\u{1E}RQ " + json)
    }

    /// Events SwiftCode pushes on its own (e.g. `loc` while location updates run).
    @MainActor
    public static func listen(_ kind: String, _ fn: @escaping @MainActor (Any?) -> Void) { shared.listeners[kind] = fn }
}

func _emit(_ s: String) {
    let line = s + "\n"
    FileHandle.standardOutput.write(line.data(using: .utf8)!)
}

public enum ScenePhase: String, Hashable, Sendable { case background, inactive, active }
nonisolated(unsafe) var _scenePhase: ScenePhase = .active

/// Values SwiftCode passes in when it launches the app (Info.plist keys, granted permissions…).
let _launchInfo: [String: Any] = {
    guard let s = ProcessInfo.processInfo.environment["SWIFTCODE_INFO"], let d = s.data(using: .utf8),
          let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { return [:] }
    return o
}()

/// The app's Info.plist keys as configured in the project editor.
var _infoPlist: [String: Any] { (_launchInfo["info"] as? [String: Any]) ?? [:] }
var _appDisplayName: String { (_launchInfo["name"] as? String) ?? "App" }

@MainActor
func _runApp(_ makeRoot: @escaping @MainActor (_Ctx) -> [_Node]) -> Never {
    #if canImport(CRT)
    setvbuf(__acrt_iob_func(1), nil, _IONBF, 0)
    setvbuf(__acrt_iob_func(2), nil, _IONBF, 0)
    #endif
    // Run with the debugger: SwiftCode attaches LLDB, installs the breakpoints, then opens this gate.
    if let gate = ProcessInfo.processInfo.environment["SWIFTCODE_DEBUG_GATE"] {
        var waited = 0
        while waited < 1000 && !FileManager.default.fileExists(atPath: gate) { Thread.sleep(forTimeInterval: 0.01); waited += 1 }
    }
    let rt = _Runtime.shared
    rt.root = makeRoot
    let reader = Thread {
        // readLine() decodes with the ANSI code page on Windows; events are UTF-8 JSON, so read raw bytes
        var pending = [UInt8]()
        while true {
            let chunk = FileHandle.standardInput.availableData
            if chunk.isEmpty { break }
            pending.append(contentsOf: chunk)
            while let nl = pending.firstIndex(of: 0x0A) {
                var bytes = pending[..<nl]
                if bytes.last == 0x0D { bytes = bytes.dropLast() }
                let line = String(decoding: bytes, as: UTF8.self)
                pending.removeSubrange(...nl)
                DispatchQueue.main.async { MainActor.assumeIsolated { rt.handle(line) } }
            }
        }
        // stdin closed (the IDE stopped us): quit once queued work is done
        DispatchQueue.main.async { exit(0) }
    }
    reader.start()
    rt.render()
    // periodic refresh picks up changes from timers, async tasks and @Observable models
    let timer = DispatchSource.makeTimerSource(queue: .main)
    timer.schedule(deadline: .now() + .milliseconds(250), repeating: .milliseconds(250))
    timer.setEventHandler { MainActor.assumeIsolated { rt.render() } }
    timer.resume()
    _keepAlive = timer
    RunLoop.main.run()
    exit(0)
}

nonisolated(unsafe) var _keepAlive: Any?

// MARK: - App & Scene

@MainActor
public protocol App {
    associatedtype Body: Scene
    @SceneBuilder @MainActor var body: Body { get }
    init()
}

extension App {
    @MainActor
    public static func main() {
        // corelibs reports GMT on Windows; SwiftCode passes the PC's IANA time zone
        if let tz = ProcessInfo.processInfo.environment["SWIFTCODE_TZ"], let zone = TimeZone(identifier: tz) { NSTimeZone.default = zone }
        _UIKit.boot()
        let app = Self()
        _runApp { ctx in
            _installDynamicProperties(app, ctx.child("app"))
            return app.body._renderScene(ctx)
        }
    }
}

@MainActor
public protocol Scene {
    func _renderScene(_ ctx: _Ctx) -> [_Node]
}

public struct WindowGroup<Content: View>: Scene {
    let content: () -> Content
    public init(@ViewBuilder content: @escaping () -> Content) { self.content = content }
    public init(_ title: String, @ViewBuilder content: @escaping () -> Content) { self.content = content }
    public func _renderScene(_ ctx: _Ctx) -> [_Node] { _resolve(content(), ctx) }
}

public struct _TupleScene: Scene {
    let first: any Scene
    public func _renderScene(_ ctx: _Ctx) -> [_Node] { first._renderScene(ctx) }
}

@resultBuilder
public enum SceneBuilder {
    public static func buildBlock<S: Scene>(_ s: S) -> S { s }
    public static func buildBlock<S1: Scene, S2: Scene>(_ s1: S1, _ s2: S2) -> _TupleScene { _TupleScene(first: s1) }
}

/// Old-style previews compile but are ignored when running.
@MainActor
public protocol PreviewProvider {
    associatedtype Previews: View
    @ViewBuilder static var previews: Previews { get }
}
