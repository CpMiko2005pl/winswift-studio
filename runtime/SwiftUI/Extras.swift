// WinSwift Studio 1.5 additions: @Bindable, Path & custom shapes, AsyncImage, ViewThatFits, TimelineView,
// content transitions and symbol effects, selectable List rows.
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// MARK: - @Bindable (iOS 17 Observation)

/// `@Bindable var model = model` / `@Bindable var model: Model` — bindings to an @Observable object's properties.
@propertyWrapper
@dynamicMemberLookup
public struct Bindable<Value: AnyObject> {
    public var wrappedValue: Value
    public init(wrappedValue: Value) { self.wrappedValue = wrappedValue }
    public init(_ wrappedValue: Value) { self.wrappedValue = wrappedValue }
    public init(projectedValue: Bindable<Value>) { self = projectedValue }
    public var projectedValue: Bindable<Value> { self }
    public subscript<T>(dynamicMember keyPath: ReferenceWritableKeyPath<Value, T>) -> Binding<T> {
        let obj = wrappedValue
        return Binding(get: { obj[keyPath: keyPath] }, set: { obj[keyPath: keyPath] = $0; _Runtime.setNeedsRender() })
    }
}

// MARK: - Path

/// A 2D path, drawn by the simulator as SVG. Coordinates are points, y grows downwards (like SwiftUI).
nonisolated public struct Path: Shape, @unchecked Sendable {
    enum Element {
        case move(CGPoint), line(CGPoint), quad(CGPoint, CGPoint), curve(CGPoint, CGPoint, CGPoint)
        case arc(rx: CGFloat, ry: CGFloat, large: Bool, sweep: Bool, to: CGPoint)
        case close
    }
    var elements: [Element] = []
    var start: CGPoint? = nil
    public private(set) var currentPoint: CGPoint? = nil
    var minX = CGFloat.infinity, minY = CGFloat.infinity, maxX = -CGFloat.infinity, maxY = -CGFloat.infinity

    public init() {}
    public init(_ rect: CGRect) { addRect(rect) }
    public init(ellipseIn rect: CGRect) { addEllipse(in: rect) }
    public init(roundedRect rect: CGRect, cornerRadius: CGFloat, style: RoundedCornerStyle = .continuous) {
        addRoundedRect(in: rect, cornerSize: CGSize(width: cornerRadius, height: cornerRadius), style: style)
    }
    public init(roundedRect rect: CGRect, cornerSize: CGSize, style: RoundedCornerStyle = .continuous) {
        addRoundedRect(in: rect, cornerSize: cornerSize, style: style)
    }
    public init(_ callback: (inout Path) -> ()) { var p = Path(); callback(&p); self = p }

    public var isEmpty: Bool { elements.isEmpty }
    public var boundingRect: CGRect {
        guard minX.isFinite else { return .zero }
        return CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
    }
    public var cgPath: Path { self }
    public func contains(_ p: CGPoint, eoFill: Bool = false) -> Bool { boundingRect.contains(p) }

    mutating func extend(_ p: CGPoint) {
        minX = Swift.min(minX, p.x); minY = Swift.min(minY, p.y); maxX = Swift.max(maxX, p.x); maxY = Swift.max(maxY, p.y)
    }

    public mutating func move(to p: CGPoint) { elements.append(.move(p)); start = p; currentPoint = p; extend(p) }
    public mutating func addLine(to p: CGPoint) {
        if currentPoint == nil { move(to: p); return }
        elements.append(.line(p)); currentPoint = p; extend(p)
    }
    public mutating func addLines(_ points: [CGPoint]) {
        guard let first = points.first else { return }
        move(to: first)
        for p in points.dropFirst() { addLine(to: p) }
    }
    public mutating func addQuadCurve(to p: CGPoint, control c: CGPoint) {
        if currentPoint == nil { move(to: c) }
        elements.append(.quad(c, p)); currentPoint = p; extend(p); extend(c)
    }
    public mutating func addCurve(to p: CGPoint, control1 c1: CGPoint, control2 c2: CGPoint) {
        if currentPoint == nil { move(to: c1) }
        elements.append(.curve(c1, c2, p)); currentPoint = p; extend(p); extend(c1); extend(c2)
    }
    public mutating func closeSubpath() {
        guard currentPoint != nil else { return }
        elements.append(.close); currentPoint = start
    }
    public mutating func addRect(_ r: CGRect) {
        move(to: CGPoint(x: r.minX, y: r.minY))
        addLine(to: CGPoint(x: r.maxX, y: r.minY))
        addLine(to: CGPoint(x: r.maxX, y: r.maxY))
        addLine(to: CGPoint(x: r.minX, y: r.maxY))
        closeSubpath()
    }
    public mutating func addRects(_ rects: [CGRect]) { for r in rects { addRect(r) } }
    public mutating func addEllipse(in r: CGRect) {
        let k: CGFloat = 0.5522847498
        let cx = r.midX, cy = r.midY, rx = r.width / 2, ry = r.height / 2
        move(to: CGPoint(x: cx + rx, y: cy))
        addCurve(to: CGPoint(x: cx, y: cy + ry), control1: CGPoint(x: cx + rx, y: cy + k * ry), control2: CGPoint(x: cx + k * rx, y: cy + ry))
        addCurve(to: CGPoint(x: cx - rx, y: cy), control1: CGPoint(x: cx - k * rx, y: cy + ry), control2: CGPoint(x: cx - rx, y: cy + k * ry))
        addCurve(to: CGPoint(x: cx, y: cy - ry), control1: CGPoint(x: cx - rx, y: cy - k * ry), control2: CGPoint(x: cx - k * rx, y: cy - ry))
        addCurve(to: CGPoint(x: cx + rx, y: cy), control1: CGPoint(x: cx + k * rx, y: cy - ry), control2: CGPoint(x: cx + rx, y: cy - k * ry))
        closeSubpath()
    }
    public mutating func addRoundedRect(in r: CGRect, cornerSize: CGSize, style: RoundedCornerStyle = .continuous) {
        let rx = Swift.min(cornerSize.width, r.width / 2), ry = Swift.min(cornerSize.height, r.height / 2)
        if rx <= 0 || ry <= 0 { addRect(r); return }
        move(to: CGPoint(x: r.minX + rx, y: r.minY))
        addLine(to: CGPoint(x: r.maxX - rx, y: r.minY))
        addQuadCurve(to: CGPoint(x: r.maxX, y: r.minY + ry), control: CGPoint(x: r.maxX, y: r.minY))
        addLine(to: CGPoint(x: r.maxX, y: r.maxY - ry))
        addQuadCurve(to: CGPoint(x: r.maxX - rx, y: r.maxY), control: CGPoint(x: r.maxX, y: r.maxY))
        addLine(to: CGPoint(x: r.minX + rx, y: r.maxY))
        addQuadCurve(to: CGPoint(x: r.minX, y: r.maxY - ry), control: CGPoint(x: r.minX, y: r.maxY))
        addLine(to: CGPoint(x: r.minX, y: r.minY + ry))
        addQuadCurve(to: CGPoint(x: r.minX + rx, y: r.minY), control: CGPoint(x: r.minX, y: r.minY))
        closeSubpath()
    }
    /// SwiftUI semantics: angles grow clockwise on screen (y down); `clockwise: false` draws clockwise on screen.
    public mutating func addArc(center: CGPoint, radius: CGFloat, startAngle: Angle, endAngle: Angle, clockwise: Bool) {
        let a0 = startAngle.radians, a1 = endAngle.radians
        let p0 = CGPoint(x: center.x + radius * CGFloat(cos(a0)), y: center.y + radius * CGFloat(sin(a0)))
        if currentPoint == nil { move(to: p0) } else { addLine(to: p0) }
        var delta = clockwise ? a0 - a1 : a1 - a0
        let full = abs(delta) >= 2 * .pi - 1e-9
        delta = delta.truncatingRemainder(dividingBy: 2 * .pi)
        if delta < 0 { delta += 2 * .pi }
        if full { delta = 2 * .pi }
        guard delta > 1e-9 else { return }
        let sweep = !clockwise
        extend(CGPoint(x: center.x - radius, y: center.y - radius)); extend(CGPoint(x: center.x + radius, y: center.y + radius))
        if delta >= 2 * .pi - 1e-9 {
            // a full circle needs two SVG arcs
            let mid = a0 + (sweep ? .pi : -.pi)
            let pm = CGPoint(x: center.x + radius * CGFloat(cos(mid)), y: center.y + radius * CGFloat(sin(mid)))
            elements.append(.arc(rx: radius, ry: radius, large: false, sweep: sweep, to: pm))
            elements.append(.arc(rx: radius, ry: radius, large: false, sweep: sweep, to: p0))
            currentPoint = p0
            return
        }
        let p1 = CGPoint(x: center.x + radius * CGFloat(cos(a1)), y: center.y + radius * CGFloat(sin(a1)))
        elements.append(.arc(rx: radius, ry: radius, large: delta > .pi, sweep: sweep, to: p1))
        currentPoint = p1
    }
    public mutating func addRelativeArc(center: CGPoint, radius: CGFloat, startAngle: Angle, delta: Angle) {
        addArc(center: center, radius: radius, startAngle: startAngle, endAngle: Angle(radians: startAngle.radians + delta.radians), clockwise: delta.radians < 0)
    }
    /// Rounded corner between two tangent lines (approximated with a quadratic curve).
    public mutating func addArc(tangent1End t1: CGPoint, tangent2End t2: CGPoint, radius: CGFloat) {
        guard let p0 = currentPoint else { move(to: t1); return }
        func toward(_ a: CGPoint, _ b: CGPoint, _ d: CGFloat) -> CGPoint {
            let dx = b.x - a.x, dy = b.y - a.y, len = Swift.max((dx * dx + dy * dy).squareRoot(), 0.0001)
            return CGPoint(x: a.x + dx / len * Swift.min(d, len), y: a.y + dy / len * Swift.min(d, len))
        }
        addLine(to: toward(t1, p0, radius))
        addQuadCurve(to: toward(t1, t2, radius), control: t1)
    }
    public mutating func addPath(_ other: Path) {
        elements += other.elements
        if other.minX.isFinite { extend(CGPoint(x: other.minX, y: other.minY)); extend(CGPoint(x: other.maxX, y: other.maxY)) }
        currentPoint = other.currentPoint ?? currentPoint
        start = other.start ?? start
    }
    public func offsetBy(dx: CGFloat, dy: CGFloat) -> Path {
        func o(_ p: CGPoint) -> CGPoint { CGPoint(x: p.x + dx, y: p.y + dy) }
        var out = Path()
        for e in elements {
            switch e {
            case .move(let p): out.move(to: o(p))
            case .line(let p): out.addLine(to: o(p))
            case .quad(let c, let p): out.addQuadCurve(to: o(p), control: o(c))
            case .curve(let c1, let c2, let p): out.addCurve(to: o(p), control1: o(c1), control2: o(c2))
            case .arc(let rx, let ry, let l, let s, let p):
                out.elements.append(.arc(rx: rx, ry: ry, large: l, sweep: s, to: o(p))); out.currentPoint = o(p); out.extend(o(p))
            case .close: out.closeSubpath()
            }
        }
        return out
    }
    public func trimmedPath(from: CGFloat, to: CGFloat) -> Path { self }

    // Shape: a Path draws at its own coordinates (no scaling)
    public func path(in rect: CGRect) -> Path { self }
    public var _shapeName: String { "path" }
    public var _shapeArgs: [String: _J] {
        let b = boundingRect
        let w = Swift.max(b.maxX, 1), h = Swift.max(b.maxY, 1)
        return ["d": .s(_svg), "vb": .s("0 0 \(_fmt(w)) \(_fmt(h))"), "ar": .s("abs"), "w": .num(w), "h": .num(h)]
    }

    var _svg: String {
        var s = ""
        func pt(_ p: CGPoint) -> String { _fmt(p.x) + " " + _fmt(p.y) }
        for e in elements {
            switch e {
            case .move(let p): s += "M" + pt(p)
            case .line(let p): s += "L" + pt(p)
            case .quad(let c, let p): s += "Q" + pt(c) + " " + pt(p)
            case .curve(let c1, let c2, let p): s += "C" + pt(c1) + " " + pt(c2) + " " + pt(p)
            case .arc(let rx, let ry, let large, let sweep, let p):
                s += "A" + _fmt(rx) + " " + _fmt(ry) + " 0 " + (large ? "1" : "0") + " " + (sweep ? "1" : "0") + " " + pt(p)
            case .close: s += "Z"
            }
        }
        return s
    }
}

func _fmt(_ v: CGFloat) -> String {
    guard v.isFinite else { return "0" }
    let r = (Double(v) * 100).rounded() / 100
    return r == r.rounded() ? String(Int(r)) : String(r)
}

// MARK: - Content transitions and symbol effects (accepted; the simulator doesn't animate them)

public struct ContentTransition: Sendable {
    let name: String
    public static let identity = ContentTransition(name: "identity")
    public static let opacity = ContentTransition(name: "opacity")
    public static let interpolate = ContentTransition(name: "interpolate")
    public static let symbolEffect = ContentTransition(name: "symbolEffect")
    public static func numericText(countsDown: Bool = false) -> ContentTransition { ContentTransition(name: "numericText") }
    public static func numericText(value: Double) -> ContentTransition { ContentTransition(name: "numericText") }
    public static func symbolEffect(_ effect: SymbolEffect, options: SymbolEffectOptions = .default) -> ContentTransition { ContentTransition(name: "symbolEffect") }
}

public struct SymbolEffect: Sendable {
    let name: String
    public static let bounce = SymbolEffect(name: "bounce")
    public static let pulse = SymbolEffect(name: "pulse")
    public static let variableColor = SymbolEffect(name: "variableColor")
    public static let scale = SymbolEffect(name: "scale")
    public static let appear = SymbolEffect(name: "appear")
    public static let disappear = SymbolEffect(name: "disappear")
    public static let replace = SymbolEffect(name: "replace")
    public static let wiggle = SymbolEffect(name: "wiggle")
    public static let rotate = SymbolEffect(name: "rotate")
    public static let breathe = SymbolEffect(name: "breathe")
    public static let automatic = SymbolEffect(name: "automatic")
    public var up: SymbolEffect { self }
    public var down: SymbolEffect { self }
    public var byLayer: SymbolEffect { self }
    public var wholeSymbol: SymbolEffect { self }
    public var iterative: SymbolEffect { self }
    public var cumulative: SymbolEffect { self }
    public var reversing: SymbolEffect { self }
    public var nonReversing: SymbolEffect { self }
    public var clockwise: SymbolEffect { self }
    public var counterClockwise: SymbolEffect { self }
    public var downUp: SymbolEffect { self }
    public var offUp: SymbolEffect { self }
    public var upUp: SymbolEffect { self }
}

public struct SymbolEffectOptions: Sendable {
    public static let `default` = SymbolEffectOptions()
    public static let repeating = SymbolEffectOptions()
    public static let nonRepeating = SymbolEffectOptions()
    public static func `repeat`(_ count: Int) -> SymbolEffectOptions { SymbolEffectOptions() }
    public static func speed(_ s: Double) -> SymbolEffectOptions { SymbolEffectOptions() }
    public var repeating: SymbolEffectOptions { self }
    public var nonRepeating: SymbolEffectOptions { self }
    public func `repeat`(_ count: Int) -> SymbolEffectOptions { self }
    public func speed(_ s: Double) -> SymbolEffectOptions { self }
}

// MARK: - AsyncImage

extension Image {
    init(_file path: String) { source = .file(path) }
}

public enum AsyncImagePhase {
    case empty
    case success(Image)
    case failure(Error)
    public var image: Image? { if case .success(let i) = self { return i }; return nil }
    public var error: Error? { if case .failure(let e) = self { return e }; return nil }
}

/// Downloads once per URL into the app's data folder; the simulator shows the file.
@MainActor
final class _ImageLoader {
    static let shared = _ImageLoader()
    enum State { case loading, done(String), failed(Error) }
    var states: [URL: State] = [:]

    func phase(_ url: URL?) -> AsyncImagePhase {
        guard let url else { return .empty }
        if url.isFileURL { return .success(Image(_file: url.path)) }
        switch states[url] {
        case .done(let path)?: return .success(Image(_file: path))
        case .failed(let e)?: return .failure(e)
        case .loading?: return .empty
        case nil:
            states[url] = .loading
            start(url)
            return .empty
        }
    }

    func cacheFile(for url: URL) -> URL {
        let base = ProcessInfo.processInfo.environment["SWIFTCODE_APPDATA"].map { URL(fileURLWithPath: $0) }
            ?? FileManager.default.temporaryDirectory
        var h: UInt64 = 1469598103934665603
        for b in url.absoluteString.utf8 { h = (h ^ UInt64(b)) &* 1099511628211 }
        let ext = ["png", "jpg", "jpeg", "gif", "webp", "svg"].contains(url.pathExtension.lowercased()) ? url.pathExtension.lowercased() : "img"
        return base.appendingPathComponent("AsyncImage").appendingPathComponent(String(h, radix: 16) + "." + ext)
    }

    func start(_ url: URL) {
        let file = cacheFile(for: url)
        if FileManager.default.fileExists(atPath: file.path) { states[url] = .done(file.path); return }
        #if canImport(FoundationNetworking) || !os(Windows)
        let task = URLSession.shared.dataTask(with: url) { data, response, error in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 200
            var result: State
            if let data, error == nil, (200..<300).contains(status), !data.isEmpty {
                do {
                    try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
                    try data.write(to: file)
                    result = .done(file.path)
                } catch { result = .failed(error) }
            } else {
                result = .failed(error ?? URLError(.badServerResponse))
            }
            let final = result
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    _ImageLoader.shared.states[url] = final
                    _Runtime.setNeedsRender()
                }
            }
        }
        task.resume()
        #else
        states[url] = .failed(URLError(.unsupportedURL))
        #endif
    }
}

public struct AsyncImage<Content: View>: View, _PrimitiveView {
    let url: URL?
    let content: (AsyncImagePhase) -> Content

    public init(url: URL?, scale: CGFloat = 1, @ViewBuilder content: @escaping (AsyncImagePhase) -> Content) {
        self.url = url; self.content = content
    }
    public init(url: URL?, scale: CGFloat = 1, transaction: Transaction, @ViewBuilder content: @escaping (AsyncImagePhase) -> Content) {
        self.url = url; self.content = content
    }

    public func _render(_ ctx: _Ctx) -> [_Node] {
        _resolve(content(_ImageLoader.shared.phase(url)), ctx)
    }
}

extension AsyncImage where Content == AnyView {
    /// `AsyncImage(url:)` — the image at its size, a gray box while loading.
    public init(url: URL?, scale: CGFloat = 1) {
        self.url = url
        self.content = { phase in
            if let image = phase.image { return AnyView(image) }
            return AnyView(Color.gray.opacity(0.25))
        }
    }
    /// `AsyncImage(url:) { image in image.resizable() } placeholder: { ProgressView() }`
    public init<I: View, P: View>(url: URL?, scale: CGFloat = 1, @ViewBuilder content: @escaping (Image) -> I, @ViewBuilder placeholder: @escaping () -> P) {
        self.url = url
        self.content = { phase in
            if let image = phase.image { return AnyView(content(image)) }
            return AnyView(placeholder())
        }
    }
}


// MARK: - ViewThatFits

/// Shows the first child (the simulator lays text out to fit, so the first choice usually works).
public struct ViewThatFits<Content: View>: View, _PrimitiveView {
    let content: Content
    public init(in axes: Axis.Set = [.horizontal, .vertical], @ViewBuilder content: () -> Content) { self.content = content() }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        let nodes = _resolve(content, ctx)
        if nodes.count == 1, nodes[0].t == "group", let first = nodes[0].c.first { return [first] }
        return Array(nodes.prefix(1))
    }
}

// MARK: - TimelineView

public protocol TimelineSchedule {}
public struct PeriodicTimelineSchedule: TimelineSchedule, Sendable {
    public init(from startDate: Date, by interval: TimeInterval) {}
}
public struct EveryMinuteTimelineSchedule: TimelineSchedule, Sendable { public init() {} }
public struct AnimationTimelineSchedule: TimelineSchedule, Sendable {
    public init(minimumInterval: Double? = nil, paused: Bool = false) {}
}
public struct ExplicitTimelineSchedule<Entries: Sequence>: TimelineSchedule where Entries.Element == Date {
    public init(_ dates: Entries) {}
}
extension TimelineSchedule where Self == PeriodicTimelineSchedule {
    public static func periodic(from startDate: Date, by interval: TimeInterval) -> PeriodicTimelineSchedule { PeriodicTimelineSchedule(from: startDate, by: interval) }
}
extension TimelineSchedule where Self == EveryMinuteTimelineSchedule {
    public static var everyMinute: EveryMinuteTimelineSchedule { EveryMinuteTimelineSchedule() }
}
extension TimelineSchedule where Self == AnimationTimelineSchedule {
    public static var animation: AnimationTimelineSchedule { AnimationTimelineSchedule() }
    public static func animation(minimumInterval: Double? = nil, paused: Bool = false) -> AnimationTimelineSchedule { AnimationTimelineSchedule(minimumInterval: minimumInterval, paused: paused) }
}

public struct TimelineViewDefaultContext {
    public enum Cadence: Comparable, Sendable { case live, seconds, minutes }
    public let date: Date
    public let cadence: Cadence
}

/// Re-evaluated on every refresh of the app (4× a second), so clocks and countdowns tick.
public struct TimelineView<Schedule: TimelineSchedule, Content: View>: View, _PrimitiveView {
    public typealias Context = TimelineViewDefaultContext
    let content: (Context) -> Content
    public init(_ schedule: Schedule, @ViewBuilder content: @escaping (Context) -> Content) { self.content = content }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        _resolve(content(Context(date: Date(), cadence: .seconds)), ctx)
    }
}

// MARK: - Selectable List rows (List(data, selection:))

/// A row of a `List(selection:)`: tapping it sets the selection (and opens the detail of a NavigationSplitView).
public struct _SelectableRow<Content: View>: View, _PrimitiveView {
    let value: AnyHashable
    let content: Content
    public func _render(_ ctx: _Ctx) -> [_Node] {
        let nodes = _resolve(content, ctx.child("row"))
        guard let select = ctx.listSelect, select(value, false) else { return nodes }
        let v = value
        ctx.action(ctx.path) { _ = select(v, true) }
        let inSplit = ctx.splitShowDetail != nil
        return [_Node(inSplit ? "navlink" : "button", ctx.path, inSplit ? [:] : ["style": .s("plain")], nodes)]
    }
}

extension List {
    public init<Data: RandomAccessCollection, RowContent: View, S: Hashable>(_ data: Data, selection: Binding<S?>?, @ViewBuilder rowContent: @escaping (Data.Element) -> RowContent)
    where Content == ForEach<Data, Data.Element.ID, _SelectableRow<RowContent>>, Data.Element: Identifiable {
        self.init(selection: selection) { ForEach(data) { el in _SelectableRow(value: AnyHashable(el.id), content: rowContent(el)) } }
    }
    public init<Data: RandomAccessCollection, ID: Hashable, RowContent: View, S: Hashable>(_ data: Data, id: KeyPath<Data.Element, ID>, selection: Binding<S?>?, @ViewBuilder rowContent: @escaping (Data.Element) -> RowContent)
    where Content == ForEach<Data, ID, _SelectableRow<RowContent>> {
        self.init(selection: selection) { ForEach(data, id: id) { el in _SelectableRow(value: AnyHashable(el[keyPath: id]), content: rowContent(el)) } }
    }
    public init<Data: RandomAccessCollection, RowContent: View, S: Hashable>(_ data: Data, selection: Binding<Set<S>>?, @ViewBuilder rowContent: @escaping (Data.Element) -> RowContent)
    where Content == ForEach<Data, Data.Element.ID, RowContent>, Data.Element: Identifiable {
        self.init { ForEach(data, content: rowContent) }
    }
}
