// Navigation, tabs, toolbars, sheets and alerts.

// MARK: - NavigationPath

public struct NavigationPath: Equatable {
    var elements: [AnyHashable] = []
    public init() {}
    public init<S: Sequence>(_ elements: S) where S.Element: Hashable { self.elements = elements.map(AnyHashable.init) }
    public var count: Int { elements.count }
    public var isEmpty: Bool { elements.isEmpty }
    public mutating func append<V: Hashable>(_ value: V) { elements.append(AnyHashable(value)) }
    public mutating func removeLast(_ k: Int = 1) { elements.removeLast(Swift.min(k, elements.count)) }
}

// MARK: - NavigationStack

struct _PathAccess {
    let get: () -> [AnyHashable]
    let set: ([AnyHashable]) -> Void
}

public struct NavigationStack<Root: View>: View, _PrimitiveView {
    let root: Root
    let pathAccess: _PathAccess?

    public init(@ViewBuilder root: () -> Root) { self.root = root(); pathAccess = nil }
    public init(path: Binding<NavigationPath>, @ViewBuilder root: () -> Root) {
        self.root = root()
        pathAccess = _PathAccess(get: { path.wrappedValue.elements },
                                 set: { var p = NavigationPath(); p.elements = $0; path.wrappedValue = p })
    }
    public init<Data: MutableCollection & RandomAccessCollection & RangeReplaceableCollection>(path: Binding<Data>, @ViewBuilder root: () -> Root) where Data.Element: Hashable {
        self.root = root()
        pathAccess = _PathAccess(get: { path.wrappedValue.map(AnyHashable.init) },
                                 set: { path.wrappedValue = Data($0.compactMap { $0.base as? Data.Element }) })
    }

    public func _render(_ ctx: _Ctx) -> [_Node] {
        // pushed views live in the graph; pushed values may come from a path binding
        let stack = ctx.graph.box(ctx.path + "#stack") { [_NavEntry]() }
        let pathAccess = self.pathAccess
        let graph = ctx.graph
        let base = ctx.path

        func entries() -> [_NavEntry] {
            if let pathAccess { return pathAccess.get().map { .value($0) } + stack.value }
            return stack.value
        }
        func popTo(_ depth: Int) {
            // depth = number of screens to keep above root
            var all = entries()
            guard all.count > depth else { return }
            all.removeLast(all.count - depth)
            if let pathAccess {
                let values = all.compactMap { e -> AnyHashable? in if case .value(let v) = e { return v }; return nil }
                pathAccess.set(values)
                stack.value = Array(all.dropFirst(values.count))
            } else {
                stack.value = all
            }
            graph.removeStorage(prefix: base + "/s\(depth + 1)")
            _Runtime.setNeedsRender()
        }

        let nav = _NavContext(push: { entry in
            if case .value(let v) = entry, let pathAccess, stack.value.isEmpty {
                pathAccess.set(pathAccess.get() + [v])
            } else {
                stack.value.append(entry)
            }
            _Runtime.setNeedsRender()
        })

        // every screen has its own edit mode, shared by its EditButton and List
        func screenEditMode(_ key: String) -> Binding<EditMode> {
            let box = graph.box(key + "#editMode") { EditMode.inactive }
            return Binding(get: { box.value }, set: { box.value = $0; _Runtime.setNeedsRender() })
        }

        var screens: [_Node] = []
        let rootCtx = ctx.child("s0")
        rootCtx.nav = nav
        rootCtx.parentAxis = "v"
        rootCtx.env._editScope = base + "/s0"
        if ctx.env.editMode == nil { rootCtx.env.editMode = screenEditMode(base + "/s0") }
        let rootNodes = _resolve(root, rootCtx)
        screens.append(_screen(base + "/s0", rootNodes))

        for (i, entry) in entries().enumerated() {
            let c = ctx.child("s\(i + 1)")
            c.nav = nav
            c.parentAxis = "v"
            c.env.dismiss = DismissAction { popTo(i) }
            c.env.isPresented = true
            c.env._editScope = base + "/s\(i + 1)"
            c.env.editMode = screenEditMode(base + "/s\(i + 1)")
            var nodes: [_Node] = []
            switch entry {
            case .view(let v, _):
                nodes = v._render(c)
            case .value(let h):
                if let dest = nav.destinations[ObjectIdentifier(type(of: h.base))] {
                    nodes = dest(h.base)._render(c)
                } else {
                    nodes = Text("No destination for \(type(of: h.base))")._render(c)
                }
            }
            screens.append(_screen(base + "/s\(i + 1)", nodes))
        }
        let depth = screens.count - 1
        ctx.action(base + "~back") { popTo(depth - 1) }
        ctx.action(base + "~root") { popTo(0) }
        return [_Node("nav", base, [:], screens)]
    }
}

func _screen(_ id: String, _ nodes: [_Node]) -> _Node {
    let n = _Node("screen", id, [:], nodes)
    if case .s(let t)? = n.findMod("navigationTitle")?["v"] { n.p["title"] = .s(t) }
    return n
}

public typealias NavigationView = NavigationStack

public struct NavigationSplitView<Sidebar: View, Detail: View>: View, _PrimitiveView {
    let sidebar: Sidebar
    public init(@ViewBuilder sidebar: () -> Sidebar, @ViewBuilder detail: () -> Detail) { self.sidebar = sidebar() }
    public init<C: View>(@ViewBuilder sidebar: () -> Sidebar, @ViewBuilder content: () -> C, @ViewBuilder detail: () -> Detail) { self.sidebar = sidebar() }
    public func _render(_ ctx: _Ctx) -> [_Node] { NavigationStack { sidebar }._render(ctx) }
}

public struct NavigationLink<Label: View, Destination: View>: View, _PrimitiveView {
    let label: Label
    let destination: Destination?
    let value: AnyHashable?

    public init(destination: Destination, @ViewBuilder label: () -> Label) { self.destination = destination; self.label = label(); value = nil }
    public init(@ViewBuilder destination: () -> Destination, @ViewBuilder label: () -> Label) { self.destination = destination(); self.label = label(); value = nil }
    public init(destination: Destination, isActive: Binding<Bool>, @ViewBuilder label: () -> Label) { self.init(destination: destination, label: label) }

    public func _render(_ ctx: _Ctx) -> [_Node] {
        if let nav = ctx.nav {
            if let destination {
                let v = AnyView(destination)
                ctx.action(ctx.path) { nav.push(.view(v, title: "")) }
            } else if let value {
                ctx.action(ctx.path) { nav.push(.value(value)) }
            }
        }
        var p: [String: _J] = [:]
        if !ctx.env.isEnabled { p["disabled"] = .b(true) }
        return [_Node("navlink", ctx.path, p, _resolve(label, ctx.child("l")))]
    }
}

extension NavigationLink where Label == Text {
    public init(_ titleKey: LocalizedStringKey, destination: Destination) { self.init(destination: destination) { Text(titleKey) } }
    public init(_ titleKey: LocalizedStringKey, @ViewBuilder destination: () -> Destination) { self.init(destination: destination()) { Text(titleKey) } }
    @_disfavoredOverload
    public init<S: StringProtocol>(_ title: S, destination: Destination) { self.init(destination: destination) { Text(title) } }
    @_disfavoredOverload
    public init<S: StringProtocol>(_ title: S, @ViewBuilder destination: () -> Destination) { self.init(destination: destination()) { Text(title) } }
}

extension NavigationLink where Destination == Never {
    public init<P: Hashable>(value: P?, @ViewBuilder label: () -> Label) {
        self.label = label(); destination = nil; self.value = value.map(AnyHashable.init)
    }
}
extension NavigationLink where Destination == Never, Label == Text {
    public init<P: Hashable>(_ titleKey: LocalizedStringKey, value: P?) { self.init(value: value) { Text(titleKey) } }
    @_disfavoredOverload
    public init<S: StringProtocol, P: Hashable>(_ title: S, value: P?) { self.init(value: value) { Text(title) } }
}

extension View {
    public func navigationDestination<D: Hashable, C: View>(for data: D.Type, @ViewBuilder destination: @escaping (D) -> C) -> some View {
        _ModifiedView(content: self, key: "navigationDestination") { ctx in
            ctx.nav?.destinations[ObjectIdentifier(D.self)] = { AnyView(destination($0 as! D)) }
            return nil
        }
    }

    public func navigationDestination<C: View>(isPresented: Binding<Bool>, @ViewBuilder destination: () -> C) -> some View {
        let dest = AnyView(destination())
        return _ModifiedView(content: self, key: "navigationDestinationPresented") { ctx in
            let pushed = ctx.graph.box(ctx.path + "#navpushed") { false }
            if isPresented.wrappedValue && !pushed.value, let nav = ctx.nav {
                pushed.value = true
                ctx.graph.pendingAfterRender.append { nav.push(.view(dest, title: "")) }
            } else if !isPresented.wrappedValue {
                pushed.value = false
            }
            return nil
        }
    }

    public func navigationDestination<Item: Hashable, C: View>(item: Binding<Item?>, @ViewBuilder destination: @escaping (Item) -> C) -> some View {
        navigationDestination(isPresented: Binding(get: { item.wrappedValue != nil }, set: { if !$0 { item.wrappedValue = nil } })) {
            if let v = item.wrappedValue { destination(v) }
        }
    }
}

// MARK: - TabView

public struct TabView<SelectionValue: Hashable, Content: View>: View, _PrimitiveView {
    let selection: Binding<SelectionValue>?
    let content: Content

    public init(selection: Binding<SelectionValue>, @ViewBuilder content: () -> Content) { self.selection = selection; self.content = content() }

    public func _render(_ ctx: _Ctx) -> [_Node] {
        let tabs = _resolve(content, ctx.child("tabs"))
        let internalSel = ctx.graph.box(ctx.path + "#tab") { 0 }
        var selected = internalSel.value
        if let selection {
            let cur = AnyHashable(selection.wrappedValue)
            if let i = tabs.firstIndex(where: { $0.tag == cur }) { selected = i }
        }
        selected = Swift.max(0, Swift.min(selected, tabs.count - 1))
        let sel = selection
        let tags = tabs.map(\.tag)
        ctx.graph.indexSetters[ctx.path] = { i in
            internalSel.value = i
            if let sel, tags.indices.contains(i), let t = tags[i]?.base as? SelectionValue { sel.wrappedValue = t }
            _Runtime.setNeedsRender()
        }
        return [_Node("tabview", ctx.path, ["sel": .int(selected), "style": .s(ctx.env.tabViewStyle)], tabs)]
    }
}

extension TabView where SelectionValue == Int {
    public init(@ViewBuilder content: () -> Content) { selection = nil; self.content = content() }
}

/// iOS 18 `Tab("Home", systemImage: "house") { … }`
public struct Tab<Content: View>: View, _PrimitiveView {
    let title: String, image: String, content: Content, value: AnyHashable?
    public init(_ titleKey: LocalizedStringKey, systemImage: String, @ViewBuilder content: () -> Content) { title = titleKey.resolved(); image = systemImage; self.content = content(); value = nil }
    public init<V: Hashable>(_ titleKey: LocalizedStringKey, systemImage: String, value: V, @ViewBuilder content: () -> Content) { title = titleKey.resolved(); image = systemImage; self.content = content(); self.value = AnyHashable(value) }
    @_disfavoredOverload
    public init<S: StringProtocol>(_ title: S, systemImage: String, @ViewBuilder content: () -> Content) { self.title = String(title); image = systemImage; self.content = content(); value = nil }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        let label = SwiftUI.Label(title, systemImage: image)._render(ctx.child("tabItem"))
        let n = _Node("group", ctx.path, [:], _resolve(content, ctx.child("c")))
        n.m.append(["k": .s("tabItem"), "v": .nodes(label)])
        n.tag = value
        return [n]
    }
}

// MARK: - Toolbar

public struct ToolbarItemPlacement: Hashable, Sendable {
    let name: String
    public static let automatic = ToolbarItemPlacement(name: "trailing")
    public static let primaryAction = ToolbarItemPlacement(name: "trailing")
    public static let confirmationAction = ToolbarItemPlacement(name: "trailing")
    public static let cancellationAction = ToolbarItemPlacement(name: "leading")
    public static let destructiveAction = ToolbarItemPlacement(name: "trailing")
    public static let navigation = ToolbarItemPlacement(name: "leading")
    public static let navigationBarLeading = ToolbarItemPlacement(name: "leading")
    public static let navigationBarTrailing = ToolbarItemPlacement(name: "trailing")
    public static let topBarLeading = ToolbarItemPlacement(name: "leading")
    public static let topBarTrailing = ToolbarItemPlacement(name: "trailing")
    public static let principal = ToolbarItemPlacement(name: "principal")
    public static let bottomBar = ToolbarItemPlacement(name: "bottom")
    public static let status = ToolbarItemPlacement(name: "bottom")
    public static let keyboard = ToolbarItemPlacement(name: "hidden")
}

public struct ToolbarItem<Content: View>: View, _PrimitiveView {
    let placement: ToolbarItemPlacement, content: Content
    public init(placement: ToolbarItemPlacement = .automatic, @ViewBuilder content: () -> Content) { self.placement = placement; self.content = content() }
    public init(id: String, placement: ToolbarItemPlacement = .automatic, @ViewBuilder content: () -> Content) { self.init(placement: placement, content: content) }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        [_Node("toolbaritem", ctx.path, ["place": .s(placement.name)], _resolve(content, ctx.child("c")))]
    }
}

public struct ToolbarItemGroup<Content: View>: View, _PrimitiveView {
    let placement: ToolbarItemPlacement, content: Content
    public init(placement: ToolbarItemPlacement = .automatic, @ViewBuilder content: () -> Content) { self.placement = placement; self.content = content() }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        [_Node("toolbaritem", ctx.path, ["place": .s(placement.name)], _resolve(content, ctx.child("c")))]
    }
}

public struct ToolbarPlacement: Sendable {
    public static let navigationBar = ToolbarPlacement(), tabBar = ToolbarPlacement(), bottomBar = ToolbarPlacement(), automatic = ToolbarPlacement()
}

public enum NavigationBarItem {
    public enum TitleDisplayMode: Sendable { case automatic, inline, large }
}

extension View {
    public func toolbar<C: View>(@ViewBuilder content: () -> C) -> some View {
        let items = AnyView(content())
        return _ModifiedView(content: self, key: "toolbar") { ctx in ["v": .nodes(items._render(ctx.child("toolbar")))] }
    }
    public func toolbar(_ visibility: Visibility, for bars: ToolbarPlacement...) -> some View {
        _ModifiedView(content: self, key: "toolbarVisibility") { _ in ["v": .s(visibility == .hidden ? "hidden" : "visible")] }
    }
    public func toolbarBackground<S: ShapeStyle>(_ style: S, for bars: ToolbarPlacement...) -> some View { self }
    public func toolbarBackground(_ visibility: Visibility, for bars: ToolbarPlacement...) -> some View { self }
    public func toolbarColorScheme(_ scheme: ColorScheme?, for bars: ToolbarPlacement...) -> some View { self }
    public func toolbarTitleDisplayMode(_ mode: NavigationBarItem.TitleDisplayMode) -> some View { navigationBarTitleDisplayMode(mode) }

    func _navigationTitle(_ title: String) -> some View {
        _ModifiedView(content: self, key: "navigationTitle") { _ in ["v": .s(title)] }
    }
    public func navigationTitle(_ titleKey: LocalizedStringKey) -> some View { _navigationTitle(titleKey.resolved()) }
    @_disfavoredOverload
    public func navigationTitle<S: StringProtocol>(_ title: S) -> some View { _navigationTitle(String(title)) }
    public func navigationTitle(_ title: Text) -> some View { _navigationTitle(title._plain) }
    public func navigationTitle(_ title: Binding<String>) -> some View { _navigationTitle(title.wrappedValue) }
    public func navigationBarTitle(_ titleKey: LocalizedStringKey) -> some View { _navigationTitle(titleKey.resolved()) }
    public func navigationBarTitle(_ title: Text) -> some View { _navigationTitle(title._plain) }
    @_disfavoredOverload
    public func navigationBarTitle<S: StringProtocol>(_ title: S) -> some View { _navigationTitle(String(title)) }
    public func navigationBarTitle(_ titleKey: LocalizedStringKey, displayMode: NavigationBarItem.TitleDisplayMode) -> some View {
        _navigationTitle(titleKey.resolved()).navigationBarTitleDisplayMode(displayMode)
    }
    public func navigationBarTitle(_ title: Text, displayMode: NavigationBarItem.TitleDisplayMode) -> some View {
        _navigationTitle(title._plain).navigationBarTitleDisplayMode(displayMode)
    }
    @_disfavoredOverload
    public func navigationBarTitle<S: StringProtocol>(_ title: S, displayMode: NavigationBarItem.TitleDisplayMode) -> some View {
        _navigationTitle(String(title)).navigationBarTitleDisplayMode(displayMode)
    }
    public func navigationBarTitleDisplayMode(_ mode: NavigationBarItem.TitleDisplayMode) -> some View {
        _ModifiedView(content: self, key: "titleMode") { _ in ["v": .s(mode == .inline ? "inline" : "large")] }
    }
    public func navigationBarHidden(_ hidden: Bool) -> some View {
        _ModifiedView(content: self, key: "toolbarVisibility") { _ in ["v": .s(hidden ? "hidden" : "visible")] }
    }
    public func navigationBarBackButtonHidden(_ hidden: Bool = true) -> some View {
        _ModifiedView(content: self, key: "backHidden") { _ in hidden ? ["v": .b(true)] : nil }
    }
    public func navigationBarItems<L: View, T: View>(leading: L, trailing: T) -> some View {
        toolbar {
            ToolbarItem(placement: .navigationBarLeading) { leading }
            ToolbarItem(placement: .navigationBarTrailing) { trailing }
        }
    }
    public func navigationBarItems<T: View>(trailing: T) -> some View {
        toolbar { ToolbarItem(placement: .navigationBarTrailing) { trailing } }
    }
    public func navigationBarItems<L: View>(leading: L) -> some View {
        toolbar { ToolbarItem(placement: .navigationBarLeading) { leading } }
    }

    public func tabItem<V: View>(@ViewBuilder _ label: () -> V) -> some View {
        let l = AnyView(label())
        return _ModifiedView(content: self, key: "tabItem") { ctx in ["v": .nodes(l._render(ctx.child("tabItem")))] }
    }

    public func searchable(text: Binding<String>, placement: SearchFieldPlacement = .automatic, prompt: String? = nil) -> some View {
        _ModifiedView(content: self, key: "searchable") { ctx in
            ctx.graph.textSetters[ctx.path + "~search"] = { text.wrappedValue = $0 }
            return ["id": .s(ctx.path + "~search"), "v": .s(text.wrappedValue), "ph": .s(prompt ?? _systemString("Search"))]
        }
    }
    public func searchable(text: Binding<String>, placement: SearchFieldPlacement = .automatic, prompt: Text) -> some View {
        searchable(text: text, placement: placement, prompt: prompt.segs.map(\.s).joined())
    }
}

public struct SearchFieldPlacement: Sendable {
    public static let automatic = SearchFieldPlacement(), navigationBarDrawer = SearchFieldPlacement(), toolbar = SearchFieldPlacement(), sidebar = SearchFieldPlacement()
    public static func navigationBarDrawer(displayMode: NavigationBarDrawerDisplayMode) -> SearchFieldPlacement { SearchFieldPlacement() }
    public enum NavigationBarDrawerDisplayMode: Sendable { case automatic, always }
}

// MARK: - Sheets & alerts

extension View {
    public func sheet<C: View>(isPresented: Binding<Bool>, onDismiss: (() -> Void)? = nil, @ViewBuilder content: @escaping () -> C) -> some View {
        _ModifiedView(content: self, key: "sheet") { ctx in
            guard isPresented.wrappedValue else { return nil }
            let c = ctx.child("sheet")
            let close: @MainActor () -> Void = { isPresented.wrappedValue = false; onDismiss?() }
            c.env.dismiss = DismissAction { isPresented.wrappedValue = false; onDismiss?() }
            c.env.isPresented = true
            c.dismissOnTap = nil
            c.parentAxis = "v"
            ctx.graph.actions[ctx.path + "~dismiss"] = close
            return ["v": .nodes(_resolve(content(), c)), "dismiss": .s(ctx.path + "~dismiss")]
        }
    }

    public func sheet<Item: Identifiable, C: View>(item: Binding<Item?>, onDismiss: (() -> Void)? = nil, @ViewBuilder content: @escaping (Item) -> C) -> some View {
        sheet(isPresented: Binding(get: { item.wrappedValue != nil }, set: { if !$0 { item.wrappedValue = nil } }), onDismiss: onDismiss) {
            if let v = item.wrappedValue { content(v) }
        }
    }

    public func fullScreenCover<C: View>(isPresented: Binding<Bool>, onDismiss: (() -> Void)? = nil, @ViewBuilder content: @escaping () -> C) -> some View {
        _ModifiedView(content: sheet(isPresented: isPresented, onDismiss: onDismiss, content: content), key: "fullScreen") { _ in nil }
    }
    public func fullScreenCover<Item: Identifiable, C: View>(item: Binding<Item?>, onDismiss: (() -> Void)? = nil, @ViewBuilder content: @escaping (Item) -> C) -> some View {
        sheet(item: item, onDismiss: onDismiss, content: content)
    }
    public func popover<C: View>(isPresented: Binding<Bool>, attachmentAnchor: PopoverAttachmentAnchor = .rect(.bounds), arrowEdge: Edge = .top, @ViewBuilder content: @escaping () -> C) -> some View {
        sheet(isPresented: isPresented, content: content)
    }

    func _alert<A: View, M: View>(_ title: String, isPresented: Binding<Bool>, @ViewBuilder actions: () -> A, @ViewBuilder message: () -> M) -> some View {
        let acts = AnyView(actions()), msg = AnyView(message())
        return _ModifiedView(content: self, key: "alert") { ctx in
            _alertJSON(ctx, title: title, isPresented: isPresented, actions: acts, message: msg, style: "alert")
        }
    }
    func _dialog<A: View, M: View>(_ title: String, isPresented: Binding<Bool>, titleVisibility: Visibility, @ViewBuilder actions: () -> A, @ViewBuilder message: () -> M) -> some View {
        let acts = AnyView(actions()), msg = AnyView(message())
        return _ModifiedView(content: self, key: "alert") { ctx in
            // iOS hides an action sheet's title unless asked (or a message is given)
            _alertJSON(ctx, title: titleVisibility == .visible ? title : "", isPresented: isPresented, actions: acts, message: msg, style: "sheet")
        }
    }

    // `.alert("Title", …)` localizes a literal; `.alert(someString, …)` shows it as is; `.alert(Text(…), …)`
    public func alert<A: View, M: View>(_ titleKey: LocalizedStringKey, isPresented: Binding<Bool>, @ViewBuilder actions: () -> A, @ViewBuilder message: () -> M) -> some View {
        _alert(titleKey.resolved(), isPresented: isPresented, actions: actions, message: message)
    }
    public func alert<A: View>(_ titleKey: LocalizedStringKey, isPresented: Binding<Bool>, @ViewBuilder actions: () -> A) -> some View {
        _alert(titleKey.resolved(), isPresented: isPresented, actions: actions, message: { EmptyView() })
    }
    @_disfavoredOverload
    public func alert<S: StringProtocol, A: View, M: View>(_ title: S, isPresented: Binding<Bool>, @ViewBuilder actions: () -> A, @ViewBuilder message: () -> M) -> some View {
        _alert(String(title), isPresented: isPresented, actions: actions, message: message)
    }
    @_disfavoredOverload
    public func alert<S: StringProtocol, A: View>(_ title: S, isPresented: Binding<Bool>, @ViewBuilder actions: () -> A) -> some View {
        _alert(String(title), isPresented: isPresented, actions: actions, message: { EmptyView() })
    }
    public func alert<A: View, M: View>(_ title: Text, isPresented: Binding<Bool>, @ViewBuilder actions: () -> A, @ViewBuilder message: () -> M) -> some View {
        _alert(title._plain, isPresented: isPresented, actions: actions, message: message)
    }
    public func alert<A: View>(_ title: Text, isPresented: Binding<Bool>, @ViewBuilder actions: () -> A) -> some View {
        _alert(title._plain, isPresented: isPresented, actions: actions, message: { EmptyView() })
    }
    public func alert<A: View, M: View, T>(_ titleKey: LocalizedStringKey, isPresented: Binding<Bool>, presenting data: T?, @ViewBuilder actions: @escaping (T) -> A, @ViewBuilder message: @escaping (T) -> M) -> some View {
        _alert(titleKey.resolved(), isPresented: isPresented, actions: { if let d = data { actions(d) } }, message: { if let d = data { message(d) } })
    }
    public func alert<A: View, T>(_ titleKey: LocalizedStringKey, isPresented: Binding<Bool>, presenting data: T?, @ViewBuilder actions: @escaping (T) -> A) -> some View {
        _alert(titleKey.resolved(), isPresented: isPresented, actions: { if let d = data { actions(d) } }, message: { EmptyView() })
    }
    @_disfavoredOverload
    public func alert<S: StringProtocol, A: View, M: View, T>(_ title: S, isPresented: Binding<Bool>, presenting data: T?, @ViewBuilder actions: @escaping (T) -> A, @ViewBuilder message: @escaping (T) -> M) -> some View {
        _alert(String(title), isPresented: isPresented, actions: { if let d = data { actions(d) } }, message: { if let d = data { message(d) } })
    }
    /// `.alert(isPresented: $error, error: someError) { … }`
    public func alert<E: LocalizedError, A: View>(isPresented: Binding<Bool>, error: E?, @ViewBuilder actions: () -> A) -> some View {
        _alert(error?.errorDescription ?? "", isPresented: isPresented, actions: actions, message: { if let m = error?.recoverySuggestion ?? error?.failureReason { Text(m) } })
    }
    public func alert(isPresented: Binding<Bool>, content: () -> Alert) -> some View {
        let a = content()
        let p = a.primary.view, s = a.secondary?.view
        return _alert(a.title, isPresented: isPresented, actions: {
            p
            if let s { s }
        }, message: { if let m = a.message { m } })
    }
    public func alert<Item: Identifiable>(item: Binding<Item?>, content: (Item) -> Alert) -> some View {
        let a = item.wrappedValue.map(content)
        let p = a?.primary.view, s = a?.secondary?.view
        return _alert(a?.title ?? "", isPresented: Binding(get: { item.wrappedValue != nil }, set: { if !$0 { item.wrappedValue = nil } }), actions: {
            if let p { p }
            if let s { s }
        }, message: { if let m = a?.message { m } })
    }

    public func confirmationDialog<A: View, M: View>(_ titleKey: LocalizedStringKey, isPresented: Binding<Bool>, titleVisibility: Visibility = .automatic, @ViewBuilder actions: () -> A, @ViewBuilder message: () -> M) -> some View {
        _dialog(titleKey.resolved(), isPresented: isPresented, titleVisibility: titleVisibility == .automatic && !(M.self == EmptyView.self) ? .visible : titleVisibility, actions: actions, message: message)
    }
    public func confirmationDialog<A: View>(_ titleKey: LocalizedStringKey, isPresented: Binding<Bool>, titleVisibility: Visibility = .automatic, @ViewBuilder actions: () -> A) -> some View {
        _dialog(titleKey.resolved(), isPresented: isPresented, titleVisibility: titleVisibility, actions: actions, message: { EmptyView() })
    }
    @_disfavoredOverload
    public func confirmationDialog<S: StringProtocol, A: View, M: View>(_ title: S, isPresented: Binding<Bool>, titleVisibility: Visibility = .automatic, @ViewBuilder actions: () -> A, @ViewBuilder message: () -> M) -> some View {
        _dialog(String(title), isPresented: isPresented, titleVisibility: titleVisibility == .automatic && !(M.self == EmptyView.self) ? .visible : titleVisibility, actions: actions, message: message)
    }
    @_disfavoredOverload
    public func confirmationDialog<S: StringProtocol, A: View>(_ title: S, isPresented: Binding<Bool>, titleVisibility: Visibility = .automatic, @ViewBuilder actions: () -> A) -> some View {
        _dialog(String(title), isPresented: isPresented, titleVisibility: titleVisibility, actions: actions, message: { EmptyView() })
    }
    public func confirmationDialog<A: View, T>(_ titleKey: LocalizedStringKey, isPresented: Binding<Bool>, titleVisibility: Visibility = .automatic, presenting data: T?, @ViewBuilder actions: @escaping (T) -> A) -> some View {
        _dialog(titleKey.resolved(), isPresented: isPresented, titleVisibility: titleVisibility, actions: { if let d = data { actions(d) } }, message: { EmptyView() })
    }
}

public enum PopoverAttachmentAnchor: Sendable {
    case rect(Anchor), point(UnitPoint)
    public enum Anchor: Sendable { case bounds }
}

@MainActor
func _alertJSON(_ ctx: _Ctx, title: String, isPresented: Binding<Bool>, actions: AnyView, message: AnyView, style: String) -> [String: _J]? {
    guard isPresented.wrappedValue else { return nil }
    let c = ctx.child("alert")
    c.dismissOnTap = { isPresented.wrappedValue = false }
    var buttons = actions._render(c)
    buttons = buttons.filter { $0.t == "button" || $0.t == "navlink" }
    if buttons.isEmpty {
        let id = ctx.path + "~alertOK"
        ctx.graph.actions[id] = { isPresented.wrappedValue = false }
        buttons = [_Node("button", id, [:], [_Node("text", id + "/t", ["segs": .a([.o(["s": .s(_systemString("OK"))])])])])]
    }
    let msg = message._render(ctx.child("msg")).map(\.plainText).joined(separator: "\n")
    if style == "sheet" {
        let id = ctx.path + "~alertCancel"
        ctx.graph.actions[id] = { isPresented.wrappedValue = false }
        if !buttons.contains(where: { if case .s("cancel")? = $0.p["role"] { return true }; return false }) {
            buttons.append(_Node("button", id, ["role": .s("cancel")], [_Node("text", id + "/t", ["segs": .a([.o(["s": .s(_systemString("Cancel"))])])])]))
        }
    }
    return ["title": .s(title), "msg": .s(msg), "buttons": .nodes(buttons), "style": .s(style)]
}

@MainActor
public struct Alert {
    let title: String
    let message: Text?
    let primary: Button
    let secondary: Button?

    public init(title: Text, message: Text? = nil, dismissButton: Button? = nil) {
        self.title = title.segs.map(\.s).joined(); self.message = message
        primary = dismissButton ?? .default(Text("OK")); secondary = nil
    }
    public init(title: Text, message: Text? = nil, primaryButton: Button, secondaryButton: Button) {
        self.title = title.segs.map(\.s).joined(); self.message = message
        primary = primaryButton; secondary = secondaryButton
    }

    @MainActor
    public struct Button {
        let label: Text, role: ButtonRole?, action: (() -> Void)?
        public static func `default`(_ label: Text, action: (() -> Void)? = {}) -> Button { Button(label: label, role: nil, action: action) }
        public static func cancel(_ label: Text, action: (() -> Void)? = {}) -> Button { Button(label: label, role: .cancel, action: action) }
        public static func cancel(_ action: (() -> Void)? = {}) -> Button { Button(label: Text("Cancel"), role: .cancel, action: action) }
        public static func destructive(_ label: Text, action: (() -> Void)? = {}) -> Button { Button(label: label, role: .destructive, action: action) }
        @MainActor var view: SwiftUI.Button<Text> {
            let act = action
            return SwiftUI.Button(role: role, action: { act?() }) { label }
        }
    }
}
