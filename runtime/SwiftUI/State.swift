// Property wrappers: @State, @Binding, @StateObject, @ObservedObject, @EnvironmentObject, @Environment,
// @Published, @AppStorage, @FocusState.

final class _StateLocation<Value> {
    var box: _Box<Value>?
    var initial: Value
    init(_ v: Value) { initial = v }
}

@propertyWrapper
public struct State<Value>: _DynamicProperty {
    let loc: _StateLocation<Value>

    public init(wrappedValue: Value) { loc = _StateLocation(wrappedValue) }
    public init(initialValue: Value) { loc = _StateLocation(initialValue) }
    public init() where Value: ExpressibleByNilLiteral { loc = _StateLocation(nil) }

    public var wrappedValue: Value {
        get { loc.box?.value ?? loc.initial }
        nonmutating set {
            if let b = loc.box { b.value = newValue } else { loc.initial = newValue }
            _Runtime.setNeedsRender()
        }
    }

    public var projectedValue: Binding<Value> {
        let loc = self.loc
        return Binding(get: { loc.box?.value ?? loc.initial },
                       set: { v in if let b = loc.box { b.value = v } else { loc.initial = v }; _Runtime.setNeedsRender() })
    }

    public func _install(key: String, ctx: _Ctx) {
        let initial = loc.initial
        loc.box = ctx.graph.box(ctx.path + "#" + key) { initial }
    }
}

@propertyWrapper
@dynamicMemberLookup
public struct Binding<Value> {
    let getter: () -> Value
    let setter: (Value) -> Void

    public init(get: @escaping () -> Value, set: @escaping (Value) -> Void) {
        getter = get; setter = set
    }
    public init(projectedValue: Binding<Value>) { self = projectedValue }
    public init(_ other: Binding<Value>) { self = other }

    public static func constant(_ value: Value) -> Binding<Value> { Binding(get: { value }, set: { _ in }) }

    public var wrappedValue: Value {
        get { getter() }
        nonmutating set { setter(newValue) }
    }
    public var projectedValue: Binding<Value> { self }

    public subscript<T>(dynamicMember keyPath: WritableKeyPath<Value, T>) -> Binding<T> {
        Binding<T>(get: { self.getter()[keyPath: keyPath] },
                   set: { v in var whole = self.getter(); whole[keyPath: keyPath] = v; self.setter(whole) })
    }
}

extension Binding {
    /// `Binding<T?>` → `Binding<T>?` like SwiftUI's failable initializer.
    public init?(_ base: Binding<Value?>) {
        guard let v = base.wrappedValue else { return nil }
        var last = v
        self.init(get: { if let x = base.wrappedValue { last = x }; return last }, set: { base.wrappedValue = $0 })
    }
}

extension Binding: Identifiable where Value: Identifiable {
    public var id: Value.ID { wrappedValue.id }
}

// MARK: - ObservableObject (Combine-free)

public protocol ObservableObject: AnyObject {}

@propertyWrapper
public struct Published<Value> {
    var storage: Value
    public init(wrappedValue: Value) { storage = wrappedValue }
    public init(initialValue: Value) { storage = initialValue }
    public var wrappedValue: Value {
        get { storage }
        set { storage = newValue; _Runtime.setNeedsRender() }
    }
    public var projectedValue: Published<Value> { self }
}

@propertyWrapper
@dynamicMemberLookup
public struct ObservedObject<ObjectType: AnyObject> {
    public var wrappedValue: ObjectType
    public init(wrappedValue: ObjectType) { self.wrappedValue = wrappedValue }
    public init(initialValue: ObjectType) { self.wrappedValue = initialValue }
    public var projectedValue: ObservedObject<ObjectType> { self }
    public subscript<T>(dynamicMember keyPath: ReferenceWritableKeyPath<ObjectType, T>) -> Binding<T> {
        let obj = wrappedValue
        return Binding(get: { obj[keyPath: keyPath] }, set: { obj[keyPath: keyPath] = $0; _Runtime.setNeedsRender() })
    }
}

final class _ObjectLocation<T> {
    var object: T?
    let make: () -> T
    init(_ make: @escaping () -> T) { self.make = make }
}

@propertyWrapper
@dynamicMemberLookup
public struct StateObject<ObjectType: AnyObject>: _DynamicProperty {
    let loc: _ObjectLocation<ObjectType>
    public init(wrappedValue: @autoclosure @escaping () -> ObjectType) { loc = _ObjectLocation(wrappedValue) }
    public var wrappedValue: ObjectType {
        if let o = loc.object { return o }
        let o = loc.make(); loc.object = o; return o
    }
    public var projectedValue: ObservedObject<ObjectType> { ObservedObject(wrappedValue: wrappedValue) }
    public subscript<T>(dynamicMember keyPath: ReferenceWritableKeyPath<ObjectType, T>) -> Binding<T> {
        projectedValue[dynamicMember: keyPath]
    }
    public func _install(key: String, ctx: _Ctx) {
        let make = loc.make
        loc.object = ctx.graph.box(ctx.path + "#" + key) { make() }.value
    }
}

@propertyWrapper
public struct EnvironmentObject<ObjectType: AnyObject>: _DynamicProperty {
    final class Loc { var object: ObjectType? }
    let loc = Loc()
    public init() {}
    public var wrappedValue: ObjectType {
        guard let o = loc.object else {
            fatalError("No ObservableObject of type \(ObjectType.self) found. A View.environmentObject(_:) for \(ObjectType.self) may be missing as an ancestor of this view.")
        }
        return o
    }
    public var projectedValue: ObservedObject<ObjectType> { ObservedObject(wrappedValue: wrappedValue) }
    public func _install(key: String, ctx: _Ctx) {
        loc.object = ctx.env.objects[ObjectIdentifier(ObjectType.self)] as? ObjectType
    }
}

// MARK: - Environment

public struct DismissAction {
    let action: () -> Void
    public func callAsFunction() { action() }
}

/// iOS 13–14 `@Environment(\.presentationMode)`; `presentationMode.wrappedValue.dismiss()`.
public struct PresentationMode {
    public let isPresented: Bool
    let dismissAction: DismissAction
    public mutating func dismiss() { dismissAction() }
}

public enum ColorScheme: Hashable, Sendable { case light, dark }

public struct EnvironmentValues {
    var objects: [ObjectIdentifier: AnyObject] = [:]
    var custom: [ObjectIdentifier: Any] = [:]
    public var dismiss = DismissAction(action: {})
    public var colorScheme: ColorScheme = _currentScheme
    public var isEnabled = true
    public var scenePhase: ScenePhase { _scenePhase }
    public var locale = _L10n.shared.locale
    var _language: String {
        let id = locale.identifier
        return id.split(separator: "_").first.map(String.init) ?? id
    }
    public var horizontalSizeClass: UserInterfaceSizeClass? = .compact
    public var verticalSizeClass: UserInterfaceSizeClass? = .regular
    public var isPresented = false
    public var editMode: Binding<EditMode>? = nil
    var _editScope = "root"
    public var presentationMode: Binding<PresentationMode> {
        let d = dismiss, presented = isPresented
        return Binding(get: { PresentationMode(isPresented: presented, dismissAction: d) }, set: { _ in })
    }
    var listStyle = "insetGrouped"
    var pickerStyle = "menu"
    var textFieldStyle = "automatic"
    var toggleStyle = "switch"
    var labelStyle = "titleAndIcon"
    var progressStyle = "automatic"
    var tabViewStyle = "tabs"
    var buttonStyle = "automatic"
    var buttonShape = "auto"
    var controlSize = "regular"
    var labelsHidden = false
    var customButtonStyle: (@MainActor (AnyView, ButtonRole?) -> AnyView)? = nil
    public init() {}

    public subscript<K: EnvironmentKey>(key: K.Type) -> K.Value {
        get { custom[ObjectIdentifier(key)] as? K.Value ?? K.defaultValue }
        set { custom[ObjectIdentifier(key)] = newValue }
    }
}

nonisolated(unsafe) var _currentScheme: ColorScheme = .light

public enum UserInterfaceSizeClass: Hashable, Sendable { case compact, regular }
public enum EditMode: Hashable, Sendable {
    case inactive, transient, active
    public var isEditing: Bool { self == .active }
}

public protocol EnvironmentKey {
    associatedtype Value
    static var defaultValue: Value { get }
}

@propertyWrapper
public struct Environment<Value>: _DynamicProperty {
    final class Loc { var value: Value? }
    let read: (EnvironmentValues) -> Value?
    let loc = Loc()
    public init(_ keyPath: KeyPath<EnvironmentValues, Value>) { read = { $0[keyPath: keyPath] } }
    /// iOS 17 `@Environment(Model.self)` for @Observable objects
    public init(_ type: Value.Type) where Value: AnyObject & Observable {
        read = { $0.objects[ObjectIdentifier(type)] as? Value }
    }
    public var wrappedValue: Value {
        if let v = loc.value ?? read(EnvironmentValues()) { return v }
        fatalError("No \(Value.self) found in the environment. Add .environment(...) to an ancestor view.")
    }
    public func _install(key: String, ctx: _Ctx) { loc.value = read(ctx.env) }
}

// MARK: - AppStorage / FocusState / SceneStorage

@propertyWrapper
public struct AppStorage<Value>: _DynamicProperty {
    let key: String
    let defaultValue: Value
    public init(wrappedValue: Value, _ key: String, store: UserDefaults? = nil) {
        self.key = key; self.defaultValue = wrappedValue
    }
    public var wrappedValue: Value {
        get { (_appStorage[key] as? Value) ?? defaultValue }
        nonmutating set { _appStorage[key] = newValue; _saveAppStorage(); _Runtime.setNeedsRender() }
    }
    public var projectedValue: Binding<Value> {
        let s = self
        return Binding(get: { s.wrappedValue }, set: { s.wrappedValue = $0 })
    }
    public func _install(key: String, ctx: _Ctx) {}
}

nonisolated(unsafe) var _appStorage: [String: Any] = _loadAppStorage()

func _appStorageURL() -> URL? {
    guard let dir = ProcessInfo.processInfo.environment["SWIFTCODE_APPDATA"] else { return nil }
    return URL(fileURLWithPath: dir).appendingPathComponent("appstorage.plist")
}
func _loadAppStorage() -> [String: Any] {
    guard let url = _appStorageURL(), let data = try? Data(contentsOf: url),
          let obj = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any] else { return [:] }
    return obj
}
func _saveAppStorage() {
    guard let url = _appStorageURL(),
          let data = try? PropertyListSerialization.data(fromPropertyList: _appStorage, format: .xml, options: 0) else { return }
    try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try? data.write(to: url)
}

@propertyWrapper
public struct SceneStorage<Value>: _DynamicProperty {
    let state: State<Value>
    public init(wrappedValue: Value, _ key: String) { state = State(wrappedValue: wrappedValue) }
    public var wrappedValue: Value { get { state.wrappedValue } nonmutating set { state.wrappedValue = newValue } }
    public var projectedValue: Binding<Value> { state.projectedValue }
    public func _install(key: String, ctx: _Ctx) { state._install(key: key, ctx: ctx) }
}

@propertyWrapper
public struct FocusState<Value: Hashable>: _DynamicProperty {
    let state: State<Value>
    public init() where Value == Bool { state = State(wrappedValue: false) }
    public init<T: Hashable>() where Value == T? { state = State(wrappedValue: nil) }
    public var wrappedValue: Value { get { state.wrappedValue } nonmutating set { state.wrappedValue = newValue } }
    public var projectedValue: SwiftUI.Binding<Value> { state.projectedValue }
    public func _install(key: String, ctx: _Ctx) { state._install(key: key, ctx: ctx) }
}

// MARK: - Animation (accepted, not animated)

public struct Animation: Equatable, Sendable {
    public static let `default` = Animation()
    public static let linear = Animation()
    public static let easeIn = Animation()
    public static let easeOut = Animation()
    public static let easeInOut = Animation()
    public static let spring = Animation()
    public static let bouncy = Animation()
    public static let smooth = Animation()
    public static let snappy = Animation()
    public static func linear(duration: Double) -> Animation { Animation() }
    public static func easeIn(duration: Double) -> Animation { Animation() }
    public static func easeOut(duration: Double) -> Animation { Animation() }
    public static func easeInOut(duration: Double) -> Animation { Animation() }
    public static func spring(response: Double = 0.5, dampingFraction: Double = 0.8, blendDuration: Double = 0) -> Animation { Animation() }
    public static func spring(duration: Double = 0.5, bounce: Double = 0) -> Animation { Animation() }
    public static func interactiveSpring() -> Animation { Animation() }
    public func delay(_ d: Double) -> Animation { self }
    public func speed(_ s: Double) -> Animation { self }
    public func repeatForever(autoreverses: Bool = true) -> Animation { self }
    public func repeatCount(_ n: Int, autoreverses: Bool = true) -> Animation { self }
}

@discardableResult
public func withAnimation<Result>(_ animation: Animation? = .default, _ body: () throws -> Result) rethrows -> Result {
    try body()
}

public struct AnyTransition: Sendable {
    public static let opacity = AnyTransition()
    public static let scale = AnyTransition()
    public static let slide = AnyTransition()
    public static let identity = AnyTransition()
    public static func move(edge: Edge) -> AnyTransition { AnyTransition() }
    public static func asymmetric(insertion: AnyTransition, removal: AnyTransition) -> AnyTransition { AnyTransition() }
    public func combined(with other: AnyTransition) -> AnyTransition { self }
    public func animation(_ a: Animation?) -> AnyTransition { self }
}
