// Primitive views, builders and containers.

// MARK: - ViewBuilder

@resultBuilder
@MainActor
public enum ViewBuilder {
    public static func buildBlock() -> EmptyView { EmptyView() }
    public static func buildBlock<Content: View>(_ content: Content) -> Content { content }
    public static func buildBlock<each C: View>(_ content: repeat each C) -> TupleView {
        var views: [AnyView] = []
        repeat views.append(AnyView(each content))
        return TupleView(views)
    }
    public static func buildExpression<Content: View>(_ content: Content) -> Content { content }
    public static func buildOptional<Content: View>(_ content: Content?) -> _OptionalView<Content> { _OptionalView(content: content) }
    public static func buildEither<T: View, F: View>(first: T) -> _ConditionalView<T, F> { _ConditionalView(first: first, second: nil) }
    public static func buildEither<T: View, F: View>(second: F) -> _ConditionalView<T, F> { _ConditionalView(first: nil, second: second) }
    public static func buildArray<Content: View>(_ items: [Content]) -> TupleView { TupleView(items.map { AnyView($0) }) }
    public static func buildLimitedAvailability<Content: View>(_ content: Content) -> AnyView { AnyView(content) }
}

public struct TupleView: View, _PrimitiveView {
    let views: [AnyView]
    init(_ views: [AnyView]) { self.views = views }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        var out: [_Node] = []
        for (i, v) in views.enumerated() { out += v._render(ctx.child(String(i))) }
        return out
    }
}

public struct _OptionalView<Content: View>: View, _PrimitiveView {
    let content: Content?
    public func _render(_ ctx: _Ctx) -> [_Node] { content.map { _resolve($0, ctx.child("?")) } ?? [] }
}

public struct _ConditionalView<T: View, F: View>: View, _PrimitiveView {
    let first: T?, second: F?
    public func _render(_ ctx: _Ctx) -> [_Node] {
        if let first { return _resolve(first, ctx.child("T")) }
        if let second { return _resolve(second, ctx.child("F")) }
        return []
    }
}

public struct AnyView: View, _PrimitiveView {
    let renderFn: @MainActor (_Ctx) -> [_Node]
    public init<V: View>(_ view: V) {
        if let any = view as? AnyView { renderFn = any.renderFn } else { renderFn = { _resolve(view, $0) } }
    }
    public init<V: View>(erasing view: V) { self.init(view) }
    public func _render(_ ctx: _Ctx) -> [_Node] { renderFn(ctx) }
}

nonisolated public struct EmptyView: View, _PrimitiveView {
    public init() {}
    public func _render(_ ctx: _Ctx) -> [_Node] { [] }
}

public struct Group<Content: View>: View, _PrimitiveView {
    let content: Content
    public init(@ViewBuilder content: () -> Content) { self.content = content() }
    public func _render(_ ctx: _Ctx) -> [_Node] { _resolve(content, ctx) }
}

extension Optional: View where Wrapped: View {
    public typealias Body = Never
}
extension Optional: _PrimitiveView where Wrapped: View {
    public func _render(_ ctx: _Ctx) -> [_Node] {
        switch self {
        case .some(let v): return _resolve(v, ctx)
        case .none: return []
        }
    }
}

// MARK: - Text

nonisolated public struct Text: View, _PrimitiveView, Equatable {
    struct Segment: Equatable {
        var s: String
        var style: [String: String] = [:]
        /// localized segments are looked up again at render time, so `.environment(\.locale, …)` works
        var loc: LocalizedStringKey? = nil
        var table: String? = nil
    }
    var segs: [Segment]

    /// `Text("Hello")` looks the key up in Localizable.strings like SwiftUI does for string literals.
    public init(_ key: LocalizedStringKey, tableName: String? = nil, bundle: Bundle? = nil, comment: StaticString? = nil) {
        segs = [Segment(s: key.resolved(table: tableName), loc: key.verbatim ? nil : key, table: tableName)]
    }
    /// `Text(someString)` shows the string as is.
    @_disfavoredOverload
    public init<S: StringProtocol>(_ content: S) { segs = [Segment(s: String(content))] }
    public init(verbatim content: String) { segs = [Segment(s: content)] }
    public init(_ date: Date, style: DateStyle) { segs = [Segment(s: Text._format(date, style))] }
    public init(_ interval: ClosedRange<Date>) {
        let f = DateFormatter(); f.locale = _L10n.shared.locale; f.dateStyle = .short; f.timeStyle = .short
        segs = [Segment(s: "\(f.string(from: interval.lowerBound)) – \(f.string(from: interval.upperBound))")]
    }

    static func _format(_ date: Date, _ style: DateStyle) -> String {
        let f = DateFormatter()
        f.locale = _L10n.shared.locale
        switch style.kind {
        case "time": f.timeStyle = .short; f.dateStyle = .none
        case "date": f.dateStyle = .long; f.timeStyle = .none
        case "relative":
            return _relative(date)
        default: f.dateStyle = .medium; f.timeStyle = .short
        }
        return f.string(from: date)
    }

    var _plain: String { segs.map(\.s).joined() }

    /// "2 hours, 5 minutes" like Text(date, style: .relative)
    static func _relative(_ date: Date) -> String {
        let secs = Int(abs(date.timeIntervalSinceNow))
        let pl = _L10n.shared.language.hasPrefix("pl")
        func unit(_ n: Int, _ en: String, _ pl1: String, _ pl2: String, _ pl5: String) -> String {
            if !pl { return "\(n) \(en)\(n == 1 ? "" : "s")" }
            let cat = _pluralCategory(Double(n), "pl")
            return "\(n) \(cat == "one" ? pl1 : cat == "few" ? pl2 : pl5)"
        }
        if secs < 60 { return unit(secs, "second", "sekunda", "sekundy", "sekund") }
        if secs < 3600 { return unit(secs / 60, "minute", "minuta", "minuty", "minut") + ", " + unit(secs % 60, "second", "sekunda", "sekundy", "sekund") }
        if secs < 86400 { return unit(secs / 3600, "hour", "godzina", "godziny", "godzin") + ", " + unit(secs % 3600 / 60, "minute", "minuta", "minuty", "minut") }
        return unit(secs / 86400, "day", "dzień", "dni", "dni")
    }
    public init<F: FormatStyle>(_ value: F.FormatInput, format: F) where F.FormatOutput == String {
        segs = [Segment(s: format.format(value))]
    }
    public init(_ image: Image) { segs = [Segment(s: image.symbolText, style: ["img": "1"])] }

    public struct DateStyle: Sendable {
        let kind: String
        public static let time = DateStyle(kind: "time")
        public static let date = DateStyle(kind: "date")
        public static let relative = DateStyle(kind: "relative")
        public static let offset = DateStyle(kind: "relative")
        public static let timer = DateStyle(kind: "relative")
    }

    public static func + (lhs: Text, rhs: Text) -> Text { var t = lhs; t.segs += rhs.segs; return t }

    func styled(_ k: String, _ v: String) -> Text {
        var t = self
        for i in t.segs.indices where t.segs[i].style[k] == nil { t.segs[i].style[k] = v }
        return t
    }

    public func bold() -> Text { styled("fontWeight", "700") }
    public func bold(_ isActive: Bool) -> Text { isActive ? bold() : self }
    public func italic() -> Text { styled("fontStyle", "italic") }
    public func italic(_ isActive: Bool) -> Text { isActive ? italic() : self }
    public func underline(_ isActive: Bool = true, color: Color? = nil) -> Text { isActive ? styled("textDecoration", "underline") : self }
    public func strikethrough(_ isActive: Bool = true, color: Color? = nil) -> Text { isActive ? styled("textDecoration", "line-through") : self }
    public func fontWeight(_ w: Font.Weight?) -> Text { w.map { styled("fontWeight", String($0.value)) } ?? self }
    public func foregroundColor(_ c: Color?) -> Text { c.map { styled("color", $0.css) } ?? self }
    public func foregroundStyle<S: ShapeStyle>(_ s: S) -> Text {
        if case .s(let css) = s._css { return styled("color", css) }
        return self
    }
    public func font(_ f: Font?) -> Text {
        guard let f else { return self }
        var t = styled("fontSize", "\(f.size)px").styled("fontWeight", String(f.weight))
        if f.isItalic { t = t.styled("fontStyle", "italic") }
        if f.design != "default" { t = t.styled("design", f.design) }
        return t
    }
    public func monospaced() -> Text { styled("design", "monospaced") }
    public func monospacedDigit() -> Text { self }
    public func kerning(_ k: CGFloat) -> Text { styled("letterSpacing", "\(k)px") }
    public func tracking(_ k: CGFloat) -> Text { kerning(k) }
    public func baselineOffset(_ o: CGFloat) -> Text { self }
    public func textCase(_ c: Text.Case?) -> Text {
        switch c { case .uppercase?: return styled("textTransform", "uppercase"); case .lowercase?: return styled("textTransform", "lowercase"); default: return self }
    }
    public enum Case: Sendable { case uppercase, lowercase }

    public func _render(_ ctx: _Ctx) -> [_Node] {
        let lang = ctx.env._language
        let segs: [_J] = self.segs.map { seg in
            let s = seg.loc.map { lang == _L10n.shared.language ? seg.s : $0.resolved(lang, table: seg.table) } ?? seg.s
            var o: [String: _J] = ["s": .s(s)]
            if !seg.style.isEmpty { o["st"] = .o(seg.style.mapValues { .s($0) }) }
            return .o(o)
        }
        return [_Node("text", ctx.path, ["segs": .a(segs)])]
    }
}

// MARK: - Image

nonisolated public struct Image: View, _PrimitiveView {
    enum Source { case symbol(String), asset(String), file(String), none }
    let source: Source
    var resizable = false
    var renderingTemplate = false

    public init(systemName: String) { source = .symbol(systemName) }
    public init(_ name: String, bundle: Bundle? = nil) { source = .asset(name) }
    public init(decorative name: String, bundle: Bundle? = nil) { source = .asset(name) }

    public func resizable(capInsets: EdgeInsets = EdgeInsets(), resizingMode: ResizingMode = .stretch) -> Image { var i = self; i.resizable = true; return i }
    public func renderingMode(_ m: TemplateRenderingMode?) -> Image { var i = self; i.renderingTemplate = m == .template; return i }
    public func symbolRenderingMode(_ m: SymbolRenderingMode?) -> Image { self }
    public func interpolation(_ i: Interpolation) -> Image { self }
    public func antialiased(_ a: Bool) -> Image { self }
    public enum ResizingMode: Sendable { case tile, stretch }
    public enum TemplateRenderingMode: Sendable { case template, original }
    public enum Interpolation: Sendable { case none, low, medium, high }
    public enum Scale: Sendable { case small, medium, large }

    var symbolText: String { if case .symbol(let n) = source { return "⟦\(n)⟧" }; return "" }

    public func _render(_ ctx: _Ctx) -> [_Node] {
        switch source {
        case .symbol(let n):
            return [_Node("symbol", ctx.path, ["name": .s(n), "resizable": .b(resizable)])]
        case .asset(let n):
            let a = _assetImage(n)
            return [_Node("image", ctx.path, ["src": a.map { .s($0.path) } ?? .null, "scale": .n(a?.scale ?? 1), "name": .s(n), "resizable": .b(resizable)])]
        case .file(let p):
            return [_Node("image", ctx.path, ["src": .s(p), "scale": .n(1), "name": .s(p), "resizable": .b(resizable)])]
        case .none:
            return []
        }
    }
}

public struct SymbolRenderingMode: Sendable {
    public static let monochrome = SymbolRenderingMode(), multicolor = SymbolRenderingMode(), hierarchical = SymbolRenderingMode(), palette = SymbolRenderingMode()
}

struct _AssetImage { let path: String; let scale: Double }

nonisolated(unsafe) var _assetImageCache: [String: _AssetImage?] = [:]
nonisolated(unsafe) var _projectFileList: [String]? = nil

/// Every file in the project (relative paths), listed once per run.
func _projectFiles() -> [String] {
    if let l = _projectFileList { return l }
    var out: [String] = []
    if let root = ProcessInfo.processInfo.environment["SWIFTCODE_PROJECT"], let e = FileManager.default.enumerator(atPath: root) {
        while let rel = e.nextObject() as? String {
            let lower = rel.lowercased()
            if lower.hasPrefix(".build") || lower.hasPrefix(".git") { e.skipDescendants(); continue }
            out.append(rel.replacingOccurrences(of: "\\", with: "/"))
        }
    }
    _projectFileList = out
    return out
}

/// Image("name"): an image set in an asset catalog (respecting scale and localized variants), else a loose image file.
func _assetImage(_ name: String) -> _AssetImage? {
    if let cached = _assetImageCache[name] { return cached }
    let r = _findAssetImage(name)
    _assetImageCache[name] = r
    return r
}

func _findAssetImage(_ name: String) -> _AssetImage? {
    guard let root = ProcessInfo.processInfo.environment["SWIFTCODE_PROJECT"] else { return nil }
    let exts = ["png", "jpg", "jpeg", "gif", "webp", "svg", "heic", "pdf", "bmp"]
    let fm = FileManager.default
    let lname = name.lowercased()
    let lang = _L10n.shared.language.lowercased()
    let files = _projectFiles()
    for rel in files where rel.lowercased().hasSuffix("/\(lname).imageset") || rel.lowercased() == "\(lname).imageset" {
        let dir = URL(fileURLWithPath: root).appendingPathComponent(rel)
        var candidates: [(file: String, scale: Double, locale: String?)] = []
        if let data = try? Data(contentsOf: dir.appendingPathComponent("Contents.json")),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let images = json["images"] as? [[String: Any]] {
            for img in images {
                guard let f = img["filename"] as? String else { continue }
                let scale = Double(String((img["scale"] as? String ?? "1x").dropLast())) ?? 1
                candidates.append((f, scale, (img["locale"] as? String)?.lowercased()))
            }
        }
        if candidates.isEmpty, let list = try? fm.contentsOfDirectory(atPath: dir.path) {
            for f in list.sorted() where exts.contains((f as NSString).pathExtension.lowercased()) {
                candidates.append((f, f.contains("@3x") ? 3 : f.contains("@2x") ? 2 : 1, nil))
            }
        }
        // localized variant for the current language first, then the shared images; highest scale wins
        let localized = candidates.filter { $0.locale == lang || $0.locale?.hasPrefix(lang + "-") == true }
        let pool = localized.isEmpty ? candidates.filter { $0.locale == nil } : localized
        if let best = (pool.isEmpty ? candidates : pool).max(by: { $0.scale < $1.scale }) {
            return _AssetImage(path: dir.appendingPathComponent(best.file).path, scale: best.scale)
        }
    }
    // loose files: prefer <lang>.lproj/name.png, then any name.png / name@2x.png
    var loose: _AssetImage? = nil
    for rel in files {
        let url = URL(fileURLWithPath: rel)
        let ext = url.pathExtension.lowercased()
        guard exts.contains(ext) else { continue }
        var base = url.deletingPathExtension().lastPathComponent.lowercased()
        var scale = 1.0
        if base.hasSuffix("@2x") { scale = 2; base.removeLast(3) } else if base.hasSuffix("@3x") { scale = 3; base.removeLast(3) }
        guard base == lname else { continue }
        let parent = url.deletingLastPathComponent().lastPathComponent.lowercased()
        if parent.hasSuffix(".imageset") { continue }
        let found = _AssetImage(path: URL(fileURLWithPath: root).appendingPathComponent(rel).path, scale: scale)
        if parent == "\(lang).lproj" { return found }
        if parent.hasSuffix(".lproj") && parent != "\(_L10n.shared.developmentRegion.lowercased()).lproj" && parent != "base.lproj" { continue }
        if loose == nil || scale > loose!.scale { loose = found }
    }
    return loose
}

// MARK: - Label

public struct Label<Title: View, Icon: View>: View, _PrimitiveView {
    let title: Title, icon: Icon
    public init(@ViewBuilder title: () -> Title, @ViewBuilder icon: () -> Icon) { self.title = title(); self.icon = icon() }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        [_Node("label", ctx.path, ["style": .s(ctx.env.labelStyle)], [
            _Node("group", ctx.path + "/i", [:], _resolve(icon, ctx.child("i"))),
            _Node("group", ctx.path + "/t", [:], _resolve(title, ctx.child("t"))),
        ])]
    }
}

extension Label where Title == Text, Icon == Image {
    public init(_ titleKey: LocalizedStringKey, systemImage: String) { self.init(title: { Text(titleKey) }, icon: { Image(systemName: systemImage) }) }
    public init(_ titleKey: LocalizedStringKey, image: String) { self.init(title: { Text(titleKey) }, icon: { Image(image) }) }
    @_disfavoredOverload
    public init<S: StringProtocol>(_ title: S, systemImage: String) { self.init(title: { Text(title) }, icon: { Image(systemName: systemImage) }) }
    @_disfavoredOverload
    public init<S: StringProtocol>(_ title: S, image: String) { self.init(title: { Text(title) }, icon: { Image(image) }) }
}

/// Form row with a title and a trailing value (iOS 16).
public struct LabeledContent<Label: View, Content: View>: View, _PrimitiveView {
    let label: Label, content: Content
    public init(@ViewBuilder content: () -> Content, @ViewBuilder label: () -> Label) { self.content = content(); self.label = label() }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        let trailing = _ModifiedView(content: content, key: "fg") { _ in ["v": .s("var(--label2)")] }
        return HStack { label; Spacer(); trailing }._render(ctx)
    }
}
extension LabeledContent where Label == Text {
    public init(_ titleKey: LocalizedStringKey, @ViewBuilder content: () -> Content) { self.init(content: content) { Text(titleKey) } }
    @_disfavoredOverload
    public init<S: StringProtocol>(_ title: S, @ViewBuilder content: () -> Content) { self.init(content: content) { Text(title) } }
}
extension LabeledContent where Label == Text, Content == Text {
    public init<S: StringProtocol>(_ titleKey: LocalizedStringKey, value: S) { self.init(content: { Text(value) }, label: { Text(titleKey) }) }
    @_disfavoredOverload
    public init<S1: StringProtocol, S2: StringProtocol>(_ title: S1, value: S2) { self.init(content: { Text(value) }, label: { Text(title) }) }
    public init<F: FormatStyle>(_ titleKey: LocalizedStringKey, value: F.FormatInput, format: F) where F.FormatOutput == String {
        self.init(content: { Text(format.format(value)) }, label: { Text(titleKey) })
    }
}

// MARK: - Layout primitives

nonisolated public struct Spacer: View, _PrimitiveView {
    let minLength: CGFloat?
    public init(minLength: CGFloat? = nil) { self.minLength = minLength }
    public func _render(_ ctx: _Ctx) -> [_Node] { [_Node("spacer", ctx.path, ["min": .opt(minLength)])] }
}

nonisolated public struct Divider: View, _PrimitiveView {
    public init() {}
    public func _render(_ ctx: _Ctx) -> [_Node] { [_Node("divider", ctx.path)] }
}

public struct VStack<Content: View>: View, _PrimitiveView {
    let alignment: HorizontalAlignment, spacing: CGFloat?, content: Content
    public init(alignment: HorizontalAlignment = .center, spacing: CGFloat? = nil, @ViewBuilder content: () -> Content) {
        self.alignment = alignment; self.spacing = spacing; self.content = content()
    }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        let c = ctx.copy(); c.parentAxis = "v"
        return [_Node("vstack", ctx.path, ["align": .s(alignment.name), "spacing": .opt(spacing)], _resolve(content, c))]
    }
}
public typealias LazyVStack = VStack

public struct HStack<Content: View>: View, _PrimitiveView {
    let alignment: VerticalAlignment, spacing: CGFloat?, content: Content
    public init(alignment: VerticalAlignment = .center, spacing: CGFloat? = nil, @ViewBuilder content: () -> Content) {
        self.alignment = alignment; self.spacing = spacing; self.content = content()
    }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        let c = ctx.copy(); c.parentAxis = "h"
        return [_Node("hstack", ctx.path, ["align": .s(alignment.name), "spacing": .opt(spacing)], _resolve(content, c))]
    }
}
public typealias LazyHStack = HStack

public struct ZStack<Content: View>: View, _PrimitiveView {
    let alignment: Alignment, content: Content
    public init(alignment: Alignment = .center, @ViewBuilder content: () -> Content) { self.alignment = alignment; self.content = content() }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        let c = ctx.copy(); c.parentAxis = "z"
        return [_Node("zstack", ctx.path, ["align": alignment.json], _resolve(content, c))]
    }
}

public struct GridItem: Sendable {
    public enum Size: Sendable { case fixed(CGFloat), flexible(minimum: CGFloat = 10, maximum: CGFloat = .infinity), adaptive(minimum: CGFloat, maximum: CGFloat = .infinity) }
    public var size: Size, spacing: CGFloat?
    public init(_ size: Size = .flexible(), spacing: CGFloat? = nil, alignment: Alignment? = nil) { self.size = size; self.spacing = spacing }
    var json: _J {
        switch size {
        case .fixed(let w): return .o(["kind": .s("fixed"), "v": .num(w)])
        case .flexible(let mn, _): return .o(["kind": .s("flex"), "v": .num(mn)])
        case .adaptive(let mn, _): return .o(["kind": .s("adaptive"), "v": .num(mn)])
        }
    }
}

public struct LazyVGrid<Content: View>: View, _PrimitiveView {
    let columns: [GridItem], spacing: CGFloat?, content: Content
    public init(columns: [GridItem], alignment: HorizontalAlignment = .center, spacing: CGFloat? = nil, pinnedViews: PinnedScrollableViews = .init(), @ViewBuilder content: () -> Content) {
        self.columns = columns; self.spacing = spacing; self.content = content()
    }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        [_Node("grid", ctx.path, ["cols": .a(columns.map(\.json)), "spacing": .opt(spacing)], _resolve(content, ctx))]
    }
}

public struct LazyHGrid<Content: View>: View, _PrimitiveView {
    let rows: [GridItem], content: Content
    public init(rows: [GridItem], alignment: VerticalAlignment = .center, spacing: CGFloat? = nil, pinnedViews: PinnedScrollableViews = .init(), @ViewBuilder content: () -> Content) {
        self.rows = rows; self.content = content()
    }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        let c = ctx.copy(); c.parentAxis = "h"
        return [_Node("hstack", ctx.path, ["align": .s("center")], _resolve(content, c))]
    }
}

public struct PinnedScrollableViews: OptionSet, Sendable {
    public let rawValue: Int
    public init(rawValue: Int = 0) { self.rawValue = rawValue }
    public static let sectionHeaders = PinnedScrollableViews(rawValue: 1)
    public static let sectionFooters = PinnedScrollableViews(rawValue: 2)
}

public struct Grid<Content: View>: View, _PrimitiveView {
    let content: Content
    public init(alignment: Alignment = .center, horizontalSpacing: CGFloat? = nil, verticalSpacing: CGFloat? = nil, @ViewBuilder content: () -> Content) { self.content = content() }
    public func _render(_ ctx: _Ctx) -> [_Node] { [_Node("vstack", ctx.path, ["align": .s("center")], _resolve(content, ctx))] }
}
public struct GridRow<Content: View>: View, _PrimitiveView {
    let content: Content
    public init(alignment: VerticalAlignment = .center, @ViewBuilder content: () -> Content) { self.content = content() }
    public func _render(_ ctx: _Ctx) -> [_Node] { [_Node("hstack", ctx.path, ["align": .s("center")], _resolve(content, ctx))] }
}

public struct ScrollView<Content: View>: View, _PrimitiveView {
    let axes: Axis.Set, content: Content
    public init(_ axes: Axis.Set = .vertical, showsIndicators: Bool = true, @ViewBuilder content: () -> Content) { self.axes = axes; self.content = content() }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        let horizontal = axes.contains(.horizontal) && !axes.contains(.vertical)
        let c = ctx.copy(); c.parentAxis = horizontal ? "h" : "v"
        return [_Node("scroll", ctx.path, ["axis": .s(horizontal ? "h" : "v")], _resolve(content, c))]
    }
}

public struct ScrollViewReader<Content: View>: View, _PrimitiveView {
    let content: (ScrollViewProxy) -> Content
    public init(@ViewBuilder content: @escaping (ScrollViewProxy) -> Content) { self.content = content }
    public func _render(_ ctx: _Ctx) -> [_Node] { _resolve(content(ScrollViewProxy()), ctx) }
}
public struct ScrollViewProxy {
    public func scrollTo<ID: Hashable>(_ id: ID, anchor: UnitPoint? = nil) {}
}

public struct GeometryProxy {
    public let size: CGSize
    public var safeAreaInsets: EdgeInsets { EdgeInsets() }
    public func frame(in space: CoordinateSpace) -> CGRect { CGRect(origin: .zero, size: size) }
}
public enum CoordinateSpace: Sendable { case global, local, named(String) }

public struct GeometryReader<Content: View>: View, _PrimitiveView {
    let content: (GeometryProxy) -> Content
    public init(@ViewBuilder content: @escaping (GeometryProxy) -> Content) { self.content = content }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        // the simulated device's screen minus status bar, navigation bar and home indicator
        [_Node("zstack", ctx.path, ["align": Alignment.topLeading.json, "fill": .b(true)], _resolve(content(GeometryProxy(size: CGSize(width: _screenSize.width, height: _screenSize.height - 152))), ctx))]
    }
}

// MARK: - Button

public struct Button<Label: View>: View, _PrimitiveView {
    let label: Label
    let role: ButtonRole?
    let action: @MainActor () -> Void
    public init(action: @escaping @MainActor () -> Void, @ViewBuilder label: () -> Label) { self.action = action; self.label = label(); role = nil }
    public init(role: ButtonRole?, action: @escaping @MainActor () -> Void, @ViewBuilder label: () -> Label) { self.action = action; self.label = label(); self.role = role }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        ctx.action(ctx.path, action)
        var p: [String: _J] = ["style": .s(ctx.env.buttonStyle), "shape": .s(ctx.env.buttonShape), "size": .s(ctx.env.controlSize)]
        if let role { p["role"] = .s(role == .destructive ? "destructive" : "cancel") }
        if !ctx.env.isEnabled { p["disabled"] = .b(true) }
        let inner = ctx.child("l")
        inner.dismissOnTap = nil
        if let custom = ctx.env.customButtonStyle {
            inner.env.customButtonStyle = nil
            inner.env.buttonStyle = "automatic"
            return [_Node("button", ctx.path, p, custom(AnyView(label), role)._render(inner))]
        }
        return [_Node("button", ctx.path, p, _resolve(label, inner))]
    }
}

extension Button where Label == Text {
    public init(_ titleKey: LocalizedStringKey, action: @escaping @MainActor () -> Void) { self.init(action: action) { Text(titleKey) } }
    public init(_ titleKey: LocalizedStringKey, role: ButtonRole?, action: @escaping @MainActor () -> Void) { self.init(role: role, action: action) { Text(titleKey) } }
    @_disfavoredOverload
    public init<S: StringProtocol>(_ title: S, action: @escaping @MainActor () -> Void) { self.init(action: action) { Text(title) } }
    @_disfavoredOverload
    public init<S: StringProtocol>(_ title: S, role: ButtonRole?, action: @escaping @MainActor () -> Void) { self.init(role: role, action: action) { Text(title) } }
}

extension Button where Label == SwiftUI.Label<Text, Image> {
    public init(_ titleKey: LocalizedStringKey, systemImage: String, action: @escaping @MainActor () -> Void) {
        self.init(action: action) { SwiftUI.Label(titleKey, systemImage: systemImage) }
    }
    public init(_ titleKey: LocalizedStringKey, systemImage: String, role: ButtonRole?, action: @escaping @MainActor () -> Void) {
        self.init(role: role, action: action) { SwiftUI.Label(titleKey, systemImage: systemImage) }
    }
    @_disfavoredOverload
    public init<S: StringProtocol>(_ title: S, systemImage: String, action: @escaping @MainActor () -> Void) {
        self.init(action: action) { SwiftUI.Label(title, systemImage: systemImage) }
    }
    @_disfavoredOverload
    public init<S: StringProtocol>(_ title: S, systemImage: String, role: ButtonRole?, action: @escaping @MainActor () -> Void) {
        self.init(role: role, action: action) { SwiftUI.Label(title, systemImage: systemImage) }
    }
}

/// Toggles the list's edit mode ("Edit" / "Done"), showing delete and move controls on its rows.
public struct EditButton: View, _PrimitiveView {
    public init() {}
    public func _render(_ ctx: _Ctx) -> [_Node] {
        let mode = _editModeBinding(ctx)
        let editing = mode.wrappedValue.isEditing
        ctx.action(ctx.path) { mode.wrappedValue = editing ? .inactive : .active }
        let title = editing ? _systemString("Done") : _systemString("Edit")
        var p: [String: _J] = ["style": .s("automatic")]
        if editing { p["bold"] = .b(true) }
        return [_Node("button", ctx.path, p, Text(verbatim: title)._render(ctx.child("l")))]
    }
}

/// The edit mode shared by the screen: an explicit `.environment(\.editMode, $mode)` or one kept per navigation screen.
@MainActor
func _editModeBinding(_ ctx: _Ctx) -> Binding<EditMode> {
    if let b = ctx.env.editMode { return b }
    let box = ctx.graph.box(ctx.env._editScope + "#editMode") { EditMode.inactive }
    return Binding(get: { box.value }, set: { box.value = $0; _Runtime.setNeedsRender() })
}

public struct Link<Label: View>: View, _PrimitiveView {
    let label: Label, url: URL
    public init(destination: URL, @ViewBuilder label: () -> Label) { self.url = destination; self.label = label() }
    public func _render(_ ctx: _Ctx) -> [_Node] { [_Node("button", ctx.path, ["link": .s(url.absoluteString)], _resolve(label, ctx.child("l")))] }
}
extension Link where Label == Text {
    public init(_ titleKey: LocalizedStringKey, destination: URL) { self.init(destination: destination) { Text(titleKey) } }
    @_disfavoredOverload
    public init<S: StringProtocol>(_ title: S, destination: URL) { self.init(destination: destination) { Text(title) } }
}

public struct ShareLink: View, _PrimitiveView {
    public init<T>(item: T, subject: Text? = nil, message: Text? = nil) {}
    public init<T>(_ title: String, item: T) {}
    public func _render(_ ctx: _Ctx) -> [_Node] { [_Node("symbol", ctx.path, ["name": .s("square.and.arrow.up"), "resizable": .b(false)])] }
}

// MARK: - Text input

public struct TextField: View, _PrimitiveView {
    let placeholder: String, text: Binding<String>, secure: Bool, multiline: Bool
    public init(_ titleKey: LocalizedStringKey, text: Binding<String>) { placeholder = titleKey.resolved(); self.text = text; secure = false; multiline = false }
    public init(_ titleKey: LocalizedStringKey, text: Binding<String>, prompt: Text?) { placeholder = prompt?._plain ?? titleKey.resolved(); self.text = text; secure = false; multiline = false }
    public init(_ titleKey: LocalizedStringKey, text: Binding<String>, axis: Axis) { placeholder = titleKey.resolved(); self.text = text; secure = false; multiline = axis == .vertical }
    public init(_ titleKey: LocalizedStringKey, text: Binding<String>, prompt: Text?, axis: Axis) { placeholder = prompt?._plain ?? titleKey.resolved(); self.text = text; secure = false; multiline = axis == .vertical }
    public init(_ titleKey: LocalizedStringKey, text: Binding<String>, onEditingChanged: @escaping (Bool) -> Void = { _ in }, onCommit: @escaping () -> Void = {}) { placeholder = titleKey.resolved(); self.text = text; secure = false; multiline = false }
    @_disfavoredOverload
    public init<S: StringProtocol>(_ title: S, text: Binding<String>) { placeholder = String(title); self.text = text; secure = false; multiline = false }
    @_disfavoredOverload
    public init<S: StringProtocol>(_ title: S, text: Binding<String>, prompt: Text?) { placeholder = prompt?._plain ?? String(title); self.text = text; secure = false; multiline = false }
    @_disfavoredOverload
    public init<S: StringProtocol>(_ title: S, text: Binding<String>, axis: Axis) { placeholder = String(title); self.text = text; secure = false; multiline = axis == .vertical }
    public init(text: Binding<String>, prompt: Text? = nil, @ViewBuilder label: () -> some View) { placeholder = prompt?._plain ?? ""; self.text = text; secure = false; multiline = false }
    public init<V>(_ titleKey: LocalizedStringKey, value: Binding<V>, format: some ParseableFormatStyle, prompt: Text? = nil) where V: LosslessStringConvertible {
        placeholder = prompt?._plain ?? titleKey.resolved()
        self.text = Binding(get: { String(value.wrappedValue) }, set: { if let v = V($0) { value.wrappedValue = v } })
        secure = false; multiline = false
    }
    public init<V: LosslessStringConvertible>(_ titleKey: LocalizedStringKey, value: Binding<V>, formatter: Formatter) {
        placeholder = titleKey.resolved()
        self.text = Binding(get: { String(value.wrappedValue) }, set: { if let v = V($0) { value.wrappedValue = v } })
        secure = false; multiline = false
    }
    /// `TextField("Age", value: $age, format: .number)` with an optional value
    public init<V>(_ titleKey: LocalizedStringKey, value: Binding<V?>, format: some ParseableFormatStyle, prompt: Text? = nil) where V: LosslessStringConvertible {
        placeholder = prompt?._plain ?? titleKey.resolved()
        self.text = Binding(get: { value.wrappedValue.map { String($0) } ?? "" }, set: { value.wrappedValue = $0.isEmpty ? nil : V($0) })
        secure = false; multiline = false
    }
    init(secure title: String, text: Binding<String>) { placeholder = title; self.text = text; secure = true; multiline = false }
    init(editor text: Binding<String>) { placeholder = ""; self.text = text; secure = false; multiline = true }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        let t = text
        ctx.graph.textSetters[ctx.path] = { t.wrappedValue = $0 }
        var p: [String: _J] = ["ph": .s(placeholder), "v": .s(text.wrappedValue), "style": .s(ctx.env.textFieldStyle)]
        if secure { p["secure"] = .b(true) }
        if multiline { p["multi"] = .b(true) }
        if !ctx.env.isEnabled { p["disabled"] = .b(true) }
        return [_Node("textfield", ctx.path, p)]
    }
}

public struct SecureField: View, _PrimitiveView {
    let field: TextField
    public init(_ titleKey: LocalizedStringKey, text: Binding<String>) { field = TextField(secure: titleKey.resolved(), text: text) }
    public init(_ titleKey: LocalizedStringKey, text: Binding<String>, prompt: Text?) { field = TextField(secure: prompt?._plain ?? titleKey.resolved(), text: text) }
    @_disfavoredOverload
    public init<S: StringProtocol>(_ title: S, text: Binding<String>) { field = TextField(secure: String(title), text: text) }
    public func _render(_ ctx: _Ctx) -> [_Node] { field._render(ctx) }
}

public struct TextEditor: View, _PrimitiveView {
    let field: TextField
    public init(text: Binding<String>) { field = TextField(editor: text) }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        var n = field._render(ctx)
        n[0].p["editor"] = .b(true)
        return n
    }
}

// MARK: - Controls

public struct Toggle<Label: View>: View, _PrimitiveView {
    let isOn: Binding<Bool>, label: Label
    public init(isOn: Binding<Bool>, @ViewBuilder label: () -> Label) { self.isOn = isOn; self.label = label() }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        let b = isOn
        ctx.graph.boolSetters[ctx.path] = { b.wrappedValue = $0 }
        return [_Node("toggle", ctx.path, ["on": .b(isOn.wrappedValue), "style": .s(ctx.env.toggleStyle), "hideLabel": .b(ctx.env.labelsHidden), "disabled": .b(!ctx.env.isEnabled)], _resolve(label, ctx.child("l")))]
    }
}
extension Toggle where Label == Text {
    public init(_ titleKey: LocalizedStringKey, isOn: Binding<Bool>) { self.init(isOn: isOn) { Text(titleKey) } }
    @_disfavoredOverload
    public init<S: StringProtocol>(_ title: S, isOn: Binding<Bool>) { self.init(isOn: isOn) { Text(title) } }
}
extension Toggle where Label == SwiftUI.Label<Text, Image> {
    public init(_ titleKey: LocalizedStringKey, systemImage: String, isOn: Binding<Bool>) { self.init(isOn: isOn) { SwiftUI.Label(titleKey, systemImage: systemImage) } }
}

public struct Slider: View, _PrimitiveView {
    let value: Binding<Double>, range: ClosedRange<Double>, step: Double?
    public init<V: BinaryFloatingPoint>(value: Binding<V>, in range: ClosedRange<V> = 0...1, step: V.Stride? = nil, onEditingChanged: @escaping (Bool) -> Void = { _ in }) where V.Stride: BinaryFloatingPoint {
        self.value = Binding(get: { Double(value.wrappedValue) }, set: { value.wrappedValue = V($0) })
        self.range = Double(range.lowerBound)...Double(range.upperBound)
        self.step = step.map { Double($0) }
    }
    public init<V: BinaryFloatingPoint, L: View>(value: Binding<V>, in range: ClosedRange<V> = 0...1, step: V.Stride? = nil, @ViewBuilder label: () -> L, onEditingChanged: @escaping (Bool) -> Void = { _ in }) where V.Stride: BinaryFloatingPoint {
        self.init(value: value, in: range, step: step)
    }
    public init<V: BinaryFloatingPoint, L: View, M: View>(value: Binding<V>, in range: ClosedRange<V> = 0...1, step: V.Stride? = nil, @ViewBuilder label: () -> L, @ViewBuilder minimumValueLabel: () -> M, @ViewBuilder maximumValueLabel: () -> M, onEditingChanged: @escaping (Bool) -> Void = { _ in }) where V.Stride: BinaryFloatingPoint {
        self.init(value: value, in: range, step: step)
    }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        let v = value
        ctx.graph.numSetters[ctx.path] = { v.wrappedValue = $0 }
        return [_Node("slider", ctx.path, ["v": .n(value.wrappedValue), "min": .n(range.lowerBound), "max": .n(range.upperBound), "step": step.map { .n($0) } ?? .null])]
    }
}

public struct Stepper<Label: View>: View, _PrimitiveView {
    let label: Label
    let inc: @MainActor () -> Void, dec: @MainActor () -> Void
    public init(@ViewBuilder label: () -> Label, onIncrement: (@MainActor () -> Void)?, onDecrement: (@MainActor () -> Void)?) {
        self.label = label(); inc = onIncrement ?? {}; dec = onDecrement ?? {}
    }
    public init<V: Strideable>(value: Binding<V>, in range: ClosedRange<V>, step: V.Stride = 1, @ViewBuilder label: () -> Label) {
        self.label = label()
        inc = { value.wrappedValue = min(range.upperBound, value.wrappedValue.advanced(by: step)) }
        dec = { value.wrappedValue = max(range.lowerBound, value.wrappedValue.advanced(by: -step)) }
    }
    public init<V: Strideable>(value: Binding<V>, step: V.Stride = 1, @ViewBuilder label: () -> Label) {
        self.label = label()
        inc = { value.wrappedValue = value.wrappedValue.advanced(by: step) }
        dec = { value.wrappedValue = value.wrappedValue.advanced(by: -step) }
    }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        ctx.action(ctx.path + "+", inc)
        ctx.action(ctx.path + "-", dec)
        return [_Node("stepper", ctx.path, [:], _resolve(label, ctx.child("l")))]
    }
}
extension Stepper where Label == Text {
    public init<V: Strideable>(_ titleKey: LocalizedStringKey, value: Binding<V>, in range: ClosedRange<V>, step: V.Stride = 1) {
        self.init(value: value, in: range, step: step) { Text(titleKey) }
    }
    public init<V: Strideable>(_ titleKey: LocalizedStringKey, value: Binding<V>, step: V.Stride = 1) {
        self.init(value: value, step: step) { Text(titleKey) }
    }
    public init(_ titleKey: LocalizedStringKey, onIncrement: (@MainActor () -> Void)?, onDecrement: (@MainActor () -> Void)?) {
        self.init(label: { Text(titleKey) }, onIncrement: onIncrement, onDecrement: onDecrement)
    }
    @_disfavoredOverload
    public init<S: StringProtocol, V: Strideable>(_ title: S, value: Binding<V>, in range: ClosedRange<V>, step: V.Stride = 1) {
        self.init(value: value, in: range, step: step) { Text(title) }
    }
    @_disfavoredOverload
    public init<S: StringProtocol, V: Strideable>(_ title: S, value: Binding<V>, step: V.Stride = 1) {
        self.init(value: value, step: step) { Text(title) }
    }
}

public struct ProgressView: View, _PrimitiveView {
    let value: Double?, total: Double, title: String?
    public init() { value = nil; total = 1; title = nil }
    public init(_ titleKey: LocalizedStringKey) { value = nil; total = 1; title = titleKey.resolved() }
    @_disfavoredOverload
    public init<S: StringProtocol>(_ title: S) { value = nil; total = 1; self.title = String(title) }
    public init<V: BinaryFloatingPoint>(value: V?, total: V = 1) { self.value = value.map { Double($0) }; self.total = Double(total); title = nil }
    public init<V: BinaryFloatingPoint>(_ titleKey: LocalizedStringKey, value: V?, total: V = 1) { self.value = value.map { Double($0) }; self.total = Double(total); title = titleKey.resolved() }
    @_disfavoredOverload
    public init<S: StringProtocol, V: BinaryFloatingPoint>(_ title: S, value: V?, total: V = 1) { self.value = value.map { Double($0) }; self.total = Double(total); self.title = String(title) }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        [_Node("progress", ctx.path, ["v": value.map { .n($0 / max(total, 0.000001)) } ?? .null, "title": title.map { .s($0) } ?? .null, "style": .s(ctx.env.progressStyle)])]
    }
}

public struct Gauge: View, _PrimitiveView {
    let value: Double
    public init<V: BinaryFloatingPoint, L: View>(value: V, in range: ClosedRange<V> = 0...1, @ViewBuilder label: () -> L) {
        self.value = Double((value - range.lowerBound) / (range.upperBound - range.lowerBound))
    }
    public func _render(_ ctx: _Ctx) -> [_Node] { [_Node("progress", ctx.path, ["v": .n(value)])] }
}

public struct DatePicker<Label: View>: View, _PrimitiveView {
    let selection: Binding<Date>, label: Label, components: DatePickerComponents
    var minDate: Date? = nil, maxDate: Date? = nil
    public init(selection: Binding<Date>, displayedComponents: DatePickerComponents = [.date, .hourAndMinute], @ViewBuilder label: () -> Label) {
        self.selection = selection; self.label = label(); components = displayedComponents
    }
    public init(selection: Binding<Date>, in range: ClosedRange<Date>, displayedComponents: DatePickerComponents = [.date, .hourAndMinute], @ViewBuilder label: () -> Label) {
        self.init(selection: selection, displayedComponents: displayedComponents, label: label)
        minDate = range.lowerBound; maxDate = range.upperBound
    }
    public init(selection: Binding<Date>, in range: PartialRangeFrom<Date>, displayedComponents: DatePickerComponents = [.date, .hourAndMinute], @ViewBuilder label: () -> Label) {
        self.init(selection: selection, displayedComponents: displayedComponents, label: label)
        minDate = range.lowerBound
    }
    public init(selection: Binding<Date>, in range: PartialRangeThrough<Date>, displayedComponents: DatePickerComponents = [.date, .hourAndMinute], @ViewBuilder label: () -> Label) {
        self.init(selection: selection, displayedComponents: displayedComponents, label: label)
        maxDate = range.upperBound
    }
    static var _iso: ISO8601DateFormatter {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withFullDate, .withTime, .withColonSeparatorInTime, .withDashSeparatorInDate]
        f.timeZone = .current
        return f
    }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        let sel = selection
        let lo = minDate, hi = maxDate
        ctx.graph.textSetters[ctx.path] = { s in
            guard var d = DatePicker._iso.date(from: s) else { return }
            // the wheel can't scroll past the allowed range
            if let lo, d < lo { d = lo }
            if let hi, d > hi { d = hi }
            sel.wrappedValue = d
        }
        let kind = components.contains(.date) && components.contains(.hourAndMinute) ? "datetime" : components.contains(.date) ? "date" : "time"
        let f = DatePicker._iso
        var p: [String: _J] = ["v": .s(f.string(from: selection.wrappedValue)), "kind": .s(kind), "hideLabel": .b(ctx.env.labelsHidden)]
        if let minDate { p["min"] = .s(f.string(from: minDate)) }
        if let maxDate { p["max"] = .s(f.string(from: maxDate)) }
        // the compact picker shows the date in the simulator's language
        let df = DateFormatter()
        df.locale = ctx.env.locale
        df.dateStyle = components.contains(.date) ? .medium : .none
        df.timeStyle = components.contains(.hourAndMinute) ? .short : .none
        p["display"] = .s(df.string(from: selection.wrappedValue))
        if !ctx.env.isEnabled { p["disabled"] = .b(true) }
        return [_Node("datepicker", ctx.path, p, _resolve(label, ctx.child("l")))]
    }
}
extension DatePicker where Label == Text {
    public init(_ titleKey: LocalizedStringKey, selection: Binding<Date>, displayedComponents: DatePickerComponents = [.date, .hourAndMinute]) {
        self.init(selection: selection, displayedComponents: displayedComponents) { Text(titleKey) }
    }
    public init(_ titleKey: LocalizedStringKey, selection: Binding<Date>, in range: ClosedRange<Date>, displayedComponents: DatePickerComponents = [.date, .hourAndMinute]) {
        self.init(selection: selection, in: range, displayedComponents: displayedComponents) { Text(titleKey) }
    }
    public init(_ titleKey: LocalizedStringKey, selection: Binding<Date>, in range: PartialRangeFrom<Date>, displayedComponents: DatePickerComponents = [.date, .hourAndMinute]) {
        self.init(selection: selection, in: range, displayedComponents: displayedComponents) { Text(titleKey) }
    }
    public init(_ titleKey: LocalizedStringKey, selection: Binding<Date>, in range: PartialRangeThrough<Date>, displayedComponents: DatePickerComponents = [.date, .hourAndMinute]) {
        self.init(selection: selection, in: range, displayedComponents: displayedComponents) { Text(titleKey) }
    }
    @_disfavoredOverload
    public init<S: StringProtocol>(_ title: S, selection: Binding<Date>, displayedComponents: DatePickerComponents = [.date, .hourAndMinute]) {
        self.init(selection: selection, displayedComponents: displayedComponents) { Text(title) }
    }
    @_disfavoredOverload
    public init<S: StringProtocol>(_ title: S, selection: Binding<Date>, in range: ClosedRange<Date>, displayedComponents: DatePickerComponents = [.date, .hourAndMinute]) {
        self.init(selection: selection, in: range, displayedComponents: displayedComponents) { Text(title) }
    }
    @_disfavoredOverload
    public init<S: StringProtocol>(_ title: S, selection: Binding<Date>, in range: PartialRangeFrom<Date>, displayedComponents: DatePickerComponents = [.date, .hourAndMinute]) {
        self.init(selection: selection, in: range, displayedComponents: displayedComponents) { Text(title) }
    }
    @_disfavoredOverload
    public init<S: StringProtocol>(_ title: S, selection: Binding<Date>, in range: PartialRangeThrough<Date>, displayedComponents: DatePickerComponents = [.date, .hourAndMinute]) {
        self.init(selection: selection, in: range, displayedComponents: displayedComponents) { Text(title) }
    }
}
public struct DatePickerComponents: OptionSet, Sendable {
    public let rawValue: Int
    public init(rawValue: Int) { self.rawValue = rawValue }
    public static let date = DatePickerComponents(rawValue: 1)
    public static let hourAndMinute = DatePickerComponents(rawValue: 2)
}

public struct ColorPicker: View, _PrimitiveView {
    let title: String
    public init(_ title: String, selection: Binding<Color>, supportsOpacity: Bool = true) { self.title = title }
    public func _render(_ ctx: _Ctx) -> [_Node] { Text(title)._render(ctx) }
}

public struct Picker<SelectionValue: Hashable, Label: View, Content: View>: View, _PrimitiveView {
    let selection: Binding<SelectionValue>, label: Label, content: Content
    public init(selection: Binding<SelectionValue>, @ViewBuilder content: () -> Content, @ViewBuilder label: () -> Label) {
        self.selection = selection; self.content = content(); self.label = label()
    }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        let options = _resolve(content, ctx.child("o"))
        let current = AnyHashable(selection.wrappedValue)
        var idx = -1
        for (i, o) in options.enumerated() where o.tag == current { idx = i }
        let sel = selection
        let tags = options.map(\.tag)
        ctx.graph.indexSetters[ctx.path] = { i in
            guard tags.indices.contains(i), let t = tags[i]?.base as? SelectionValue else { return }
            sel.wrappedValue = t
        }
        let opts: [_J] = options.map { .s($0.plainText) }
        return [_Node("picker", ctx.path, ["opts": .a(opts), "sel": .int(idx), "style": .s(ctx.env.pickerStyle), "hideLabel": .b(ctx.env.labelsHidden)], _resolve(label, ctx.child("l")))]
    }
}
extension Picker where Label == Text {
    public init(_ titleKey: LocalizedStringKey, selection: Binding<SelectionValue>, @ViewBuilder content: () -> Content) {
        self.init(selection: selection, content: content) { Text(titleKey) }
    }
    @_disfavoredOverload
    public init<S: StringProtocol>(_ title: S, selection: Binding<SelectionValue>, @ViewBuilder content: () -> Content) {
        self.init(selection: selection, content: content) { Text(title) }
    }
}

// MARK: - ForEach

public struct ForEach<Data: RandomAccessCollection, ID: Hashable, Content: View>: View, _PrimitiveView {
    let data: Data
    let idFor: (Data.Element) -> ID
    let content: (Data.Element) -> Content
    var onDeleteAction: ((IndexSet) -> Void)?
    var onMoveAction: ((IndexSet, Int) -> Void)?

    public init(_ data: Data, id: KeyPath<Data.Element, ID>, @ViewBuilder content: @escaping (Data.Element) -> Content) {
        self.data = data; self.idFor = { $0[keyPath: id] }; self.content = content
    }

    public func onDelete(perform action: ((IndexSet) -> Void)?) -> ForEach { var f = self; f.onDeleteAction = action; return f }
    public func onMove(perform action: ((IndexSet, Int) -> Void)?) -> ForEach { var f = self; f.onMoveAction = action; return f }

    public func _render(_ ctx: _Ctx) -> [_Node] {
        var out: [_Node] = []
        for (i, element) in data.enumerated() {
            let nodes = _resolve(content(element), ctx.child("[\(idFor(element))]"))
            if let del = onDeleteAction {
                ctx.action(ctx.path + "~del\(i)") { del(IndexSet(integer: i)); _Runtime.setNeedsRender() }
                for n in nodes { n.m.append(["k": .s("deletable"), "id": .s(ctx.path + "~del\(i)")]) }
            }
            out += nodes
        }
        return out
    }
}

extension ForEach where Data.Element: Identifiable, ID == Data.Element.ID {
    public init(_ data: Data, @ViewBuilder content: @escaping (Data.Element) -> Content) {
        self.init(data, id: \.id, content: content)
    }
}

extension ForEach where Data == Range<Int>, ID == Int {
    public init(_ data: Range<Int>, @ViewBuilder content: @escaping (Int) -> Content) {
        self.init(data, id: \.self, content: content)
    }
}

/// `ForEach($items) { $item in … }`
extension ForEach {
    public init<C: MutableCollection & RandomAccessCollection>(_ data: Binding<C>, @ViewBuilder content: @escaping (Binding<C.Element>) -> Content)
    where C.Element: Identifiable, C.Index: Hashable, Data == [Binding<C.Element>], ID == C.Element.ID {
        let bindings: [Binding<C.Element>] = data.wrappedValue.indices.map { idx in
            Binding(get: { data.wrappedValue[idx] }, set: { data.wrappedValue[idx] = $0 })
        }
        self.init(bindings, id: \.wrappedValue.id, content: content)
    }
}

// MARK: - List / Form / Section

public struct List<Content: View>: View, _PrimitiveView {
    let content: Content
    public init(@ViewBuilder content: () -> Content) { self.content = content() }
    public init<S: Hashable>(selection: Binding<S?>?, @ViewBuilder content: () -> Content) { self.content = content() }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        let c = ctx.copy(); c.parentAxis = "list"
        var p: [String: _J] = ["style": .s(ctx.env.listStyle)]
        if _editModeBinding(ctx).wrappedValue.isEditing { p["editing"] = .b(true) }
        return [_Node("list", ctx.path, p, _resolve(content, c))]
    }
}

extension List {
    public init<Data: RandomAccessCollection, RowContent: View>(_ data: Data, @ViewBuilder rowContent: @escaping (Data.Element) -> RowContent)
    where Content == ForEach<Data, Data.Element.ID, RowContent>, Data.Element: Identifiable {
        self.init { ForEach(data, content: rowContent) }
    }
    public init<Data: RandomAccessCollection, ID: Hashable, RowContent: View>(_ data: Data, id: KeyPath<Data.Element, ID>, @ViewBuilder rowContent: @escaping (Data.Element) -> RowContent)
    where Content == ForEach<Data, ID, RowContent> {
        self.init { ForEach(data, id: id, content: rowContent) }
    }
    public init<RowContent: View>(_ data: Range<Int>, @ViewBuilder rowContent: @escaping (Int) -> RowContent)
    where Content == ForEach<Range<Int>, Int, RowContent> {
        self.init { ForEach(data, content: rowContent) }
    }
}

public struct Form<Content: View>: View, _PrimitiveView {
    let content: Content
    public init(@ViewBuilder content: () -> Content) { self.content = content() }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        let c = ctx.copy(); c.parentAxis = "list"
        return [_Node("list", ctx.path, ["style": .s("insetGrouped"), "form": .b(true)], _resolve(content, c))]
    }
}

public struct Section<Parent: View, Content: View, Footer: View>: View, _PrimitiveView {
    let header: Parent, content: Content, footer: Footer
    public init(@ViewBuilder content: () -> Content, @ViewBuilder header: () -> Parent, @ViewBuilder footer: () -> Footer) {
        self.content = content(); self.header = header(); self.footer = footer()
    }
    public init(header: Parent, footer: Footer, @ViewBuilder content: () -> Content) {
        self.header = header; self.footer = footer; self.content = content()
    }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        let c = ctx.child("c"); c.parentAxis = "list"
        return [_Node("section", ctx.path, [
            "header": .nodes(_resolve(header, ctx.child("h"))),
            "footer": .nodes(_resolve(footer, ctx.child("f"))),
        ], _resolve(content, c))]
    }
}
extension Section where Parent == EmptyView, Footer == EmptyView {
    public init(@ViewBuilder content: () -> Content) { self.init(content: content, header: { EmptyView() }, footer: { EmptyView() }) }
}
extension Section where Parent == Text, Footer == EmptyView {
    public init(_ titleKey: LocalizedStringKey, @ViewBuilder content: () -> Content) { self.init(content: content, header: { Text(titleKey) }, footer: { EmptyView() }) }
    public init(_ titleKey: LocalizedStringKey, isExpanded: Binding<Bool>, @ViewBuilder content: () -> Content) { self.init(titleKey, content: content) }
    @_disfavoredOverload
    public init<S: StringProtocol>(_ title: S, @ViewBuilder content: () -> Content) { self.init(content: content, header: { Text(title) }, footer: { EmptyView() }) }
}
extension Section where Footer == EmptyView {
    public init(header: Parent, @ViewBuilder content: () -> Content) { self.init(content: content, header: { header }, footer: { EmptyView() }) }
    public init(@ViewBuilder content: () -> Content, @ViewBuilder header: () -> Parent) { self.init(content: content, header: header, footer: { EmptyView() }) }
}
extension Section where Parent == EmptyView {
    public init(footer: Footer, @ViewBuilder content: () -> Content) { self.init(content: content, header: { EmptyView() }, footer: { footer }) }
    public init(@ViewBuilder content: () -> Content, @ViewBuilder footer: () -> Footer) { self.init(content: content, header: { EmptyView() }, footer: footer) }
}

public struct DisclosureGroup<Label: View, Content: View>: View, _PrimitiveView {
    let label: Label, content: Content
    @State var expanded = false
    public init(@ViewBuilder content: () -> Content, @ViewBuilder label: () -> Label) { self.content = content(); self.label = label() }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        _installDynamicProperties(self, ctx)
        let s = $expanded
        ctx.action(ctx.path, { s.wrappedValue.toggle() })
        return [_Node("disclosure", ctx.path, ["open": .b(expanded), "label": .nodes(_resolve(label, ctx.child("l")))], expanded ? _resolve(content, ctx.child("c")) : [])]
    }
}
extension DisclosureGroup where Label == Text {
    public init(_ title: String, @ViewBuilder content: () -> Content) { self.init(content: content) { Text(title) } }
}

public struct ContentUnavailableView: View, _PrimitiveView {
    let title: String, image: String?, desc: String?
    public init(_ titleKey: LocalizedStringKey, systemImage: String, description: Text? = nil) {
        title = titleKey.resolved(); image = systemImage; desc = description?._plain
    }
    @_disfavoredOverload
    public init<S: StringProtocol>(_ title: S, systemImage: String, description: Text? = nil) {
        self.title = String(title); image = systemImage; desc = description?._plain
    }
    public static var search: ContentUnavailableView { ContentUnavailableView("No Results", systemImage: "magnifyingglass") }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        var kids: [_Node] = []
        if let image { kids.append(_Node("symbol", ctx.path + "/i", ["name": .s(image), "size": .n(48)])) }
        kids.append(_Node("text", ctx.path + "/t", ["segs": .a([.o(["s": .s(title), "st": .o(["fontSize": .s("22px"), "fontWeight": .s("700")])])])]))
        if let desc { kids.append(_Node("text", ctx.path + "/d", ["segs": .a([.o(["s": .s(desc), "st": .o(["color": .s("var(--label2)")])])])])) }
        return [_Node("vstack", ctx.path, ["align": .s("center"), "spacing": .n(8), "unavailable": .b(true)], kids)]
    }
}

// MARK: - Color / gradient as views

extension Color: View, _PrimitiveView {
    public func _render(_ ctx: _Ctx) -> [_Node] { [_Node("color", ctx.path, ["c": .s(css)])] }
}

// MARK: - Menus

public struct Menu<Label: View, Content: View>: View, _PrimitiveView {
    let label: Label, content: Content
    public init(@ViewBuilder content: () -> Content, @ViewBuilder label: () -> Label) { self.content = content(); self.label = label() }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        [_Node("menu", ctx.path, ["items": .nodes(_resolve(content, ctx.child("items")))], _resolve(label, ctx.child("l")))]
    }
}
extension Menu where Label == Text {
    public init(_ titleKey: LocalizedStringKey, @ViewBuilder content: () -> Content) { self.init(content: content) { Text(titleKey) } }
    @_disfavoredOverload
    public init<S: StringProtocol>(_ title: S, @ViewBuilder content: () -> Content) { self.init(content: content) { Text(title) } }
}
extension Menu where Label == SwiftUI.Label<Text, Image> {
    public init(_ titleKey: LocalizedStringKey, systemImage: String, @ViewBuilder content: () -> Content) { self.init(content: content) { SwiftUI.Label(titleKey, systemImage: systemImage) } }
}
