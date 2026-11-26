public struct OpenURLAction {
    public enum Result { case handled, discarded, systemAction }
    private let handler: @MainActor (URL) -> Result
    public init(handler: @escaping @MainActor (URL) -> Result) { self.handler = handler }
    @MainActor public func callAsFunction(_ url: URL) { callAsFunction(url) { _ in } }
    @MainActor public func callAsFunction(_ url: URL, completion: @escaping (Bool) -> Void) {
        switch handler(url) {
        case .handled: completion(true)
        case .discarded: completion(false)
        case .systemAction: _Runtime.request("openURL", ["url": url.absoluteString]) { reply in completion(reply as? Bool ?? false) }
        }
    }
}

public struct ScrollTargetBehavior {
    let value: String
    public static let paging = Self(value: "paging")
    public static let viewAligned = Self(value: "viewAligned")
}

public struct ControlGroup<Content: View>: View {
    let content: Content
    public init(@ViewBuilder content: () -> Content) { self.content = content() }
    public var body: some View { HStack(spacing: 8) { content }.buttonStyle(.bordered) }
}

extension View {
    public func inspector<C: View>(isPresented: Binding<Bool>, @ViewBuilder content: @escaping () -> C) -> some View {
        sheet(isPresented: isPresented, content: content)
    }
}

public struct GraphicsContext {
    public struct Shading {
        let css: _J
        public static func color(_ color: Color) -> Self { Self(css: color._css) }
    }
    final class Drawing { var paths: [_J] = [] }
    let drawing: Drawing
    public func fill(_ path: Path, with shading: Shading) {
        drawing.paths.append(.o(["d": .s(path._svg), "fill": shading.css]))
    }
    public func stroke(_ path: Path, with shading: Shading, lineWidth: CGFloat = 1) {
        drawing.paths.append(.o(["d": .s(path._svg), "stroke": shading.css, "width": .num(lineWidth)]))
    }
}

public struct Canvas: View, _PrimitiveView {
    let renderer: (inout GraphicsContext, CGSize) -> Void
    public init(renderer: @escaping (inout GraphicsContext, CGSize) -> Void) { self.renderer = renderer }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        let size = ctx.graph.box(ctx.path + "~size") { _screenSize }.value
        var graphics = GraphicsContext(drawing: .init())
        renderer(&graphics, size)
        return [_Node("canvas", ctx.path, ["paths": .a(graphics.drawing.paths), "measure": .b(true), "w": .num(size.width), "h": .num(size.height)])]
    }
}

public struct KeyEquivalent: Hashable, ExpressibleByExtendedGraphemeClusterLiteral {
    public let character: Character
    public init(_ character: Character) { self.character = character }
    public init(extendedGraphemeClusterLiteral value: Character) { self.init(value) }
    public static let escape = Self("\u{1b}"), space = Self(" "), tab = Self("\t")
    public static let upArrow = Self("\u{f700}"), downArrow = Self("\u{f701}"), leftArrow = Self("\u{f702}"), rightArrow = Self("\u{f703}")
}
extension KeyEquivalent { public static let `return` = Self("\r") }
public struct KeyPress {
    public enum Result { case handled, ignored }
    public let key: KeyEquivalent
    public var characters: String { String(key.character) }
}
extension View {
    public func onKeyPress(_ key: KeyEquivalent, action: @escaping () -> KeyPress.Result) -> some View {
        _ModifiedView(content: self, key: "keyPress") { ctx in
            ctx.action(ctx.path) { _ = action() }
            return ["id": .s(ctx.path), "key": .s(String(key.character))]
        }
    }
    public func onKeyPress(action: @escaping (KeyPress) -> KeyPress.Result) -> some View {
        _ModifiedView(content: self, key: "keyPress") { ctx in
            ctx.graph.textSetters[ctx.path] = { if let character = $0.first { _ = action(KeyPress(key: KeyEquivalent(character))) } }
            return ["id": .s(ctx.path)]
        }
    }
}
