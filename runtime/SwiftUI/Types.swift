// Value types: Color, ShapeStyle, Font, alignment, edges, angles…

// MARK: - ShapeStyle

public protocol ShapeStyle {
    var _css: _J { get }
}

public struct Color: ShapeStyle, Hashable, Sendable {
    let css: String      // CSS color, or a "var(--…)" token resolved by the simulator theme

    init(css: String) { self.css = css }
    public var _css: _J { .s(css) }

    public init(red: Double, green: Double, blue: Double, opacity: Double = 1) {
        css = "rgba(\(Int((red * 255).rounded())),\(Int((green * 255).rounded())),\(Int((blue * 255).rounded())),\(opacity))"
    }
    public init(_ space: RGBColorSpace = .sRGB, red: Double, green: Double, blue: Double, opacity: Double = 1) {
        self.init(red: red, green: green, blue: blue, opacity: opacity)
    }
    public init(white: Double, opacity: Double = 1) { self.init(red: white, green: white, blue: white, opacity: opacity) }
    public init(hue: Double, saturation: Double, brightness: Double, opacity: Double = 1) {
        // HSB → RGB
        let h = (hue - floor(hue)) * 6, s = saturation, v = brightness
        let i = Int(h), f = h - Double(i)
        let p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f))
        let (r, g, b): (Double, Double, Double) = [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)][i % 6]
        self.init(red: r, green: g, blue: b, opacity: opacity)
    }
    /// Named color from Assets.xcassets (falls back to the accent color).
    public init(_ name: String, bundle: Bundle? = nil) {
        css = _assetColor(name) ?? "var(--accent)"
    }

    public func opacity(_ o: Double) -> Color { Color(css: "color-mix(in srgb, \(css) \(Int(o * 100))%, transparent)") }
    public var gradient: LinearGradient { LinearGradient(colors: [self, Color(css: "color-mix(in srgb, \(css) 75%, black)")], startPoint: .top, endPoint: .bottom) }

    public enum RGBColorSpace: Sendable { case sRGB, sRGBLinear, displayP3 }

    public static let red = Color(css: "var(--red)")
    public static let orange = Color(css: "var(--orange)")
    public static let yellow = Color(css: "var(--yellow)")
    public static let green = Color(css: "var(--green)")
    public static let mint = Color(css: "var(--mint)")
    public static let teal = Color(css: "var(--teal)")
    public static let cyan = Color(css: "var(--cyan)")
    public static let blue = Color(css: "var(--blue)")
    public static let indigo = Color(css: "var(--indigo)")
    public static let purple = Color(css: "var(--purple)")
    public static let pink = Color(css: "var(--pink)")
    public static let brown = Color(css: "var(--brown)")
    public static let gray = Color(css: "var(--gray)")
    public static let black = Color(css: "#000")
    public static let white = Color(css: "#fff")
    public static let clear = Color(css: "transparent")
    public static let primary = Color(css: "var(--label)")
    public static let secondary = Color(css: "var(--label2)")
    public static let accentColor = Color(css: "var(--accent)")
}

func _assetColor(_ name: String) -> String? {
    guard let root = ProcessInfo.processInfo.environment["SWIFTCODE_PROJECT"] else { return nil }
    let fm = FileManager.default
    guard let e = fm.enumerator(atPath: root) else { return nil }
    while let rel = e.nextObject() as? String {
        guard rel.hasSuffix("\(name).colorset") else { continue }
        let url = URL(fileURLWithPath: root).appendingPathComponent(rel).appendingPathComponent("Contents.json")
        guard let data = try? Data(contentsOf: url),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let colors = json["colors"] as? [[String: Any]],
              let comps = (colors.first?["color"] as? [String: Any])?["components"] as? [String: Any] else { return nil }
        func v(_ k: String) -> Double {
            let s = "\(comps[k] ?? "0")"
            if s.hasPrefix("0x"), let i = Int(s.dropFirst(2), radix: 16) { return Double(i) / 255 }
            let d = Double(s) ?? 0
            return d > 1 ? d / 255 : d
        }
        return "rgba(\(Int(v("red") * 255)),\(Int(v("green") * 255)),\(Int(v("blue") * 255)),\(comps["alpha"].map { "\($0)" } ?? "1"))"
    }
    return nil
}

extension ShapeStyle where Self == Color {
    public static var red: Color { .red }
    public static var orange: Color { .orange }
    public static var yellow: Color { .yellow }
    public static var green: Color { .green }
    public static var mint: Color { .mint }
    public static var teal: Color { .teal }
    public static var cyan: Color { .cyan }
    public static var blue: Color { .blue }
    public static var indigo: Color { .indigo }
    public static var purple: Color { .purple }
    public static var pink: Color { .pink }
    public static var brown: Color { .brown }
    public static var gray: Color { .gray }
    public static var black: Color { .black }
    public static var white: Color { .white }
    public static var clear: Color { .clear }
    public static var primary: Color { .primary }
    public static var secondary: Color { .secondary }
    public static var tertiary: Color { Color(css: "var(--label3)") }
    public static var quaternary: Color { Color(css: "var(--label4)") }
    public static var accentColor: Color { .accentColor }
    public static var tint: Color { .accentColor }
    public static var background: Color { Color(css: "var(--bg)") }
}

public struct Material: ShapeStyle, Sendable {
    let alpha: Double
    public var _css: _J { .s("var(--material-\(Int(alpha * 100)))") }
    public static let ultraThinMaterial = Material(alpha: 0.35)
    public static let thinMaterial = Material(alpha: 0.5)
    public static let regularMaterial = Material(alpha: 0.65)
    public static let thickMaterial = Material(alpha: 0.8)
    public static let ultraThickMaterial = Material(alpha: 0.9)
    public static let bar = Material(alpha: 0.8)
}

extension ShapeStyle where Self == Material {
    public static var ultraThinMaterial: Material { .ultraThinMaterial }
    public static var thinMaterial: Material { .thinMaterial }
    public static var regularMaterial: Material { .regularMaterial }
    public static var thickMaterial: Material { .thickMaterial }
    public static var ultraThickMaterial: Material { .ultraThickMaterial }
    public static var bar: Material { .bar }
}

public struct Gradient: Sendable {
    public var colors: [Color]
    public init(colors: [Color]) { self.colors = colors }
    public struct Stop: Sendable {
        public var color: Color, location: Double
        public init(color: Color, location: Double) { self.color = color; self.location = location }
    }
    public init(stops: [Stop]) { colors = stops.map(\.color) }
}

nonisolated public struct LinearGradient: ShapeStyle, View, _PrimitiveView {
    let gradient: Gradient
    let start: UnitPoint, end: UnitPoint
    public init(gradient: Gradient, startPoint: UnitPoint, endPoint: UnitPoint) { self.gradient = gradient; start = startPoint; end = endPoint }
    public init(colors: [Color], startPoint: UnitPoint, endPoint: UnitPoint) { self.init(gradient: Gradient(colors: colors), startPoint: startPoint, endPoint: endPoint) }
    public init(stops: [Gradient.Stop], startPoint: UnitPoint, endPoint: UnitPoint) { self.init(gradient: Gradient(stops: stops), startPoint: startPoint, endPoint: endPoint) }
    public var _css: _J {
        let angle = atan2(end.x - start.x, start.y - end.y) * 180 / .pi
        return .s("linear-gradient(\(Int(angle))deg, \(gradient.colors.map(\.css).joined(separator: ", ")))")
    }
    public func _render(_ ctx: _Ctx) -> [_Node] { [_Node("color", ctx.path, ["c": _css])] }
}

nonisolated public struct RadialGradient: ShapeStyle, View, _PrimitiveView {
    let gradient: Gradient
    public init(gradient: Gradient, center: UnitPoint, startRadius: CGFloat, endRadius: CGFloat) { self.gradient = gradient }
    public init(colors: [Color], center: UnitPoint, startRadius: CGFloat, endRadius: CGFloat) { gradient = Gradient(colors: colors) }
    public var _css: _J { .s("radial-gradient(circle, \(gradient.colors.map(\.css).joined(separator: ", ")))") }
    public func _render(_ ctx: _Ctx) -> [_Node] { [_Node("color", ctx.path, ["c": _css])] }
}

nonisolated public struct AngularGradient: ShapeStyle, View, _PrimitiveView {
    let gradient: Gradient
    public init(gradient: Gradient, center: UnitPoint) { self.gradient = gradient }
    public init(colors: [Color], center: UnitPoint) { gradient = Gradient(colors: colors) }
    public var _css: _J { .s("conic-gradient(\(gradient.colors.map(\.css).joined(separator: ", ")))") }
    public func _render(_ ctx: _Ctx) -> [_Node] { [_Node("color", ctx.path, ["c": _css])] }
}

public struct AnyShapeStyle: ShapeStyle {
    let css: _J
    public init<S: ShapeStyle>(_ s: S) { css = s._css }
    public var _css: _J { css }
}

// MARK: - Font

public struct Font: Hashable, Sendable {
    var size: Double
    var weight: Int
    var design: String = "default"
    var isItalic = false
    var family: String? = nil
    var textStyle: String? = nil

    public static let largeTitle = Font(size: 34, weight: 700, textStyle: "largeTitle")
    public static let title = Font(size: 28, weight: 700, textStyle: "title")
    public static let title2 = Font(size: 22, weight: 700, textStyle: "title2")
    public static let title3 = Font(size: 20, weight: 600, textStyle: "title3")
    public static let headline = Font(size: 17, weight: 600, textStyle: "headline")
    public static let subheadline = Font(size: 15, weight: 400, textStyle: "subheadline")
    public static let body = Font(size: 17, weight: 400, textStyle: "body")
    public static let callout = Font(size: 16, weight: 400, textStyle: "callout")
    public static let footnote = Font(size: 13, weight: 400, textStyle: "footnote")
    public static let caption = Font(size: 12, weight: 400, textStyle: "caption")
    public static let caption2 = Font(size: 11, weight: 400, textStyle: "caption2")

    public static func system(size: CGFloat, weight: Weight? = nil, design: Design? = nil) -> Font {
        Font(size: Double(size), weight: (weight ?? .regular).value, design: (design ?? .default).name)
    }
    public static func system(_ style: TextStyle, design: Design = .default, weight: Weight? = nil) -> Font {
        var f = style.font
        f.design = design.name
        if let weight { f.weight = weight.value }
        return f
    }
    public static func custom(_ name: String, size: CGFloat) -> Font { Font(size: Double(size), weight: 400, family: name) }
    public static func custom(_ name: String, size: CGFloat, relativeTo: TextStyle) -> Font { custom(name, size: size) }
    public static func custom(_ name: String, fixedSize: CGFloat) -> Font { custom(name, size: fixedSize) }

    public func bold() -> Font { var f = self; f.weight = 700; return f }
    public func italic() -> Font { var f = self; f.isItalic = true; return f }
    public func weight(_ w: Weight) -> Font { var f = self; f.weight = w.value; return f }
    public func monospaced() -> Font { var f = self; f.design = "monospaced"; return f }
    public func monospacedDigit() -> Font { self }
    public func smallCaps() -> Font { self }
    public func leading(_ l: Leading) -> Font { self }

    public enum Leading: Sendable { case standard, tight, loose }

    public struct Weight: Hashable, Sendable {
        let value: Int
        public static let ultraLight = Weight(value: 100)
        public static let thin = Weight(value: 200)
        public static let light = Weight(value: 300)
        public static let regular = Weight(value: 400)
        public static let medium = Weight(value: 500)
        public static let semibold = Weight(value: 600)
        public static let bold = Weight(value: 700)
        public static let heavy = Weight(value: 800)
        public static let black = Weight(value: 900)
    }

    public struct Design: Hashable, Sendable {
        let name: String
        public static let `default` = Design(name: "default")
        public static let rounded = Design(name: "rounded")
        public static let serif = Design(name: "serif")
        public static let monospaced = Design(name: "monospaced")
    }

    public enum TextStyle: Hashable, Sendable, CaseIterable {
        case largeTitle, title, title2, title3, headline, subheadline, body, callout, footnote, caption, caption2
        var font: Font {
            switch self {
            case .largeTitle: return .largeTitle
            case .title: return .title
            case .title2: return .title2
            case .title3: return .title3
            case .headline: return .headline
            case .subheadline: return .subheadline
            case .body: return .body
            case .callout: return .callout
            case .footnote: return .footnote
            case .caption: return .caption
            case .caption2: return .caption2
            }
        }
    }

    var json: _J {
        var o: [String: _J] = ["size": .n(size), "weight": .int(weight), "design": .s(design)]
        if isItalic { o["italic"] = .b(true) }
        if let family { o["family"] = .s(family) }
        return .o(o)
    }
}

// MARK: - Geometry & alignment

public struct UnitPoint: Hashable, Sendable {
    public var x: Double, y: Double
    public init(x: Double, y: Double) { self.x = x; self.y = y }
    public static let zero = UnitPoint(x: 0, y: 0)
    public static let center = UnitPoint(x: 0.5, y: 0.5)
    public static let leading = UnitPoint(x: 0, y: 0.5)
    public static let trailing = UnitPoint(x: 1, y: 0.5)
    public static let top = UnitPoint(x: 0.5, y: 0)
    public static let bottom = UnitPoint(x: 0.5, y: 1)
    public static let topLeading = UnitPoint(x: 0, y: 0)
    public static let topTrailing = UnitPoint(x: 1, y: 0)
    public static let bottomLeading = UnitPoint(x: 0, y: 1)
    public static let bottomTrailing = UnitPoint(x: 1, y: 1)
}

public struct HorizontalAlignment: Hashable, Sendable {
    let name: String
    public static let leading = HorizontalAlignment(name: "leading")
    public static let center = HorizontalAlignment(name: "center")
    public static let trailing = HorizontalAlignment(name: "trailing")
    public static let listRowSeparatorLeading = HorizontalAlignment(name: "leading")
}

public struct VerticalAlignment: Hashable, Sendable {
    let name: String
    public static let top = VerticalAlignment(name: "top")
    public static let center = VerticalAlignment(name: "center")
    public static let bottom = VerticalAlignment(name: "bottom")
    public static let firstTextBaseline = VerticalAlignment(name: "baseline")
    public static let lastTextBaseline = VerticalAlignment(name: "baseline")
}

public struct Alignment: Hashable, Sendable {
    public var horizontal: HorizontalAlignment
    public var vertical: VerticalAlignment
    public init(horizontal: HorizontalAlignment, vertical: VerticalAlignment) { self.horizontal = horizontal; self.vertical = vertical }
    public static let center = Alignment(horizontal: .center, vertical: .center)
    public static let leading = Alignment(horizontal: .leading, vertical: .center)
    public static let trailing = Alignment(horizontal: .trailing, vertical: .center)
    public static let top = Alignment(horizontal: .center, vertical: .top)
    public static let bottom = Alignment(horizontal: .center, vertical: .bottom)
    public static let topLeading = Alignment(horizontal: .leading, vertical: .top)
    public static let topTrailing = Alignment(horizontal: .trailing, vertical: .top)
    public static let bottomLeading = Alignment(horizontal: .leading, vertical: .bottom)
    public static let bottomTrailing = Alignment(horizontal: .trailing, vertical: .bottom)
    var json: _J { .o(["h": .s(horizontal.name), "v": .s(vertical.name)]) }
}

public enum TextAlignment: Hashable, Sendable { case leading, center, trailing }

public enum Edge: Int8, Hashable, Sendable, CaseIterable {
    case top, leading, bottom, trailing
    public struct Set: OptionSet, Hashable, Sendable {
        public let rawValue: Int8
        public init(rawValue: Int8) { self.rawValue = rawValue }
        public init(_ e: Edge) { rawValue = 1 << e.rawValue }
        public static let top = Set(.top)
        public static let leading = Set(.leading)
        public static let bottom = Set(.bottom)
        public static let trailing = Set(.trailing)
        public static let horizontal: Set = [.leading, .trailing]
        public static let vertical: Set = [.top, .bottom]
        public static let all: Set = [.top, .leading, .bottom, .trailing]
    }
}

public struct EdgeInsets: Hashable, Sendable {
    public var top: CGFloat, leading: CGFloat, bottom: CGFloat, trailing: CGFloat
    public init(top: CGFloat = 0, leading: CGFloat = 0, bottom: CGFloat = 0, trailing: CGFloat = 0) {
        self.top = top; self.leading = leading; self.bottom = bottom; self.trailing = trailing
    }
}

public struct Angle: Hashable, Sendable {
    public var radians: Double
    public var degrees: Double { radians * 180 / .pi }
    public init(radians: Double) { self.radians = radians }
    public init(degrees: Double) { radians = degrees * .pi / 180 }
    public static func degrees(_ d: Double) -> Angle { Angle(degrees: d) }
    public static func radians(_ r: Double) -> Angle { Angle(radians: r) }
    public static let zero = Angle(radians: 0)
}

public enum ContentMode: Hashable, Sendable { case fit, fill }
public enum Visibility: Hashable, Sendable { case automatic, visible, hidden }
public enum Axis: Hashable, Sendable {
    case horizontal, vertical
    public struct Set: OptionSet, Hashable, Sendable {
        public let rawValue: Int8
        public init(rawValue: Int8) { self.rawValue = rawValue }
        public static let horizontal = Set(rawValue: 1)
        public static let vertical = Set(rawValue: 2)
    }
}

public enum ButtonRole: Hashable, Sendable { case destructive, cancel }

public struct ControlSize: Hashable, Sendable {
    let name: String
    public static let mini = ControlSize(name: "mini")
    public static let small = ControlSize(name: "small")
    public static let regular = ControlSize(name: "regular")
    public static let large = ControlSize(name: "large")
    public static let extraLarge = ControlSize(name: "large")
}

public enum Prominence: Hashable, Sendable { case standard, increased }

public struct DynamicTypeSize: Hashable, Sendable {
    public static let large = DynamicTypeSize()
    public static let xxxLarge = DynamicTypeSize()
}

// MARK: - Shapes

public protocol Shape: View {
    var _shapeName: String { get }
    var _shapeArgs: [String: _J] { get }
}

extension Shape {
    public var _shapeArgs: [String: _J] { [:] }
    public func fill<S: ShapeStyle>(_ style: S) -> _ShapeView { _ShapeView(name: _shapeName, args: _shapeArgs, fill: style._css, stroke: nil, lineWidth: 0) }
    public func fill() -> _ShapeView { _ShapeView(name: _shapeName, args: _shapeArgs, fill: .s("currentColor"), stroke: nil, lineWidth: 0) }
    public func stroke<S: ShapeStyle>(_ style: S, lineWidth: CGFloat = 1) -> _ShapeView { _ShapeView(name: _shapeName, args: _shapeArgs, fill: nil, stroke: style._css, lineWidth: Double(lineWidth)) }
    public func stroke<S: ShapeStyle>(_ style: S, style strokeStyle: StrokeStyle) -> _ShapeView { _ShapeView(name: _shapeName, args: _shapeArgs, fill: nil, stroke: style._css, lineWidth: Double(strokeStyle.lineWidth)) }
    public func strokeBorder<S: ShapeStyle>(_ style: S, lineWidth: CGFloat = 1) -> _ShapeView { stroke(style, lineWidth: lineWidth) }
    public func stroke(lineWidth: CGFloat = 1) -> _ShapeView { _ShapeView(name: _shapeName, args: _shapeArgs, fill: nil, stroke: .s("currentColor"), lineWidth: Double(lineWidth)) }
    public func trim(from: CGFloat = 0, to: CGFloat = 1) -> Self { self }
}

public struct StrokeStyle: Sendable {
    public var lineWidth: CGFloat
    public init(lineWidth: CGFloat = 1, lineCap: Int = 0, lineJoin: Int = 0, dash: [CGFloat] = []) { self.lineWidth = lineWidth }
}

nonisolated public struct _ShapeView: View, _PrimitiveView {
    let name: String, args: [String: _J], fill: _J?, stroke: _J?, lineWidth: Double
    public func _render(_ ctx: _Ctx) -> [_Node] {
        var p = args
        p["shape"] = .s(name)
        if let fill { p["fill"] = fill }
        if let stroke { p["stroke"] = stroke; p["lw"] = .n(lineWidth) }
        return [_Node("shape", ctx.path, p)]
    }
}

nonisolated public struct Rectangle: Shape, _PrimitiveView {
    public init() {}
    public var _shapeName: String { "rect" }
    public func _render(_ ctx: _Ctx) -> [_Node] { fill()._render(ctx) }
}
nonisolated public struct RoundedRectangle: Shape, _PrimitiveView {
    let r: CGFloat
    public init(cornerRadius: CGFloat, style: RoundedCornerStyle = .continuous) { r = cornerRadius }
    public init(cornerSize: CGSize, style: RoundedCornerStyle = .continuous) { r = cornerSize.width }
    public var _shapeName: String { "rect" }
    public var _shapeArgs: [String: _J] { ["r": .num(r)] }
    public func _render(_ ctx: _Ctx) -> [_Node] { fill()._render(ctx) }
}
nonisolated public struct UnevenRoundedRectangle: Shape, _PrimitiveView {
    let r: CGFloat
    public init(topLeadingRadius: CGFloat = 0, bottomLeadingRadius: CGFloat = 0, bottomTrailingRadius: CGFloat = 0, topTrailingRadius: CGFloat = 0, style: RoundedCornerStyle = .continuous) { r = topLeadingRadius }
    public var _shapeName: String { "rect" }
    public var _shapeArgs: [String: _J] { ["r": .num(r)] }
    public func _render(_ ctx: _Ctx) -> [_Node] { fill()._render(ctx) }
}
public enum RoundedCornerStyle: Sendable { case circular, continuous }
nonisolated public struct Circle: Shape, _PrimitiveView {
    public init() {}
    public var _shapeName: String { "circle" }
    public func _render(_ ctx: _Ctx) -> [_Node] { fill()._render(ctx) }
}
nonisolated public struct Ellipse: Shape, _PrimitiveView {
    public init() {}
    public var _shapeName: String { "ellipse" }
    public func _render(_ ctx: _Ctx) -> [_Node] { fill()._render(ctx) }
}
nonisolated public struct Capsule: Shape, _PrimitiveView {
    public init(style: RoundedCornerStyle = .continuous) {}
    public var _shapeName: String { "capsule" }
    public func _render(_ ctx: _Ctx) -> [_Node] { fill()._render(ctx) }
}

extension Shape where Self == Rectangle { public static var rect: Rectangle { Rectangle() } }
extension Shape where Self == Circle { public static var circle: Circle { Circle() } }
extension Shape where Self == Capsule { public static var capsule: Capsule { Capsule() } }
extension Shape where Self == Ellipse { public static var ellipse: Ellipse { Ellipse() } }
extension Shape where Self == RoundedRectangle {
    public static func rect(cornerRadius: CGFloat) -> RoundedRectangle { RoundedRectangle(cornerRadius: cornerRadius) }
}

// UIKit-flavoured enums that SwiftUI code commonly references

public enum UIKeyboardType: Int, Sendable {
    case `default`, asciiCapable, numbersAndPunctuation, URL, numberPad, phonePad, namePhonePad, emailAddress, decimalPad, twitter, webSearch, asciiCapableNumberPad
}
public struct TextInputAutocapitalization: Sendable {
    public static let never = TextInputAutocapitalization()
    public static let words = TextInputAutocapitalization()
    public static let sentences = TextInputAutocapitalization()
    public static let characters = TextInputAutocapitalization()
}
public enum UITextAutocapitalizationType: Int, Sendable { case none, words, sentences, allCharacters }
public struct SubmitLabel: Sendable {
    public static let done = SubmitLabel(), go = SubmitLabel(), send = SubmitLabel(), join = SubmitLabel()
    public static let route = SubmitLabel(), search = SubmitLabel(), `return` = SubmitLabel(), next = SubmitLabel(), `continue` = SubmitLabel()
}
public struct UITextContentType: Sendable {
    public static let username = UITextContentType(), password = UITextContentType(), emailAddress = UITextContentType(), name = UITextContentType(), newPassword = UITextContentType(), oneTimeCode = UITextContentType()
}
