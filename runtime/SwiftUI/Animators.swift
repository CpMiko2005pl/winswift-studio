// Timelines use the runtime render clock. Triggered timelines stay on their first value until triggered.
private final class Playback<Trigger: Equatable> {
    var trigger: Trigger, started: TimeInterval?
    init(_ trigger: Trigger, repeats: Bool, now: TimeInterval) { self.trigger = trigger; started = repeats ? now : nil }
}
private func playback<T: Equatable>(_ ctx: _Ctx, _ trigger: T, repeats: Bool) -> TimeInterval? {
    let now = ProcessInfo.processInfo.systemUptime
    let clock = ctx.graph.box(ctx.path + "~playback") { Playback(trigger, repeats: repeats, now: now) }.value
    if clock.trigger != trigger { clock.trigger = trigger; clock.started = now }
    return clock.started.map { max(0, now - $0) }
}

public struct PhaseAnimator<Phase: Equatable, Content: View>: View, _PrimitiveView {
    private let phases: [Phase], content: (Phase) -> Content, animation: (Phase) -> Animation?
    private let elapsed: (_Ctx) -> TimeInterval?
    private let repeats: Bool
    public init<S: Sequence>(_ phases: S, @ViewBuilder content: @escaping (Phase) -> Content, animation: @escaping (Phase) -> Animation? = { _ in .default }) where S.Element == Phase {
        self.phases = Array(phases); self.content = content; self.animation = animation
        repeats = true; elapsed = { playback($0, true, repeats: true) }
    }
    public init<S: Sequence, T: Equatable>(_ phases: S, trigger: T, @ViewBuilder content: @escaping (Phase) -> Content, animation: @escaping (Phase) -> Animation? = { _ in .default }) where S.Element == Phase {
        self.phases = Array(phases); self.content = content; self.animation = animation
        repeats = false; elapsed = { playback($0, trigger, repeats: false) }
    }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        guard let first = phases.first else { return [] }
        let durations = phases.map { max(0.01, animation($0)?.duration ?? 0.25) }
        let length = durations.reduce(0, +)
        var phase = first
        if var time = elapsed(ctx), repeats || time < length {
            time = time.truncatingRemainder(dividingBy: length)
            for (i, duration) in durations.enumerated() {
                if time < duration { phase = phases[i]; break }
                time -= duration
            }
        }
        return _resolve(content(phase).animation(animation(phase), value: phase), ctx.child("phase"))
    }
}

public struct LinearKeyframe<Value: BinaryFloatingPoint> {
    let value: Value, duration: Double
    public init(_ value: Value, duration: Double) { self.value = value; self.duration = max(0, duration) }
}
public typealias CubicKeyframe<Value: BinaryFloatingPoint> = LinearKeyframe<Value>
public typealias SpringKeyframe<Value: BinaryFloatingPoint> = LinearKeyframe<Value>
@resultBuilder public enum KeyframeBuilder<V: BinaryFloatingPoint> {
    public static func buildExpression(_ frame: LinearKeyframe<V>) -> LinearKeyframe<V> { frame }
    public static func buildBlock(_ frames: LinearKeyframe<V>...) -> [LinearKeyframe<V>] { frames }
}
public struct KeyframeTrack<Root> {
    let duration: Double
    let apply: (inout Root, Double) -> Void
    public init<V: BinaryFloatingPoint>(_ key: WritableKeyPath<Root, V>, @KeyframeBuilder<V> content: () -> [LinearKeyframe<V>]) {
        let frames = content()
        duration = frames.reduce(0) { $0 + $1.duration }
        apply = { root, time in
            var previous = root[keyPath: key], remaining = time
            for frame in frames {
                if remaining < frame.duration {
                    root[keyPath: key] = previous + (frame.value - previous) * V(remaining / frame.duration)
                    return
                }
                remaining -= frame.duration; previous = frame.value
            }
            root[keyPath: key] = previous
        }
    }
}
@resultBuilder public enum KeyframeTrackBuilder<Root> {
    public static func buildExpression(_ track: KeyframeTrack<Root>) -> KeyframeTrack<Root> { track }
    public static func buildBlock(_ tracks: KeyframeTrack<Root>...) -> [KeyframeTrack<Root>] { tracks }
}
public struct KeyframeAnimator<Value, Content: View>: View, _PrimitiveView {
    let initial: Value, content: (Value) -> Content, tracks: [KeyframeTrack<Value>]
    let elapsed: (_Ctx) -> TimeInterval?, repeating: Bool
    public init<T: Equatable>(initialValue: Value, trigger: T, @ViewBuilder content: @escaping (Value) -> Content, @KeyframeTrackBuilder<Value> keyframes: (Value) -> [KeyframeTrack<Value>]) {
        initial = initialValue; self.content = content; tracks = keyframes(initialValue)
        repeating = false; elapsed = { playback($0, trigger, repeats: false) }
    }
    public init(initialValue: Value, repeating: Bool = true, @ViewBuilder content: @escaping (Value) -> Content, @KeyframeTrackBuilder<Value> keyframes: (Value) -> [KeyframeTrack<Value>]) {
        initial = initialValue; self.content = content; tracks = keyframes(initialValue)
        self.repeating = repeating; elapsed = { playback($0, true, repeats: true) }
    }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        var value = initial
        if var time = elapsed(ctx) {
            let duration = tracks.map(\.duration).max() ?? 0
            if repeating && duration > 0 { time = time.truncatingRemainder(dividingBy: duration) }
            for track in tracks { track.apply(&value, time) }
        }
        return _resolve(content(value), ctx.child("keyframes"))
    }
}
