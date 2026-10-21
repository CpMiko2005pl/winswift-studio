// Gestures. The simulator recognises taps (with counts), long presses, drags, pinches and rotations
// with the mouse (Alt+drag pinches/rotates like Option in Apple's Simulator) and reports them per gesture id.

/// One recognizer the simulator should run on a view.
public struct _GesturePart {
    var kind: String                      // tap, spatialTap, longpress, drag, magnify, rotate
    var params: [String: _J] = [:]
    var changed: [@MainActor (_GestureEvent) -> Void] = []
    var ended: [@MainActor (_GestureEvent) -> Void] = []
    var pressing: [@MainActor (Bool) -> Void] = []
}

/// What the simulator reports (points, in the view's own coordinate space).
public struct _GestureEvent {
    var phase = "changed"
    var location = CGPoint.zero
    var startLocation = CGPoint.zero
    var translation = CGSize.zero
    var velocity = CGSize.zero
    var predictedEndTranslation = CGSize.zero
    var magnification: CGFloat = 1
    var rotation: Double = 0          // degrees
    var finished = true

    init(_ v: [String: Any]) {
        func d(_ k: String) -> CGFloat { CGFloat((v[k] as? Double) ?? Double((v[k] as? Int) ?? 0)) }
        phase = v["ph"] as? String ?? "changed"
        location = CGPoint(x: d("x"), y: d("y"))
        startLocation = CGPoint(x: d("sx"), y: d("sy"))
        translation = CGSize(width: location.x - startLocation.x, height: location.y - startLocation.y)
        velocity = CGSize(width: d("vx"), height: d("vy"))
        predictedEndTranslation = CGSize(width: translation.width + velocity.width * 0.25, height: translation.height + velocity.height * 0.25)
        if v["mag"] != nil { magnification = d("mag") }
        rotation = Double(d("rot"))
        finished = (v["fin"] as? Bool) ?? true
    }
}

public protocol Gesture {
    associatedtype Value
    var _parts: [_GesturePart] { get set }
    func _value(_ e: _GestureEvent) -> Value
}

public struct Transaction: Sendable {
    public var animation: Animation?
    public var disablesAnimations = false
    public var isContinuous = false
    public init() {}
    public init(animation: Animation?) { self.animation = animation }
}
@discardableResult
public func withTransaction<R>(_ t: Transaction, _ body: () throws -> R) rethrows -> R { try body() }

extension Gesture {
    public func onChanged(_ action: @escaping (Value) -> Void) -> Self {
        var g = self
        let conv = _value
        for i in g._parts.indices { g._parts[i].changed.append { action(conv($0)) } }
        return g
    }
    public func onEnded(_ action: @escaping (Value) -> Void) -> Self {
        var g = self
        let conv = _value
        for i in g._parts.indices { g._parts[i].ended.append { action(conv($0)) } }
        return g
    }
    /// Keeps a @GestureState in sync while the gesture runs; it snaps back when the gesture ends.
    public func updating<S>(_ state: GestureState<S>, body: @escaping (Value, inout S, inout Transaction) -> Void) -> Self {
        var g = self
        let conv = _value
        for i in g._parts.indices {
            g._parts[i].changed.append { e in
                var s = state.wrappedValue
                var t = Transaction()
                body(conv(e), &s, &t)
                state._set(s)
            }
            g._parts[i].ended.append { _ in state._reset() }
        }
        return g
    }
    public func simultaneously<Other: Gesture>(with other: Other) -> SimultaneousGesture<Self, Other> { SimultaneousGesture(first: self, second: other) }
    public func sequenced<Other: Gesture>(before other: Other) -> SequenceGesture<Self, Other> { SequenceGesture(first: self, second: other) }
    public func exclusively<Other: Gesture>(before other: Other) -> ExclusiveGesture<Self, Other> { ExclusiveGesture(first: self, second: other) }
    public func map<T>(_ body: @escaping (Value) -> T) -> _MapGesture<Self, T> { _MapGesture(base: self, transform: body) }
}

// MARK: Concrete gestures

public struct TapGesture: Gesture {
    public typealias Value = Void
    public var _parts: [_GesturePart]
    public init(count: Int = 1) { _parts = [_GesturePart(kind: "tap", params: ["count": .int(count)])] }
    public func _value(_ e: _GestureEvent) {}
}

public struct SpatialTapGesture: Gesture {
    public struct Value: Equatable, Sendable { public var location: CGPoint }
    public var _parts: [_GesturePart]
    public init(count: Int = 1, coordinateSpace: CoordinateSpace = .local) { _parts = [_GesturePart(kind: "tap", params: ["count": .int(count), "loc": .b(true)])] }
    public func _value(_ e: _GestureEvent) -> Value { Value(location: e.location) }
}

public struct LongPressGesture: Gesture {
    public typealias Value = Bool
    public var _parts: [_GesturePart]
    public var minimumDuration: Double
    public init(minimumDuration: Double = 0.5, maximumDistance: CGFloat = 10) {
        self.minimumDuration = minimumDuration
        _parts = [_GesturePart(kind: "longpress", params: ["dur": .n(minimumDuration), "dist": .num(maximumDistance)])]
    }
    public func _value(_ e: _GestureEvent) -> Bool { e.finished }
}

public struct DragGesture: Gesture {
    public struct Value: Equatable, Sendable {
        public var time: Date
        public var location: CGPoint
        public var startLocation: CGPoint
        public var translation: CGSize
        public var velocity: CGSize
        public var predictedEndLocation: CGPoint
        public var predictedEndTranslation: CGSize
    }
    public var _parts: [_GesturePart]
    public var minimumDistance: CGFloat
    public init(minimumDistance: CGFloat = 10, coordinateSpace: CoordinateSpace = .local) {
        self.minimumDistance = minimumDistance
        _parts = [_GesturePart(kind: "drag", params: ["min": .num(minimumDistance)])]
    }
    public init(minimumDistance: CGFloat = 10, coordinateSpace: some CoordinateSpaceProtocol) { self.init(minimumDistance: minimumDistance) }
    public func _value(_ e: _GestureEvent) -> Value {
        Value(time: Date(), location: e.location, startLocation: e.startLocation, translation: e.translation, velocity: e.velocity,
              predictedEndLocation: CGPoint(x: e.startLocation.x + e.predictedEndTranslation.width, y: e.startLocation.y + e.predictedEndTranslation.height),
              predictedEndTranslation: e.predictedEndTranslation)
    }
}

public struct MagnifyGesture: Gesture {
    public struct Value: Equatable, Sendable {
        public var time: Date
        public var magnification: CGFloat
        public var velocity: CGFloat
        public var startAnchor: UnitPoint
        public var startLocation: CGPoint
    }
    public var _parts: [_GesturePart]
    public init(minimumScaleDelta: CGFloat = 0.01) { _parts = [_GesturePart(kind: "magnify")] }
    public func _value(_ e: _GestureEvent) -> Value {
        Value(time: Date(), magnification: e.magnification, velocity: 0, startAnchor: .center, startLocation: e.startLocation)
    }
}

/// iOS 13–16 pinch: the value is the scale factor itself.
public struct MagnificationGesture: Gesture {
    public typealias Value = CGFloat
    public var _parts: [_GesturePart]
    public init(minimumScaleDelta: CGFloat = 0.01) { _parts = [_GesturePart(kind: "magnify")] }
    public func _value(_ e: _GestureEvent) -> CGFloat { e.magnification }
}

public struct RotateGesture: Gesture {
    public struct Value: Equatable, Sendable {
        public var time: Date
        public var rotation: Angle
        public var velocity: Angle
        public var startAnchor: UnitPoint
        public var startLocation: CGPoint
    }
    public var _parts: [_GesturePart]
    public init(minimumAngleDelta: Angle = .degrees(1)) { _parts = [_GesturePart(kind: "rotate")] }
    public func _value(_ e: _GestureEvent) -> Value {
        Value(time: Date(), rotation: .degrees(e.rotation), velocity: .zero, startAnchor: .center, startLocation: e.startLocation)
    }
}

/// iOS 13–16 rotation: the value is the angle itself.
public struct RotationGesture: Gesture {
    public typealias Value = Angle
    public var _parts: [_GesturePart]
    public init(minimumAngleDelta: Angle = .degrees(1)) { _parts = [_GesturePart(kind: "rotate")] }
    public func _value(_ e: _GestureEvent) -> Angle { .degrees(e.rotation) }
}

// MARK: Composition

public struct SimultaneousGesture<First: Gesture, Second: Gesture>: Gesture {
    public struct Value { public var first: First.Value?; public var second: Second.Value? }
    public var first: First, second: Second
    public var _parts: [_GesturePart]
    init(first: First, second: Second) {
        self.first = first; self.second = second
        _parts = first._parts.map { var p = $0; p.params["grp"] = .s("a"); return p } + second._parts.map { var p = $0; p.params["grp"] = .s("b"); return p }
    }
    public func _value(_ e: _GestureEvent) -> Value { Value(first: first._value(e), second: second._value(e)) }
}

public struct SequenceGesture<First: Gesture, Second: Gesture>: Gesture {
    public enum Value { case first(First.Value), second(First.Value, Second.Value?) }
    public var first: First, second: Second
    public var _parts: [_GesturePart]
    init(first: First, second: Second) { self.first = first; self.second = second; _parts = first._parts + second._parts }
    public func _value(_ e: _GestureEvent) -> Value { .second(first._value(e), second._value(e)) }
}

public struct ExclusiveGesture<First: Gesture, Second: Gesture>: Gesture {
    public enum Value { case first(First.Value), second(Second.Value) }
    public var first: First, second: Second
    public var _parts: [_GesturePart]
    init(first: First, second: Second) { self.first = first; self.second = second; _parts = first._parts + second._parts }
    public func _value(_ e: _GestureEvent) -> Value { .first(first._value(e)) }
}

public struct _MapGesture<Base: Gesture, T>: Gesture {
    public typealias Value = T
    let base: Base, transform: (Base.Value) -> T
    public var _parts: [_GesturePart]
    init(base: Base, transform: @escaping (Base.Value) -> T) { self.base = base; self.transform = transform; _parts = base._parts }
    public func _value(_ e: _GestureEvent) -> T { transform(base._value(e)) }
}

/// `var drag: some Gesture { … }` stored as AnyGesture
public struct AnyGesture<Value>: Gesture {
    public var _parts: [_GesturePart]
    let conv: (_GestureEvent) -> Value
    public init<G: Gesture>(_ g: G) where G.Value == Value { _parts = g._parts; conv = g._value }
    public func _value(_ e: _GestureEvent) -> Value { conv(e) }
}

public protocol CoordinateSpaceProtocol {}
public struct LocalCoordinateSpace: CoordinateSpaceProtocol { public init() {} }
public struct GlobalCoordinateSpace: CoordinateSpaceProtocol { public init() {} }
public struct NamedCoordinateSpace: CoordinateSpaceProtocol { let name: AnyHashable }
extension CoordinateSpaceProtocol where Self == LocalCoordinateSpace { public static var local: LocalCoordinateSpace { LocalCoordinateSpace() } }
extension CoordinateSpaceProtocol where Self == GlobalCoordinateSpace { public static var global: GlobalCoordinateSpace { GlobalCoordinateSpace() } }
extension CoordinateSpaceProtocol where Self == NamedCoordinateSpace { public static func named(_ n: some Hashable) -> NamedCoordinateSpace { NamedCoordinateSpace(name: AnyHashable(n)) } }

public struct GestureMask: OptionSet, Sendable {
    public let rawValue: Int
    public init(rawValue: Int) { self.rawValue = rawValue }
    public static let none = GestureMask([]), gesture = GestureMask(rawValue: 1), subviews = GestureMask(rawValue: 2), all = GestureMask(rawValue: 3)
}

// MARK: @GestureState

@propertyWrapper
public struct GestureState<Value>: _DynamicProperty {
    let state: State<Value>
    let initial: Value
    public init(wrappedValue: Value) { state = State(wrappedValue: wrappedValue); initial = wrappedValue }
    public init(initialValue: Value) { self.init(wrappedValue: initialValue) }
    public init(wrappedValue: Value, resetTransaction: Transaction) { self.init(wrappedValue: wrappedValue) }
    public init(wrappedValue: Value, reset: @escaping (Value, inout Transaction) -> Void) { self.init(wrappedValue: wrappedValue) }
    public var wrappedValue: Value { state.wrappedValue }
    public var projectedValue: GestureState<Value> { self }
    func _set(_ v: Value) { state.wrappedValue = v }
    func _reset() { state.wrappedValue = initial }
    public func _install(key: String, ctx: _Ctx) { state._install(key: key, ctx: ctx) }
}

// MARK: Modifiers

extension View {
    public func onTapGesture(count: Int = 1, perform action: @escaping @MainActor () -> Void) -> some View {
        _ModifiedView(content: self, key: "tap") { ctx in
            let id = ctx.path + "~tap\(count)"
            ctx.action(id, action)
            return ["id": .s(id), "count": .int(count)]
        }
    }
    /// iOS 17: the tap location in the view's coordinates
    public func onTapGesture(count: Int = 1, coordinateSpace: CoordinateSpace = .local, perform action: @escaping @MainActor (CGPoint) -> Void) -> some View {
        gesture(SpatialTapGesture(count: count).onEnded { v in MainActor.assumeIsolated { action(v.location) } })
    }
    public func onLongPressGesture(minimumDuration: Double = 0.5, maximumDistance: CGFloat = 10, perform action: @escaping @MainActor () -> Void, onPressingChanged: ((Bool) -> Void)? = nil) -> some View {
        _ModifiedView(content: self, key: "longpress") { ctx in
            let id = ctx.path + "~long"
            ctx.action(id, action)
            var o: [String: _J] = ["id": .s(id), "dur": .n(minimumDuration), "dist": .num(maximumDistance)]
            if let onPressingChanged {
                ctx.graph.boolSetters[id + "~pressing"] = { onPressingChanged($0) }
                o["pressing"] = .s(id + "~pressing")
            }
            return o
        }
    }
    public func onLongPressGesture(minimumDuration: Double = 0.5, perform action: @escaping @MainActor () -> Void, onPressingChanged: ((Bool) -> Void)? = nil) -> some View {
        onLongPressGesture(minimumDuration: minimumDuration, maximumDistance: 10, perform: action, onPressingChanged: onPressingChanged)
    }
    public func onLongPressGesture(minimumDuration: Double = 0.5, maximumDistance: CGFloat = 10, pressing: ((Bool) -> Void)?, perform action: @escaping @MainActor () -> Void) -> some View {
        onLongPressGesture(minimumDuration: minimumDuration, maximumDistance: maximumDistance, perform: action, onPressingChanged: pressing)
    }

    func _gesture<G: Gesture>(_ g: G, _ priority: String) -> some View {
        _ModifiedView(content: self, key: "gesture") { ctx in
            var specs: [_J] = []
            for (i, part) in g._parts.enumerated() {
                let id = ctx.path + "~g\(priority)\(i)"
                ctx.graph.gestures[id] = part
                var o = part.params
                o["kind"] = .s(part.kind)
                o["id"] = .s(id)
                specs.append(.o(o))
            }
            return ["g": .a(specs), "prio": .s(priority)]
        }
    }
    public func gesture<G: Gesture>(_ g: G, including mask: GestureMask = .all) -> some View { _gesture(g, "n") }
    public func gesture<G: Gesture>(_ g: G, isEnabled: Bool) -> some View { _gesture(g, isEnabled ? "n" : "off") }
    public func simultaneousGesture<G: Gesture>(_ g: G, including mask: GestureMask = .all) -> some View { _gesture(g, "s") }
    public func highPriorityGesture<G: Gesture>(_ g: G, including mask: GestureMask = .all) -> some View { _gesture(g, "h") }
    public func coordinateSpace(name: some Hashable) -> some View { self }
    public func coordinateSpace(_ s: NamedCoordinateSpace) -> some View { self }
}

@MainActor
func _dispatchGesture(_ graph: _Graph, _ id: String, _ v: [String: Any]) {
    guard let part = graph.gestures[id] else { return }
    let e = _GestureEvent(v)
    switch e.phase {
    case "pressing": for f in part.pressing { f((v["v"] as? Bool) ?? false) }; for f in part.changed { f(e) }
    case "changed": for f in part.changed { f(e) }
    case "ended", "cancelled": for f in part.ended { f(e) }
    default: break
    }
    _Runtime.setNeedsRender()
}
