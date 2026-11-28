// Kingfisher for WinSwift Studio — the API of Kingfisher's SwiftUI views and caches, so code written for
// https://github.com/onevcat/Kingfisher builds and runs in the Windows simulator. Images are downloaded once and kept
// on disk in the app's data folder (the same cache AsyncImage uses); processors keep their API, and the ones with a
// visible effect in a view (round corners) are drawn by the view.
import SwiftUI
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public typealias KFCrossPlatformImage = UIImage

// MARK: - Sources

/// Something Kingfisher can download: a URL, or your own type with a URL and a cache key.
public protocol Resource {
    var cacheKey: String { get }
    var downloadURL: URL { get }
}

extension URL: Resource {
    public var cacheKey: String { absoluteString }
    public var downloadURL: URL { self }
}

public struct KF {
    public struct ImageResource: Resource {
        public let cacheKey: String
        public let downloadURL: URL
        public init(downloadURL: URL, cacheKey: String? = nil) {
            self.downloadURL = downloadURL
            self.cacheKey = cacheKey ?? downloadURL.absoluteString
        }
    }
}

/// Image data that doesn't come from a URL download.
public protocol ImageDataProvider {
    var cacheKey: String { get }
    func data(handler: @escaping (Result<Data, Error>) -> Void)
    var contentURL: URL? { get }
}

extension ImageDataProvider {
    public var contentURL: URL? { nil }
}

public struct LocalFileImageDataProvider: ImageDataProvider {
    public let fileURL: URL
    public let cacheKey: String
    public init(fileURL: URL, cacheKey: String? = nil) {
        self.fileURL = fileURL
        self.cacheKey = cacheKey ?? fileURL.absoluteString
    }
    public func data(handler: @escaping (Result<Data, Error>) -> Void) {
        handler(Result { try Data(contentsOf: fileURL) })
    }
    public var contentURL: URL? { fileURL }
}

public struct RawImageDataProvider: ImageDataProvider {
    public let data: Data
    public let cacheKey: String
    public init(data: Data, cacheKey: String) { self.data = data; self.cacheKey = cacheKey }
    public func data(handler: @escaping (Result<Data, Error>) -> Void) { handler(.success(data)) }
    /// The data is written next to the downloaded images, so the simulator can show it.
    public var contentURL: URL? {
        let file = _KFCache.directory.appendingPathComponent("data-" + _KFCache.hash(cacheKey) + ".img")
        if !FileManager.default.fileExists(atPath: file.path) {
            try? FileManager.default.createDirectory(at: _KFCache.directory, withIntermediateDirectories: true)
            try? data.write(to: file)
        }
        return file
    }
}

public enum Source {
    case network(any Resource)
    case provider(any ImageDataProvider)

    public var cacheKey: String {
        switch self {
        case .network(let r): return r.cacheKey
        case .provider(let p): return p.cacheKey
        }
    }
    public var url: URL? {
        switch self {
        case .network(let r): return r.downloadURL
        case .provider(let p): return p.contentURL
        }
    }
}

// MARK: - Results and errors

public enum CacheType: Sendable {
    case none, memory, disk
    public var cached: Bool { self != .none }
}

public struct RetrieveImageResult {
    public let image: KFCrossPlatformImage
    public let cacheType: CacheType
    public let source: Source
    public let originalSource: Source
    public let data: () -> Data?
}

public enum KingfisherError: Error, LocalizedError, CustomStringConvertible {
    case requestError(reason: String)
    case responseError(reason: String)
    case cacheError(reason: String)
    case processorError(reason: String)
    case imageSettingError(reason: String)

    public var errorDescription: String? {
        switch self {
        case .requestError(let r), .responseError(let r), .cacheError(let r), .processorError(let r), .imageSettingError(let r): return r
        }
    }
    public var description: String { errorDescription ?? "Kingfisher error" }
    public var isTaskCancelled: Bool { false }
    public var isNotCurrentSourceTask: Bool { false }
}

// MARK: - Processors

public protocol ImageProcessor {
    var identifier: String { get }
}

public struct DefaultImageProcessor: ImageProcessor {
    public static let `default` = DefaultImageProcessor()
    public let identifier = ""
    public init() {}
}

public struct DownsamplingImageProcessor: ImageProcessor {
    public let size: CGSize
    public var identifier: String { "com.onevcat.Kingfisher.DownsamplingImageProcessor(\(size))" }
    public init(size: CGSize) { self.size = size }
}

public struct RectCorner: OptionSet, Sendable {
    public let rawValue: Int
    public init(rawValue: Int) { self.rawValue = rawValue }
    public static let topLeft = RectCorner(rawValue: 1 << 0)
    public static let topRight = RectCorner(rawValue: 1 << 1)
    public static let bottomLeft = RectCorner(rawValue: 1 << 2)
    public static let bottomRight = RectCorner(rawValue: 1 << 3)
    public static let all: RectCorner = [.topLeft, .topRight, .bottomLeft, .bottomRight]
}

public enum Radius: Sendable {
    case widthFraction(CGFloat)
    case heightFraction(CGFloat)
    case point(CGFloat)
}

public struct RoundCornerImageProcessor: ImageProcessor {
    public let radius: Radius
    public let roundingCorners: RectCorner
    public var identifier: String { "com.onevcat.Kingfisher.RoundCornerImageProcessor(\(radius))" }
    public init(cornerRadius: CGFloat, targetSize: CGSize? = nil, roundingCorners corners: RectCorner = .all, backgroundColor: UIColor? = nil) {
        self.radius = .point(cornerRadius); self.roundingCorners = corners
    }
    public init(radius: Radius, targetSize: CGSize? = nil, roundingCorners corners: RectCorner = .all, backgroundColor: UIColor? = nil) {
        self.radius = radius; self.roundingCorners = corners
    }
}

public struct BlurImageProcessor: ImageProcessor {
    public let blurRadius: CGFloat
    public var identifier: String { "com.onevcat.Kingfisher.BlurImageProcessor(\(blurRadius))" }
    public init(blurRadius: CGFloat) { self.blurRadius = blurRadius }
}

public struct OverlayImageProcessor: ImageProcessor {
    public let overlay: UIColor
    public let fraction: CGFloat
    public var identifier: String { "com.onevcat.Kingfisher.OverlayImageProcessor(\(fraction))" }
    public init(overlay: UIColor, fraction: CGFloat = 0.5) { self.overlay = overlay; self.fraction = fraction }
}

public struct TintImageProcessor: ImageProcessor {
    public let tint: UIColor
    public var identifier: String { "com.onevcat.Kingfisher.TintImageProcessor" }
    public init(tint: UIColor) { self.tint = tint }
}

public struct BlackWhiteProcessor: ImageProcessor {
    public let identifier = "com.onevcat.Kingfisher.BlackWhiteProcessor"
    public init() {}
}

public struct CroppingImageProcessor: ImageProcessor {
    public let size: CGSize
    public var identifier: String { "com.onevcat.Kingfisher.CroppingImageProcessor(\(size))" }
    public init(size: CGSize, anchor: CGPoint = CGPoint(x: 0.5, y: 0.5)) { self.size = size }
}

/// `processorA |> processorB` runs both, in order.
public struct _KFProcessorChain: ImageProcessor {
    let items: [any ImageProcessor]
    public var identifier: String { items.map(\.identifier).joined(separator: "|>") }
}

infix operator |>: AdditionPrecedence
public func |> (left: any ImageProcessor, right: any ImageProcessor) -> any ImageProcessor {
    _KFProcessorChain(items: _KFCache.flatten(left) + _KFCache.flatten(right))
}

// MARK: - Options

public enum ImageTransition {
    case none
    case fade(TimeInterval)
}

public enum CacheSerializerKind { case `default` }

public enum KingfisherOptionsInfoItem {
    case forceRefresh
    case fromMemoryCacheOrRefresh
    case cacheMemoryOnly
    case onlyFromCache
    case backgroundDecode
    case cacheOriginalImage
    case loadDiskFileSynchronously
    case transition(ImageTransition)
    case processor(any ImageProcessor)
    case scaleFactor(CGFloat)
    case retryStrategy(Int)
}

public typealias KingfisherOptionsInfo = [KingfisherOptionsInfoItem]

// MARK: - KFImage

/// `KFImage(url).placeholder { ProgressView() }.resizable().scaledToFit()`
public struct KFImage: View {
    var source: Source?
    var placeholderContent: ((Progress) -> AnyView)?
    var isResizable = false
    var capInsets = EdgeInsets()
    var resizingMode: Image.ResizingMode = .stretch
    var rendering: Image.TemplateRenderingMode?
    var imageConfigurations: [(Image) -> Image] = []
    var contentConfiguration: ((Image) -> AnyView)?
    var successAction: ((RetrieveImageResult) -> Void)?
    var failureAction: ((KingfisherError) -> Void)?
    var processors: [any ImageProcessor] = []

    public init(source: Source?) { self.source = source }
    public init(_ url: URL?, cacheKey: String? = nil) {
        guard let url else { self.source = nil; return }
        if let cacheKey { self.source = .network(KF.ImageResource(downloadURL: url, cacheKey: cacheKey)) }
        else { self.source = .network(url) }
    }
    public init(resource: (any Resource)?) { self.source = resource.map { .network($0) } }

    public static func url(_ url: URL?, cacheKey: String? = nil) -> KFImage { KFImage(url, cacheKey: cacheKey) }
    public static func source(_ source: Source?) -> KFImage { KFImage(source: source) }
    public static func resource(_ resource: (any Resource)?) -> KFImage { KFImage(resource: resource) }
    public static func dataProvider(_ provider: (any ImageDataProvider)?) -> KFImage { KFImage(source: provider.map { .provider($0) }) }
    public static func data(_ data: Data?, cacheKey: String) -> KFImage {
        KFImage(source: data.map { .provider(RawImageDataProvider(data: $0, cacheKey: cacheKey)) })
    }

    public var body: some View {
        AsyncImage(url: source?.url) { phase in
            if let image = phase.image {
                content(for: image)
                    .onAppear { if let successAction { successAction(result()) } }
            } else if let error = phase.error {
                placeholderView
                    .onAppear { failureAction?(.responseError(reason: String(describing: error))) }
            } else {
                placeholderView
            }
        }
    }

    // the image with the configured image modifiers (resizable, rendering mode, configure { })
    func configured(_ image: Image) -> Image {
        var img = image
        if isResizable { img = img.resizable(capInsets: capInsets, resizingMode: resizingMode) }
        if let rendering { img = img.renderingMode(rendering) }
        for c in imageConfigurations { img = c(img) }
        return img
    }

    var cornerRadius: CGFloat? {
        for p in processors.flatMap(_KFCache.flatten) {
            if let r = p as? RoundCornerImageProcessor, case .point(let v) = r.radius { return v }
        }
        return nil
    }

    func content(for image: Image) -> AnyView {
        let img = configured(image)
        if let contentConfiguration { return contentConfiguration(img) }
        if let r = cornerRadius { return AnyView(img.cornerRadius(r)) }
        return AnyView(img)
    }

    var placeholderView: AnyView {
        placeholderContent?(Progress(totalUnitCount: 1)) ?? AnyView(Color.clear)
    }

    func result() -> RetrieveImageResult {
        let source = self.source ?? .network(URL(fileURLWithPath: "/"))
        let file = source.url.map { $0.isFileURL ? $0 : _KFCache.file(for: $0) }
        let image = file.flatMap { UIImage(contentsOfFile: $0.path) } ?? UIImage(systemName: "photo")!
        return RetrieveImageResult(image: image, cacheType: .disk, source: source, originalSource: source,
                                   data: { file.flatMap { try? Data(contentsOf: $0) } })
    }

    func with(_ change: (inout KFImage) -> Void) -> KFImage { var copy = self; change(&copy); return copy }

    // Image modifiers Kingfisher applies to the loaded image
    public func resizable(capInsets: EdgeInsets = EdgeInsets(), resizingMode: Image.ResizingMode = .stretch) -> KFImage {
        with { $0.isResizable = true; $0.capInsets = capInsets; $0.resizingMode = resizingMode }
    }
    public func renderingMode(_ mode: Image.TemplateRenderingMode?) -> KFImage { with { $0.rendering = mode } }
    public func interpolation(_ interpolation: Image.Interpolation) -> KFImage { with { $0.imageConfigurations.append { $0.interpolation(interpolation) } } }
    public func antialiased(_ isAntialiased: Bool) -> KFImage { with { $0.imageConfigurations.append { $0.antialiased(isAntialiased) } } }
    public func configure(_ block: @escaping (Image) -> Image) -> KFImage { with { $0.imageConfigurations.append(block) } }
    public func contentConfigure<V: View>(_ block: @escaping (Image) -> V) -> KFImage { with { $0.contentConfiguration = { AnyView(block($0)) } } }

    // Placeholder while loading (and when loading fails)
    public func placeholder<P: View>(@ViewBuilder _ content: @escaping () -> P) -> KFImage {
        with { $0.placeholderContent = { _ in AnyView(content()) } }
    }
    public func placeholder<P: View>(@ViewBuilder _ content: @escaping (Progress) -> P) -> KFImage {
        with { $0.placeholderContent = { AnyView(content($0)) } }
    }

    // Callbacks
    public func onSuccess(_ action: ((RetrieveImageResult) -> Void)?) -> KFImage { with { $0.successAction = action } }
    public func onFailure(_ action: ((KingfisherError) -> Void)?) -> KFImage { with { $0.failureAction = action } }
    public func onProgress(_ action: ((Int64, Int64) -> Void)?) -> KFImage { self }

    // Processing
    public func setProcessor(_ processor: any ImageProcessor) -> KFImage { with { $0.processors = [processor] } }
    public func setProcessors(_ processors: [any ImageProcessor]) -> KFImage { with { $0.processors = processors } }
    public func appendProcessor(_ processor: any ImageProcessor) -> KFImage { with { $0.processors.append(processor) } }
    public func downsampling(size: CGSize) -> KFImage { appendProcessor(DownsamplingImageProcessor(size: size)) }
    public func roundCorner(radius: Radius, roundingCorners corners: RectCorner = .all, backgroundColor: UIColor? = nil) -> KFImage {
        appendProcessor(RoundCornerImageProcessor(radius: radius, roundingCorners: corners))
    }
    public func blur(radius: CGFloat) -> KFImage { appendProcessor(BlurImageProcessor(blurRadius: radius)) }

    // Loading and caching options: the simulator downloads every image once and keeps it on disk
    public func fade(duration: TimeInterval) -> KFImage { self }
    public func forceTransition(_ enabled: Bool = true) -> KFImage { self }
    public func transition(_ transition: ImageTransition) -> KFImage { self }
    public func cancelOnDisappear(_ flag: Bool) -> KFImage { self }
    public func reducePriorityOnDisappear(_ flag: Bool) -> KFImage { self }
    public func startLoadingBeforeViewAppear(_ flag: Bool = true) -> KFImage { self }
    public func loadDiskFileSynchronously(_ enabled: Bool = true) -> KFImage { self }
    public func cacheMemoryOnly(_ enabled: Bool = true) -> KFImage { self }
    public func cacheOriginalImage(_ enabled: Bool = true) -> KFImage { self }
    public func forceRefresh(_ enabled: Bool = true) -> KFImage { self }
    public func fromMemoryCacheOrRefresh(_ enabled: Bool = true) -> KFImage { self }
    public func onlyFromCache(_ enabled: Bool = true) -> KFImage { self }
    public func backgroundDecode(_ enabled: Bool = true) -> KFImage { self }
    public func scaleFactor(_ factor: CGFloat) -> KFImage { self }
    public func retry(maxCount: Int, interval: TimeInterval = 3) -> KFImage { self }
    public func diskCacheExpiration(_ expiration: Any) -> KFImage { self }
    public func memoryCacheExpiration(_ expiration: Any) -> KFImage { self }
    public func lowDataModeSource(_ source: Source?) -> KFImage { self }
    public func targetCache(_ cache: ImageCache) -> KFImage { self }
    public func options(_ options: KingfisherOptionsInfo) -> KFImage {
        var next = self
        for o in options { if case .processor(let p) = o { next = next.appendProcessor(p) } }
        return next
    }
}

/// Animated images play as their first frame in the simulator.
public typealias KFAnimatedImage = KFImage

// MARK: - Caches

/// The disk cache shared with AsyncImage: one file per URL in the app's data folder.
enum _KFCache {
    static var directory: URL {
        let base = ProcessInfo.processInfo.environment["SWIFTCODE_APPDATA"].map { URL(fileURLWithPath: $0) }
            ?? FileManager.default.temporaryDirectory
        return base.appendingPathComponent("AsyncImage")
    }

    static func hash(_ s: String) -> String {
        var h: UInt64 = 1469598103934665603
        for b in s.utf8 { h = (h ^ UInt64(b)) &* 1099511628211 }
        return String(h, radix: 16)
    }

    // the file the runtime's image loader uses for this URL
    static func file(for url: URL) -> URL {
        let ext = ["png", "jpg", "jpeg", "gif", "webp", "svg"].contains(url.pathExtension.lowercased()) ? url.pathExtension.lowercased() : "img"
        return directory.appendingPathComponent(hash(url.absoluteString) + "." + ext)
    }

    static func flatten(_ p: any ImageProcessor) -> [any ImageProcessor] {
        if let chain = p as? _KFProcessorChain { return chain.items.flatMap(flatten) }
        return [p]
    }

    static func download(_ url: URL, completion: @escaping (Result<URL, KingfisherError>) -> Void) {
        let file = file(for: url)
        if url.isFileURL || FileManager.default.fileExists(atPath: file.path) { completion(.success(url.isFileURL ? url : file)); return }
        URLSession.shared.dataTask(with: url) { data, response, error in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 200
            guard let data, error == nil, (200..<300).contains(status), !data.isEmpty else {
                completion(.failure(.responseError(reason: error.map { String(describing: $0) } ?? "HTTP \(status)")))
                return
            }
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                try data.write(to: file)
                completion(.success(file))
            } catch {
                completion(.failure(.cacheError(reason: String(describing: error))))
            }
        }.resume()
    }
}

public final class ImageCache: @unchecked Sendable {
    public static let `default` = ImageCache(name: "default")
    public let name: String
    public init(name: String) { self.name = name }

    public func clearMemoryCache() {}
    public func cleanExpiredMemoryCache() {}
    public func cleanExpiredDiskCache(completion handler: (() -> Void)? = nil) { handler?() }

    public func clearDiskCache(completion handler: (() -> Void)? = nil) {
        let fm = FileManager.default
        for f in (try? fm.contentsOfDirectory(at: _KFCache.directory, includingPropertiesForKeys: nil)) ?? [] { try? fm.removeItem(at: f) }
        handler?()
    }
    public func clearCache(completion handler: (() -> Void)? = nil) {
        clearMemoryCache()
        clearDiskCache(completion: handler)
    }

    public func isCached(forKey key: String) -> Bool { imageCachedType(forKey: key).cached }
    public func imageCachedType(forKey key: String) -> CacheType {
        guard let url = URL(string: key) else { return .none }
        return FileManager.default.fileExists(atPath: _KFCache.file(for: url).path) ? .disk : .none
    }
    public func removeImage(forKey key: String, completionHandler: (() -> Void)? = nil) {
        if let url = URL(string: key) { try? FileManager.default.removeItem(at: _KFCache.file(for: url)) }
        completionHandler?()
    }

    public func calculateDiskStorageSize(completion handler: @escaping (Result<UInt, KingfisherError>) -> Void) {
        handler(.success(diskSize()))
    }
    public var diskStorageSize: UInt { get async throws { diskSize() } }

    func diskSize() -> UInt {
        let fm = FileManager.default
        var total: UInt = 0
        for f in (try? fm.contentsOfDirectory(at: _KFCache.directory, includingPropertiesForKeys: nil)) ?? [] {
            let attributes = (try? fm.attributesOfItem(atPath: f.path)) ?? [:]
            if let n = attributes[.size] as? NSNumber { total += n.uintValue }
            else if let n = attributes[.size] as? UInt64 { total += UInt(n) }
        }
        return total
    }
}

public final class KingfisherManager: @unchecked Sendable {
    public static let shared = KingfisherManager()
    public var cache: ImageCache = .default
    public var defaultOptions: KingfisherOptionsInfo = []
    public init() {}

    @discardableResult
    public func retrieveImage(with resource: any Resource, options: KingfisherOptionsInfo? = nil,
                              completionHandler: ((Result<RetrieveImageResult, KingfisherError>) -> Void)?) -> Any? {
        _KFCache.download(resource.downloadURL) { result in
            let mapped = result.flatMap { file -> Result<RetrieveImageResult, KingfisherError> in
                guard let image = UIImage(contentsOfFile: file.path) else { return .failure(.processorError(reason: "Not an image: \(file.lastPathComponent)")) }
                return .success(RetrieveImageResult(image: image, cacheType: .disk, source: .network(resource), originalSource: .network(resource),
                                                    data: { try? Data(contentsOf: file) }))
            }
            DispatchQueue.main.async { completionHandler?(mapped) }
        }
        return nil
    }

    public func retrieveImage(with resource: any Resource, options: KingfisherOptionsInfo? = nil) async throws -> RetrieveImageResult {
        try await withCheckedThrowingContinuation { cont in
            retrieveImage(with: resource, options: options) { cont.resume(with: $0) }
        }
    }
}

/// Downloads images ahead of time; a KFImage for the same URL then shows it without waiting.
public final class ImagePrefetcher: @unchecked Sendable {
    let urls: [URL]
    let completion: (([any Resource], [any Resource], [any Resource]) -> Void)?
    var stopped = false

    public init(urls: [URL], options: KingfisherOptionsInfo? = nil,
                completionHandler: (([any Resource], [any Resource], [any Resource]) -> Void)? = nil) {
        self.urls = urls; self.completion = completionHandler
    }
    public convenience init(resources: [any Resource], options: KingfisherOptionsInfo? = nil,
                            completionHandler: (([any Resource], [any Resource], [any Resource]) -> Void)? = nil) {
        self.init(urls: resources.map(\.downloadURL), options: options, completionHandler: completionHandler)
    }

    public func start() {
        let group = DispatchGroup()
        var skipped: [any Resource] = [], failed: [any Resource] = [], completed: [any Resource] = []
        let lock = NSLock()
        for url in urls {
            if FileManager.default.fileExists(atPath: _KFCache.file(for: url).path) { skipped.append(url); continue }
            group.enter()
            _KFCache.download(url) { result in
                lock.lock()
                if case .success = result { completed.append(url) } else { failed.append(url) }
                lock.unlock()
                group.leave()
            }
        }
        group.notify(queue: .main) { [self] in
            if !stopped { completion?(skipped, failed, completed) }
        }
    }
    public func stop() { stopped = true }
}
