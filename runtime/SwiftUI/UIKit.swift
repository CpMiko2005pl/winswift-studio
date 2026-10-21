// The UIKit pieces SwiftUI apps reach for: the responder chain (Device ▸ Shake ends up in UIWindow.motionEnded),
// UIDevice, UIApplication, UIColor/UIImage bridges, haptics. `import UIKit` resolves to these too.

public enum _UIKit {
    /// SwiftCode compiles `extension UIWindow { override func motionEnded … }` into a UIWindow subclass and puts it here.
    nonisolated(unsafe) public static var windowClass: UIWindow.Type = UIWindow.self
    nonisolated(unsafe) static var keyWindow: UIWindow? = nil
    nonisolated(unsafe) static var delegate: UIApplicationDelegate? = nil

    /// Created on first use, so SwiftCode's entry point (or a preview) can pick the window class first.
    static func window() -> UIWindow {
        if let w = keyWindow { return w }
        let w = windowClass.init()
        keyWindow = w
        UIApplication.shared._windows = [w]
        return w
    }

    @MainActor
    static func boot() {}

    /// Device ▸ Shake: iOS delivers the motion to the key window and up the responder chain.
    @MainActor
    static func shake() {
        let w = window()
        let e = UIEvent(type: .motion, subtype: .motionShake)
        w.motionBegan(.motionShake, with: e)
        w.motionEnded(.motionShake, with: e)
    }
}

// MARK: - Responders

open class UIResponder: NSObject {
    public override init() { super.init() }
    open var next: UIResponder? { nil }
    open func motionBegan(_ motion: UIEvent.EventSubtype, with event: UIEvent?) { next?.motionBegan(motion, with: event) }
    open func motionEnded(_ motion: UIEvent.EventSubtype, with event: UIEvent?) { next?.motionEnded(motion, with: event) }
    open func motionCancelled(_ motion: UIEvent.EventSubtype, with event: UIEvent?) { next?.motionCancelled(motion, with: event) }
    open func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {}
    open func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {}
    open func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {}
    open func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {}
    open var canBecomeFirstResponder: Bool { false }
    open var isFirstResponder: Bool { false }
    @discardableResult open func becomeFirstResponder() -> Bool { false }
    @discardableResult open func resignFirstResponder() -> Bool { _Runtime.endEditing(); return true }
}

open class UIView: UIResponder {
    open var frame: CGRect
    open var bounds: CGRect { CGRect(origin: .zero, size: frame.size) }
    open var backgroundColor: UIColor?
    open var isHidden = false
    open var alpha: CGFloat = 1
    open var tintColor: UIColor! = .systemBlue
    open var isUserInteractionEnabled = true
    open var subviews: [UIView] = []
    open weak var superview: UIView?
    public required override init() { frame = .zero; super.init() }
    public init(frame: CGRect) { self.frame = frame; super.init() }
    open override var next: UIResponder? { superview }
    open func addSubview(_ v: UIView) { subviews.append(v); v.superview = self }
    open func removeFromSuperview() { superview?.subviews.removeAll { $0 === self }; superview = nil }
    @discardableResult open func endEditing(_ force: Bool) -> Bool { _Runtime.endEditing(); return true }
    open func layoutSubviews() {}
    open func setNeedsLayout() {}
    open func layoutIfNeeded() {}
}

open class UIWindow: UIView {
    open var rootViewController: UIViewController?
    open var isKeyWindow: Bool { self === _UIKit.keyWindow }
    open var windowScene: UIWindowScene? { UIApplication.shared.connectedScenes.first as? UIWindowScene }
    open override var next: UIResponder? { UIApplication.shared }
    open func makeKeyAndVisible() {}
    open func makeKey() {}
    public required init() { super.init(frame: CGRect(origin: .zero, size: _screenSize)) }
    public override init(frame: CGRect) { super.init(frame: frame) }
}

open class UIViewController: UIResponder {
    open var view: UIView! = UIView()
    open var title: String?
    open var presentedViewController: UIViewController?
    public override init() { super.init() }
    open func viewDidLoad() {}
    open func viewWillAppear(_ animated: Bool) {}
    open func viewDidAppear(_ animated: Bool) {}
    open func viewWillDisappear(_ animated: Bool) {}
    open func viewDidDisappear(_ animated: Bool) {}
    open func present(_ vc: UIViewController, animated: Bool, completion: (() -> Void)? = nil) { presentedViewController = vc; completion?() }
    open func dismiss(animated: Bool, completion: (() -> Void)? = nil) { presentedViewController = nil; completion?() }
}

public final class UIHostingController<Content: View>: UIViewController {
    public var rootView: Content
    public init(rootView: Content) { self.rootView = rootView; super.init() }
}

open class UIScene: UIResponder {}
open class UIWindowScene: UIScene {
    open var windows: [UIWindow] { UIApplication.shared._windows }
    open var keyWindow: UIWindow? { _UIKit.window() }
}

open class UITouch: NSObject {
    open func location(in view: UIView?) -> CGPoint { .zero }
}

open class UIEvent: NSObject {
    public enum EventType: Int, Sendable { case touches, motion, remoteControl, presses, scroll, hover, transform }
    public enum EventSubtype: Int, Sendable {
        case none = 0, motionShake = 1
        case remoteControlPlay = 100, remoteControlPause, remoteControlStop, remoteControlTogglePlayPause
        case remoteControlNextTrack, remoteControlPreviousTrack
    }
    open private(set) var type: EventType
    open private(set) var subtype: EventSubtype
    open private(set) var timestamp: TimeInterval
    init(type: EventType, subtype: EventSubtype) {
        self.type = type; self.subtype = subtype; timestamp = ProcessInfo.processInfo.systemUptime
        super.init()
    }
}

// MARK: - Application

public protocol UIApplicationDelegate: AnyObject {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool
    func applicationDidBecomeActive(_ application: UIApplication)
    func applicationWillResignActive(_ application: UIApplication)
    func applicationDidEnterBackground(_ application: UIApplication)
    func applicationWillEnterForeground(_ application: UIApplication)
    func applicationWillTerminate(_ application: UIApplication)
}
extension UIApplicationDelegate {
    public func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool { true }
    public func applicationDidBecomeActive(_ application: UIApplication) {}
    public func applicationWillResignActive(_ application: UIApplication) {}
    public func applicationDidEnterBackground(_ application: UIApplication) {}
    public func applicationWillEnterForeground(_ application: UIApplication) {}
    public func applicationWillTerminate(_ application: UIApplication) {}
}

open class UIApplication: UIResponder {
    nonisolated(unsafe) public static let shared = UIApplication()
    public struct LaunchOptionsKey: Hashable, RawRepresentable, Sendable { public let rawValue: String; public init(rawValue: String) { self.rawValue = rawValue } }
    public struct OpenExternalURLOptionsKey: Hashable, RawRepresentable, Sendable { public let rawValue: String; public init(rawValue: String) { self.rawValue = rawValue } }
    public enum State: Int, Sendable { case active, inactive, background }
    public static let openSettingsURLString = "app-settings:"
    public static let didBecomeActiveNotification = Notification.Name("UIApplicationDidBecomeActiveNotification")
    public static let willResignActiveNotification = Notification.Name("UIApplicationWillResignActiveNotification")
    public static let didEnterBackgroundNotification = Notification.Name("UIApplicationDidEnterBackgroundNotification")
    public static let willEnterForegroundNotification = Notification.Name("UIApplicationWillEnterForegroundNotification")
    public static let keyboardWillShowNotification = Notification.Name("UIKeyboardWillShowNotification")
    public static let keyboardWillHideNotification = Notification.Name("UIKeyboardWillHideNotification")

    var _windows: [UIWindow] = []
    open var windows: [UIWindow] { [_UIKit.window()] }
    open var keyWindow: UIWindow? { _UIKit.window() }
    open var connectedScenes: Set<UIScene> { [_scene] }
    let _scene = UIWindowScene()
    open var delegate: UIApplicationDelegate? { _UIKit.delegate }
    open var applicationState: State { _scenePhase == .active ? .active : _scenePhase == .inactive ? .inactive : .background }
    open var applicationIconBadgeNumber = 0
    open var isIdleTimerDisabled = false
    open override var next: UIResponder? { nil }

    open func open(_ url: URL, options: [OpenExternalURLOptionsKey: Any] = [:], completionHandler: ((Bool) -> Void)? = nil) {
        MainActor.assumeIsolated { _Runtime.request("openURL", ["url": url.absoluteString]) }
        completionHandler?(true)
    }
    open func canOpenURL(_ url: URL) -> Bool { ["http", "https", "mailto", "tel", "app-settings", "maps"].contains(url.scheme?.lowercased() ?? "") }
    /// `sendAction(#selector(UIResponder.resignFirstResponder), …)` hides the keyboard
    @discardableResult
    open func sendAction(_ action: Selector, to target: Any?, from sender: Any?, for event: UIEvent?) -> Bool {
        if action.name.contains("resignFirstResponder") { _Runtime.endEditing() }
        return true
    }
    open func registerForRemoteNotifications() {}
}

/// `#selector(...)` (SwiftCode rewrites it to `Selector("…")`: there is no Objective-C runtime on Windows)
public struct Selector: Hashable, Sendable, ExpressibleByStringLiteral {
    public let name: String
    public init(_ name: String) { self.name = name }
    public init(stringLiteral value: String) { name = value }
}

extension _Runtime {
    /// Dismisses the simulator's keyboard (blurs the focused text field).
    static func endEditing() { DispatchQueue.main.async { MainActor.assumeIsolated { _Runtime.request("endEditing") } } }
}

// MARK: - Device & screen

public enum UIUserInterfaceIdiom: Int, Sendable { case unspecified = -1, phone, pad, tv, carPlay, mac, vision }
public enum UIDeviceOrientation: Int, Sendable {
    case unknown, portrait, portraitUpsideDown, landscapeLeft, landscapeRight, faceUp, faceDown
    public var isPortrait: Bool { self == .portrait || self == .portraitUpsideDown }
    public var isLandscape: Bool { self == .landscapeLeft || self == .landscapeRight }
    public var isFlat: Bool { self == .faceUp || self == .faceDown }
    public var isValidInterfaceOrientation: Bool { isPortrait || isLandscape }
}

open class UIDevice: NSObject {
    nonisolated(unsafe) public static let current = UIDevice()
    public enum BatteryState: Int, Sendable { case unknown, unplugged, charging, full }
    public static let orientationDidChangeNotification = Notification.Name("UIDeviceOrientationDidChangeNotification")
    public static let batteryLevelDidChangeNotification = Notification.Name("UIDeviceBatteryLevelDidChangeNotification")
    open var name: String { "iPhone" }
    open var model: String { "iPhone" }
    open var localizedModel: String { "iPhone" }
    open var systemName: String { "iOS" }
    open var systemVersion: String { "18.0" }
    open var userInterfaceIdiom: UIUserInterfaceIdiom { .phone }
    open var orientation: UIDeviceOrientation { .portrait }
    open var identifierForVendor: UUID? { _vendorID }
    let _vendorID = UUID()
    open var isBatteryMonitoringEnabled = false
    open var batteryLevel: Float { isBatteryMonitoringEnabled ? 1 : -1 }
    open var batteryState: BatteryState { isBatteryMonitoringEnabled ? .full : .unknown }
    open var isProximityMonitoringEnabled = false
    open var isMultitaskingSupported: Bool { true }
    open func beginGeneratingDeviceOrientationNotifications() {}
    open func endGeneratingDeviceOrientationNotifications() {}
    open func playInputClick() {}
}

/// The simulated device's screen in points (Product ▸ Destination picks the model; SWIFTCODE_SCREEN="402x874").
let _screenSize: CGSize = {
    let parts = (ProcessInfo.processInfo.environment["SWIFTCODE_SCREEN"] ?? "").split(separator: "x").compactMap { Double($0) }
    return parts.count == 2 ? CGSize(width: parts[0], height: parts[1]) : CGSize(width: 393, height: 852)
}()

open class UIScreen: NSObject {
    nonisolated(unsafe) public static let main = UIScreen()
    open var bounds: CGRect { CGRect(origin: .zero, size: _screenSize) }
    open var nativeBounds: CGRect { CGRect(x: 0, y: 0, width: _screenSize.width * scale, height: _screenSize.height * scale) }
    open var scale: CGFloat { _screenSize.height < 700 ? 2 : 3 }
    open var brightness: CGFloat = 0.5
}

// MARK: - Haptics (the simulator, like Apple's, has no Taptic Engine)

open class UIFeedbackGenerator: NSObject {
    open func prepare() {}
}
open class UIImpactFeedbackGenerator: UIFeedbackGenerator {
    public enum FeedbackStyle: Int, Sendable { case light, medium, heavy, soft, rigid }
    public init(style: FeedbackStyle = .medium) { super.init() }
    public override init() { super.init() }
    open func impactOccurred() {}
    open func impactOccurred(intensity: CGFloat) {}
}
open class UINotificationFeedbackGenerator: UIFeedbackGenerator {
    public enum FeedbackType: Int, Sendable { case success, warning, error }
    open func notificationOccurred(_ type: FeedbackType) {}
}
open class UISelectionFeedbackGenerator: UIFeedbackGenerator {
    open func selectionChanged() {}
}

open class UIPasteboard: NSObject {
    nonisolated(unsafe) public static let general = UIPasteboard()
    open var string: String?
    open var strings: [String]? { string.map { [$0] } }
    open var url: URL?
    open var hasStrings: Bool { string != nil }
}

// MARK: - Colors

open class UITraitCollection: NSObject {
    open var userInterfaceStyle: UIUserInterfaceStyle { _currentScheme == .dark ? .dark : .light }
    nonisolated(unsafe) public static var current = UITraitCollection()
}
public enum UIUserInterfaceStyle: Int, Sendable { case unspecified, light, dark }

open class UIColor: NSObject {
    let css: String
    init(css: String) { self.css = css; super.init() }
    public init(red: CGFloat, green: CGFloat, blue: CGFloat, alpha: CGFloat) { css = Color(red: Double(red), green: Double(green), blue: Double(blue), opacity: Double(alpha)).css; super.init() }
    public init(white: CGFloat, alpha: CGFloat) { css = Color(white: Double(white), opacity: Double(alpha)).css; super.init() }
    public init(hue: CGFloat, saturation: CGFloat, brightness: CGFloat, alpha: CGFloat) { css = Color(hue: Double(hue), saturation: Double(saturation), brightness: Double(brightness), opacity: Double(alpha)).css; super.init() }
    public convenience init?(named name: String) { guard let c = _assetColor(name) else { return nil }; self.init(css: c) }
    public convenience init(_ color: Color) { self.init(css: color.css) }
    public convenience init(dynamicProvider: @escaping (UITraitCollection) -> UIColor) { self.init(css: dynamicProvider(UITraitCollection()).css) }
    open func withAlphaComponent(_ a: CGFloat) -> UIColor { UIColor(css: Color(css: css).opacity(Double(a)).css) }

    open class var red: UIColor { UIColor(css: "#ff0000") }
    open class var green: UIColor { UIColor(css: "#00ff00") }
    open class var blue: UIColor { UIColor(css: "#0000ff") }
    open class var black: UIColor { UIColor(css: "#000") }
    open class var white: UIColor { UIColor(css: "#fff") }
    open class var gray: UIColor { UIColor(css: "#808080") }
    open class var lightGray: UIColor { UIColor(css: "#aaaaaa") }
    open class var darkGray: UIColor { UIColor(css: "#555555") }
    open class var clear: UIColor { UIColor(css: "transparent") }
    open class var orange: UIColor { UIColor(css: "#ff8000") }
    open class var yellow: UIColor { UIColor(css: "#ffff00") }
    open class var purple: UIColor { UIColor(css: "#800080") }
    open class var brown: UIColor { UIColor(css: "#996633") }
    open class var cyan: UIColor { UIColor(css: "#00ffff") }
    open class var magenta: UIColor { UIColor(css: "#ff00ff") }

    open class var systemRed: UIColor { UIColor(css: "var(--red)") }
    open class var systemOrange: UIColor { UIColor(css: "var(--orange)") }
    open class var systemYellow: UIColor { UIColor(css: "var(--yellow)") }
    open class var systemGreen: UIColor { UIColor(css: "var(--green)") }
    open class var systemMint: UIColor { UIColor(css: "var(--mint)") }
    open class var systemTeal: UIColor { UIColor(css: "var(--teal)") }
    open class var systemCyan: UIColor { UIColor(css: "var(--cyan)") }
    open class var systemBlue: UIColor { UIColor(css: "var(--blue)") }
    open class var systemIndigo: UIColor { UIColor(css: "var(--indigo)") }
    open class var systemPurple: UIColor { UIColor(css: "var(--purple)") }
    open class var systemPink: UIColor { UIColor(css: "var(--pink)") }
    open class var systemBrown: UIColor { UIColor(css: "var(--brown)") }
    open class var systemGray: UIColor { UIColor(css: "var(--gray)") }
    open class var systemGray2: UIColor { UIColor(css: "var(--gray2)") }
    open class var systemGray3: UIColor { UIColor(css: "var(--gray3)") }
    open class var systemGray4: UIColor { UIColor(css: "var(--gray4)") }
    open class var systemGray5: UIColor { UIColor(css: "var(--gray5)") }
    open class var systemGray6: UIColor { UIColor(css: "var(--gray6)") }
    open class var label: UIColor { UIColor(css: "var(--label)") }
    open class var secondaryLabel: UIColor { UIColor(css: "var(--label2)") }
    open class var tertiaryLabel: UIColor { UIColor(css: "var(--label3)") }
    open class var quaternaryLabel: UIColor { UIColor(css: "var(--label4)") }
    open class var placeholderText: UIColor { UIColor(css: "var(--label3)") }
    open class var link: UIColor { UIColor(css: "var(--blue)") }
    open class var separator: UIColor { UIColor(css: "var(--separator)") }
    open class var opaqueSeparator: UIColor { UIColor(css: "var(--separator)") }
    open class var systemBackground: UIColor { UIColor(css: "var(--bg)") }
    open class var secondarySystemBackground: UIColor { UIColor(css: "var(--bg2)") }
    open class var tertiarySystemBackground: UIColor { UIColor(css: "var(--bg3)") }
    open class var systemGroupedBackground: UIColor { UIColor(css: "var(--grouped)") }
    open class var secondarySystemGroupedBackground: UIColor { UIColor(css: "var(--cell)") }
    open class var tertiarySystemGroupedBackground: UIColor { UIColor(css: "var(--grouped)") }
    open class var systemFill: UIColor { UIColor(css: "var(--fill)") }
    open class var secondarySystemFill: UIColor { UIColor(css: "var(--fill2)") }
    open class var tertiarySystemFill: UIColor { UIColor(css: "var(--fill3)") }
    open class var quaternarySystemFill: UIColor { UIColor(css: "var(--fill3)") }
    open class var tintColor: UIColor { UIColor(css: "var(--accent)") }
    open class var darkText: UIColor { UIColor(css: "#000") }
    open class var lightText: UIColor { UIColor(css: "rgba(255,255,255,.6)") }
}

extension Color {
    public init(_ uiColor: UIColor) { self.init(css: uiColor.css) }
    public init(uiColor: UIColor) { self.init(css: uiColor.css) }
}

// MARK: - Images & fonts

open class UIImage: NSObject {
    let source: Image.Source
    public var size: CGSize = .zero
    init(source: Image.Source) { self.source = source; super.init() }
    public convenience init?(named name: String) { guard _assetImage(name) != nil else { return nil }; self.init(source: .asset(name)) }
    public convenience init?(systemName name: String) { self.init(source: .symbol(name)) }
    public convenience init?(contentsOfFile path: String) { guard FileManager.default.fileExists(atPath: path) else { return nil }; self.init(source: .file(path)) }
    public convenience init?(data: Data) {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("swiftcode-img-\(UUID().uuidString)")
        guard (try? data.write(to: url)) != nil else { return nil }
        self.init(source: .file(url.path))
    }
    open func withRenderingMode(_ m: RenderingMode) -> UIImage { self }
    open func withTintColor(_ c: UIColor) -> UIImage { self }
    public enum RenderingMode: Int, Sendable { case automatic, alwaysOriginal, alwaysTemplate }
}

extension Image {
    public init(uiImage: UIImage) { source = uiImage.source }
}

open class UIFont: NSObject {
    public let pointSize: CGFloat
    let weight: Font.Weight
    init(size: CGFloat, weight: Font.Weight) { pointSize = size; self.weight = weight; super.init() }
    public struct Weight: Hashable, Sendable {
        let w: Font.Weight
        public static let regular = Weight(w: .regular), medium = Weight(w: .medium), semibold = Weight(w: .semibold), bold = Weight(w: .bold)
        public static let light = Weight(w: .light), thin = Weight(w: .thin), heavy = Weight(w: .heavy), black = Weight(w: .black), ultraLight = Weight(w: .ultraLight)
    }
    public enum TextStyle: Sendable { case largeTitle, title1, title2, title3, headline, subheadline, body, callout, footnote, caption1, caption2 }
    open class func systemFont(ofSize size: CGFloat) -> UIFont { UIFont(size: size, weight: .regular) }
    open class func systemFont(ofSize size: CGFloat, weight: Weight) -> UIFont { UIFont(size: size, weight: weight.w) }
    open class func boldSystemFont(ofSize size: CGFloat) -> UIFont { UIFont(size: size, weight: .bold) }
    open class func preferredFont(forTextStyle style: TextStyle) -> UIFont {
        let sizes: [TextStyle: CGFloat] = [.largeTitle: 34, .title1: 28, .title2: 22, .title3: 20, .headline: 17, .subheadline: 15, .body: 17, .callout: 16, .footnote: 13, .caption1: 12, .caption2: 11]
        return UIFont(size: sizes[style] ?? 17, weight: style == .headline ? .semibold : .regular)
    }
}

extension Font {
    public init(_ font: UIFont) { self = .system(size: font.pointSize, weight: font.weight) }
}

// MARK: - Representables (compile; drawn as a placeholder box)

public struct UIViewRepresentableContext<R> {
    public let coordinator: Any
    public var environment: EnvironmentValues { EnvironmentValues() }
}

@MainActor
public protocol UIViewRepresentable: View where Body == Never {
    associatedtype UIViewType: UIView
    associatedtype Coordinator = Void
    typealias Context = UIViewRepresentableContext<Self>
    func makeUIView(context: Context) -> UIViewType
    func updateUIView(_ uiView: UIViewType, context: Context)
    func makeCoordinator() -> Coordinator
}
extension UIViewRepresentable where Coordinator == Void {
    public func makeCoordinator() {}
}
extension UIViewRepresentable {
    public var body: Never { fatalError() }
}

public struct UIViewControllerRepresentableContext<R> {
    public let coordinator: Any
    public var environment: EnvironmentValues { EnvironmentValues() }
}

@MainActor
public protocol UIViewControllerRepresentable: View where Body == Never {
    associatedtype UIViewControllerType: UIViewController
    associatedtype Coordinator = Void
    typealias Context = UIViewControllerRepresentableContext<Self>
    func makeUIViewController(context: Context) -> UIViewControllerType
    func updateUIViewController(_ vc: UIViewControllerType, context: Context)
    func makeCoordinator() -> Coordinator
}
extension UIViewControllerRepresentable where Coordinator == Void {
    public func makeCoordinator() {}
}
extension UIViewControllerRepresentable {
    public var body: Never { fatalError() }
}
