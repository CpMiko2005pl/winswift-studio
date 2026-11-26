// A per-container JSON store for Codable model classes. Each concrete type has its own file.
public protocol PersistentModel: AnyObject, Identifiable, Codable {}

private final class ModelTable<M: PersistentModel> {
    var rows: [M]
    let url: URL?
    init(url: URL?) throws {
        self.url = url
        if let url, FileManager.default.fileExists(atPath: url.path) {
            rows = try JSONDecoder().decode([M].self, from: Data(contentsOf: url))
        } else { rows = [] }
    }
    func save() throws {
        guard let url else { return }
        let data = try JSONEncoder().encode(rows)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url, options: .atomic)
    }
}

public final class ModelContext {
    fileprivate static let fallback = ModelContext(directory: nil)
    private let directory: URL?
    private var tables: [ObjectIdentifier: AnyObject] = [:]
    private var writers: [() throws -> Void] = []
    fileprivate init(directory: URL?) { self.directory = directory }

    private func table<M: PersistentModel>(_ type: M.Type) throws -> ModelTable<M> {
        let key = ObjectIdentifier(type)
        if let cached = tables[key] as? ModelTable<M> { return cached }
        let name = String(reflecting: type).addingPercentEncoding(withAllowedCharacters: .alphanumerics)!
        let table = try ModelTable<M>(url: directory?.appendingPathComponent(name + ".json"))
        tables[key] = table
        writers.append(table.save)
        return table
    }

    public func insert<M: PersistentModel>(_ model: M) {
        guard let table = try? table(M.self), !table.rows.contains(where: { $0 === model }) else { return }
        table.rows.append(model)
        try? table.save()
        _Runtime.setNeedsRender()
    }

    public func delete<M: PersistentModel>(_ model: M) {
        guard let table = try? table(M.self) else { return }
        table.rows.removeAll { $0 === model }
        try? table.save()
        _Runtime.setNeedsRender()
    }

    public func save() throws { for write in writers { try write() } }
    fileprivate func models<M: PersistentModel>(_ type: M.Type) -> [M] { (try? table(type).rows) ?? [] }
}

extension EnvironmentValues {
    public var modelContext: ModelContext {
        get { objects[ObjectIdentifier(ModelContext.self)] as? ModelContext ?? .fallback }
        set { objects[ObjectIdentifier(ModelContext.self)] = newValue }
    }
}

@propertyWrapper
public struct Query<M: PersistentModel>: _DynamicProperty {
    private final class Location { var context = ModelContext.fallback }
    private let location = Location()
    private let filter: Predicate<M>?
    private let sort: [SortDescriptor<M>]
    public init(filter: Predicate<M>? = nil, sort: [SortDescriptor<M>] = []) { self.filter = filter; self.sort = sort }
    public init<V: Comparable>(filter: Predicate<M>? = nil, sort key: KeyPath<M, V>, order: SortOrder = .forward) {
        self.init(filter: filter, sort: [SortDescriptor(key, order: order)])
    }
    public var wrappedValue: [M] {
        let rows = location.context.models(M.self)
        let matches = filter.map { predicate in rows.filter { (try? predicate.evaluate($0)) == true } } ?? rows
        return sort.isEmpty ? matches : matches.sorted(using: sort)
    }
    public func _install(key: String, ctx: _Ctx) { location.context = ctx.env.modelContext }
}

private func containerContext(_ ctx: _Ctx, _ inMemory: Bool) -> _Ctx {
    let child = ctx.child("modelContainer")
    let context = ctx.graph.box(child.path + (inMemory ? "~memory" : "~disk")) {
        let base = ProcessInfo.processInfo.environment["SWIFTCODE_APPDATA"].map { URL(fileURLWithPath: $0, isDirectory: true) }
        return ModelContext(directory: inMemory ? nil : base?.appendingPathComponent("Models", isDirectory: true))
    }
    child.env.modelContext = context.value
    return child
}

private struct ContainerView<Content: View>: View, _PrimitiveView {
    let content: Content, inMemory: Bool
    func _render(_ ctx: _Ctx) -> [_Node] { _resolve(content, containerContext(ctx, inMemory)) }
}
private struct ContainerScene<Content: Scene>: Scene {
    let content: Content, inMemory: Bool
    func _renderScene(_ ctx: _Ctx) -> [_Node] { content._renderScene(containerContext(ctx, inMemory)) }
}
extension Scene {
    public func modelContainer<M: PersistentModel>(for type: M.Type, inMemory: Bool = false) -> some Scene {
        ContainerScene(content: self, inMemory: inMemory)
    }
}
extension View {
    public func modelContainer<M: PersistentModel>(for type: M.Type, inMemory: Bool = false) -> some View {
        ContainerView(content: self, inMemory: inMemory)
    }
}
