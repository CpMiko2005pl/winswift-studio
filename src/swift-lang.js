const SWIFT_LANG = 'swift-xcode';

// Swift language support for Monaco: Xcode-flavoured tokenizer, theme, completions, snippets, quick help, symbols.

const SWIFT_KEYWORDS = [
  'associatedtype', 'class', 'deinit', 'enum', 'extension', 'fileprivate', 'func', 'import', 'init', 'inout',
  'internal', 'let', 'open', 'operator', 'private', 'precedencegroup', 'protocol', 'public', 'rethrows', 'static',
  'struct', 'subscript', 'typealias', 'var', 'break', 'case', 'catch', 'continue', 'default', 'defer', 'do', 'else',
  'fallthrough', 'for', 'guard', 'if', 'in', 'repeat', 'return', 'throw', 'switch', 'where', 'while', 'as', 'Any',
  'false', 'is', 'nil', 'self', 'Self', 'super', 'throws', 'true', 'try', 'await', 'async', 'actor', 'some', 'any',
  'mutating', 'nonmutating', 'override', 'final', 'required', 'convenience', 'lazy', 'weak', 'unowned', 'optional',
  'indirect', 'dynamic', 'get', 'set', 'willSet', 'didSet', 'consuming', 'borrowing', 'nonisolated', 'isolated',
  'package', 'macro', 'each', 'repeat', 'sending', 'then',
];

const SWIFT_SNIPPETS = [
  { label: 'func', detail: 'Function', body: 'func ${1:name}(${2:parameters}) ${3:-> ${4:Type} }{\n\t${0}\n}' },
  { label: 'struct', detail: 'Structure', body: 'struct ${1:Name} {\n\t${0}\n}' },
  { label: 'class', detail: 'Class', body: 'class ${1:Name} {\n\t${0}\n}' },
  { label: 'enum', detail: 'Enumeration', body: 'enum ${1:Name} {\n\tcase ${2:value}\n}' },
  { label: 'protocol', detail: 'Protocol', body: 'protocol ${1:Name} {\n\t${0}\n}' },
  { label: 'extension', detail: 'Extension', body: 'extension ${1:Type} {\n\t${0}\n}' },
  { label: 'init', detail: 'Initializer', body: 'init(${1:parameters}) {\n\t${0}\n}' },
  { label: 'if', detail: 'If Statement', body: 'if ${1:condition} {\n\t${0}\n}' },
  { label: 'if-else', detail: 'If-Else Statement', body: 'if ${1:condition} {\n\t${2}\n} else {\n\t${0}\n}' },
  { label: 'if let', detail: 'If-Let Statement', body: 'if let ${1:value} {\n\t${0}\n}' },
  { label: 'guard let', detail: 'Guard-Let Statement', body: 'guard let ${1:value} else {\n\t${2:return}\n}' },
  { label: 'guard', detail: 'Guard Statement', body: 'guard ${1:condition} else {\n\t${2:return}\n}' },
  { label: 'for', detail: 'For-In Loop', body: 'for ${1:item} in ${2:collection} {\n\t${0}\n}' },
  { label: 'for range', detail: 'For-In over a range', body: 'for ${1:i} in ${2:0}..<${3:10} {\n\t${0}\n}' },
  { label: 'while', detail: 'While Loop', body: 'while ${1:condition} {\n\t${0}\n}' },
  { label: 'repeat', detail: 'Repeat-While Loop', body: 'repeat {\n\t${0}\n} while ${1:condition}' },
  { label: 'switch', detail: 'Switch Statement', body: 'switch ${1:value} {\ncase ${2:pattern}:\n\t${3}\ndefault:\n\t${0:break}\n}' },
  { label: 'do', detail: 'Do-Catch Statement', body: 'do {\n\ttry ${1}\n} catch {\n\t${0:print(error)}\n}' },
  { label: 'defer', detail: 'Defer Statement', body: 'defer {\n\t${0}\n}' },
  { label: 'closure', detail: 'Closure Expression', body: '{ (${1:parameters}) -> ${2:Type} in\n\t${0}\n}' },
  { label: 'print', detail: 'Print to the console', body: 'print(${0})' },
  { label: 'readLine', detail: 'Read a line from standard input', body: 'let ${1:input} = readLine() ?? ""' },
  { label: '@main', detail: 'Main Entry Point', body: '@main\nstruct ${1:App} {\n\tstatic func main() {\n\t\t${0}\n\t}\n}' },
  { label: 'async func', detail: 'Async Function', body: 'func ${1:name}() async throws {\n\t${0}\n}' },
  { label: 'Task', detail: 'Unstructured Task', body: 'Task {\n\t${0}\n}' },
  { label: 'mark', detail: 'MARK Comment', body: '// MARK: - ${0:Section}' },
  { label: 'todo', detail: 'TODO Comment', body: '// TODO: ${0}' },
];

// SwiftUI views offered as snippets (label, detail, body)
const SWIFTUI_VIEWS = [
  ['SwiftUI View', 'struct … : View', 'struct ${1:ContentView}: View {\n\tvar body: some View {\n\t\t${0:Text("Hello, world!")}\n\t}\n}'],
  ['App', '@main struct … : App', '@main\nstruct ${1:MyApp}: App {\n\tvar body: some Scene {\n\t\tWindowGroup {\n\t\t\t${0:ContentView()}\n\t\t}\n\t}\n}'],
  ['#Preview', 'Preview macro', '#Preview {\n\t${0:ContentView()}\n}'],
  ['@State', 'State property', '@State private var ${1:name} = ${0:value}'],
  ['@Binding', 'Binding property', '@Binding var ${1:name}: ${0:Type}'],
  ['@Environment', 'Environment value', '@Environment(\\\\.${1:dismiss}) private var ${0:dismiss}'],
  ['@Observable', 'Observable class', '@Observable\nclass ${1:Model} {\n\t${0}\n}'],
  ['VStack', 'Vertical stack', 'VStack {\n\t${0}\n}'],
  ['VStack(alignment:spacing:)', 'Vertical stack', 'VStack(alignment: .${1:leading}, spacing: ${2:8}) {\n\t${0}\n}'],
  ['HStack', 'Horizontal stack', 'HStack {\n\t${0}\n}'],
  ['ZStack', 'Overlapping stack', 'ZStack {\n\t${0}\n}'],
  ['Text', 'Text view', 'Text("${0}")'],
  ['Image(systemName:)', 'SF Symbol image', 'Image(systemName: "${0:star}")'],
  ['Image', 'Asset image', 'Image("${0:name}")'],
  ['Label', 'Title and icon', 'Label("${1:Title}", systemImage: "${0:star}")'],
  ['Button', 'Button with title', 'Button("${1:Title}") {\n\t${0}\n}'],
  ['Button(action:label:)', 'Button with custom label', 'Button {\n\t${1}\n} label: {\n\t${0:Text("Title")}\n}'],
  ['Spacer', 'Flexible space', 'Spacer()'],
  ['Divider', 'Separator line', 'Divider()'],
  ['List', 'List', 'List {\n\t${0}\n}'],
  ['List(items)', 'List over data', 'List(${1:items}) { ${2:item} in\n\t${0:Text(item.name)}\n}'],
  ['ForEach', 'Repeat views', 'ForEach(${1:items}) { ${2:item} in\n\t${0}\n}'],
  ['ForEach(0..<n)', 'Repeat over a range', 'ForEach(0..<${1:5}) { ${2:index} in\n\t${0}\n}'],
  ['Section', 'List section', 'Section("${1:Header}") {\n\t${0}\n}'],
  ['Form', 'Settings-style form', 'Form {\n\t${0}\n}'],
  ['ScrollView', 'Scrollable content', 'ScrollView {\n\t${0}\n}'],
  ['NavigationStack', 'Navigation container', 'NavigationStack {\n\t${1}\n\t\t.navigationTitle("${0:Title}")\n}'],
  ['NavigationLink', 'Push a destination', 'NavigationLink("${1:Title}") {\n\t${0:DetailView()}\n}'],
  ['TabView', 'Tabs', 'TabView {\n\t${1:FirstView()}\n\t\t.tabItem { Label("${2:Home}", systemImage: "${3:house}") }\n\t${0}\n}'],
  ['TextField', 'Text input', 'TextField("${1:Placeholder}", text: $${0:text})'],
  ['SecureField', 'Password input', 'SecureField("${1:Password}", text: $${0:password})'],
  ['Toggle', 'Switch', 'Toggle("${1:Title}", isOn: $${0:isOn})'],
  ['Slider', 'Slider', 'Slider(value: $${1:value}, in: ${2:0}...${0:1})'],
  ['Stepper', 'Stepper', 'Stepper("${1:Value}: \\\\(${2:value})", value: $${2:value}, in: ${3:0}...${0:10})'],
  ['Picker', 'Picker', 'Picker("${1:Title}", selection: $${2:selection}) {\n\tText("${3:One}").tag(${4:0})\n\t${0}\n}'],
  ['DatePicker', 'Date picker', 'DatePicker("${1:Date}", selection: $${0:date})'],
  ['ProgressView', 'Activity / progress', 'ProgressView(${0})'],
  ['Color', 'Color view', 'Color.${0:blue}'],
  ['RoundedRectangle', 'Shape', 'RoundedRectangle(cornerRadius: ${0:12})'],
  ['Circle', 'Shape', 'Circle()'],
  ['GeometryReader', 'Read the available size', 'GeometryReader { proxy in\n\t${0}\n}'],
  ['LazyVGrid', 'Grid', 'LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())]) {\n\t${0}\n}'],
  ['Menu', 'Pop-up menu', 'Menu("${1:Options}") {\n\t${0}\n}'],
  ['Group', 'Group views', 'Group {\n\t${0}\n}'],
  ['ContentUnavailableView', 'Empty state', 'ContentUnavailableView("${1:No Items}", systemImage: "${0:tray}")'],
];

// Modifiers suggested after a dot
const SWIFTUI_MODIFIERS = [
  ['padding()', 'Adds default padding', 'padding()'],
  ['padding(_:)', 'Padding on edges', 'padding(.${1:horizontal}${2:, ${3:16}})'],
  ['frame(width:height:)', 'Fixed size', 'frame(width: ${1:100}, height: ${0:100})'],
  ['frame(maxWidth:)', 'Expand horizontally', 'frame(maxWidth: .infinity${0})'],
  ['font(_:)', 'Text font', 'font(.${0:title})'],
  ['fontWeight(_:)', 'Font weight', 'fontWeight(.${0:bold})'],
  ['bold()', 'Bold text', 'bold()'],
  ['foregroundStyle(_:)', 'Foreground color', 'foregroundStyle(.${0:blue})'],
  ['foregroundColor(_:)', 'Foreground color', 'foregroundColor(.${0:blue})'],
  ['background(_:)', 'Background', 'background(.${0:yellow})'],
  ['background { }', 'Background view', 'background {\n\t${0}\n}'],
  ['overlay { }', 'Overlay view', 'overlay {\n\t${0}\n}'],
  ['cornerRadius(_:)', 'Rounded corners', 'cornerRadius(${0:12})'],
  ['clipShape(_:)', 'Clip to shape', 'clipShape(${0:.rect(cornerRadius: 12)})'],
  ['shadow(radius:)', 'Drop shadow', 'shadow(radius: ${0:4})'],
  ['opacity(_:)', 'Opacity', 'opacity(${0:0.5})'],
  ['tint(_:)', 'Tint color', 'tint(.${0:green})'],
  ['buttonStyle(_:)', 'Button style', 'buttonStyle(.${0:borderedProminent})'],
  ['navigationTitle(_:)', 'Navigation title', 'navigationTitle("${0:Title}")'],
  ['navigationBarTitleDisplayMode(_:)', 'Title display mode', 'navigationBarTitleDisplayMode(.${0:inline})'],
  ['toolbar { }', 'Toolbar items', 'toolbar {\n\tButton("${1:Add}") {\n\t\t${0}\n\t}\n}'],
  ['sheet(isPresented:)', 'Present a sheet', 'sheet(isPresented: $${1:isPresented}) {\n\t${0}\n}'],
  ['alert(_:isPresented:)', 'Show an alert', 'alert("${1:Title}", isPresented: $${2:isPresented}) {\n\tButton("OK") { }\n} message: {\n\tText("${0:Message}")\n}'],
  ['onAppear { }', 'Run when shown', 'onAppear {\n\t${0}\n}'],
  ['task { }', 'Async work when shown', 'task {\n\t${0}\n}'],
  ['onTapGesture { }', 'Tap handler', 'onTapGesture {\n\t${0}\n}'],
  ['onChange(of:)', 'React to changes', 'onChange(of: ${1:value}) { oldValue, newValue in\n\t${0}\n}'],
  ['onDelete(perform:)', 'Swipe to delete', 'onDelete { indexSet in\n\t${0}\n}'],
  ['onSubmit { }', 'Return key action', 'onSubmit {\n\t${0}\n}'],
  ['tabItem { }', 'Tab bar item', 'tabItem {\n\tLabel("${1:Home}", systemImage: "${0:house}")\n}'],
  ['tag(_:)', 'Identify for Picker/TabView', 'tag(${0:0})'],
  ['listStyle(_:)', 'List style', 'listStyle(.${0:plain})'],
  ['pickerStyle(_:)', 'Picker style', 'pickerStyle(.${0:segmented})'],
  ['textFieldStyle(_:)', 'Text field style', 'textFieldStyle(.${0:roundedBorder})'],
  ['multilineTextAlignment(_:)', 'Text alignment', 'multilineTextAlignment(.${0:center})'],
  ['lineLimit(_:)', 'Maximum lines', 'lineLimit(${0:1})'],
  ['imageScale(_:)', 'Symbol size', 'imageScale(.${0:large})'],
  ['resizable()', 'Resizable image', 'resizable()'],
  ['scaledToFit()', 'Fit image', 'scaledToFit()'],
  ['scaledToFill()', 'Fill image', 'scaledToFill()'],
  ['ignoresSafeArea()', 'Extend under bars', 'ignoresSafeArea()'],
  ['disabled(_:)', 'Disable interaction', 'disabled(${0:true})'],
  ['searchable(text:)', 'Search field', 'searchable(text: $${0:searchText})'],
  ['preferredColorScheme(_:)', 'Light / dark', 'preferredColorScheme(.${0:dark})'],
  ['environment(_:_:)', 'Set environment value', 'environment(${0})'],
  ['rotationEffect(_:)', 'Rotate', 'rotationEffect(.degrees(${0:45}))'],
  ['scaleEffect(_:)', 'Scale', 'scaleEffect(${0:1.5})'],
  ['offset(x:y:)', 'Move', 'offset(x: ${1:0}, y: ${0:0})'],
  ['animation(_:value:)', 'Animate changes', 'animation(.${1:default}, value: ${0:value})'],
];

const SWIFT_STDLIB = [
  ['print', 'func print(_ items: Any..., separator: String = " ", terminator: String = "\\n")', 'Writes the textual representations of the given items into the standard output.'],
  ['readLine', 'func readLine(strippingNewline: Bool = true) -> String?', 'Returns a string read from standard input through the end of the current line or until EOF is reached.'],
  ['debugPrint', 'func debugPrint(_ items: Any..., separator: String = " ", terminator: String = "\\n")', 'Writes the textual representations of the given items most suitable for debugging into the standard output.'],
  ['assert', 'func assert(_ condition: @autoclosure () -> Bool, _ message: @autoclosure () -> String = String())', 'Performs a traditional C-style assert with an optional message.'],
  ['precondition', 'func precondition(_ condition: @autoclosure () -> Bool, _ message: @autoclosure () -> String = String())', 'Checks a necessary condition for making forward progress.'],
  ['fatalError', 'func fatalError(_ message: @autoclosure () -> String = String()) -> Never', 'Unconditionally prints a given message and stops execution.'],
  ['min', 'func min<T: Comparable>(_ x: T, _ y: T) -> T', 'Returns the lesser of two comparable values.'],
  ['max', 'func max<T: Comparable>(_ x: T, _ y: T) -> T', 'Returns the greater of two comparable values.'],
  ['abs', 'func abs<T: Comparable & SignedNumeric>(_ x: T) -> T', 'Returns the absolute value of the given number.'],
  ['zip', 'func zip<S1: Sequence, S2: Sequence>(_ s1: S1, _ s2: S2) -> Zip2Sequence<S1, S2>', 'Creates a sequence of pairs built out of two underlying sequences.'],
  ['stride', 'func stride<T: Strideable>(from start: T, to end: T, by stride: T.Stride) -> StrideTo<T>', 'Returns a sequence from a starting value to, but not including, an end value, stepping by the specified amount.'],
  ['String', 'struct String', 'A Unicode string value that is a collection of characters.'],
  ['Int', 'struct Int', 'A signed integer value type. On 64-bit platforms, Int is the same size as Int64.'],
  ['Double', 'struct Double', 'A double-precision, floating-point value type.'],
  ['Float', 'struct Float', 'A single-precision, floating-point value type.'],
  ['Bool', 'struct Bool', 'A value type whose instances are either true or false.'],
  ['Character', 'struct Character', 'A single extended grapheme cluster that approximates a user-perceived character.'],
  ['Array', 'struct Array<Element>', 'An ordered, random-access collection.'],
  ['Dictionary', 'struct Dictionary<Key: Hashable, Value>', 'A collection whose elements are key-value pairs.'],
  ['Set', 'struct Set<Element: Hashable>', 'An unordered collection of unique elements.'],
  ['Optional', 'enum Optional<Wrapped>', 'A type that represents either a wrapped value or the absence of a value.'],
  ['Result', 'enum Result<Success, Failure: Error>', 'A value that represents either a success or a failure, including an associated value in each case.'],
  ['Error', 'protocol Error', 'A type representing an error value that can be thrown.'],
  ['Equatable', 'protocol Equatable', 'A type that can be compared for value equality.'],
  ['Hashable', 'protocol Hashable', 'A type that can be hashed into a Hasher to produce an integer hash value.'],
  ['Comparable', 'protocol Comparable', 'A type that can be compared using the relational operators <, <=, >=, and >.'],
  ['Codable', 'typealias Codable = Decodable & Encodable', 'A type that can convert itself into and out of an external representation.'],
  ['CustomStringConvertible', 'protocol CustomStringConvertible', 'A type with a customized textual representation.'],
  ['Sequence', 'protocol Sequence', 'A type that provides sequential, iterated access to its elements.'],
  ['Collection', 'protocol Collection', 'A sequence whose elements can be traversed multiple times, nondestructively, and accessed by an indexed subscript.'],
  ['Task', 'struct Task<Success, Failure: Error>', 'A unit of asynchronous work.'],
  ['map', 'func map<T>(_ transform: (Element) throws -> T) rethrows -> [T]', 'Returns an array containing the results of mapping the given closure over the sequence’s elements.'],
  ['filter', 'func filter(_ isIncluded: (Element) throws -> Bool) rethrows -> [Element]', 'Returns an array containing, in order, the elements of the sequence that satisfy the given predicate.'],
  ['reduce', 'func reduce<Result>(_ initialResult: Result, _ nextPartialResult: (Result, Element) throws -> Result) rethrows -> Result', 'Returns the result of combining the elements of the sequence using the given closure.'],
  ['compactMap', 'func compactMap<T>(_ transform: (Element) throws -> T?) rethrows -> [T]', 'Returns an array containing the non-nil results of calling the given transformation with each element of this sequence.'],
  ['forEach', 'func forEach(_ body: (Element) throws -> Void) rethrows', 'Calls the given closure on each element in the sequence in the same order as a for-in loop.'],
  ['sorted', 'func sorted() -> [Element]', 'Returns the elements of the sequence, sorted.'],
  ['append', 'mutating func append(_ newElement: Element)', 'Adds a new element at the end of the array.'],
  ['count', 'var count: Int { get }', 'The number of elements in the collection.'],
  ['isEmpty', 'var isEmpty: Bool { get }', 'A Boolean value indicating whether the collection is empty.'],
];

const SWIFT_KEYWORD_HELP = {
  let: 'Declares a constant. Its value can’t be changed once it’s set.',
  var: 'Declares a variable. Its value can be changed later.',
  func: 'Declares a function — a self-contained chunk of code that performs a specific task.',
  struct: 'Declares a structure, a value type that is copied when it’s assigned or passed around.',
  class: 'Declares a class, a reference type that supports inheritance.',
  enum: 'Declares an enumeration, a common type for a group of related values.',
  protocol: 'Declares a protocol, a blueprint of methods and properties that a type can adopt.',
  extension: 'Adds new functionality to an existing class, structure, enumeration, or protocol type.',
  guard: 'Transfers program control out of scope if one or more conditions aren’t met.',
  if: 'Executes a set of statements only if a condition is true.',
  for: 'Iterates over a sequence, such as an array, range, or string.',
  while: 'Performs a set of statements until a condition becomes false.',
  switch: 'Considers a value and compares it against several possible matching patterns.',
  return: 'Ends the execution of a function and optionally returns a value.',
  import: 'Makes the declarations of a module available in the current file.',
  init: 'An initializer prepares an instance of a type for use.',
  self: 'Refers to the current instance within its own instance methods.',
  nil: 'Represents the absence of a value for an optional.',
  try: 'Marks a call to a function that can throw an error.',
  throws: 'Indicates that a function can throw an error.',
  async: 'Marks a function as asynchronous — it can suspend while it waits.',
  await: 'Marks a possible suspension point while calling an async function.',
  defer: 'Executes a set of statements just before code execution leaves the current scope.',
  inout: 'A parameter whose value is passed in, modified, and passed back out of the function.',
  mutating: 'Allows a method of a value type to modify its properties.',
  static: 'Declares a type member that belongs to the type itself rather than to instances.',
  private: 'Restricts the use of an entity to the enclosing declaration and its extensions in the same file.',
  public: 'Makes an entity usable from any source file in its module and in modules that import it.',
};

function registerSwift(monaco) {
  // Replace the stock Swift grammar with an Xcode-style one.
  monaco.languages.register({ id: SWIFT_LANG, aliases: ['Swift'] });

  monaco.languages.setLanguageConfiguration(SWIFT_LANG, {
    comments: { lineComment: '//', blockComment: ['/*', '*/'] },
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [
      { open: '{', close: '}' }, { open: '[', close: ']' }, { open: '(', close: ')' },
      { open: '"', close: '"', notIn: ['string', 'comment'] },
      { open: '/*', close: ' */', notIn: ['string'] },
    ],
    surroundingPairs: [{ open: '{', close: '}' }, { open: '[', close: ']' }, { open: '(', close: ')' }, { open: '"', close: '"' }],
    indentationRules: { increaseIndentPattern: /^.*\{[^}"']*$|^\s*case\b.*:\s*$|^\s*default:\s*$/, decreaseIndentPattern: /^\s*(\}|case\b|default:)/ },
    onEnterRules: [
      { beforeText: /^\s*\/\/\/.*$/, action: { indentAction: monaco.languages.IndentAction.None, appendText: '/// ' } },
    ],
    folding: { markers: { start: /^\s*\/\/\s*MARK:/, end: /^\s*\/\/\s*MARK:/ } },
    wordPattern: /(-?\d*\.\d\w*)|([^`~!@#%^&*()\-=+[{\]}\\|;:'",.<>/?\s]+)/g,
  });

  monaco.languages.setMonarchTokensProvider(SWIFT_LANG, {
    defaultToken: '',
    keywords: SWIFT_KEYWORDS,
    typeDecl: ['struct', 'class', 'enum', 'protocol', 'extension', 'actor', 'typealias', 'associatedtype'],
    operators: /[=><!~?:&|+\-*/^%.]+/,
    escapes: /\\(?:[0\\tnr"']|u\{[0-9A-Fa-f]{1,8}\})/,
    tokenizer: {
      root: [
        { include: '@whitespace' },
        [/(func)(\s+)([A-Za-z_]\w*|`[^`]+`)/, ['keyword', 'white', 'decl.func']],
        [/(struct|class|enum|protocol|extension|actor|typealias|associatedtype)(\s+)([A-Za-z_][\w.]*)/, ['keyword', 'white', 'decl.type']],
        [/(case)(\s+)(let|var)\b/, ['keyword', 'white', 'keyword']],
        [/(let|var)(\s+)([a-z_]\w*)/, ['keyword', 'white', 'decl.var']],
        [/@[A-Za-z_]\w*/, 'attribute'],
        [/#(if|elseif|else|endif|sourceLocation|warning|error|available|unavailable|selector|keyPath|file|fileID|filePath|line|column|function|dsohandle|colorLiteral|imageLiteral)\b/, 'directive'],
        [/#[A-Za-z_]\w*/, 'macro'],
        [/#+"""/, { token: 'string', next: '@mlstring' }],
        [/"""/, { token: 'string', next: '@mlstring' }],
        [/#+"/, { token: 'string', next: '@rawstring' }],
        [/"/, { token: 'string', next: '@string' }],
        [/0[xX][0-9a-fA-F_]+(\.[0-9a-fA-F_]+)?([pP][+-]?\d+)?/, 'number'],
        [/0[bB][01_]+/, 'number'],
        [/0[oO][0-7_]+/, 'number'],
        [/\d[\d_]*(\.\d[\d_]*)?([eE][+-]?\d+)?/, 'number'],
        [/(\.)([a-z_]\w*)(?=\s*\()/, ['delimiter', 'call']],
        [/(\.)([a-z_]\w*)/, ['delimiter', 'member']],
        [/(\.)([A-Z]\w*)/, ['delimiter', 'type']],
        [/`[^`]+`/, 'identifier'],
        [/[A-Z]\w*/, 'type'],
        [/[a-z_]\w*(?=\s*\()/, { cases: { '@keywords': 'keyword', '@default': 'call' } }],
        [/[a-z_$]\w*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
        [/[{}()[\]]/, '@brackets'],
        [/->/, 'operator'],
        [/@operators/, 'operator'],
        [/[;,]/, 'delimiter'],
      ],
      whitespace: [
        [/[ \t\r\n]+/, 'white'],
        [/\/\/\s*(MARK|TODO|FIXME):.*$/, 'comment.mark'],
        [/\/\/\/.*$/, 'comment.doc'],
        [/\/\/.*$/, 'comment'],
        [/\/\*\*(?!\/)/, 'comment.doc', '@doccomment'],
        [/\/\*/, 'comment', '@comment'],
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\/\*/, 'comment', '@push'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment'],
      ],
      doccomment: [
        [/[^/*]+/, 'comment.doc'],
        [/\*\//, 'comment.doc', '@pop'],
        [/[/*]/, 'comment.doc'],
      ],
      string: [
        [/[^\\"]+/, 'string'],
        [/\\\(/, { token: 'interp.delim', next: '@interp' }],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/"/, { token: 'string', next: '@pop' }],
      ],
      mlstring: [
        [/"""#*/, { token: 'string', next: '@pop' }],
        [/\\\(/, { token: 'interp.delim', next: '@interp' }],
        [/@escapes/, 'string.escape'],
        [/[^\\"]+/, 'string'],
        [/./, 'string'],
      ],
      rawstring: [
        [/"#+/, { token: 'string', next: '@pop' }],
        [/[^"]+/, 'string'],
        [/"/, 'string'],
      ],
      interp: [
        [/\(/, { token: '@brackets', next: '@interpParen' }],
        [/\)/, { token: 'interp.delim', next: '@pop' }],
        { include: 'root' },
      ],
      interpParen: [
        [/\(/, { token: '@brackets', next: '@interpParen' }],
        [/\)/, { token: '@brackets', next: '@pop' }],
        { include: 'root' },
      ],
    },
  });

  // Xcode "Default (Dark)" palette
  monaco.editor.defineTheme('xcode-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'DFDFE0' },
      { token: 'white', foreground: 'DFDFE0' },
      { token: 'identifier', foreground: 'DFDFE0' },
      { token: 'comment', foreground: '7F8C98' },
      { token: 'comment.doc', foreground: '7F8C98' },
      { token: 'comment.mark', foreground: '92A1B1', fontStyle: 'bold' },
      { token: 'keyword', foreground: 'FF7AB2', fontStyle: 'bold' },
      { token: 'string', foreground: 'FF8170' },
      { token: 'string.escape', foreground: 'FF8170' },
      { token: 'interp.delim', foreground: 'DFDFE0' },
      { token: 'number', foreground: 'D9C97C' },
      { token: 'type', foreground: 'DABAFF' },
      { token: 'decl.type', foreground: '5DD8FF' },
      { token: 'decl.func', foreground: '41A1C0' },
      { token: 'decl.var', foreground: '41A1C0' },
      { token: 'call', foreground: 'B281EB' },
      { token: 'member', foreground: 'B281EB' },
      { token: 'attribute', foreground: 'CC9768' },
      { token: 'directive', foreground: 'FFA14F' },
      { token: 'macro', foreground: 'FFA14F' },
      { token: 'operator', foreground: 'DFDFE0' },
      { token: 'delimiter', foreground: 'DFDFE0' },
    ],
    colors: {
      'editor.background': '#1F1F24',
      'editor.foreground': '#DFDFE0',
      'editor.lineHighlightBackground': '#23252B',
      'editor.lineHighlightBorder': '#00000000',
      'editorLineNumber.foreground': '#747478',
      'editorLineNumber.activeForeground': '#DFDFE0',
      'editor.selectionBackground': '#515B70',
      'editor.inactiveSelectionBackground': '#3A3F4B',
      'editor.selectionHighlightBackground': '#3A3F4B88',
      'editor.wordHighlightBackground': '#3A3F4B88',
      'editorCursor.foreground': '#FFFFFF',
      'editorWhitespace.foreground': '#424D5B',
      'editorIndentGuide.background1': '#2C2C33',
      'editorIndentGuide.activeBackground1': '#3D3D46',
      'editorGutter.background': '#1F1F24',
      'editorBracketHighlight.foreground1': '#DFDFE0',
      'editorBracketHighlight.foreground2': '#DFDFE0',
      'editorBracketHighlight.foreground3': '#DFDFE0',
      'editorBracketHighlight.foreground4': '#DFDFE0',
      'editorBracketHighlight.foreground5': '#DFDFE0',
      'editorBracketHighlight.foreground6': '#DFDFE0',
      'editorBracketMatch.background': '#00000000',
      'editorBracketMatch.border': '#FFFFFF66',
      'minimap.background': '#1F1F24',
      'minimapSlider.background': '#FFFFFF14',
      'scrollbar.shadow': '#00000000',
      'scrollbarSlider.background': '#FFFFFF26',
      'scrollbarSlider.hoverBackground': '#FFFFFF3A',
      'scrollbarSlider.activeBackground': '#FFFFFF4D',
      'editorWidget.background': '#2A2A2E',
      'editorWidget.border': '#454549',
      'editorSuggestWidget.background': '#2A2A2E',
      'editorSuggestWidget.border': '#454549',
      'editorSuggestWidget.selectedBackground': '#0A64D6',
      'editorSuggestWidget.highlightForeground': '#FFFFFF',
      'editorHoverWidget.background': '#2A2A2E',
      'editorHoverWidget.border': '#454549',
      'editorError.foreground': '#FF453A',
      'editorWarning.foreground': '#FFD60A',
      'editorOverviewRuler.border': '#00000000',
      'focusBorder': '#0A84FF00',
      'input.background': '#1E1E22',
      'list.hoverBackground': '#3A3A3E',
      'peekViewEditor.background': '#1F1F24',
      'peekViewResult.background': '#252529',
      'peekViewTitle.background': '#2A2A2E',
    },
  });

  // Xcode "Default (Light)" palette
  monaco.editor.defineTheme('xcode-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: '', foreground: '262626' },
      { token: 'white', foreground: '262626' },
      { token: 'identifier', foreground: '262626' },
      { token: 'comment', foreground: '5D6C79' },
      { token: 'comment.doc', foreground: '5D6C79' },
      { token: 'comment.mark', foreground: '4A5560', fontStyle: 'bold' },
      { token: 'keyword', foreground: 'AD3DA4', fontStyle: 'bold' },
      { token: 'string', foreground: 'D12F1B' },
      { token: 'string.escape', foreground: 'D12F1B' },
      { token: 'interp.delim', foreground: '262626' },
      { token: 'number', foreground: '272AD8' },
      { token: 'type', foreground: '703DAA' },
      { token: 'decl.type', foreground: '0B4F79' },
      { token: 'decl.func', foreground: '0F68A0' },
      { token: 'decl.var', foreground: '0F68A0' },
      { token: 'call', foreground: '6C36A9' },
      { token: 'member', foreground: '6C36A9' },
      { token: 'attribute', foreground: '815F03' },
      { token: 'directive', foreground: '78492A' },
      { token: 'macro', foreground: '78492A' },
      { token: 'operator', foreground: '262626' },
      { token: 'delimiter', foreground: '262626' },
    ],
    colors: {
      'editor.background': '#FFFFFF',
      'editor.foreground': '#262626',
      'editor.lineHighlightBackground': '#ECF5FF',
      'editor.lineHighlightBorder': '#00000000',
      'editorLineNumber.foreground': '#A6A6A6',
      'editorLineNumber.activeForeground': '#262626',
      'editor.selectionBackground': '#B4D8FD',
      'editor.inactiveSelectionBackground': '#DCDCDC',
      'editor.selectionHighlightBackground': '#E5E5E5',
      'editor.wordHighlightBackground': '#E5E5E5',
      'editorCursor.foreground': '#000000',
      'editorWhitespace.foreground': '#CCCCCC',
      'editorIndentGuide.background1': '#EEEEEE',
      'editorIndentGuide.activeBackground1': '#DDDDDD',
      'editorGutter.background': '#FFFFFF',
      'editorBracketMatch.background': '#00000000',
      'editorBracketMatch.border': '#00000055',
      'minimap.background': '#FFFFFF',
      'scrollbar.shadow': '#00000000',
      'scrollbarSlider.background': '#00000022',
      'scrollbarSlider.hoverBackground': '#00000033',
      'scrollbarSlider.activeBackground': '#00000044',
      'editorWidget.background': '#F6F6F6',
      'editorWidget.border': '#D0D0D0',
      'editorSuggestWidget.background': '#FFFFFF',
      'editorSuggestWidget.border': '#D0D0D0',
      'editorSuggestWidget.selectedBackground': '#0A64D6',
      'editorSuggestWidget.selectedForeground': '#FFFFFF',
      'editorSuggestWidget.highlightForeground': '#0A64D6',
      'editorHoverWidget.background': '#FFFFFF',
      'editorHoverWidget.border': '#D0D0D0',
      'editorError.foreground': '#E0352B',
      'editorWarning.foreground': '#C79A00',
      'editorOverviewRuler.border': '#00000000',
      'focusBorder': '#0A84FF00',
      'peekViewEditor.background': '#FFFFFF',
      'peekViewResult.background': '#F6F6F6',
      'peekViewTitle.background': '#ECECEC',
    },
  });

  // Xcode "Classic (Dark)" and "Midnight"
  monaco.editor.defineTheme('xcode-midnight', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'FFFFFF' }, { token: 'identifier', foreground: 'FFFFFF' },
      { token: 'comment', foreground: '41CC45' }, { token: 'comment.doc', foreground: '41CC45' }, { token: 'comment.mark', foreground: '41CC45', fontStyle: 'bold' },
      { token: 'keyword', foreground: 'D31895', fontStyle: 'bold' }, { token: 'string', foreground: 'FF2C38' }, { token: 'string.escape', foreground: 'FF2C38' },
      { token: 'number', foreground: '786DFF' }, { token: 'type', foreground: '00A0FF' }, { token: 'decl.type', foreground: '00A0FF' },
      { token: 'decl.func', foreground: '83C057' }, { token: 'decl.var', foreground: '83C057' }, { token: 'call', foreground: '23FF83' }, { token: 'member', foreground: '23FF83' },
      { token: 'attribute', foreground: 'D28F5A' }, { token: 'directive', foreground: 'D28F5A' }, { token: 'macro', foreground: 'D28F5A' },
    ],
    colors: {
      'editor.background': '#000000', 'editor.foreground': '#FFFFFF', 'editor.lineHighlightBackground': '#191919', 'editorGutter.background': '#000000',
      'editor.selectionBackground': '#404040', 'editorLineNumber.foreground': '#5C5C5C', 'editorLineNumber.activeForeground': '#FFFFFF', 'minimap.background': '#000000',
      'editorWidget.background': '#1C1C1E', 'editorSuggestWidget.background': '#1C1C1E', 'editorSuggestWidget.selectedBackground': '#0A64D6', 'editorHoverWidget.background': '#1C1C1E',
      'focusBorder': '#0A84FF00', 'scrollbar.shadow': '#00000000',
    },
  });

  monaco.languages.registerCompletionItemProvider(SWIFT_LANG, {
    triggerCharacters: ['.', '@', '#'],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
      const K = monaco.languages.CompletionItemKind;
      const Snippet = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
      const suggestions = [];
      const before = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1);
      const usesSwiftUI = /import\s+SwiftUI/.test(model.getValue());
      // with SourceKit running, real API comes from it: only code snippets are added here (like Xcode's snippet library)
      if (window.swiftLspActive && window.swiftLspActive(model)) {
        if (/[.]\s*$/.test(before)) return { suggestions: [] };
        for (const s of SWIFT_SNIPPETS) suggestions.push({ label: s.label, kind: K.Snippet, detail: s.detail, insertText: s.body, insertTextRules: Snippet, range, sortText: 'z1' + s.label });
        if (usesSwiftUI) for (const [label, detail, body] of SWIFTUI_VIEWS) {
          const isAttr = label.startsWith('@') || label.startsWith('#');
          const r = isAttr && /[@#]$/.test(before) ? { ...range, startColumn: range.startColumn - 1 } : range;
          suggestions.push({ label: { label, description: 'snippet' }, kind: K.Snippet, detail, insertText: body, insertTextRules: Snippet, range: r, sortText: 'z0' + label, filterText: label });
        }
        return { suggestions };
      }
      // after a dot: modifiers (the editor's word-based suggestions still add members it has seen)
      if (/\.\s*$/.test(before) && !/\d\.$/.test(before)) {
        if (usesSwiftUI) {
          for (const [label, detail, body] of SWIFTUI_MODIFIERS) {
            suggestions.push({ label, kind: K.Method, detail, insertText: body, insertTextRules: Snippet, range, sortText: '0' + label, documentation: 'SwiftUI modifier' });
          }
        }
        return { suggestions };
      }
      if (usesSwiftUI) {
        for (const [label, detail, body] of SWIFTUI_VIEWS) {
          const isAttr = label.startsWith('@') || label.startsWith('#');
          const r = isAttr && /[@#]$/.test(before) ? { ...range, startColumn: range.startColumn - 1 } : range;
          suggestions.push({ label, kind: label.startsWith('@') ? K.Property : K.Struct, detail, insertText: body, insertTextRules: Snippet, range: r, sortText: '05' + label, filterText: label });
        }
      }
      for (const s of SWIFT_SNIPPETS) {
        suggestions.push({ label: s.label, kind: K.Snippet, detail: s.detail, insertText: s.body, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, sortText: '1' + s.label });
      }
      for (const k of SWIFT_KEYWORDS) suggestions.push({ label: k, kind: K.Keyword, insertText: k, range, sortText: '3' + k });
      for (const [name, sig, doc] of SWIFT_STDLIB) {
        const isType = /^[A-Z]/.test(name);
        suggestions.push({ label: name, kind: isType ? K.Struct : (sig.startsWith('var') ? K.Property : K.Function), detail: sig, documentation: doc, insertText: name, range, sortText: '2' + name });
      }
      // symbols declared anywhere in the open project
      for (const m of monaco.editor.getModels()) {
        if (m.getLanguageId() !== SWIFT_LANG) continue;
        for (const sym of parseSwiftSymbols(m.getValue())) {
          suggestions.push({ label: sym.name, kind: symKindToMonaco(monaco, sym.kind), detail: sym.signature, insertText: sym.name, range, sortText: '0' + sym.name });
        }
      }
      const seen = new Set();
      return { suggestions: suggestions.filter(s => { const k = s.label + '|' + s.kind; if (seen.has(k)) return false; seen.add(k); return true; }) };
    },
  });

  monaco.languages.registerDocumentSymbolProvider(SWIFT_LANG, {
    provideDocumentSymbols(model) {
      return parseSwiftSymbols(model.getValue()).map(s => ({
        name: s.name, detail: s.signature, kind: symKindToMonacoSymbol(monaco, s.kind), tags: [],
        range: { startLineNumber: s.line, startColumn: 1, endLineNumber: s.line, endColumn: model.getLineMaxColumn(s.line) },
        selectionRange: { startLineNumber: s.line, startColumn: s.col, endLineNumber: s.line, endColumn: s.col + s.name.length },
      }));
    },
  });

  monaco.languages.registerDefinitionProvider(SWIFT_LANG, {
    provideDefinition(model, position) {
      if (window.swiftLspActive && window.swiftLspActive(model)) return null;
      const w = model.getWordAtPosition(position);
      if (!w) return null;
      const out = [];
      for (const m of monaco.editor.getModels()) {
        if (m.getLanguageId() !== SWIFT_LANG) continue;
        for (const s of parseSwiftSymbols(m.getValue())) {
          if (s.name === w.word) out.push({ uri: m.uri, range: { startLineNumber: s.line, startColumn: s.col, endLineNumber: s.line, endColumn: s.col + s.name.length } });
        }
      }
      return out;
    },
  });

  monaco.languages.registerHoverProvider(SWIFT_LANG, {
    provideHover(model, position) {
      if (window.swiftLspActive && window.swiftLspActive(model)) return null;
      const w = model.getWordAtPosition(position);
      if (!w) return null;
      const help = swiftQuickHelp(w.word);
      if (!help) return null;
      return { contents: [{ value: '```swift\n' + help.signature + '\n```' }, { value: help.summary }] };
    },
  });
}

function symKindToMonaco(monaco, kind) {
  const K = monaco.languages.CompletionItemKind;
  return { func: K.Function, struct: K.Struct, class: K.Class, enum: K.Enum, protocol: K.Interface, var: K.Variable, let: K.Constant, actor: K.Class, typealias: K.TypeParameter, case: K.EnumMember, extension: K.Module }[kind] || K.Text;
}

function symKindToMonacoSymbol(monaco, kind) {
  const K = monaco.languages.SymbolKind;
  return { func: K.Function, struct: K.Struct, class: K.Class, enum: K.Enum, protocol: K.Interface, var: K.Variable, let: K.Constant, actor: K.Class, typealias: K.TypeParameter, case: K.EnumMember, extension: K.Namespace, init: K.Constructor }[kind] || K.Variable;
}

// Lightweight declaration scanner (good enough for navigation, jump bar and completions).
function parseSwiftSymbols(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  let depth = 0;
  let inBlockComment = false;
  const re = /\b(func|struct|class|enum|protocol|extension|actor|typealias|let|var|case|init)\b\s*([A-Za-z_][\w.]*|`[^`]+`)?/g;
  lines.forEach((raw, i) => {
    let line = raw;
    if (inBlockComment) {
      const end = line.indexOf('*/');
      if (end < 0) return;
      line = ' '.repeat(end + 2) + line.slice(end + 2);
      inBlockComment = false;
    }
    line = line.replace(/"(?:[^"\\]|\\.)*"/g, m => ' '.repeat(m.length));
    const lc = line.indexOf('//');
    if (lc >= 0) line = line.slice(0, lc);
    const bc = line.indexOf('/*');
    if (bc >= 0) { if (line.indexOf('*/', bc) < 0) inBlockComment = true; line = line.slice(0, bc); }
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line))) {
      const kind = m[1];
      let name = m[2];
      if (kind === 'init') name = 'init';
      if (!name) continue;
      // only top-level and type-member variables, not locals inside functions
      if ((kind === 'let' || kind === 'var') && depth > 1) continue;
      // bindings in if/guard/while/for/case are locals, not declarations worth listing
      if ((kind === 'let' || kind === 'var') && /\b(if|guard|while|for|case|catch)\b[^{}]*$/.test(line.slice(0, m.index))) continue;
      if (kind === 'case' && !/^\s*case\s+[a-z_]\w*\s*(\(|,|=|$)/.test(line)) continue;
      const col = kind === 'init' ? m.index + 1 : m.index + m[0].length - name.length + 1;
      let signature = line.trim().replace(/\s*\{.*$/, '');
      out.push({ kind, name, line: i + 1, col, depth, signature });
      if (kind !== 'case') break;
    }
    for (const ch of line) { if (ch === '{') depth++; else if (ch === '}') depth = Math.max(0, depth - 1); }
  });
  return out;
}

function swiftQuickHelp(word) {
  const lib = SWIFT_STDLIB.find(e => e[0] === word);
  if (lib) return { name: word, signature: lib[1], summary: lib[2], kind: 'Swift Standard Library' };
  if (SWIFT_KEYWORD_HELP[word]) return { name: word, signature: word, summary: SWIFT_KEYWORD_HELP[word], kind: 'Swift Keyword' };
  return null;
}
