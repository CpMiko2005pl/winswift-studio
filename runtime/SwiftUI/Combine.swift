// A small Combine: enough for `.onReceive(NotificationCenter.default.publisher(for:))`, `Timer.publish`,
// subjects, `$published.sink`, `objectWillChange` and the common operators. `import Combine` resolves here.

public enum Subscribers {
    public enum Completion<Failure: Error> {
        case finished
        case failure(Failure)
    }
}

public protocol Cancellable { func cancel() }

public final class AnyCancellable: Cancellable, Hashable {
    private var onCancel: (() -> Void)?
    public init(_ cancel: @escaping () -> Void) { onCancel = cancel }
    public init<C: Cancellable>(_ c: C) { onCancel = { c.cancel() } }
    public func cancel() { onCancel?(); onCancel = nil }
    deinit { onCancel?() }
    public func store(in set: inout Set<AnyCancellable>) { set.insert(self) }
    public func store<C: RangeReplaceableCollection>(in collection: inout C) where C.Element == AnyCancellable { collection.append(self) }
    public static func == (a: AnyCancellable, b: AnyCancellable) -> Bool { a === b }
    public func hash(into h: inout Hasher) { h.combine(ObjectIdentifier(self)) }
}

public protocol Publisher<Output, Failure> {
    associatedtype Output
    associatedtype Failure: Error
    /// Delivers values until the returned token is cancelled.
    func _subscribe(_ value: @escaping (Output) -> Void, _ completion: @escaping (Subscribers.Completion<Failure>) -> Void) -> AnyCancellable
}

extension Publisher {
    public func sink(receiveCompletion: @escaping (Subscribers.Completion<Failure>) -> Void, receiveValue: @escaping (Output) -> Void) -> AnyCancellable {
        _subscribe(receiveValue, receiveCompletion)
    }
    public func map<T>(_ transform: @escaping (Output) -> T) -> AnyPublisher<T, Failure> {
        AnyPublisher { v, c in self._subscribe({ v(transform($0)) }, c) }
    }
    public func compactMap<T>(_ transform: @escaping (Output) -> T?) -> AnyPublisher<T, Failure> {
        AnyPublisher { v, c in self._subscribe({ if let x = transform($0) { v(x) } }, c) }
    }
    public func filter(_ isIncluded: @escaping (Output) -> Bool) -> AnyPublisher<Output, Failure> {
        AnyPublisher { v, c in self._subscribe({ if isIncluded($0) { v($0) } }, c) }
    }
    public func handleEvents(receiveOutput: ((Output) -> Void)? = nil) -> AnyPublisher<Output, Failure> {
        AnyPublisher { v, c in self._subscribe({ receiveOutput?($0); v($0) }, c) }
    }
    public func receive<S>(on scheduler: S, options: Any? = nil) -> AnyPublisher<Output, Failure> {
        AnyPublisher { v, c in self._subscribe({ x in DispatchQueue.main.async { v(x) } }, { e in DispatchQueue.main.async { c(e) } }) }
    }
    public func subscribe<S>(on scheduler: S, options: Any? = nil) -> AnyPublisher<Output, Failure> { eraseToAnyPublisher() }
    public func eraseToAnyPublisher() -> AnyPublisher<Output, Failure> {
        if let a = self as? AnyPublisher<Output, Failure> { return a }
        return AnyPublisher { v, c in self._subscribe(v, c) }
    }
    public func debounce<S>(for interval: _SchedulerStride, scheduler: S, options: Any? = nil) -> AnyPublisher<Output, Failure> {
        AnyPublisher { v, c in
            let gen = _Box(0)
            return self._subscribe({ x in
                gen.value += 1
                let mine = gen.value
                DispatchQueue.main.asyncAfter(deadline: .now() + interval.seconds) { if gen.value == mine { v(x) } }
            }, c)
        }
    }
    public func delay<S>(for interval: _SchedulerStride, scheduler: S, options: Any? = nil) -> AnyPublisher<Output, Failure> {
        AnyPublisher { v, c in self._subscribe({ x in DispatchQueue.main.asyncAfter(deadline: .now() + interval.seconds) { v(x) } }, c) }
    }
    public func prepend(_ values: Output...) -> AnyPublisher<Output, Failure> {
        AnyPublisher { v, c in values.forEach(v); return self._subscribe(v, c) }
    }
    public func merge<P: Publisher>(with other: P) -> AnyPublisher<Output, Failure> where P.Output == Output, P.Failure == Failure {
        AnyPublisher { v, c in
            let a = self._subscribe(v, c), b = other._subscribe(v, c)
            return AnyCancellable { a.cancel(); b.cancel() }
        }
    }
    public func combineLatest<P: Publisher>(_ other: P) -> AnyPublisher<(Output, P.Output), Failure> where P.Failure == Failure {
        AnyPublisher { v, c in
            let l = _Box<Output?>(nil), r = _Box<P.Output?>(nil)
            let a = self._subscribe({ x in l.value = x; if let y = r.value { v((x, y)) } }, c)
            let b = other._subscribe({ y in r.value = y; if let x = l.value { v((x, y)) } }, c)
            return AnyCancellable { a.cancel(); b.cancel() }
        }
    }
    public func first() -> AnyPublisher<Output, Failure> {
        AnyPublisher { v, c in
            let done = _Box(false)
            return self._subscribe({ x in if !done.value { done.value = true; v(x); c(.finished) } }, c)
        }
    }
    public func dropFirst(_ count: Int = 1) -> AnyPublisher<Output, Failure> {
        AnyPublisher { v, c in
            let seen = _Box(0)
            return self._subscribe({ x in seen.value += 1; if seen.value > count { v(x) } }, c)
        }
    }
    public func scan<T>(_ initial: T, _ next: @escaping (T, Output) -> T) -> AnyPublisher<T, Failure> {
        AnyPublisher { v, c in
            let acc = _Box(initial)
            return self._subscribe({ x in acc.value = next(acc.value, x); v(acc.value) }, c)
        }
    }
    public func replaceNil<T>(with value: T) -> AnyPublisher<T, Failure> where Output == T? {
        AnyPublisher { v, c in self._subscribe({ v($0 ?? value) }, c) }
    }
    public func setFailureType<E: Error>(to: E.Type) -> AnyPublisher<Output, E> where Failure == Never {
        AnyPublisher { v, c in self._subscribe(v, { _ in c(.finished) }) }
    }
}

extension Publisher where Failure == Never {
    public func sink(receiveValue: @escaping (Output) -> Void) -> AnyCancellable { _subscribe(receiveValue, { _ in }) }
    public func assign<Root: AnyObject>(to keyPath: ReferenceWritableKeyPath<Root, Output>, on object: Root) -> AnyCancellable {
        _subscribe({ object[keyPath: keyPath] = $0 }, { _ in })
    }
}

extension Publisher where Output: Equatable {
    public func removeDuplicates() -> AnyPublisher<Output, Failure> {
        AnyPublisher { v, c in
            let last = _Box<Output?>(nil)
            return self._subscribe({ x in if last.value != x { last.value = x; v(x) } }, c)
        }
    }
}

/// `.debounce(for: .milliseconds(300), scheduler: RunLoop.main)` or `for: 0.3`
public struct _SchedulerStride: ExpressibleByFloatLiteral, ExpressibleByIntegerLiteral, Sendable {
    public let seconds: Double
    public init(floatLiteral v: Double) { seconds = v }
    public init(integerLiteral v: Int) { seconds = Double(v) }
    public static func seconds(_ s: Double) -> _SchedulerStride { _SchedulerStride(floatLiteral: s) }
    public static func milliseconds(_ ms: Int) -> _SchedulerStride { _SchedulerStride(floatLiteral: Double(ms) / 1000) }
}

public struct AnyPublisher<Output, Failure: Error>: Publisher {
    let subscribe: (@escaping (Output) -> Void, @escaping (Subscribers.Completion<Failure>) -> Void) -> AnyCancellable
    init(_ subscribe: @escaping (@escaping (Output) -> Void, @escaping (Subscribers.Completion<Failure>) -> Void) -> AnyCancellable) { self.subscribe = subscribe }
    public func _subscribe(_ value: @escaping (Output) -> Void, _ completion: @escaping (Subscribers.Completion<Failure>) -> Void) -> AnyCancellable { subscribe(value, completion) }
}

public struct Just<Output>: Publisher {
    public typealias Failure = Never
    public let output: Output
    public init(_ output: Output) { self.output = output }
    public func _subscribe(_ value: @escaping (Output) -> Void, _ completion: @escaping (Subscribers.Completion<Never>) -> Void) -> AnyCancellable {
        value(output); completion(.finished); return AnyCancellable {}
    }
}

public struct Empty<Output, Failure: Error>: Publisher {
    public init(completeImmediately: Bool = true) {}
    public func _subscribe(_ value: @escaping (Output) -> Void, _ completion: @escaping (Subscribers.Completion<Failure>) -> Void) -> AnyCancellable {
        completion(.finished); return AnyCancellable {}
    }
}

public struct Fail<Output, Failure: Error>: Publisher {
    public let error: Failure
    public init(error: Failure) { self.error = error }
    public func _subscribe(_ value: @escaping (Output) -> Void, _ completion: @escaping (Subscribers.Completion<Failure>) -> Void) -> AnyCancellable {
        completion(.failure(error)); return AnyCancellable {}
    }
}

/// `Future { promise in … promise(.success(x)) }`
public final class Future<Output, Failure: Error>: Publisher {
    public typealias Promise = (Result<Output, Failure>) -> Void
    var result: Result<Output, Failure>?
    var waiting: [(Result<Output, Failure>) -> Void] = []
    public init(_ attempt: @escaping (@escaping Promise) -> Void) {
        attempt { [weak self] r in
            guard let self, self.result == nil else { return }
            self.result = r
            let w = self.waiting; self.waiting = []
            w.forEach { $0(r) }
        }
    }
    public func _subscribe(_ value: @escaping (Output) -> Void, _ completion: @escaping (Subscribers.Completion<Failure>) -> Void) -> AnyCancellable {
        let deliver: (Result<Output, Failure>) -> Void = { r in
            switch r { case .success(let v): value(v); completion(.finished); case .failure(let e): completion(.failure(e)) }
        }
        if let result { deliver(result) } else { waiting.append(deliver) }
        return AnyCancellable {}
    }
}

/// Fan-out to every current subscriber.
final class _Subscribers<Output, Failure: Error> {
    var next = 0
    var subs: [Int: (value: (Output) -> Void, completion: (Subscribers.Completion<Failure>) -> Void)] = [:]
    var completed: Subscribers.Completion<Failure>?
    func add(_ v: @escaping (Output) -> Void, _ c: @escaping (Subscribers.Completion<Failure>) -> Void) -> AnyCancellable {
        if let completed { c(completed); return AnyCancellable {} }
        next += 1
        let id = next
        subs[id] = (v, c)
        return AnyCancellable { [weak self] in self?.subs.removeValue(forKey: id) }
    }
    func send(_ v: Output) { for s in subs.values { s.value(v) } }
    func finish(_ c: Subscribers.Completion<Failure>) { completed = c; for s in subs.values { s.completion(c) }; subs = [:] }
}

public protocol Subject<Output, Failure>: AnyObject, Publisher {
    func send(_ value: Output)
    func send(completion: Subscribers.Completion<Failure>)
}
extension Subject where Output == Void { public func send() { send(()) } }

public final class PassthroughSubject<Output, Failure: Error>: Subject {
    let subscribers = _Subscribers<Output, Failure>()
    public init() {}
    public func send(_ value: Output) { subscribers.send(value) }
    public func send(completion: Subscribers.Completion<Failure>) { subscribers.finish(completion) }
    public func _subscribe(_ value: @escaping (Output) -> Void, _ completion: @escaping (Subscribers.Completion<Failure>) -> Void) -> AnyCancellable {
        subscribers.add(value, completion)
    }
}

public final class CurrentValueSubject<Output, Failure: Error>: Subject {
    let subscribers = _Subscribers<Output, Failure>()
    public var value: Output { didSet { subscribers.send(value) } }
    public init(_ value: Output) { self.value = value }
    public func send(_ value: Output) { self.value = value }
    public func send(completion: Subscribers.Completion<Failure>) { subscribers.finish(completion) }
    public func _subscribe(_ v: @escaping (Output) -> Void, _ completion: @escaping (Subscribers.Completion<Failure>) -> Void) -> AnyCancellable {
        v(value)
        return subscribers.add(v, completion)
    }
}

// MARK: - Foundation publishers

extension NotificationCenter {
    /// `NotificationCenter.default.publisher(for: .deviceDidShakeNotification)`
    public struct Publisher: SwiftUI.Publisher {
        public typealias Output = Notification
        public typealias Failure = Never
        public let center: NotificationCenter
        public let name: Notification.Name
        public let object: AnyObject?
        public func _subscribe(_ value: @escaping (Notification) -> Void, _ completion: @escaping (Subscribers.Completion<Never>) -> Void) -> AnyCancellable {
            let token = center.addObserver(forName: name, object: object, queue: nil) { n in value(n) }
            let c = center
            return AnyCancellable { c.removeObserver(token) }
        }
    }
    public func publisher(for name: Notification.Name, object: AnyObject? = nil) -> NotificationCenter.Publisher {
        Publisher(center: self, name: name, object: object)
    }
}

extension Timer {
    /// `Timer.publish(every: 1, on: .main, in: .common).autoconnect()`
    public static func publish(every interval: TimeInterval, tolerance: TimeInterval? = nil, on runLoop: RunLoop, in mode: RunLoop.Mode, options: Any? = nil) -> TimerPublisher {
        TimerPublisher(interval: interval)
    }

    public final class TimerPublisher: SwiftUI.Publisher {
        public typealias Output = Date
        public typealias Failure = Never
        public let interval: TimeInterval
        let subscribers = _Subscribers<Date, Never>()
        var source: DispatchSourceTimer?
        init(interval: TimeInterval) { self.interval = interval }
        /// starts firing; the returned token stops it
        public func connect() -> Cancellable {
            if source == nil {
                let t = DispatchSource.makeTimerSource(queue: .main)
                t.schedule(deadline: .now() + interval, repeating: interval)
                t.setEventHandler { [weak self] in self?.subscribers.send(Date()) }
                t.resume()
                source = t
            }
            return AnyCancellable { [weak self] in self?.source?.cancel(); self?.source = nil }
        }
        public func autoconnect() -> TimerPublisher { _ = connect(); return self }
        public func _subscribe(_ value: @escaping (Date) -> Void, _ completion: @escaping (Subscribers.Completion<Never>) -> Void) -> AnyCancellable {
            subscribers.add(value, completion)
        }
    }
}

// MARK: - ObservableObject.objectWillChange

public final class ObservableObjectPublisher: Publisher {
    public typealias Output = Void
    public typealias Failure = Never
    let subscribers = _Subscribers<Void, Never>()
    public init() {}
    public func send() { subscribers.send(()) }
    public func _subscribe(_ value: @escaping (Void) -> Void, _ completion: @escaping (Subscribers.Completion<Never>) -> Void) -> AnyCancellable {
        subscribers.add(value, completion)
    }
}

nonisolated(unsafe) var _objectWillChange: [ObjectIdentifier: ObservableObjectPublisher] = [:]

extension ObservableObject {
    public var objectWillChange: ObservableObjectPublisher {
        let id = ObjectIdentifier(self)
        if let p = _objectWillChange[id] { return p }
        let p = ObservableObjectPublisher()
        _objectWillChange[id] = p
        return p
    }
}

// MARK: - onReceive

extension View {
    /// Runs `action` on the main thread for every value the publisher emits while the view is on screen.
    public func onReceive<P: Publisher>(_ publisher: P, perform action: @escaping (P.Output) -> Void) -> some View where P.Failure == Never {
        _ModifiedView(content: self, key: "onReceive") { ctx in
            // the newest closure sees the newest state; one subscription per view
            let handler = ctx.graph.box(ctx.path + "~recvfn") { action }
            handler.value = action
            _ = ctx.graph.box(ctx.path + "~recv") { () -> AnyCancellable in
                publisher._subscribe({ v in
                    let deliver = { MainActor.assumeIsolated { handler.value(v); _Runtime.setNeedsRender() } }
                    if Thread.isMainThread { deliver() } else { DispatchQueue.main.async(execute: deliver) }
                }, { _ in })
            }
            return nil
        }
    }
}
