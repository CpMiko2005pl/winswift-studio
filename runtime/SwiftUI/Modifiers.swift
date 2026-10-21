// View modifiers. Each modifier wraps its content and appends a JSON description that the simulator
// applies in order (outermost last), which mirrors SwiftUI's modifier semantics.

public struct _ModifiedView<Content: View>: View, _PrimitiveView {
    let content: Content
    let key: String
    let env: ((inout EnvironmentValues) -> Void)?
    let make: @MainActor (_Ctx) -> [String: _J]?

    init(content: Content, key: String, env: ((inout EnvironmentValues) -> Void)? = nil, make: @escaping @MainActor (_Ctx) -> [String: _J]?) {
        self.content = content; self.key = key; self.env = env; self.make = make
    }

    public func _render(_ ctx: _Ctx) -> [_Node] {
        let c = ctx.child("." + key)
        if let env { env(&c.env) }
        let nodes = _resolve(content, c)
        if var mod = make(c) {
            mod["k"] = .s(key)
            for n in nodes { n.m.append(mod) }
        }
        return nodes
    }
}

struct _TagView<Content: View>: View, _PrimitiveView {
    let content: Content, tag: AnyHashable
    func _render(_ ctx: _Ctx) -> [_Node] {
        let nodes = _resolve(content, ctx)
        if nodes.count == 1 { nodes[0].tag = tag; return nodes }
        let g = _Node("group", ctx.path, [:], nodes)
        g.tag = tag
        return [g]
    }
}

extension View {
    func _mod(_ key: String, _ json: [String: _J]) -> _ModifiedView<Self> { _ModifiedView(content: self, key: key) { _ in json } }
    func _env(_ key: String, _ change: @escaping (inout EnvironmentValues) -> Void) -> _ModifiedView<Self> {
        _ModifiedView(content: self, key: key, env: change) { _ in nil }
    }
}

func _edges(_ e: Edge.Set) -> _J {
    .a([e.contains(.top), e.contains(.leading), e.contains(.bottom), e.contains(.trailing)].map { .b($0) })
}

// MARK: - Layout

extension View {
    public func padding(_ edges: Edge.Set = .all, _ length: CGFloat? = nil) -> some View {
        _mod("padding", ["edges": _edges(edges), "v": .opt(length)])
    }
    public func padding(_ length: CGFloat) -> some View { padding(.all, length) }
    public func padding(_ insets: EdgeInsets) -> some View {
        _mod("paddingInsets", ["t": .num(insets.top), "l": .num(insets.leading), "b": .num(insets.bottom), "r": .num(insets.trailing)])
    }
    public func frame(width: CGFloat? = nil, height: CGFloat? = nil, alignment: Alignment = .center) -> some View {
        _mod("frame", ["w": .opt(width), "h": .opt(height), "align": alignment.json])
    }
    public func frame(minWidth: CGFloat? = nil, idealWidth: CGFloat? = nil, maxWidth: CGFloat? = nil, minHeight: CGFloat? = nil, idealHeight: CGFloat? = nil, maxHeight: CGFloat? = nil, alignment: Alignment = .center) -> some View {
        _mod("frame", ["minW": .opt(minWidth), "maxW": .opt(maxWidth), "minH": .opt(minHeight), "maxH": .opt(maxHeight), "align": alignment.json])
    }
    public func fixedSize() -> some View { _mod("fixedSize", [:]) }
    public func fixedSize(horizontal: Bool, vertical: Bool) -> some View { _mod("fixedSize", [:]) }
    public func layoutPriority(_ p: Double) -> some View { _mod("layoutPriority", ["v": .n(p)]) }
    public func offset(x: CGFloat = 0, y: CGFloat = 0) -> some View { _mod("offset", ["x": .num(x), "y": .num(y)]) }
    public func offset(_ size: CGSize) -> some View { offset(x: size.width, y: size.height) }
    public func position(x: CGFloat = 0, y: CGFloat = 0) -> some View { _mod("position", ["x": .num(x), "y": .num(y)]) }
    public func position(_ p: CGPoint) -> some View { position(x: p.x, y: p.y) }
    public func aspectRatio(_ ratio: CGFloat? = nil, contentMode: ContentMode) -> some View {
        _mod("aspect", ["r": .opt(ratio), "mode": .s(contentMode == .fit ? "fit" : "fill")])
    }
    public func aspectRatio(_ size: CGSize, contentMode: ContentMode) -> some View { aspectRatio(size.width / size.height, contentMode: contentMode) }
    public func scaledToFit() -> some View { aspectRatio(nil, contentMode: .fit) }
    public func scaledToFill() -> some View { aspectRatio(nil, contentMode: .fill) }
    public func ignoresSafeArea(_ regions: SafeAreaRegions = .all, edges: Edge.Set = .all) -> some View { _mod("ignoresSafeArea", [:]) }
    public func edgesIgnoringSafeArea(_ edges: Edge.Set) -> some View { _mod("ignoresSafeArea", [:]) }
    public func safeAreaInset<V: View>(edge: VerticalEdge, alignment: HorizontalAlignment = .center, spacing: CGFloat? = nil, @ViewBuilder content: () -> V) -> some View {
        let v = AnyView(content())
        return _ModifiedView(content: self, key: "safeAreaInset") { ctx in ["v": .nodes(v._render(ctx.child("inset"))), "edge": .s(edge == .top ? "top" : "bottom")] }
    }
    public func zIndex(_ z: Double) -> some View { _mod("zIndex", ["v": .n(z)]) }
    public func containerRelativeFrame(_ axes: Axis.Set, alignment: Alignment = .center) -> some View {
        _mod("frame", ["maxW": axes.contains(.horizontal) ? .s("inf") : .null, "maxH": axes.contains(.vertical) ? .s("inf") : .null, "align": alignment.json])
    }
}

public struct SafeAreaRegions: OptionSet, Sendable {
    public let rawValue: Int
    public init(rawValue: Int) { self.rawValue = rawValue }
    public static let all = SafeAreaRegions(rawValue: 3), container = SafeAreaRegions(rawValue: 1), keyboard = SafeAreaRegions(rawValue: 2)
}
public enum VerticalEdge: Sendable { case top, bottom }

// MARK: - Appearance

extension View {
    public func foregroundColor(_ color: Color?) -> some View { _mod("fg", ["v": color.map { .s($0.css) } ?? .null]) }
    public func foregroundStyle<S: ShapeStyle>(_ style: S) -> some View { _mod("fg", ["v": style._css]) }
    public func foregroundStyle<S1: ShapeStyle, S2: ShapeStyle>(_ primary: S1, _ secondary: S2) -> some View { _mod("fg", ["v": primary._css]) }
    public func tint(_ color: Color?) -> some View { _mod("tint", ["v": color.map { .s($0.css) } ?? .null]) }
    public func tint<S: ShapeStyle>(_ style: S?) -> some View { _mod("tint", ["v": style?._css ?? .null]) }
    public func accentColor(_ color: Color?) -> some View { tint(color) }

    public func background(_ color: Color) -> some View { _mod("bg", ["v": .s(color.css)]) }
    public func background(_ g: LinearGradient) -> some View { _mod("bg", ["v": g._css]) }
    public func background<S: ShapeStyle>(_ style: S, ignoresSafeAreaEdges edges: Edge.Set = .all) -> some View { _mod("bg", ["v": style._css]) }
    public func background<S: ShapeStyle, T: Shape>(_ style: S, in shape: T, fillStyle: FillStyle = FillStyle()) -> some View {
        _mod("bg", ["v": style._css, "shape": .s(shape._shapeName), "r": shape._shapeArgs["r"] ?? .null])
    }
    public func background<T: Shape>(in shape: T, fillStyle: FillStyle = FillStyle()) -> some View {
        _mod("bg", ["v": .s("var(--bg2)"), "shape": .s(shape._shapeName), "r": shape._shapeArgs["r"] ?? .null])
    }
    public func background<V: View>(alignment: Alignment = .center, @ViewBuilder content: () -> V) -> some View {
        let v = AnyView(content())
        return _ModifiedView(content: self, key: "bgView") { ctx in ["v": .nodes(v._render(ctx.child("bg"))), "align": alignment.json] }
    }
    public func background<V: View>(_ view: V, alignment: Alignment = .center) -> some View {
        background(alignment: alignment) { view }
    }

    public func overlay(_ color: Color) -> some View {
        overlay(alignment: .center) { color }
    }
    public func overlay<V: View>(alignment: Alignment = .center, @ViewBuilder content: () -> V) -> some View {
        let v = AnyView(content())
        return _ModifiedView(content: self, key: "overlay") { ctx in ["v": .nodes(v._render(ctx.child("ov"))), "align": alignment.json] }
    }
    public func overlay<V: View>(_ view: V, alignment: Alignment = .center) -> some View { overlay(alignment: alignment) { view } }
    public func overlay<S: ShapeStyle, T: Shape>(_ style: S, in shape: T) -> some View { overlay(alignment: .center) { shape.fill(style) } }

    public func cornerRadius(_ r: CGFloat, antialiased: Bool = true) -> some View { _mod("clip", ["shape": .s("rect"), "r": .num(r)]) }
    public func clipShape<S: Shape>(_ shape: S, style: FillStyle = FillStyle()) -> some View {
        _mod("clip", ["shape": .s(shape._shapeName), "r": shape._shapeArgs["r"] ?? .null])
    }
    public func clipped(antialiased: Bool = false) -> some View { _mod("clip", ["shape": .s("rect")]) }
    public func mask<M: View>(alignment: Alignment = .center, @ViewBuilder _ mask: () -> M) -> some View { self }
    public func contentShape<S: Shape>(_ shape: S, eoFill: Bool = false) -> some View { self }
    public func opacity(_ o: Double) -> some View { _mod("opacity", ["v": .n(o)]) }
    public func shadow(color: Color = Color(red: 0, green: 0, blue: 0, opacity: 0.33), radius: CGFloat, x: CGFloat = 0, y: CGFloat = 0) -> some View {
        _mod("shadow", ["c": .s(color.css), "r": .num(radius), "x": .num(x), "y": .num(y)])
    }
    public func border<S: ShapeStyle>(_ content: S, width: CGFloat = 1) -> some View { _mod("border", ["v": content._css, "w": .num(width)]) }
    public func rotationEffect(_ angle: Angle, anchor: UnitPoint = .center) -> some View { _mod("rotate", ["v": .n(angle.degrees)]) }
    public func rotation3DEffect(_ angle: Angle, axis: (x: CGFloat, y: CGFloat, z: CGFloat), anchor: UnitPoint = .center, perspective: CGFloat = 1) -> some View {
        _mod("rotate3d", ["v": .n(angle.degrees), "x": .num(axis.x), "y": .num(axis.y), "z": .num(axis.z)])
    }
    public func scaleEffect(_ s: CGFloat, anchor: UnitPoint = .center) -> some View { _mod("scale", ["x": .num(s), "y": .num(s)]) }
    public func scaleEffect(x: CGFloat = 1, y: CGFloat = 1, anchor: UnitPoint = .center) -> some View { _mod("scale", ["x": .num(x), "y": .num(y)]) }
    public func scaleEffect(_ s: CGSize, anchor: UnitPoint = .center) -> some View { scaleEffect(x: s.width, y: s.height) }
    public func blur(radius: CGFloat, opaque: Bool = false) -> some View { _mod("filter", ["v": .s("blur(\(radius)px)")]) }
    public func brightness(_ v: Double) -> some View { _mod("filter", ["v": .s("brightness(\(1 + v))")]) }
    public func contrast(_ v: Double) -> some View { _mod("filter", ["v": .s("contrast(\(v))")]) }
    public func saturation(_ v: Double) -> some View { _mod("filter", ["v": .s("saturate(\(v))")]) }
    public func grayscale(_ v: Double) -> some View { _mod("filter", ["v": .s("grayscale(\(v))")]) }
    public func hueRotation(_ a: Angle) -> some View { _mod("filter", ["v": .s("hue-rotate(\(a.degrees)deg)")]) }
    public func colorInvert() -> some View { _mod("filter", ["v": .s("invert(1)")]) }
    public func hidden() -> some View { _mod("hidden", [:]) }
    public func preferredColorScheme(_ scheme: ColorScheme?) -> some View {
        _mod("scheme", ["v": scheme.map { .s($0 == .dark ? "dark" : "light") } ?? .null])
    }
    public func colorScheme(_ scheme: ColorScheme) -> some View { preferredColorScheme(scheme) }
    public func statusBarHidden(_ hidden: Bool = true) -> some View { self }
    public func persistentSystemOverlays(_ v: Visibility) -> some View { self }
    public func badge(_ count: Int) -> some View { _mod("badge", ["v": count == 0 ? .null : .s(String(count))]) }
    public func badge(_ label: String?) -> some View { _mod("badge", ["v": label.map { .s($0) } ?? .null]) }
    public func symbolVariant(_ v: SymbolVariants) -> some View { _mod("symbolVariant", ["v": .s(v.name)]) }
    public func symbolEffect<E>(_ effect: E, options: Int = 0, value: some Equatable) -> some View { self }
    public func symbolEffect<E>(_ effect: E, options: Int = 0, isActive: Bool = true) -> some View { self }
    public func imageScale(_ scale: Image.Scale) -> some View {
        _mod("imageScale", ["v": .s(scale == .small ? "small" : scale == .large ? "large" : "medium")])
    }
    public func redacted(reason: RedactionReasons) -> some View { self }
    public func privacySensitive(_ s: Bool = true) -> some View { self }
}

public struct FillStyle: Sendable { public init(eoFill: Bool = false, antialiased: Bool = true) {} }
public struct RedactionReasons: OptionSet, Sendable {
    public let rawValue: Int
    public init(rawValue: Int) { self.rawValue = rawValue }
    public static let placeholder = RedactionReasons(rawValue: 1)
}
public struct SymbolVariants: Sendable {
    let name: String
    public static let none = SymbolVariants(name: ""), fill = SymbolVariants(name: "fill"), circle = SymbolVariants(name: "circle"), square = SymbolVariants(name: "square"), slash = SymbolVariants(name: "slash")
}

// MARK: - Text styling

extension View {
    public func font(_ font: Font?) -> some View { _mod("font", ["v": font?.json ?? .null]) }
    public func fontWeight(_ w: Font.Weight?) -> some View { _mod("fontWeight", ["v": w.map { .int($0.value) } ?? .null]) }
    public func fontDesign(_ d: Font.Design?) -> some View { _mod("fontDesign", ["v": .s(d?.name ?? "default")]) }
    public func fontWidth(_ w: Font.Width?) -> some View { self }
    public func bold(_ isActive: Bool = true) -> some View { _mod("fontWeight", ["v": isActive ? .int(700) : .null]) }
    public func italic(_ isActive: Bool = true) -> some View { _mod("italic", ["v": .b(isActive)]) }
    public func monospaced(_ isActive: Bool = true) -> some View { _mod("fontDesign", ["v": .s(isActive ? "monospaced" : "default")]) }
    public func monospacedDigit() -> some View { self }
    public func underline(_ isActive: Bool = true, color: Color? = nil) -> some View { _mod("decoration", ["v": .s(isActive ? "underline" : "none")]) }
    public func strikethrough(_ isActive: Bool = true, color: Color? = nil) -> some View { _mod("decoration", ["v": .s(isActive ? "line-through" : "none")]) }
    public func kerning(_ k: CGFloat) -> some View { _mod("kerning", ["v": .num(k)]) }
    public func tracking(_ k: CGFloat) -> some View { kerning(k) }
    public func multilineTextAlignment(_ a: TextAlignment) -> some View {
        _mod("textAlign", ["v": .s(a == .leading ? "left" : a == .trailing ? "right" : "center")])
    }
    public func lineLimit(_ n: Int?) -> some View { _mod("lineLimit", ["v": n.map { .int($0) } ?? .null]) }
    public func lineLimit(_ r: ClosedRange<Int>) -> some View { lineLimit(r.upperBound) }
    public func lineLimit(_ r: PartialRangeFrom<Int>) -> some View { self }
    public func lineLimit(_ n: Int, reservesSpace: Bool) -> some View { lineLimit(n) }
    public func lineSpacing(_ s: CGFloat) -> some View { _mod("lineSpacing", ["v": .num(s)]) }
    public func minimumScaleFactor(_ f: CGFloat) -> some View { self }
    public func truncationMode(_ m: Text.TruncationMode) -> some View { self }
    public func textCase(_ c: Text.Case?) -> some View { _mod("textCase", ["v": .s(c == .uppercase ? "uppercase" : c == .lowercase ? "lowercase" : "none")]) }
    public func textSelection(_ s: TextSelectability) -> some View { self }
    public func dynamicTypeSize(_ s: DynamicTypeSize) -> some View { self }
    public func dynamicTypeSize(_ s: ClosedRange<DynamicTypeSize>) -> some View { self }
}

extension DynamicTypeSize: Comparable {
    public static func < (a: DynamicTypeSize, b: DynamicTypeSize) -> Bool { false }
}
extension Text { public enum TruncationMode: Sendable { case head, tail, middle } }
extension Font { public struct Width: Sendable { public static let standard = Width(), compressed = Width(), condensed = Width(), expanded = Width() } }
public struct TextSelectability: Sendable { public static let enabled = TextSelectability(), disabled = TextSelectability() }

// MARK: - Interaction & lifecycle

extension View {
    public func onAppear(perform action: (@MainActor () -> Void)? = nil) -> some View {
        _ModifiedView(content: self, key: "onAppear") { ctx in
            let key = ctx.path + "~appear"
            ctx.graph.seenThisRender.insert(key)
            if !ctx.graph.appeared.contains(key) {
                ctx.graph.appeared.insert(key)
                if let action { ctx.graph.pendingAfterRender.append(action) }
            }
            return nil
        }
    }
    public func onDisappear(perform action: (@MainActor () -> Void)? = nil) -> some View { self }

    public func task(priority: TaskPriority = .userInitiated, _ action: @escaping @MainActor @Sendable () async -> Void) -> some View {
        onAppear { Task { @MainActor in await action() } }
    }
    public func task<T: Equatable>(id value: T, priority: TaskPriority = .userInitiated, _ action: @escaping @MainActor @Sendable () async -> Void) -> some View {
        _ModifiedView(content: self, key: "taskId") { ctx in
            let box = ctx.graph.box(ctx.path + "~taskid") { Optional<T>.none }
            if box.value != value {
                box.value = value
                ctx.graph.pendingAfterRender.append { Task { @MainActor in await action() } }
            }
            return nil
        }
    }

    public func onChange<V: Equatable>(of value: V, perform action: @escaping @MainActor (V) -> Void) -> some View {
        _ModifiedView(content: self, key: "onChange") { ctx in
            let box = ctx.graph.box(ctx.path + "~prev") { value }
            if box.value != value {
                box.value = value
                ctx.graph.pendingAfterRender.append { action(value) }
            }
            return nil
        }
    }
    public func onChange<V: Equatable>(of value: V, initial: Bool = false, _ action: @escaping @MainActor (V, V) -> Void) -> some View {
        _ModifiedView(content: self, key: "onChange2") { ctx in
            var first = false
            let box = ctx.graph.box(ctx.path + "~prev") { () -> V in first = true; return value }
            if first && initial { ctx.graph.pendingAfterRender.append { action(value, value) } }
            if box.value != value {
                let old = box.value
                box.value = value
                ctx.graph.pendingAfterRender.append { action(old, value) }
            }
            return nil
        }
    }
    public func onChange<V: Equatable>(of value: V, initial: Bool = false, _ action: @escaping @MainActor () -> Void) -> some View {
        onChange(of: value, initial: initial) { (_: V, _: V) in action() }
    }

    public func onSubmit(of triggers: SubmitTriggers = .text, _ action: @escaping @MainActor () -> Void) -> some View {
        _ModifiedView(content: self, key: "onSubmit") { ctx in
            ctx.graph.actions[ctx.path + "~submit"] = action
            return ["id": .s(ctx.path + "~submit")]
        }
    }
    public func refreshable(action: @escaping @Sendable () async -> Void) -> some View { self }
    public func onOpenURL(perform action: @escaping (URL) -> Void) -> some View { self }
    public func onMove(perform action: ((IndexSet, Int) -> Void)?) -> some View { self }
    public func swipeActions<T: View>(edge: HorizontalEdge = .trailing, allowsFullSwipe: Bool = true, @ViewBuilder content: () -> T) -> some View {
        let v = AnyView(content())
        return _ModifiedView(content: self, key: "swipe") { ctx in ["v": .nodes(v._render(ctx.child("swipe")))] }
    }
    public func contextMenu<M: View>(@ViewBuilder menuItems: () -> M) -> some View {
        let v = AnyView(menuItems())
        return _ModifiedView(content: self, key: "contextMenu") { ctx in ["v": .nodes(v._render(ctx.child("menu")))] }
    }

    public func disabled(_ disabled: Bool) -> some View {
        _ModifiedView(content: self, key: "disabled", env: { if disabled { $0.isEnabled = false } }) { _ in disabled ? [:] : nil }
    }
    public func allowsHitTesting(_ enabled: Bool) -> some View { _mod("hitTesting", ["v": .b(enabled)]) }

    public func focused(_ binding: FocusState<Bool>.Binding) -> some View { self }
    public func focused<V: Hashable>(_ binding: FocusState<V>.Binding, equals value: V) -> some View { self }
    public func keyboardType(_ type: UIKeyboardType) -> some View {
        let mode: String
        switch type {
        case .numberPad, .asciiCapableNumberPad: mode = "numeric"
        case .decimalPad: mode = "decimal"
        case .phonePad, .namePhonePad: mode = "tel"
        case .emailAddress: mode = "email"
        case .URL: mode = "url"
        default: mode = "text"
        }
        return _mod("keyboard", ["v": .s(mode)])
    }
    public func textInputAutocapitalization(_ a: TextInputAutocapitalization?) -> some View { self }
    public func autocapitalization(_ a: UITextAutocapitalizationType) -> some View { self }
    public func autocorrectionDisabled(_ d: Bool = true) -> some View { self }
    public func disableAutocorrection(_ d: Bool?) -> some View { self }
    public func submitLabel(_ l: SubmitLabel) -> some View { self }
    public func textContentType(_ t: UITextContentType?) -> some View { self }
    public func scrollDismissesKeyboard(_ m: ScrollDismissesKeyboardMode) -> some View { self }
    public func scrollIndicators(_ v: ScrollIndicatorVisibility, axes: Axis.Set = [.vertical, .horizontal]) -> some View { self }
    public func scrollDisabled(_ d: Bool) -> some View { self }
    public func scrollTargetBehavior(_ b: Any) -> some View { self }
    public func scrollContentBackground(_ v: Visibility) -> some View { _mod("scrollBg", ["v": .s(v == .hidden ? "hidden" : "visible")]) }

    public func animation<V: Equatable>(_ a: Animation?, value: V) -> some View { self }
    public func animation(_ a: Animation?) -> some View { self }
    public func transition(_ t: AnyTransition) -> some View { self }
    public func matchedGeometryEffect<ID: Hashable>(id: ID, in namespace: Namespace.ID, properties: Int = 0, anchor: UnitPoint = .center, isSource: Bool = true) -> some View { self }
    public func id<ID: Hashable>(_ id: ID) -> some View { self }
    public func tag<V: Hashable>(_ tag: V) -> some View { _TagView(content: self, tag: AnyHashable(tag)) }
    public func tag<V: Hashable>(_ tag: V, includeOptional: Bool) -> some View { _TagView(content: self, tag: AnyHashable(tag)) }

    public func help(_ s: String) -> some View { self }
    public func accessibilityLabel(_ s: String) -> some View { self }
    public func accessibilityLabel(_ t: Text) -> some View { self }
    public func accessibilityHint(_ s: String) -> some View { self }
    public func accessibilityValue(_ s: String) -> some View { self }
    public func accessibilityIdentifier(_ s: String) -> some View { self }
    public func accessibilityHidden(_ h: Bool) -> some View { self }
    public func accessibilityElement(children: AccessibilityChildBehavior = .ignore) -> some View { self }
    public func accessibilityAddTraits(_ t: AccessibilityTraits) -> some View { self }
    public func sensoryFeedback<T: Equatable>(_ f: SensoryFeedback, trigger: T) -> some View { self }
    public func presentationDetents(_ d: Set<PresentationDetent>) -> some View { self }
    public func presentationDragIndicator(_ v: Visibility) -> some View { self }
    public func presentationCornerRadius(_ r: CGFloat?) -> some View { self }
    public func presentationBackground<S: ShapeStyle>(_ s: S) -> some View { self }
    public func interactiveDismissDisabled(_ d: Bool = true) -> some View { self }

    public func listRowBackground<V: View>(_ view: V?) -> some View {
        let v = view.map { AnyView($0) }
        return _ModifiedView(content: self, key: "rowBg") { ctx in
            guard let v else { return nil }
            let n = v._render(ctx.child("rowbg"))
            if n.count == 1, n[0].t == "color", let c = n[0].p["c"] { return ["v": c] }
            return nil
        }
    }
    public func listRowInsets(_ insets: EdgeInsets?) -> some View { _mod("rowInsets", insets.map { ["t": .num($0.top), "l": .num($0.leading), "b": .num($0.bottom), "r": .num($0.trailing)] } ?? [:]) }
    public func listRowSeparator(_ v: Visibility, edges: VerticalEdge.Set = .all) -> some View { _mod("rowSeparator", ["v": .s(v == .hidden ? "hidden" : "visible")]) }
    public func listRowSeparatorTint(_ c: Color?, edges: VerticalEdge.Set = .all) -> some View { self }
    public func listSectionSeparator(_ v: Visibility, edges: VerticalEdge.Set = .all) -> some View { self }
    public func listRowSpacing(_ s: CGFloat?) -> some View { self }
    public func listSectionSpacing(_ s: CGFloat) -> some View { self }
    public func headerProminence(_ p: Prominence) -> some View { self }
    public func labelsHidden() -> some View { _env("labelsHidden") { $0.labelsHidden = true } }
    public func controlSize(_ s: ControlSize) -> some View { _env("controlSize") { $0.controlSize = s.name } }
    public func buttonBorderShape(_ s: ButtonBorderShape) -> some View { _env("buttonShape") { $0.buttonShape = s.name } }

    public func environment<V>(_ keyPath: WritableKeyPath<EnvironmentValues, V>, _ value: V) -> some View {
        _env("environment") { $0[keyPath: keyPath] = value }
    }
    public func environmentObject<T: ObservableObject>(_ object: T) -> some View {
        _env("environmentObject") { $0.objects[ObjectIdentifier(T.self)] = object }
    }
    public func environment<T: AnyObject & Observable>(_ object: T?) -> some View {
        _env("environmentObservable") { if let object { $0.objects[ObjectIdentifier(T.self)] = object } }
    }
}

extension VerticalEdge { public struct Set: OptionSet, Sendable { public let rawValue: Int; public init(rawValue: Int) { self.rawValue = rawValue }; public static let all = Set(rawValue: 3), top = Set(rawValue: 1), bottom = Set(rawValue: 2) } }
public enum HorizontalEdge: Sendable { case leading, trailing }
public struct SubmitTriggers: OptionSet, Sendable { public let rawValue: Int; public init(rawValue: Int) { self.rawValue = rawValue }; public static let text = SubmitTriggers(rawValue: 1), search = SubmitTriggers(rawValue: 2) }
public enum ScrollDismissesKeyboardMode: Sendable { case automatic, immediately, interactively, never }
public enum ScrollIndicatorVisibility: Sendable { case automatic, visible, hidden, never }
public enum AccessibilityChildBehavior: Sendable { case ignore, contain, combine }
public struct AccessibilityTraits: OptionSet, Sendable { public let rawValue: Int; public init(rawValue: Int) { self.rawValue = rawValue }; public static let isButton = AccessibilityTraits(rawValue: 1), isHeader = AccessibilityTraits(rawValue: 2), isSelected = AccessibilityTraits(rawValue: 4) }
public struct SensoryFeedback: Sendable { public static let success = SensoryFeedback(), warning = SensoryFeedback(), error = SensoryFeedback(), selection = SensoryFeedback(), increase = SensoryFeedback(), decrease = SensoryFeedback(), impact = SensoryFeedback() }
public struct PresentationDetent: Hashable, Sendable {
    let v: Double
    public static let medium = PresentationDetent(v: 0.5), large = PresentationDetent(v: 1)
    public static func fraction(_ f: CGFloat) -> PresentationDetent { PresentationDetent(v: Double(f)) }
    public static func height(_ h: CGFloat) -> PresentationDetent { PresentationDetent(v: Double(h)) }
}
public struct ButtonBorderShape: Sendable {
    let name: String
    public static let automatic = ButtonBorderShape(name: "auto"), capsule = ButtonBorderShape(name: "capsule"), roundedRectangle = ButtonBorderShape(name: "rounded"), circle = ButtonBorderShape(name: "circle")
    public static func roundedRectangle(radius: CGFloat) -> ButtonBorderShape { ButtonBorderShape(name: "rounded") }
}

extension FocusState { public typealias Binding = SwiftUI.Binding<Value> }

@propertyWrapper
public struct Namespace: _DynamicProperty {
    public typealias ID = Int
    public init() {}
    public var wrappedValue: Int { 0 }
    public func _install(key: String, ctx: _Ctx) {}
}

// MARK: - Styles

public protocol _StyleToken { var _styleName: String { get } }

public struct ButtonStyleConfiguration {
    public struct Label: View, _PrimitiveView {
        let inner: AnyView
        public func _render(_ ctx: _Ctx) -> [_Node] { inner._render(ctx) }
    }
    public let label: Label
    public let isPressed: Bool
    public let role: ButtonRole?
}

@MainActor
public protocol ButtonStyle {
    associatedtype Body: View
    @ViewBuilder func makeBody(configuration: Configuration) -> Body
    typealias Configuration = ButtonStyleConfiguration
}
public typealias PrimitiveButtonStyle = ButtonStyle

public struct _BuiltinButtonStyle: ButtonStyle, _StyleToken {
    public let _styleName: String
    public func makeBody(configuration: Configuration) -> some View { configuration.label }
}
public typealias PlainButtonStyle = _BuiltinButtonStyle
public typealias BorderlessButtonStyle = _BuiltinButtonStyle
public typealias BorderedButtonStyle = _BuiltinButtonStyle
public typealias BorderedProminentButtonStyle = _BuiltinButtonStyle
public typealias DefaultButtonStyle = _BuiltinButtonStyle
extension _BuiltinButtonStyle { public init() { _styleName = "automatic" } }

extension ButtonStyle where Self == _BuiltinButtonStyle {
    public static var plain: _BuiltinButtonStyle { _BuiltinButtonStyle(_styleName: "plain") }
    public static var borderless: _BuiltinButtonStyle { _BuiltinButtonStyle(_styleName: "borderless") }
    public static var bordered: _BuiltinButtonStyle { _BuiltinButtonStyle(_styleName: "bordered") }
    public static var borderedProminent: _BuiltinButtonStyle { _BuiltinButtonStyle(_styleName: "borderedProminent") }
    public static var automatic: _BuiltinButtonStyle { _BuiltinButtonStyle(_styleName: "automatic") }
    public static var glass: _BuiltinButtonStyle { _BuiltinButtonStyle(_styleName: "bordered") }
    public static var glassProminent: _BuiltinButtonStyle { _BuiltinButtonStyle(_styleName: "borderedProminent") }
}

extension View {
    public func buttonStyle<S: ButtonStyle>(_ style: S) -> some View {
        if let token = style as? _StyleToken {
            let name = token._styleName
            return _env("buttonStyle") { $0.buttonStyle = name; $0.customButtonStyle = nil }
        }
        return _env("buttonStyle") { env in
            env.buttonStyle = "custom"
            env.customButtonStyle = { label, role in AnyView(style.makeBody(configuration: ButtonStyleConfiguration(label: .init(inner: label), isPressed: false, role: role))) }
        }
    }
}

public struct _SimpleStyle: _StyleToken, Sendable {
    public let _styleName: String
}

public protocol ListStyle {}
public protocol PickerStyle {}
public protocol TextFieldStyle {}
public protocol ToggleStyle {}
public protocol LabelStyle {}
public protocol ProgressViewStyle {}
public protocol DatePickerStyle {}
public protocol TabViewStyle {}
public protocol IndexViewStyle {}
public protocol MenuStyle {}
public protocol FormStyle {}
public protocol GaugeStyle {}
extension _SimpleStyle: ListStyle, PickerStyle, TextFieldStyle, ToggleStyle, LabelStyle, ProgressViewStyle, DatePickerStyle, TabViewStyle, IndexViewStyle, MenuStyle, FormStyle, GaugeStyle {}

extension ListStyle where Self == _SimpleStyle {
    public static var plain: _SimpleStyle { .init(_styleName: "plain") }
    public static var grouped: _SimpleStyle { .init(_styleName: "grouped") }
    public static var insetGrouped: _SimpleStyle { .init(_styleName: "insetGrouped") }
    public static var inset: _SimpleStyle { .init(_styleName: "inset") }
    public static var sidebar: _SimpleStyle { .init(_styleName: "insetGrouped") }
    public static var automatic: _SimpleStyle { .init(_styleName: "insetGrouped") }
}
public struct PlainListStyle: ListStyle { public init() {} }
public struct GroupedListStyle: ListStyle { public init() {} }
public struct InsetGroupedListStyle: ListStyle { public init() {} }
public struct InsetListStyle: ListStyle { public init() {} }
public struct SidebarListStyle: ListStyle { public init() {} }
public struct DefaultListStyle: ListStyle { public init() {} }

extension PickerStyle where Self == _SimpleStyle {
    public static var segmented: _SimpleStyle { .init(_styleName: "segmented") }
    public static var menu: _SimpleStyle { .init(_styleName: "menu") }
    public static var wheel: _SimpleStyle { .init(_styleName: "wheel") }
    public static var inline: _SimpleStyle { .init(_styleName: "inline") }
    public static var navigationLink: _SimpleStyle { .init(_styleName: "menu") }
    public static var palette: _SimpleStyle { .init(_styleName: "segmented") }
    public static var automatic: _SimpleStyle { .init(_styleName: "menu") }
}
public struct SegmentedPickerStyle: PickerStyle { public init() {} }
public struct MenuPickerStyle: PickerStyle { public init() {} }
public struct WheelPickerStyle: PickerStyle { public init() {} }
public struct InlinePickerStyle: PickerStyle { public init() {} }
public struct DefaultPickerStyle: PickerStyle { public init() {} }

extension TextFieldStyle where Self == _SimpleStyle {
    public static var roundedBorder: _SimpleStyle { .init(_styleName: "roundedBorder") }
    public static var plain: _SimpleStyle { .init(_styleName: "plain") }
    public static var automatic: _SimpleStyle { .init(_styleName: "automatic") }
}
public struct RoundedBorderTextFieldStyle: TextFieldStyle { public init() {} }
public struct PlainTextFieldStyle: TextFieldStyle { public init() {} }
public struct DefaultTextFieldStyle: TextFieldStyle { public init() {} }

extension ToggleStyle where Self == _SimpleStyle {
    public static var `switch`: _SimpleStyle { .init(_styleName: "switch") }
    public static var button: _SimpleStyle { .init(_styleName: "button") }
    public static var automatic: _SimpleStyle { .init(_styleName: "switch") }
}
public struct SwitchToggleStyle: ToggleStyle { public init(tint: Color? = nil) {} }

extension LabelStyle where Self == _SimpleStyle {
    public static var iconOnly: _SimpleStyle { .init(_styleName: "iconOnly") }
    public static var titleOnly: _SimpleStyle { .init(_styleName: "titleOnly") }
    public static var titleAndIcon: _SimpleStyle { .init(_styleName: "titleAndIcon") }
    public static var automatic: _SimpleStyle { .init(_styleName: "titleAndIcon") }
}
extension ProgressViewStyle where Self == _SimpleStyle {
    public static var linear: _SimpleStyle { .init(_styleName: "linear") }
    public static var circular: _SimpleStyle { .init(_styleName: "circular") }
    public static var automatic: _SimpleStyle { .init(_styleName: "automatic") }
}
public struct LinearProgressViewStyle: ProgressViewStyle { public init(tint: Color? = nil) {} }
public struct CircularProgressViewStyle: ProgressViewStyle { public init(tint: Color? = nil) {} }
extension DatePickerStyle where Self == _SimpleStyle {
    public static var compact: _SimpleStyle { .init(_styleName: "compact") }
    public static var graphical: _SimpleStyle { .init(_styleName: "compact") }
    public static var wheel: _SimpleStyle { .init(_styleName: "compact") }
    public static var automatic: _SimpleStyle { .init(_styleName: "compact") }
}
extension TabViewStyle where Self == _SimpleStyle {
    public static var page: _SimpleStyle { .init(_styleName: "page") }
    public static func page(indexDisplayMode: PageTabViewStyle.IndexDisplayMode) -> _SimpleStyle { .init(_styleName: "page") }
    public static var automatic: _SimpleStyle { .init(_styleName: "tabs") }
    public static var sidebarAdaptable: _SimpleStyle { .init(_styleName: "tabs") }
}
public struct PageTabViewStyle: TabViewStyle {
    public enum IndexDisplayMode: Sendable { case automatic, always, never }
    public init(indexDisplayMode: IndexDisplayMode = .automatic) {}
}
extension IndexViewStyle where Self == _SimpleStyle {
    public static func page(backgroundDisplayMode: PageIndexViewStyle.BackgroundDisplayMode) -> _SimpleStyle { .init(_styleName: "page") }
}
public struct PageIndexViewStyle: IndexViewStyle { public enum BackgroundDisplayMode: Sendable { case automatic, always, interactive, never } }
extension FormStyle where Self == _SimpleStyle {
    public static var grouped: _SimpleStyle { .init(_styleName: "grouped") }
    public static var columns: _SimpleStyle { .init(_styleName: "grouped") }
    public static var automatic: _SimpleStyle { .init(_styleName: "grouped") }
}
extension MenuStyle where Self == _SimpleStyle { public static var button: _SimpleStyle { .init(_styleName: "button") } }
extension GaugeStyle where Self == _SimpleStyle { public static var accessoryCircular: _SimpleStyle { .init(_styleName: "circular") } }

func _styleName(_ s: Any, _ fallback: String) -> String {
    if let t = s as? _StyleToken { return t._styleName }
    switch s {
    case is PlainListStyle: return "plain"
    case is GroupedListStyle: return "grouped"
    case is InsetListStyle: return "inset"
    case is SegmentedPickerStyle: return "segmented"
    case is WheelPickerStyle: return "wheel"
    case is InlinePickerStyle: return "inline"
    case is RoundedBorderTextFieldStyle: return "roundedBorder"
    case is PlainTextFieldStyle: return "plain"
    case is PageTabViewStyle: return "page"
    case is CircularProgressViewStyle: return "circular"
    case is LinearProgressViewStyle: return "linear"
    default: return fallback
    }
}

extension View {
    public func listStyle<S: ListStyle>(_ s: S) -> some View { let n = _styleName(s, "insetGrouped"); return _env("listStyle") { $0.listStyle = n } }
    public func pickerStyle<S: PickerStyle>(_ s: S) -> some View { let n = _styleName(s, "menu"); return _env("pickerStyle") { $0.pickerStyle = n } }
    public func textFieldStyle<S: TextFieldStyle>(_ s: S) -> some View { let n = _styleName(s, "automatic"); return _env("textFieldStyle") { $0.textFieldStyle = n } }
    public func toggleStyle<S: ToggleStyle>(_ s: S) -> some View { let n = _styleName(s, "switch"); return _env("toggleStyle") { $0.toggleStyle = n } }
    public func labelStyle<S: LabelStyle>(_ s: S) -> some View { let n = _styleName(s, "titleAndIcon"); return _env("labelStyle") { $0.labelStyle = n } }
    public func progressViewStyle<S: ProgressViewStyle>(_ s: S) -> some View { let n = _styleName(s, "automatic"); return _env("progressStyle") { $0.progressStyle = n } }
    public func datePickerStyle<S: DatePickerStyle>(_ s: S) -> some View { self }
    public func tabViewStyle<S: TabViewStyle>(_ s: S) -> some View { let n = _styleName(s, "tabs"); return _env("tabViewStyle") { $0.tabViewStyle = n } }
    public func indexViewStyle<S: IndexViewStyle>(_ s: S) -> some View { self }
    public func menuStyle<S: MenuStyle>(_ s: S) -> some View { self }
    public func formStyle<S: FormStyle>(_ s: S) -> some View { self }
    public func gaugeStyle<S: GaugeStyle>(_ s: S) -> some View { self }
}

// MARK: - ViewModifier

@MainActor
public protocol ViewModifier {
    associatedtype Body: View
    typealias Content = _ViewModifierContent
    @ViewBuilder func body(content: Content) -> Body
}

public struct _ViewModifierContent: View, _PrimitiveView {
    let inner: AnyView
    public func _render(_ ctx: _Ctx) -> [_Node] { inner._render(ctx) }
}

struct _CustomModified<Content: View, M: ViewModifier>: View, _PrimitiveView {
    let content: Content, modifier: M
    func _render(_ ctx: _Ctx) -> [_Node] {
        _installDynamicProperties(modifier, ctx)
        return _resolve(modifier.body(content: _ViewModifierContent(inner: AnyView(content))), ctx.child("vm"))
    }
}

extension View {
    public func modifier<M: ViewModifier>(_ m: M) -> some View { _CustomModified(content: self, modifier: m) }
}

// Previews compile but don't run in the simulator.
public struct _PreviewTrait: Sendable {}
public enum PreviewDevice: Sendable { case device }
extension View {
    public func previewLayout(_ l: Any) -> some View { self }
    public func previewDisplayName(_ n: String?) -> some View { self }
    public func previewDevice(_ d: Any?) -> some View { self }
    public func previewInterfaceOrientation(_ o: Any) -> some View { self }
}
