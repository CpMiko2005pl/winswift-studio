// Foundation APIs that iOS code uses for validation but swift-corelibs-foundation lacks:
// NSPredicate format strings and NSDataDetector. These shadow the corelibs declarations.

/// `NSPredicate(format: "SELF MATCHES %@", regex).evaluate(with: email)` — comparisons on SELF
/// (MATCHES, LIKE, CONTAINS, BEGINSWITH, ENDSWITH, ==, !=, <, >, IN) with [c]/[d] options, joined by AND / OR / NOT.
open class NSPredicate: NSObject, @unchecked Sendable {
    let test: (Any?) -> Bool
    public let predicateFormat: String

    public init(block: @escaping (Any?, [String: Any]?) -> Bool) {
        test = { block($0, nil) }; predicateFormat = "BLOCKPREDICATE"
        super.init()
    }
    public init(value: Bool) { test = { _ in value }; predicateFormat = value ? "TRUEPREDICATE" : "FALSEPREDICATE"; super.init() }
    public convenience init(format: String, _ args: CVarArg...) { self.init(format: format, argumentArray: args) }
    public init(format: String, argumentArray: [Any]?) {
        predicateFormat = format
        var p = _PredicateParser(format, args: argumentArray ?? [])
        let expr = p.parse()
        test = { expr($0) }
        super.init()
    }
    open func evaluate(with object: Any?) -> Bool { test(object) }
    open func evaluate(with object: Any?, substitutionVariables: [String: Any]?) -> Bool { test(object) }
    open override var description: String { predicateFormat }
}

extension Array {
    public func filtered(using predicate: NSPredicate) -> [Element] { filter { predicate.evaluate(with: $0) } }
}

struct _PredicateParser {
    var tokens: [String] = []
    var i = 0
    var args: [Any]
    var argIndex = 0

    init(_ format: String, args: [Any]) {
        self.args = args
        // tokens: quoted strings, %@-style placeholders, words, operators
        let chars = Array(format)
        var k = 0
        while k < chars.count {
            let c = chars[k]
            if c.isWhitespace { k += 1; continue }
            if c == "\"" || c == "'" {
                var s = String(c); k += 1
                while k < chars.count, chars[k] != c { if chars[k] == "\\", k + 1 < chars.count { k += 1 }; s.append(chars[k]); k += 1 }
                k += 1
                tokens.append(s); continue
            }
            if c == "%", k + 1 < chars.count { tokens.append("%" + String(chars[k + 1])); k += 2; continue }
            if "()".contains(c) { tokens.append(String(c)); k += 1; continue }
            if "=!<>&|".contains(c) {
                var s = String(c); k += 1
                while k < chars.count, "=<>&|".contains(chars[k]) { s.append(chars[k]); k += 1 }
                tokens.append(s); continue
            }
            var s = ""
            while k < chars.count, !chars[k].isWhitespace, !"()=!<>\"'%&|".contains(chars[k]) { s.append(chars[k]); k += 1 }
            // operator options like MATCHES[c]
            tokens.append(s)
        }
    }

    mutating func parse() -> (Any?) -> Bool { orExpr() }

    mutating func peek() -> String? { i < tokens.count ? tokens[i] : nil }
    mutating func next() -> String? { defer { i += 1 }; return peek() }

    mutating func orExpr() -> (Any?) -> Bool {
        var lhs = andExpr()
        while let t = peek(), t.uppercased() == "OR" || t == "||" {
            i += 1
            let l = lhs, r = andExpr()
            lhs = { l($0) || r($0) }
        }
        return lhs
    }
    mutating func andExpr() -> (Any?) -> Bool {
        var lhs = notExpr()
        while let t = peek(), t.uppercased() == "AND" || t == "&&" {
            i += 1
            let l = lhs, r = notExpr()
            lhs = { l($0) && r($0) }
        }
        return lhs
    }
    mutating func notExpr() -> (Any?) -> Bool {
        if let t = peek(), t.uppercased() == "NOT" || t == "!" { i += 1; let e = notExpr(); return { !e($0) } }
        if peek() == "(" { i += 1; let e = orExpr(); if peek() == ")" { i += 1 }; return e }
        return comparison()
    }

    mutating func value() -> Any? {
        guard let t = next() else { return nil }
        if t.hasPrefix("%") {
            defer { argIndex += 1 }
            return argIndex < args.count ? args[argIndex] : nil
        }
        if t.hasPrefix("\"") || t.hasPrefix("'") { return String(t.dropFirst()) }
        if let d = Double(t) { return d }
        switch t.uppercased() { case "TRUE", "YES": return true; case "FALSE", "NO": return false; case "NIL", "NULL": return nil; default: return t }
    }

    mutating func comparison() -> (Any?) -> Bool {
        let lhsToken = next() ?? "SELF"
        let isSelf = ["SELF", "SELF.DESCRIPTION"].contains(lhsToken.uppercased())
        var length = false
        if lhsToken.uppercased().hasSuffix(".LENGTH") || lhsToken.uppercased().hasSuffix(".COUNT") { length = true }
        guard var op = next() else { return { _ in false } }
        var options = ""
        if let b = op.firstIndex(of: "[") { options = op[b...].lowercased(); op = String(op[..<b]) }
        let rhs = value()
        let caseInsensitive = options.contains("c"), diacritic = options.contains("d")
        func norm(_ s: String) -> String {
            var s = s
            if caseInsensitive { s = s.lowercased() }
            if diacritic { s = s.folding(options: .diacriticInsensitive, locale: nil) }
            return s
        }
        func string(_ v: Any?) -> String? {
            if let s = v as? String { return s }
            if let s = v as? NSString { return String(s) }
            if let v { return String(describing: v) }
            return nil
        }
        func number(_ v: Any?) -> Double? {
            if let d = v as? Double { return d }
            if let i = v as? Int { return Double(i) }
            if let s = v as? String { return Double(s) }
            return nil
        }
        let opU = op.uppercased()
        return { obj in
            let subject: Any? = isSelf ? obj : obj
            if length, let s = string(subject) {
                guard let r = number(rhs) else { return false }
                let n = Double(s.count)
                switch opU { case "==", "=": return n == r; case "!=", "<>": return n != r; case "<": return n < r; case "<=", "=<": return n <= r; case ">": return n > r; case ">=", "=>": return n >= r; default: return false }
            }
            switch opU {
            case "MATCHES":
                guard let s = string(subject), let pattern = string(rhs) else { return false }
                // MATCHES compares the whole string (ICU regex), like Foundation
                return s.range(of: "^(?:" + pattern + ")$", options: caseInsensitive ? [.regularExpression, .caseInsensitive] : .regularExpression) != nil
            case "LIKE":
                guard let s = string(subject), let p = string(rhs) else { return false }
                var re = "^"
                for ch in p { re += ch == "*" ? ".*" : ch == "?" ? "." : NSRegularExpression.escapedPattern(for: String(ch)) }
                return s.range(of: re + "$", options: caseInsensitive ? [.regularExpression, .caseInsensitive] : .regularExpression) != nil
            case "CONTAINS":
                guard let s = string(subject), let p = string(rhs) else { return false }
                return norm(s).contains(norm(p))
            case "BEGINSWITH":
                guard let s = string(subject), let p = string(rhs) else { return false }
                return norm(s).hasPrefix(norm(p))
            case "ENDSWITH":
                guard let s = string(subject), let p = string(rhs) else { return false }
                return norm(s).hasSuffix(norm(p))
            case "IN":
                guard let s = string(subject) else { return false }
                if let arr = rhs as? [Any] { return arr.contains { string($0).map(norm) == norm(s) } }
                if let r = string(rhs) { return norm(r).contains(norm(s)) }
                return false
            case "==", "=", "!=", "<>":
                let eq: Bool
                if let a = number(subject), let b = number(rhs) { eq = a == b }
                else { eq = string(subject).map(norm) == string(rhs).map(norm) }
                return opU.hasPrefix("!") || opU == "<>" ? !eq : eq
            case "<", "<=", "=<", ">", ">=", "=>":
                guard let a = number(subject), let b = number(rhs) else {
                    guard let x = string(subject), let y = string(rhs) else { return false }
                    switch opU { case "<": return x < y; case "<=", "=<": return x <= y; case ">": return x > y; default: return x >= y }
                }
                switch opU { case "<": return a < b; case "<=", "=<": return a <= b; case ">": return a > b; default: return a >= b }
            default:
                return false
            }
        }
    }
}

/// Swift's `NSTextCheckingResult` on Windows can't describe links or phone numbers; NSDataDetector returns these.
public final class _DataDetectorResult: NSObject {
    public let resultType: NSTextCheckingResult.CheckingType
    public let range: NSRange
    public let url: URL?
    public let phoneNumber: String?
    public let date: Date?
    public var numberOfRanges: Int { 1 }
    public func range(at idx: Int) -> NSRange { range }
    init(_ type: NSTextCheckingResult.CheckingType, _ range: NSRange, url: URL? = nil, phone: String? = nil, date: Date? = nil) {
        resultType = type; self.range = range; self.url = url; phoneNumber = phone; self.date = date
        super.init()
    }
}

/// `NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)` — finds links (incl. e-mail addresses as
/// mailto: URLs), phone numbers and dates.
public final class NSDataDetector: NSObject {
    public let checkingTypes: NSTextCheckingResult.CheckingType
    public init(types: UInt64) throws {
        checkingTypes = NSTextCheckingResult.CheckingType(rawValue: types)
        super.init()
    }

    static let email = try! NSRegularExpression(pattern: "(?:mailto:)?[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}", options: [.caseInsensitive])
    static let web = try! NSRegularExpression(pattern: "(?:https?://|www\\.)[^\\s<>\"]+|\\b[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:com|org|net|pl|io|dev|edu|gov|de|uk|eu|info|app)(?:/[^\\s<>\"]*)?", options: [.caseInsensitive])
    static let phone = try! NSRegularExpression(pattern: "\\+?\\(?\\d[\\d\\s().-]{5,}\\d", options: [])

    public func matches(in string: String, options: NSRegularExpression.MatchingOptions = [], range: NSRange) -> [_DataDetectorResult] {
        var out: [_DataDetectorResult] = []
        let ns = string as NSString
        func taken(_ r: NSRange) -> Bool { out.contains { NSIntersectionRange($0.range, r).length > 0 } }
        if checkingTypes.contains(.link) {
            for m in NSDataDetector.email.matches(in: string, options: [], range: range) {
                var s = ns.substring(with: m.range)
                if !s.lowercased().hasPrefix("mailto:") { s = "mailto:" + s }
                out.append(_DataDetectorResult(.link, m.range, url: URL(string: s)))
            }
            for m in NSDataDetector.web.matches(in: string, options: [], range: range) where !taken(m.range) {
                var s = ns.substring(with: m.range)
                if !s.lowercased().hasPrefix("http") { s = "http://" + s }
                out.append(_DataDetectorResult(.link, m.range, url: URL(string: s)))
            }
        }
        if checkingTypes.contains(.phoneNumber) {
            for m in NSDataDetector.phone.matches(in: string, options: [], range: range) where !taken(m.range) {
                let s = ns.substring(with: m.range)
                if s.filter(\.isNumber).count >= 7 { out.append(_DataDetectorResult(.phoneNumber, m.range, phone: s)) }
            }
        }
        if checkingTypes.contains(.date) {
            let f = DateFormatter()
            for fmt in ["yyyy-MM-dd", "dd.MM.yyyy", "dd/MM/yyyy", "MM/dd/yyyy"] {
                f.dateFormat = fmt
                let re = try! NSRegularExpression(pattern: "\\b\\d{1,4}[-./]\\d{1,2}[-./]\\d{1,4}\\b")
                for m in re.matches(in: string, range: range) where !taken(m.range) {
                    if let d = f.date(from: ns.substring(with: m.range)) { out.append(_DataDetectorResult(.date, m.range, date: d)) }
                }
            }
        }
        return out.sorted { $0.range.location < $1.range.location }
    }
    public func firstMatch(in string: String, options: NSRegularExpression.MatchingOptions = [], range: NSRange) -> _DataDetectorResult? {
        matches(in: string, options: options, range: range).first
    }
    public func numberOfMatches(in string: String, options: NSRegularExpression.MatchingOptions = [], range: NSRange) -> Int {
        matches(in: string, options: options, range: range).count
    }
    public func enumerateMatches(in string: String, options: NSRegularExpression.MatchingOptions = [], range: NSRange, using block: (_DataDetectorResult?, NSRegularExpression.MatchingFlags, UnsafeMutablePointer<ObjCBool>) -> Void) {
        var stop = ObjCBool(false)
        for m in matches(in: string, options: options, range: range) {
            block(m, [], &stop)
            if stop.boolValue { break }
        }
    }
}
