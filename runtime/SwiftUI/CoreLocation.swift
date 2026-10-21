// CoreLocation backed by the simulator: Features ▸ Location picks the position, the permission prompt is the
// simulator's system alert, and reverse geocoding goes through SwiftCode (OpenStreetMap, offline for the presets).

public typealias CLLocationDegrees = Double
public typealias CLLocationDistance = Double
public typealias CLLocationSpeed = Double
public typealias CLLocationSpeedAccuracy = Double
public typealias CLLocationDirection = Double
public typealias CLLocationDirectionAccuracy = Double
public typealias CLLocationAccuracy = Double

public let kCLLocationAccuracyBestForNavigation: CLLocationAccuracy = -2
public let kCLLocationAccuracyBest: CLLocationAccuracy = -1
public let kCLLocationAccuracyNearestTenMeters: CLLocationAccuracy = 10
public let kCLLocationAccuracyHundredMeters: CLLocationAccuracy = 100
public let kCLLocationAccuracyKilometer: CLLocationAccuracy = 1000
public let kCLLocationAccuracyThreeKilometers: CLLocationAccuracy = 3000
public let kCLLocationAccuracyReduced: CLLocationAccuracy = 3000
public let kCLDistanceFilterNone: CLLocationDistance = -1
public let CLLocationDistanceMax: CLLocationDistance = .greatestFiniteMagnitude

public struct CLLocationCoordinate2D: Equatable, Hashable, Sendable {
    public var latitude: CLLocationDegrees
    public var longitude: CLLocationDegrees
    public init() { latitude = 0; longitude = 0 }
    public init(latitude: CLLocationDegrees, longitude: CLLocationDegrees) { self.latitude = latitude; self.longitude = longitude }
}
public func CLLocationCoordinate2DMake(_ lat: CLLocationDegrees, _ lon: CLLocationDegrees) -> CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lon) }
public func CLLocationCoordinate2DIsValid(_ c: CLLocationCoordinate2D) -> Bool { abs(c.latitude) <= 90 && abs(c.longitude) <= 180 }
public let kCLLocationCoordinate2DInvalid = CLLocationCoordinate2D(latitude: -180, longitude: -180)

open class CLLocation: NSObject, @unchecked Sendable {
    public let coordinate: CLLocationCoordinate2D
    public let altitude: CLLocationDistance
    public let horizontalAccuracy: CLLocationAccuracy
    public let verticalAccuracy: CLLocationAccuracy
    public let speed: CLLocationSpeed
    public let speedAccuracy: CLLocationSpeedAccuracy
    public let course: CLLocationDirection
    public let courseAccuracy: CLLocationDirectionAccuracy
    public let timestamp: Date

    public init(latitude: CLLocationDegrees, longitude: CLLocationDegrees) {
        coordinate = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
        altitude = 0; horizontalAccuracy = 0; verticalAccuracy = -1; speed = -1; speedAccuracy = -1; course = -1; courseAccuracy = -1; timestamp = Date()
        super.init()
    }
    public init(coordinate: CLLocationCoordinate2D, altitude: CLLocationDistance, horizontalAccuracy: CLLocationAccuracy, verticalAccuracy: CLLocationAccuracy,
                course: CLLocationDirection = -1, speed: CLLocationSpeed = -1, timestamp: Date) {
        self.coordinate = coordinate; self.altitude = altitude; self.horizontalAccuracy = horizontalAccuracy; self.verticalAccuracy = verticalAccuracy
        self.speed = speed; speedAccuracy = speed < 0 ? -1 : 0; self.course = course; courseAccuracy = course < 0 ? -1 : 0; self.timestamp = timestamp
        super.init()
    }
    public convenience init(coordinate: CLLocationCoordinate2D, altitude: CLLocationDistance, horizontalAccuracy: CLLocationAccuracy, verticalAccuracy: CLLocationAccuracy, timestamp: Date) {
        self.init(coordinate: coordinate, altitude: altitude, horizontalAccuracy: horizontalAccuracy, verticalAccuracy: verticalAccuracy, course: -1, speed: -1, timestamp: timestamp)
    }

    /// Great-circle distance in meters.
    open func distance(from other: CLLocation) -> CLLocationDistance {
        let r = 6_371_000.0
        let p1 = coordinate.latitude * .pi / 180, p2 = other.coordinate.latitude * .pi / 180
        let dp = p2 - p1, dl = (other.coordinate.longitude - coordinate.longitude) * .pi / 180
        let a = sin(dp / 2) * sin(dp / 2) + cos(p1) * cos(p2) * sin(dl / 2) * sin(dl / 2)
        return 2 * r * atan2(sqrt(a), sqrt(1 - a))
    }

    /// `<+37.33233141,-122.03121860> +/- 5.00m (speed -1.00 mps / course -1.00) @ 21/10/2026, 18:54:12 Central European Summer Time`
    open override var description: String {
        let f = DateFormatter()
        f.locale = _L10n.shared.locale
        f.dateStyle = .short
        f.timeStyle = .full
        return String(format: "<%+.8f,%+.8f> +/- %.2fm (speed %.2f mps / course %.2f) @ ", coordinate.latitude, coordinate.longitude, horizontalAccuracy, speed, course) + f.string(from: timestamp)
    }
}

public enum CLAuthorizationStatus: Int32, Sendable {
    case notDetermined = 0, restricted = 1, denied = 2, authorizedAlways = 3, authorizedWhenInUse = 4
    @available(*, deprecated, renamed: "authorizedAlways") public static var authorized: CLAuthorizationStatus { .authorizedAlways }
}
public enum CLAccuracyAuthorization: Int, Sendable { case fullAccuracy, reducedAccuracy }
public enum CLActivityType: Int, Sendable { case other = 1, automotiveNavigation, fitness, otherNavigation, airborne }

public struct CLError: Error, CustomStringConvertible, Sendable {
    public enum Code: Int, Sendable { case locationUnknown = 0, denied = 1, network = 2, headingFailure = 3, geocodeFoundNoResult = 8, geocodeFoundPartialResult = 9, geocodeCanceled = 10 }
    public let code: Code
    public init(_ code: Code) { self.code = code }
    public var localizedDescription: String { description }
    public var description: String { "The operation couldn’t be completed. (kCLErrorDomain error \(code.rawValue).)" }
}

public protocol CLLocationManagerDelegate: AnyObject {
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation])
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error)
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager)
    func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus)
    func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading)
}
extension CLLocationManagerDelegate {
    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {}
    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}
    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {}
    public func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {}
    public func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {}
}

open class CLHeading: NSObject {
    public let magneticHeading: CLLocationDirection = 0
    public let trueHeading: CLLocationDirection = 0
    public let headingAccuracy: CLLocationDirection = -1
}

/// The device's location state, shared by every CLLocationManager in the app.
@MainActor
final class _LocationService {
    static let shared = _LocationService()
    var status: CLAuthorizationStatus
    var last: CLLocation?
    var managers: [ObjectIdentifier: Weak] = [:]
    var prompting = false
    final class Weak { weak var m: CLLocationManager?; init(_ m: CLLocationManager) { self.m = m } }

    init() {
        let granted = _launchInfo["location"] as? String
        status = granted == "always" ? .authorizedAlways : granted == "whenInUse" ? .authorizedWhenInUse : granted == "denied" ? .denied : .notDetermined
        _Runtime.listen("loc") { [weak self] v in self?.deliver(v) }
        _Runtime.listen("locStatus") { [weak self] v in if let s = v as? String { self?.setStatus(s) } }
    }

    var authorized: Bool { status == .authorizedWhenInUse || status == .authorizedAlways }
    var anyUpdating: Bool { managers.values.contains { $0.m?.updating == true || $0.m?.oneShot == true } }

    func register(_ m: CLLocationManager) { managers[ObjectIdentifier(m)] = Weak(m) }

    func request(always: Bool) {
        guard status == .notDetermined, !prompting else { return }
        let key = always ? "NSLocationAlwaysAndWhenInUseUsageDescription" : "NSLocationWhenInUseUsageDescription"
        guard let reason = _infoPlist[key] as? String ?? (always ? nil : _infoPlist["NSLocationAlwaysAndWhenInUseUsageDescription"] as? String) else {
            // what iOS logs (and then ignores the request) when Info.plist lacks the purpose string
            FileHandle.standardError.write(("This app has attempted to access privacy-sensitive data without a usage description. The app's Info.plist must contain an “\(key)” key with a string value explaining to the user how the app uses this data\n").data(using: .utf8)!)
            return
        }
        prompting = true
        _Runtime.request("permission", ["kind": "location", "message": reason, "always": always]) { [weak self] v in
            self?.prompting = false
            self?.setStatus(v as? String ?? "denied")
        }
    }

    func setStatus(_ s: String) {
        let new: CLAuthorizationStatus = s == "always" ? .authorizedAlways : (s == "whenInUse" || s == "once") ? .authorizedWhenInUse : s == "denied" ? .denied : .notDetermined
        guard new != status else { return }
        status = new
        for w in managers.values { if let m = w.m { m._authorizationChanged() } }
        updateFeed()
    }

    func updateFeed() {
        _Runtime.request("location", ["on": authorized && anyUpdating])
    }

    func deliver(_ v: Any?) {
        guard authorized else { return }
        guard let d = v as? [String: Any], let lat = d["lat"] as? Double, let lon = d["lon"] as? Double else {
            // Features ▸ Location ▸ None
            for w in managers.values { if let m = w.m, m.updating || m.oneShot { m.delegate?.locationManager(m, didFailWithError: CLError(.locationUnknown)); m.oneShot = false } }
            return
        }
        let loc = CLLocation(coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon), altitude: d["alt"] as? Double ?? 0,
                             horizontalAccuracy: d["acc"] as? Double ?? 5, verticalAccuracy: d["vacc"] as? Double ?? -1,
                             course: d["course"] as? Double ?? -1, speed: d["speed"] as? Double ?? -1, timestamp: Date())
        last = loc
        for w in managers.values {
            guard let m = w.m, m.updating || m.oneShot else { continue }
            if m.oneShot && !m.updating { m.oneShot = false }
            m.delegate?.locationManager(m, didUpdateLocations: [loc])
        }
        if !anyUpdating { updateFeed() }
        _Runtime.setNeedsRender()
    }
}

open class CLLocationManager: NSObject {
    open weak var delegate: CLLocationManagerDelegate? {
        didSet {
            // iOS calls this right after a delegate is set
            if delegate != nil { let d = delegate; DispatchQueue.main.async { MainActor.assumeIsolated { d?.locationManagerDidChangeAuthorization(self) } } }
        }
    }
    open var desiredAccuracy: CLLocationAccuracy = kCLLocationAccuracyBest
    open var distanceFilter: CLLocationDistance = kCLDistanceFilterNone
    open var activityType: CLActivityType = .other
    open var allowsBackgroundLocationUpdates = false
    open var pausesLocationUpdatesAutomatically = true
    open var showsBackgroundLocationIndicator = false
    open var headingFilter: CLLocationDirection = 1
    var updating = false
    var oneShot = false

    public override init() {
        super.init()
        MainActor.assumeIsolated { _LocationService.shared.register(self) }
    }

    open var authorizationStatus: CLAuthorizationStatus { MainActor.assumeIsolated { _LocationService.shared.status } }
    open class func authorizationStatus() -> CLAuthorizationStatus { MainActor.assumeIsolated { _LocationService.shared.status } }
    open var accuracyAuthorization: CLAccuracyAuthorization { .fullAccuracy }
    open class func locationServicesEnabled() -> Bool { true }
    open class func headingAvailable() -> Bool { false }
    open class func significantLocationChangeMonitoringAvailable() -> Bool { true }
    /// The most recent location the device reported (nil until the app is authorized and a fix arrived).
    open var location: CLLocation? { MainActor.assumeIsolated { _LocationService.shared.authorized ? _LocationService.shared.last : nil } }

    open func requestWhenInUseAuthorization() { MainActor.assumeIsolated { _LocationService.shared.request(always: false) } }
    open func requestAlwaysAuthorization() { MainActor.assumeIsolated { _LocationService.shared.request(always: true) } }
    open func requestTemporaryFullAccuracyAuthorization(withPurposeKey key: String, completion: ((Error?) -> Void)? = nil) { completion?(nil) }

    open func startUpdatingLocation() {
        updating = true
        MainActor.assumeIsolated {
            let s = _LocationService.shared
            if s.status == .denied || s.status == .restricted {
                let d = delegate
                DispatchQueue.main.async { d?.locationManager(self, didFailWithError: CLError(.denied)) }
            }
            s.updateFeed()
        }
    }
    open func stopUpdatingLocation() { updating = false; MainActor.assumeIsolated { _LocationService.shared.updateFeed() } }
    /// One location, then stops.
    open func requestLocation() { oneShot = true; MainActor.assumeIsolated { _LocationService.shared.updateFeed() } }
    open func startMonitoringSignificantLocationChanges() { startUpdatingLocation() }
    open func stopMonitoringSignificantLocationChanges() { stopUpdatingLocation() }
    open func startUpdatingHeading() {}
    open func stopUpdatingHeading() {}
    open func dismissHeadingCalibrationDisplay() {}

    func _authorizationChanged() {
        delegate?.locationManagerDidChangeAuthorization(self)
        delegate?.locationManager(self, didChangeAuthorization: authorizationStatus)
    }
}

// MARK: - Geocoding

open class CLPlacemark: NSObject, @unchecked Sendable {
    public let location: CLLocation?
    public let name: String?
    public let thoroughfare: String?
    public let subThoroughfare: String?
    public let locality: String?
    public let subLocality: String?
    public let administrativeArea: String?
    public let subAdministrativeArea: String?
    public let postalCode: String?
    public let isoCountryCode: String?
    public let country: String?
    public let inlandWater: String?
    public let ocean: String?
    public let areasOfInterest: [String]?
    public let timeZone: TimeZone?

    init(_ d: [String: Any], location: CLLocation?) {
        func s(_ k: String) -> String? { (d[k] as? String).flatMap { $0.isEmpty ? nil : $0 } }
        if let location { self.location = location }
        else if let lat = d["lat"] as? Double, let lon = d["lon"] as? Double { self.location = CLLocation(latitude: lat, longitude: lon) }
        else { self.location = nil }
        name = s("name"); thoroughfare = s("thoroughfare"); subThoroughfare = s("subThoroughfare")
        locality = s("locality"); subLocality = s("subLocality"); administrativeArea = s("administrativeArea")
        subAdministrativeArea = s("subAdministrativeArea"); postalCode = s("postalCode"); isoCountryCode = s("isoCountryCode")
        country = s("country"); inlandWater = s("inlandWater"); ocean = s("ocean")
        areasOfInterest = (d["areasOfInterest"] as? [String]).flatMap { $0.isEmpty ? nil : $0 }
        timeZone = s("timeZone").flatMap { TimeZone(identifier: $0) } ?? .current
        super.init()
    }

    open override var description: String {
        [name, thoroughfare.map { t in subThoroughfare.map { "\(t) \($0)" } ?? t }, locality, administrativeArea, postalCode, country]
            .compactMap { $0 }.joined(separator: ", ") + (location.map { " @ \($0)" } ?? "")
    }
}

open class CLGeocoder: NSObject {
    public typealias CompletionHandler = ([CLPlacemark]?, Error?) -> Void
    open private(set) var isGeocoding = false
    public override init() { super.init() }

    open func reverseGeocodeLocation(_ location: CLLocation, completionHandler: @escaping CompletionHandler) {
        reverseGeocodeLocation(location, preferredLocale: nil, completionHandler: completionHandler)
    }
    open func reverseGeocodeLocation(_ location: CLLocation, preferredLocale locale: Locale?, completionHandler: @escaping CompletionHandler) {
        isGeocoding = true
        let lang = locale.map { $0.identifier.split(separator: "_").first.map(String.init) ?? $0.identifier } ?? _L10n.shared.language
        MainActor.assumeIsolated {
            _Runtime.request("geocode", ["lat": location.coordinate.latitude, "lon": location.coordinate.longitude, "lang": lang]) { [weak self] v in
                self?.isGeocoding = false
                CLGeocoder.finish(v, location, completionHandler)
            }
        }
    }
    open func geocodeAddressString(_ address: String, completionHandler: @escaping CompletionHandler) {
        isGeocoding = true
        MainActor.assumeIsolated {
            _Runtime.request("geocodeAddress", ["q": address, "lang": _L10n.shared.language]) { [weak self] v in
                self?.isGeocoding = false
                CLGeocoder.finish(v, nil, completionHandler)
            }
        }
    }
    open func geocodeAddressString(_ address: String, in region: CLRegion?, completionHandler: @escaping CompletionHandler) {
        geocodeAddressString(address, completionHandler: completionHandler)
    }

    static func finish(_ v: Any?, _ location: CLLocation?, _ done: CompletionHandler) {
        guard let list = v as? [[String: Any]], !list.isEmpty else {
            let failed = (v as? [String: Any])?["error"] != nil
            done(nil, CLError(failed ? .network : .geocodeFoundNoResult))
            return
        }
        done(list.map { CLPlacemark($0, location: location) }, nil)
    }

    open func reverseGeocodeLocation(_ location: CLLocation) async throws -> [CLPlacemark] {
        try await withCheckedThrowingContinuation { (c: CheckedContinuation<[CLPlacemark], Error>) in
            reverseGeocodeLocation(location) { p, e in if let p { c.resume(returning: p) } else { c.resume(throwing: e ?? CLError(.geocodeFoundNoResult)) } }
        }
    }
    open func reverseGeocodeLocation(_ location: CLLocation, preferredLocale locale: Locale?) async throws -> [CLPlacemark] {
        try await withCheckedThrowingContinuation { (c: CheckedContinuation<[CLPlacemark], Error>) in
            reverseGeocodeLocation(location, preferredLocale: locale) { p, e in if let p { c.resume(returning: p) } else { c.resume(throwing: e ?? CLError(.geocodeFoundNoResult)) } }
        }
    }
    open func geocodeAddressString(_ address: String) async throws -> [CLPlacemark] {
        try await withCheckedThrowingContinuation { (c: CheckedContinuation<[CLPlacemark], Error>) in
            geocodeAddressString(address) { p, e in if let p { c.resume(returning: p) } else { c.resume(throwing: e ?? CLError(.geocodeFoundNoResult)) } }
        }
    }
    open func cancelGeocode() { isGeocoding = false }
}

open class CLRegion: NSObject {
    public let identifier: String
    public init(identifier: String) { self.identifier = identifier; super.init() }
}
open class CLCircularRegion: CLRegion {
    public let center: CLLocationCoordinate2D
    public let radius: CLLocationDistance
    public init(center: CLLocationCoordinate2D, radius: CLLocationDistance, identifier: String) { self.center = center; self.radius = radius; super.init(identifier: identifier) }
    open func contains(_ c: CLLocationCoordinate2D) -> Bool {
        CLLocation(latitude: center.latitude, longitude: center.longitude).distance(from: CLLocation(latitude: c.latitude, longitude: c.longitude)) <= radius
    }
}
