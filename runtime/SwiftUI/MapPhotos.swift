public struct MKCoordinateSpan: Equatable, Sendable {
    public var latitudeDelta: Double, longitudeDelta: Double
    public init(latitudeDelta: Double, longitudeDelta: Double) { self.latitudeDelta = latitudeDelta; self.longitudeDelta = longitudeDelta }
}
public struct MKCoordinateRegion: Equatable, Sendable {
    public var center: CLLocationCoordinate2D, span: MKCoordinateSpan
    public init(center: CLLocationCoordinate2D, span: MKCoordinateSpan) { self.center = center; self.span = span }
}
public struct MapCameraPosition: Equatable, Sendable {
    let region: MKCoordinateRegion?
    public static let automatic = Self(region: nil)
    public static func region(_ region: MKCoordinateRegion) -> Self { Self(region: region) }
}

public struct Marker: View, _PrimitiveView {
    let title: String, coordinate: CLLocationCoordinate2D, symbol: String
    public init(_ title: String, coordinate: CLLocationCoordinate2D) { self.init(title, systemImage: "mappin", coordinate: coordinate) }
    public init(_ title: String, systemImage: String, coordinate: CLLocationCoordinate2D) {
        self.title = title; self.coordinate = coordinate; symbol = systemImage
    }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        [_Node("marker", ctx.path, ["title": .s(title), "lat": .n(coordinate.latitude), "lon": .n(coordinate.longitude), "symbol": .s(symbol)])]
    }
}

public struct Annotation<Content: View>: View, _PrimitiveView {
    let title: String, coordinate: CLLocationCoordinate2D, content: Content
    public init(_ title: String, coordinate: CLLocationCoordinate2D, @ViewBuilder content: () -> Content) {
        self.title = title; self.coordinate = coordinate; self.content = content()
    }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        [_Node("marker", ctx.path, ["title": .s(title), "lat": .n(coordinate.latitude), "lon": .n(coordinate.longitude)], _resolve(content, ctx.child("label")))]
    }
}

public struct Map<Content: View>: View, _PrimitiveView {
    let position: MapCameraPosition, content: Content
    public init(initialPosition: MapCameraPosition = .automatic, @ViewBuilder content: () -> Content) { position = initialPosition; self.content = content() }
    public init(position: Binding<MapCameraPosition>, @ViewBuilder content: () -> Content) { self.init(initialPosition: position.wrappedValue, content: content) }
    public func _render(_ ctx: _Ctx) -> [_Node] {
        var props: [String: _J] = [:]
        if let region = position.region {
            props = ["lat": .n(region.center.latitude), "lon": .n(region.center.longitude), "span": .n(region.span.longitudeDelta)]
        }
        return [_Node("map", ctx.path, props, _resolve(content, ctx.child("places")))]
    }
}
extension Map where Content == EmptyView {
    public init(initialPosition: MapCameraPosition = .automatic) { self.init(initialPosition: initialPosition) { EmptyView() } }
}

public struct PHPickerFilter: Sendable { public static let images = Self() }
public struct PhotosPickerItem: Equatable, Hashable, Sendable {
    let url: URL
    public var itemIdentifier: String? { url.lastPathComponent }
    public func loadTransferable<T>(type: T.Type) async throws -> T? {
        if type == URL.self { return url as? T }
        if type == Data.self { return try Data(contentsOf: url) as? T }
        return nil
    }
}
public struct PhotosPicker<Label: View>: View {
    let selection: Binding<PhotosPickerItem?>, label: Label
    public init(selection: Binding<PhotosPickerItem?>, matching: PHPickerFilter? = nil, @ViewBuilder label: () -> Label) {
        self.selection = selection; self.label = label()
    }
    public var body: some View {
        Button {
            _Runtime.request("pickPhoto") { result in
                if let path = result as? String { selection.wrappedValue = PhotosPickerItem(url: URL(fileURLWithPath: path)) }
            }
        } label: { label }
    }
}
extension PhotosPicker where Label == Text {
    public init(_ title: String, selection: Binding<PhotosPickerItem?>, matching: PHPickerFilter? = nil) {
        self.init(selection: selection, matching: matching) { Text(title) }
    }
}
