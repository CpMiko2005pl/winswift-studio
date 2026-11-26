public struct UTType: Equatable, Sendable {
    public let identifier: String
    public static let plainText = Self(identifier: "public.plain-text")
    public static let text = Self(identifier: "public.text")
    public static let json = Self(identifier: "public.json")
    public static let data = Self(identifier: "public.data")
}
public struct FileWrapper {
    public let regularFileContents: Data?
    public init(regularFileWithContents data: Data) { regularFileContents = data }
}
public struct FileDocumentReadConfiguration { public let file: FileWrapper, contentType: UTType }
public struct FileDocumentWriteConfiguration { public let contentType: UTType }
public protocol FileDocument {
    typealias ReadConfiguration = FileDocumentReadConfiguration
    typealias WriteConfiguration = FileDocumentWriteConfiguration
    static var readableContentTypes: [UTType] { get }
    init(configuration: ReadConfiguration) throws
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper
}

extension View {
    public func fileImporter(isPresented: Binding<Bool>, allowedContentTypes: [UTType], onCompletion: @escaping (Result<URL, Error>) -> Void) -> some View {
        onChange(of: isPresented.wrappedValue) { presented in
            guard presented else { return }
            _Runtime.request("importFile", ["types": allowedContentTypes.map(\.identifier)]) { path in
                isPresented.wrappedValue = false
                if let path = path as? String { onCompletion(.success(URL(fileURLWithPath: path))) }
            }
        }
    }
    public func fileExporter<D: FileDocument>(isPresented: Binding<Bool>, document: D?, contentType: UTType, defaultFilename: String? = nil, onCompletion: @escaping (Result<URL, Error>) -> Void) -> some View {
        onChange(of: isPresented.wrappedValue) { presented in
            guard presented, let document else { return }
            _Runtime.request("exportFile", ["name": defaultFilename ?? "Document"]) { path in
                isPresented.wrappedValue = false
                guard let path = path as? String else { return }
                onCompletion(Result {
                    let url = URL(fileURLWithPath: path)
                    let wrapper = try document.fileWrapper(configuration: FileDocumentWriteConfiguration(contentType: contentType))
                    guard let data = wrapper.regularFileContents else { throw CocoaError(.fileWriteUnknown) }
                    try data.write(to: url, options: .atomic)
                    return url
                })
            }
        }
    }
}
