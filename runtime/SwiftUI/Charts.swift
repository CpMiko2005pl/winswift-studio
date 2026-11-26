// Swift Charts for Windows (`import Charts` resolves here): Chart, BarMark, LineMark, PointMark, AreaMark, RuleMark,
// RectangleMark, SectorMark, foregroundStyle(by:), axis/legend/scale modifiers. The marks are sent as JSON and the
// simulator draws them as SVG.

// MARK: - Plottable values

public protocol Plottable {
    var _plot: _J { get }
}
extension String: Plottable { public var _plot: _J { .s(self) } }
extension Substring: Plottable { public var _plot: _J { .s(String(self)) } }
extension Int: Plottable { public var _plot: _J { .int(self) } }
extension Int32: Plottable { public var _plot: _J { .int(self) } }
extension Int64: Plottable { public var _plot: _J { .int(self) } }
extension UInt: Plottable { public var _plot: _J { .int(self) } }
extension Double: Plottable { public var _plot: _J { .n(self) } }
extension Float: Plottable { public var _plot: _J { .num(self) } }
extension CGFloat: Plottable { public var _plot: _J { .num(self) } }
extension Decimal: Plottable { public var _plot: _J { .n(NSDecimalNumber(decimal: self).doubleValue) } }
extension Date: Plottable { public var _plot: _J { .o(["date": .n(timeIntervalSince1970 * 1000)]) } }
extension Bool: Plottable { public var _plot: _J { .s(self ? "true" : "false") } }

/// `.value("Month", item.month)`
public struct PlottableValue<Value: Plottable> {
    let label: String
    let value: Value
    public static func value(_ label: String, _ value: Value) -> PlottableValue<Value> { PlottableValue(label: label, value: value) }
    public static func value(_ label: String, _ value: Value, unit: Calendar.Component) -> PlottableValue<Value> { PlottableValue(label: label, value: value) }
    var _j: _J { value._plot }
}

public struct MarkDimension: Sendable {
    let v: Double?
    let ratio: Bool
    public static let automatic = MarkDimension(v: nil, ratio: false)
    public static func fixed(_ v: CGFloat) -> MarkDimension { MarkDimension(v: Double(v), ratio: false) }
    public static func ratio(_ r: CGFloat) -> MarkDimension { MarkDimension(v: Double(r), ratio: true) }
    public static func inset(_ v: CGFloat) -> MarkDimension { MarkDimension(v: nil, ratio: false) }
}
extension MarkDimension: ExpressibleByFloatLiteral, ExpressibleByIntegerLiteral {
    public init(floatLiteral value: Double) { v = value; ratio = false }
    public init(integerLiteral value: Int) { v = Double(value); ratio = false }
}

public struct MarkStackingMethod: Sendable {
    let name: String
    public static let standard = MarkStackingMethod(name: "standard")
    public static let normalized = MarkStackingMethod(name: "normalized")
    public static let center = MarkStackingMethod(name: "center")
    public static let unstacked = MarkStackingMethod(name: "unstacked")
}

public struct InterpolationMethod: Sendable {
    let name: String
    public static let linear = InterpolationMethod(name: "linear")
    public static let catmullRom = InterpolationMethod(name: "smooth")
    public static let cardinal = InterpolationMethod(name: "smooth")
    public static let monotone = InterpolationMethod(name: "smooth")
    public static let stepStart = InterpolationMethod(name: "step")
    public static let stepCenter = InterpolationMethod(name: "step")
    public static let stepEnd = InterpolationMethod(name: "step")
    public static func cardinal(tension: CGFloat) -> InterpolationMethod { InterpolationMethod(name: "smooth") }
    public static func catmullRom(alpha: CGFloat) -> InterpolationMethod { InterpolationMethod(name: "smooth") }
}

public struct BasicChartSymbolShape: Sendable {
    let name: String
    public static let circle = BasicChartSymbolShape(name: "circle")
    public static let square = BasicChartSymbolShape(name: "square")
    public static let triangle = BasicChartSymbolShape(name: "triangle")
    public static let diamond = BasicChartSymbolShape(name: "diamond")
    public static let pentagon = BasicChartSymbolShape(name: "circle")
    public static let plus = BasicChartSymbolShape(name: "plus")
    public static let cross = BasicChartSymbolShape(name: "plus")
    public static let asterisk = BasicChartSymbolShape(name: "plus")
}

// MARK: - Chart content

/// One drawn mark (bar, line point, sector…) as the simulator receives it.
public struct _Mark {
    var p: [String: _J]
}

@MainActor
public protocol ChartContent {
    func _chartMarks() -> [_Mark]
}

public typealias _MarkContent = ChartContent

public struct _AnyChartContent: ChartContent {
    let marks: [_Mark]
    public func _chartMarks() -> [_Mark] { marks }
}

public struct _ChartGroup: ChartContent {
    let parts: [any ChartContent]
    public func _chartMarks() -> [_Mark] { parts.flatMap { $0._chartMarks() } }
}

@resultBuilder
@MainActor
public enum ChartContentBuilder {
    public static func buildExpression<C: ChartContent>(_ c: C) -> any ChartContent { c }
    public static func buildBlock(_ parts: (any ChartContent)...) -> _ChartGroup { _ChartGroup(parts: parts) }
    public static func buildOptional(_ c: (any ChartContent)?) -> _ChartGroup { _ChartGroup(parts: c.map { [$0] } ?? []) }
    public static func buildEither(first c: any ChartContent) -> _ChartGroup { _ChartGroup(parts: [c]) }
    public static func buildEither(second c: any ChartContent) -> _ChartGroup { _ChartGroup(parts: [c]) }
    public static func buildArray(_ cs: [any ChartContent]) -> _ChartGroup { _ChartGroup(parts: cs) }
    public static func buildLimitedAvailability(_ c: any ChartContent) -> _ChartGroup { _ChartGroup(parts: [c]) }
}

extension ForEach: ChartContent where Content: ChartContent {
    public func _chartMarks() -> [_Mark] { data.flatMap { content($0)._chartMarks() } }
}

extension ForEach where Content: ChartContent {
    public init(_ data: Data, id: KeyPath<Data.Element, ID>, @ChartContentBuilder content: @escaping (Data.Element) -> Content) {
        self.init(_data: data, idFor: { $0[keyPath: id] }, content: content)
    }
}
extension ForEach where Content: ChartContent, Data.Element: Identifiable, ID == Data.Element.ID {
    public init(_ data: Data, @ChartContentBuilder content: @escaping (Data.Element) -> Content) {
        self.init(_data: data, idFor: { $0.id }, content: content)
    }
}
extension ForEach where Content: ChartContent, Data == Range<Int>, ID == Int {
    public init(_ data: Range<Int>, @ChartContentBuilder content: @escaping (Int) -> Content) {
        self.init(_data: data, idFor: { $0 }, content: content)
    }
}

/// A mark with its modifiers applied (`.foregroundStyle(by:)`, `.annotation`, …).
public struct _ModifiedMark<Base: ChartContent>: _MarkContent {
    let base: Base
    let change: (inout [String: _J]) -> Void
    public func _chartMarks() -> [_Mark] {
        base._chartMarks().map { m in var m = m; change(&m.p); return m }
    }
}

extension ChartContent {
    func _set(_ change: @escaping (inout [String: _J]) -> Void) -> _ModifiedMark<Self> { _ModifiedMark(base: self, change: change) }
    public func foregroundStyle<S: ShapeStyle>(_ style: S) -> _ModifiedMark<Self> { _set { $0["color"] = style._css } }
    public func foregroundStyle<V: Plottable>(by value: PlottableValue<V>) -> _ModifiedMark<Self> {
        _set { $0["series"] = .s(_plainLabel(value._j)); $0["seriesLabel"] = .s(value.label) }
    }
    public func position<V: Plottable>(by value: PlottableValue<V>, axis: Axis? = nil, span: MarkDimension = .automatic) -> _ModifiedMark<Self> {
        _set { $0["group"] = .s(_plainLabel(value._j)) }
    }
    public func symbol<V: Plottable>(by value: PlottableValue<V>) -> _ModifiedMark<Self> {
        _set { if $0["series"] == nil { $0["series"] = .s(_plainLabel(value._j)) } ; $0["symbol"] = .s("circle") }
    }
    public func symbol(_ shape: BasicChartSymbolShape) -> _ModifiedMark<Self> { _set { $0["symbol"] = .s(shape.name) } }
    public func symbol<S: View>(@ViewBuilder _ symbol: () -> S) -> _ModifiedMark<Self> { _set { $0["symbol"] = .s("circle") } }
    public func symbolSize(_ size: CGFloat) -> _ModifiedMark<Self> { _set { $0["symbolSize"] = .num(size) } }
    public func symbolSize(_ size: CGSize) -> _ModifiedMark<Self> { _set { $0["symbolSize"] = .num(size.width * size.height) } }
    public func interpolationMethod(_ m: InterpolationMethod) -> _ModifiedMark<Self> { _set { $0["interp"] = .s(m.name) } }
    public func lineStyle(_ s: StrokeStyle) -> _ModifiedMark<Self> {
        _set { $0["lw"] = .num(s.lineWidth); if !s.dash.isEmpty { $0["dash"] = .a(s.dash.map { .num($0) }) } }
    }
    public func opacity(_ o: Double) -> _ModifiedMark<Self> { _set { $0["opacity"] = .n(o) } }
    public func cornerRadius(_ r: CGFloat, style: RoundedCornerStyle = .continuous) -> _ModifiedMark<Self> { _set { $0["r"] = .num(r) } }
    public func alignsMarkStylesWithPlotArea(_ v: Bool = true) -> _ModifiedMark<Self> { _set { _ in } }
    public func accessibilityLabel(_ s: String) -> _ModifiedMark<Self> { _set { _ in } }
    public func accessibilityValue(_ s: String) -> _ModifiedMark<Self> { _set { _ in } }
    public func accessibilityHidden(_ h: Bool) -> _ModifiedMark<Self> { _set { _ in } }
    /// `.annotation(position: .top) { Text("…") }` — the annotation's text is drawn next to the mark.
    public func annotation<C: View>(position: AnnotationPosition = .automatic, alignment: Alignment = .center, spacing: CGFloat? = nil, @ViewBuilder content: () -> C) -> _ModifiedMark<Self> {
        let text = _plainText(of: content())
        return _set { $0["note"] = .s(text); $0["notePos"] = .s(position.name) }
    }
}

public struct AnnotationPosition: Sendable {
    let name: String
    public static let automatic = AnnotationPosition(name: "top"), top = AnnotationPosition(name: "top"), bottom = AnnotationPosition(name: "bottom")
    public static let leading = AnnotationPosition(name: "leading"), trailing = AnnotationPosition(name: "trailing"), overlay = AnnotationPosition(name: "overlay")
    public static let topLeading = AnnotationPosition(name: "top"), topTrailing = AnnotationPosition(name: "top"), bottomLeading = AnnotationPosition(name: "bottom"), bottomTrailing = AnnotationPosition(name: "bottom")
}

func _plainLabel(_ j: _J) -> String {
    switch j {
    case .s(let s): return s
    case .n(let d): return d == d.rounded() && abs(d) < 1e15 ? String(Int64(d)) : String(d)
    case .o(let o): if case .n(let ms)? = o["date"] { return Date(timeIntervalSince1970: ms / 1000).formatted(date: .abbreviated, time: .omitted) }; return ""
    default: return ""
    }
}

@MainActor
func _plainText<V: View>(of view: V) -> String {
    let ctx = _Ctx(path: "annotation", graph: _Graph(), env: EnvironmentValues())
    return _resolve(view, ctx).map(\.plainText).joined(separator: " ")
}

func _mark(_ kind: String, _ fields: [String: _J]) -> [_Mark] {
    var p = fields
    p["kind"] = .s(kind)
    return [_Mark(p: p)]
}

// MARK: - Marks

public struct BarMark: _MarkContent {
    let p: [String: _J]
    public init<X: Plottable, Y: Plottable>(x: PlottableValue<X>, y: PlottableValue<Y>, width: MarkDimension = .automatic, height: MarkDimension = .automatic, stacking: MarkStackingMethod = .standard) {
        p = ["x": x._j, "y": y._j, "xl": .s(x.label), "yl": .s(y.label), "stack": .s(stacking.name), "bw": width.v.map { .n($0) } ?? .null]
    }
    public init<X: Plottable, Y: Plottable>(x: PlottableValue<X>, yStart: PlottableValue<Y>, yEnd: PlottableValue<Y>, width: MarkDimension = .automatic) {
        p = ["x": x._j, "y": yEnd._j, "y0": yStart._j, "xl": .s(x.label), "yl": .s(yEnd.label), "stack": .s("unstacked")]
    }
    public init<X: Plottable, Y: Plottable>(xStart: PlottableValue<X>, xEnd: PlottableValue<X>, y: PlottableValue<Y>, height: MarkDimension = .automatic) {
        p = ["x": xEnd._j, "x0": xStart._j, "y": y._j, "xl": .s(xEnd.label), "yl": .s(y.label), "stack": .s("unstacked")]
    }
    /// Single bar (`BarMark(x: .value("Total", n))`)
    public init<X: Plottable>(x: PlottableValue<X>, stacking: MarkStackingMethod = .standard) {
        p = ["x": x._j, "y": .s(""), "xl": .s(x.label), "yl": .s(""), "stack": .s(stacking.name)]
    }
    public init<Y: Plottable>(y: PlottableValue<Y>, stacking: MarkStackingMethod = .standard) {
        p = ["x": .s(""), "y": y._j, "xl": .s(""), "yl": .s(y.label), "stack": .s(stacking.name)]
    }
    public func _chartMarks() -> [_Mark] { _mark("bar", p) }
}

public struct LineMark: _MarkContent {
    let p: [String: _J]
    public init<X: Plottable, Y: Plottable>(x: PlottableValue<X>, y: PlottableValue<Y>) {
        p = ["x": x._j, "y": y._j, "xl": .s(x.label), "yl": .s(y.label)]
    }
    public init<X: Plottable, Y: Plottable, S: Plottable>(x: PlottableValue<X>, y: PlottableValue<Y>, series: PlottableValue<S>) {
        p = ["x": x._j, "y": y._j, "xl": .s(x.label), "yl": .s(y.label), "line": .s(_plainLabel(series._j))]
    }
    public func _chartMarks() -> [_Mark] { _mark("line", p) }
}

public struct PointMark: _MarkContent {
    let p: [String: _J]
    public init<X: Plottable, Y: Plottable>(x: PlottableValue<X>, y: PlottableValue<Y>) {
        p = ["x": x._j, "y": y._j, "xl": .s(x.label), "yl": .s(y.label)]
    }
    public func _chartMarks() -> [_Mark] { _mark("point", p) }
}

public struct AreaMark: _MarkContent {
    let p: [String: _J]
    public init<X: Plottable, Y: Plottable>(x: PlottableValue<X>, y: PlottableValue<Y>, stacking: MarkStackingMethod = .standard) {
        p = ["x": x._j, "y": y._j, "xl": .s(x.label), "yl": .s(y.label)]
    }
    public init<X: Plottable, Y: Plottable>(x: PlottableValue<X>, yStart: PlottableValue<Y>, yEnd: PlottableValue<Y>) {
        p = ["x": x._j, "y": yEnd._j, "y0": yStart._j, "xl": .s(x.label), "yl": .s(yEnd.label)]
    }
    public func _chartMarks() -> [_Mark] { _mark("area", p) }
}

public struct RuleMark: _MarkContent {
    let p: [String: _J]
    public init<Y: Plottable>(y: PlottableValue<Y>) { p = ["y": y._j, "yl": .s(y.label), "dir": .s("h")] }
    public init<X: Plottable>(x: PlottableValue<X>) { p = ["x": x._j, "xl": .s(x.label), "dir": .s("v")] }
    public init<X: Plottable, Y: Plottable>(x: PlottableValue<X>, yStart: PlottableValue<Y>, yEnd: PlottableValue<Y>) {
        p = ["x": x._j, "y0": yStart._j, "y": yEnd._j, "dir": .s("v")]
    }
    public init<X: Plottable, Y: Plottable>(xStart: PlottableValue<X>, xEnd: PlottableValue<X>, y: PlottableValue<Y>) {
        p = ["x0": xStart._j, "x": xEnd._j, "y": y._j, "dir": .s("h")]
    }
    public func _chartMarks() -> [_Mark] { _mark("rule", p) }
}

public struct RectangleMark: _MarkContent {
    let p: [String: _J]
    public init<X: Plottable, Y: Plottable>(x: PlottableValue<X>, y: PlottableValue<Y>, width: MarkDimension = .automatic, height: MarkDimension = .automatic) {
        p = ["x": x._j, "y": y._j, "xl": .s(x.label), "yl": .s(y.label)]
    }
    public func _chartMarks() -> [_Mark] { _mark("rect", p) }
}

/// Pie and donut charts (iOS 17).
public struct SectorMark: _MarkContent {
    let p: [String: _J]
    public init<V: Plottable>(angle: PlottableValue<V>, innerRadius: MarkDimension = .automatic, outerRadius: MarkDimension = .automatic, angularInset: CGFloat = 0) {
        var p: [String: _J] = ["angle": angle._j, "al": .s(angle.label), "inset": .num(angularInset)]
        if let v = innerRadius.v { p["inner"] = .n(v); p["innerRatio"] = .b(innerRadius.ratio) }
        self.p = p
    }
    public func _chartMarks() -> [_Mark] { _mark("sector", p) }
}

// MARK: - Chart

public struct Chart<Content: ChartContent>: View, _PrimitiveView {
    let marks: [_Mark]
    public init(@ChartContentBuilder content: () -> Content) where Content == _ChartGroup { marks = content()._chartMarks() }
    public init<Data: RandomAccessCollection, C: ChartContent>(_ data: Data, @ChartContentBuilder content: @escaping (Data.Element) -> C)
    where Content == _AnyChartContent, Data.Element: Identifiable {
        marks = data.flatMap { content($0)._chartMarks() }
    }
    public init<Data: RandomAccessCollection, ID: Hashable, C: ChartContent>(_ data: Data, id: KeyPath<Data.Element, ID>, @ChartContentBuilder content: @escaping (Data.Element) -> C)
    where Content == _AnyChartContent {
        marks = data.flatMap { content($0)._chartMarks() }
    }

    public func _render(_ ctx: _Ctx) -> [_Node] {
        var p: [String: _J] = ["marks": .a(marks.map { .o($0.p) })]
        if let o = ctx.env.custom[ObjectIdentifier(_ChartOptionsKey.self)] as? _ChartOptions { p["opts"] = .o(o.json) }
        return [_Node("chart", ctx.path, p)]
    }
}


// MARK: - Chart options (axes, legend, scales)

struct _ChartOptions {
    var json: [String: _J] = [:]
}
enum _ChartOptionsKey: EnvironmentKey { static let defaultValue = _ChartOptions() }

public struct AxisMarks: View, _PrimitiveView {
    let hidden: Bool
    public init(preset: Int = 0, position: AxisMarkPosition = .automatic, values: AxisMarkValues = .automatic) { hidden = false }
    public init<C: View>(preset: Int = 0, position: AxisMarkPosition = .automatic, values: AxisMarkValues = .automatic, @ViewBuilder content: (AxisValue) -> C) { hidden = false }
    public init<V>(values: [V]) { hidden = false }
    public init<V, C: View>(values: [V], @ViewBuilder content: (AxisValue) -> C) { hidden = false }
    public func _render(_ ctx: _Ctx) -> [_Node] { [] }
}
public struct AxisValue: Sendable {
    public var index: Int { 0 }
    public var count: Int { 0 }
    public func `as`<T>(_ type: T.Type) -> T? { nil }
}
public struct AxisMarkPosition: Sendable {
    public static let automatic = AxisMarkPosition(), leading = AxisMarkPosition(), trailing = AxisMarkPosition(), top = AxisMarkPosition(), bottom = AxisMarkPosition()
}
public struct AxisMarkValues: Sendable {
    public static let automatic = AxisMarkValues()
    public static func automatic(desiredCount: Int) -> AxisMarkValues { AxisMarkValues() }
    public static func stride(by: Calendar.Component, count: Int = 1) -> AxisMarkValues { AxisMarkValues() }
    public static func stride(by: Double) -> AxisMarkValues { AxisMarkValues() }
}
public struct AxisGridLine: View, _PrimitiveView { public init(centered: Bool? = nil, stroke: StrokeStyle? = nil) {}; public func _render(_ ctx: _Ctx) -> [_Node] { [] } }
public struct AxisTick: View, _PrimitiveView { public init(centered: Bool? = nil, length: CGFloat = 4, stroke: StrokeStyle? = nil) {}; public func _render(_ ctx: _Ctx) -> [_Node] { [] } }
public struct AxisValueLabel: View, _PrimitiveView {
    public init(centered: Bool? = nil, anchor: UnitPoint? = nil, multiLabelAlignment: Alignment? = nil, collisionResolution: Int = 0, offsetsMarks: Bool? = nil, orientation: Int = 0, horizontalSpacing: CGFloat? = nil, verticalSpacing: CGFloat? = nil) {}
    public init<F>(format: F, centered: Bool? = nil) {}
    public init<C: View>(@ViewBuilder content: () -> C) {}
    public func _render(_ ctx: _Ctx) -> [_Node] { [] }
}

extension View {
    func _chartOption(_ key: String, _ value: _J) -> some View {
        _env("chart." + key) { env in
            var o = env[_ChartOptionsKey.self]
            o.json[key] = value
            env[_ChartOptionsKey.self] = o
        }
    }
    public func chartXAxis(_ visibility: Visibility) -> some View { _chartOption("xAxis", .b(visibility != .hidden)) }
    public func chartYAxis(_ visibility: Visibility) -> some View { _chartOption("yAxis", .b(visibility != .hidden)) }
    public func chartXAxis<C: View>(@ViewBuilder content: () -> C) -> some View { self }
    public func chartYAxis<C: View>(@ViewBuilder content: () -> C) -> some View { self }
    public func chartLegend(_ visibility: Visibility) -> some View { _chartOption("legend", .b(visibility != .hidden)) }
    public func chartLegend(position: AnnotationPosition = .automatic, alignment: Alignment? = nil, spacing: CGFloat? = nil) -> some View { self }
    public func chartXAxisLabel(_ label: String, position: AnnotationPosition = .automatic, alignment: Alignment? = nil, spacing: CGFloat? = nil) -> some View { _chartOption("xLabel", .s(label)) }
    public func chartYAxisLabel(_ label: String, position: AnnotationPosition = .automatic, alignment: Alignment? = nil, spacing: CGFloat? = nil) -> some View { _chartOption("yLabel", .s(label)) }
    public func chartYScale<V: Plottable & Comparable>(domain: ClosedRange<V>) -> some View { _chartOption("yDomain", .a([domain.lowerBound._plot, domain.upperBound._plot])) }
    public func chartXScale<V: Plottable & Comparable>(domain: ClosedRange<V>) -> some View { _chartOption("xDomain", .a([domain.lowerBound._plot, domain.upperBound._plot])) }
    public func chartYScale(domain: [String]) -> some View { self }
    public func chartXScale(domain: [String]) -> some View { self }
    public func chartForegroundStyleScale(_ mapping: KeyValuePairs<String, Color>) -> some View {
        _chartOption("palette", .o(Dictionary(mapping.map { ($0.key, $0.value._css) }, uniquingKeysWith: { a, _ in a })))
    }
    public func chartForegroundStyleScale<S: ShapeStyle>(domain: [String], range: [S]) -> some View {
        var d: [String: _J] = [:]
        for (i, k) in domain.enumerated() where i < range.count { d[k] = range[i]._css }
        return _chartOption("palette", .o(d))
    }
    public func chartPlotStyle<C: View>(content: (_ChartPlotContent) -> C) -> some View { self }
    public func chartScrollableAxes(_ axes: Axis.Set) -> some View { self }
    public func chartXVisibleDomain(length: Int) -> some View { self }
    public func chartXSelection<V>(value: Binding<V?>) -> some View { self }
    public func chartAngleSelection<V>(value: Binding<V?>) -> some View { self }
    public func chartOverlay<C: View>(@ViewBuilder content: @escaping (ChartProxy) -> C) -> some View { self }
    public func chartBackground<C: View>(@ViewBuilder content: @escaping (ChartProxy) -> C) -> some View { self }
}

public struct _ChartPlotContent: View, _PrimitiveView { public func _render(_ ctx: _Ctx) -> [_Node] { [] } }
public struct ChartProxy {}
