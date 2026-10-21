// Localization: Localizable.strings / .stringsdict / .xcstrings from the project, picked by the simulator's
// language (SWIFTCODE_LANG), the same lookup order a bundle uses on iOS.

// MARK: - LocalizedStringKey

public enum _LocArg: Equatable, Sendable {
    case s(String), i(Int64), d(Double)

    var string: String {
        switch self {
        case .s(let v): return v
        case .i(let v): return String(v)
        case .d(let v): return String(v)
        }
    }
    var number: Double? {
        switch self {
        case .s(let v): return Double(v)
        case .i(let v): return Double(v)
        case .d(let v): return v
        }
    }
}

public struct LocalizedStringKey: Equatable, Sendable, ExpressibleByStringInterpolation {
    var key: String
    var args: [_LocArg] = []
    var verbatim = false

    public init(_ value: String) { key = value }
    public init(stringLiteral value: String) { key = value }
    public init(stringInterpolation: StringInterpolation) { key = stringInterpolation.key; args = stringInterpolation.args }
    init(verbatim value: String) { key = value; verbatim = true }

    public struct StringInterpolation: StringInterpolationProtocol {
        var key = ""
        var args: [_LocArg] = []
        public init(literalCapacity: Int, interpolationCount: Int) {}
        public mutating func appendLiteral(_ literal: String) { key += literal.replacingOccurrences(of: "%", with: "%%") }
        public mutating func appendInterpolation(_ string: String) { key += "%@"; args.append(.s(string)) }
        public mutating func appendInterpolation<T: BinaryInteger>(_ value: T) { key += "%lld"; args.append(.i(Int64(value))) }
        public mutating func appendInterpolation<T: BinaryFloatingPoint>(_ value: T) { key += "%lf"; args.append(.d(Double(value))) }
        public mutating func appendInterpolation<T>(_ value: T) { key += "%@"; args.append(.s(String(describing: value))) }
        public mutating func appendInterpolation<T: BinaryInteger>(_ value: T, specifier: String) { key += specifier; args.append(.i(Int64(value))) }
        public mutating func appendInterpolation<T: BinaryFloatingPoint>(_ value: T, specifier: String) { key += specifier; args.append(.d(Double(value))) }
        public mutating func appendInterpolation(_ text: Text) { key += "%@"; args.append(.s(text._plain)) }
        public mutating func appendInterpolation(_ image: Image) { key += "%@"; args.append(.s(image.symbolText)) }
        public mutating func appendInterpolation(_ date: Date, style: Text.DateStyle) { key += "%@"; args.append(.s(Text._format(date, style))) }
        public mutating func appendInterpolation<F: FormatStyle>(_ input: F.FormatInput, format: F) where F.FormatOutput == String {
            key += "%@"; args.append(.s(format.format(input)))
        }
    }

    /// The text shown for this key in the given language (nil = the simulator's language).
    func resolved(_ language: String? = nil, table: String? = nil) -> String {
        if verbatim { return key }
        let format = _L10n.shared.lookup(key, table: table, language: language) ?? .plain(key)
        return format.render(args, language: language ?? _L10n.shared.language)
    }
}

// MARK: - Foundation entry points (shadow the corelibs versions, which can't switch language at runtime)

public func NSLocalizedString(_ key: String, comment: String) -> String { _localized(key, nil) }
public func NSLocalizedString(_ key: String, tableName: String?, comment: String) -> String { _localized(key, tableName) }
public func NSLocalizedString(_ key: String, value: String, comment: String) -> String { _localized(key, nil, value: value) }
public func NSLocalizedString(_ key: String, tableName: String?, value: String, comment: String) -> String { _localized(key, tableName, value: value) }
public func NSLocalizedString(_ key: String, bundle: Bundle, comment: String) -> String { _localized(key, nil) }
public func NSLocalizedString(_ key: String, tableName: String?, bundle: Bundle, comment: String) -> String { _localized(key, tableName) }
public func NSLocalizedString(_ key: String, bundle: Bundle, value: String, comment: String) -> String { _localized(key, nil, value: value) }

func _localized(_ key: String, _ table: String?, value: String? = nil) -> String {
    guard let entry = _L10n.shared.lookup(key, table: table, language: nil) else { return (value?.isEmpty == false ? value! : key) }
    // a plain NSLocalizedString keeps format specifiers for String(format:)
    if case .plain(let s) = entry { return s }
    return entry.render([], language: _L10n.shared.language)
}

public struct _LocalizationKey: ExpressibleByStringInterpolation, Sendable {
    let key: LocalizedStringKey
    public init(stringLiteral value: String) { key = LocalizedStringKey(stringLiteral: value) }
    public init(stringInterpolation: LocalizedStringKey.StringInterpolation) { key = LocalizedStringKey(stringInterpolation: stringInterpolation) }
}

extension String {
    /// `String(localized: "Hello \(name)")`
    public init(localized key: _LocalizationKey) { self = key.key.resolved() }
    public init(localized key: _LocalizationKey, comment: StaticString) { self = key.key.resolved() }
    public init(localized key: _LocalizationKey, table: String?, comment: StaticString) { self = key.key.resolved(table: table) }
    public init(localized key: _LocalizationKey, defaultValue: _LocalizationKey, comment: StaticString) {
        let k = key.key
        self = _L10n.shared.lookup(k.key, table: nil, language: nil) == nil ? defaultValue.key.resolved() : k.resolved()
    }
}

// MARK: - System strings (what UIKit itself shows: Edit, Done, Cancel…)

let _systemStrings: [String: [String: String]] = [
    "pl": ["OK": "OK", "Cancel": "Anuluj", "Edit": "Edycja", "Done": "Gotowe", "Delete": "Usuń", "Back": "Wróć", "Search": "Szukaj", "Close": "Zamknij", "Save": "Zachowaj", "Add": "Dodaj"],
    "de": ["Cancel": "Abbrechen", "Edit": "Bearbeiten", "Done": "Fertig", "Delete": "Löschen", "Back": "Zurück", "Search": "Suchen", "Close": "Schließen", "Save": "Sichern", "Add": "Hinzufügen"],
    "fr": ["Cancel": "Annuler", "Edit": "Modifier", "Done": "OK", "Delete": "Supprimer", "Back": "Retour", "Search": "Rechercher", "Close": "Fermer", "Save": "Enregistrer", "Add": "Ajouter"],
    "es": ["Cancel": "Cancelar", "Edit": "Editar", "Done": "OK", "Delete": "Eliminar", "Back": "Atrás", "Search": "Buscar", "Close": "Cerrar", "Save": "Guardar", "Add": "Añadir"],
    "it": ["Cancel": "Annulla", "Edit": "Modifica", "Done": "Fine", "Delete": "Elimina", "Back": "Indietro", "Search": "Cerca", "Close": "Chiudi", "Save": "Salva", "Add": "Aggiungi"],
    "uk": ["Cancel": "Скасувати", "Edit": "Редагувати", "Done": "Готово", "Delete": "Видалити", "Back": "Назад", "Search": "Пошук", "Close": "Закрити", "Save": "Зберегти", "Add": "Додати"],
]

func _systemString(_ s: String) -> String {
    let lang = _L10n.shared.language.split(separator: "-").first.map(String.init) ?? _L10n.shared.language
    return _systemStrings[lang]?[s] ?? s
}

// MARK: - Tables

enum _LocEntry {
    case plain(String)
    /// .stringsdict: "%#@var@" placeholders with plural forms per variable
    case dict(format: String, vars: [String: [String: String]])
    /// .xcstrings plural variations
    case plural([String: String])

    func render(_ args: [_LocArg], language: String) -> String {
        switch self {
        case .plain(let f):
            return args.isEmpty && !f.contains("%") ? f : _format(f, args, language: language)
        case .plural(let forms):
            let n = args.lazy.compactMap(\.number).first ?? 0
            let f = forms[_pluralCategory(n, language)] ?? forms["other"] ?? forms.values.first ?? ""
            return _format(f, args, language: language)
        case .dict(let format, let vars):
            // walk the format: %#@var@ picks a plural form for the next argument
            var out = ""
            var argIndex = 0
            var i = format.startIndex
            while i < format.endIndex {
                let c = format[i]
                if c == "%", format[i...].hasPrefix("%#@"), let end = format[format.index(i, offsetBy: 3)...].firstIndex(of: "@") {
                    let name = String(format[format.index(i, offsetBy: 3)..<end])
                    let arg = argIndex < args.count ? args[argIndex] : .i(0)
                    let forms = vars[name] ?? [:]
                    let form = forms[_pluralCategory(arg.number ?? 0, language)] ?? forms["other"] ?? ""
                    out += _format(form, [arg], language: language)
                    argIndex += 1
                    i = format.index(after: end)
                    continue
                }
                if c == "%" {
                    // ordinary specifier: hand it (with its argument) to the formatter
                    var j = format.index(after: i)
                    while j < format.endIndex, !"@dDiuUxXoOfFeEgGcCsSaAp%".contains(format[j]) { j = format.index(after: j) }
                    guard j < format.endIndex else { out += String(format[i...]); break }
                    let spec = String(format[i...j])
                    if spec == "%%" { out += "%" } else {
                        out += _format(spec, argIndex < args.count ? [args[argIndex]] : [], language: language)
                        argIndex += 1
                    }
                    i = format.index(after: j)
                    continue
                }
                out.append(c)
                i = format.index(after: i)
            }
            return out
        }
    }
}

/// CLDR plural category for the languages people localize into most; others fall back to one/other.
func _pluralCategory(_ n: Double, _ language: String) -> String {
    let lang = language.split(separator: "-").first.map(String.init)?.lowercased() ?? language
    let isInt = n == n.rounded()
    let i = Int(abs(n))
    switch lang {
    case "pl":
        if !isInt { return "other" }
        if i == 1 { return "one" }
        if (2...4).contains(i % 10) && !(12...14).contains(i % 100) { return "few" }
        return "many"
    case "uk", "ru", "be":
        if !isInt { return "other" }
        if i % 10 == 1 && i % 100 != 11 { return "one" }
        if (2...4).contains(i % 10) && !(12...14).contains(i % 100) { return "few" }
        return "many"
    case "cs", "sk":
        if !isInt { return "many" }
        if i == 1 { return "one" }
        if (2...4).contains(i) { return "few" }
        return "other"
    case "fr":
        return i == 0 || i == 1 ? "one" : "other"
    case "ja", "zh", "ko", "vi", "th":
        return "other"
    default:
        return n == 1 ? "one" : "other"
    }
}

/// printf-style formatting for localized strings: %@ %d %i %ld %lld %u %f %lf %.2f %e %g %x %c, positional %1$@.
func _format(_ format: String, _ args: [_LocArg], language: String) -> String {
    var out = ""
    var next = 0
    var i = format.startIndex
    while i < format.endIndex {
        let c = format[i]
        guard c == "%" else { out.append(c); i = format.index(after: i); continue }
        var j = format.index(after: i)
        guard j < format.endIndex else { out.append(c); break }
        if format[j] == "%" { out.append("%"); i = format.index(after: j); continue }
        // optional positional index "n$"
        var position: Int? = nil
        var k = j
        while k < format.endIndex, format[k].isNumber { k = format.index(after: k) }
        if k < format.endIndex, format[k] == "$", k > j, let p = Int(format[j..<k]) { position = p - 1; j = format.index(after: k) }
        let flagsStart = j
        while j < format.endIndex, "-+ #0123456789.*".contains(format[j]) { j = format.index(after: j) }
        let flags = String(format[flagsStart..<j])
        while j < format.endIndex, "hlqLzjt".contains(format[j]) { j = format.index(after: j) }
        guard j < format.endIndex else { out += String(format[i...]); break }
        let conv = format[j]
        let idx = position ?? next
        if position == nil { next += 1 }
        let arg: _LocArg? = idx < args.count ? args[idx] : nil
        switch conv {
        case "@", "s", "S":
            out += arg?.string ?? ""
        case "d", "D", "i", "u", "U", "x", "X", "o", "O", "c", "C":
            let v: Int64
            switch arg { case .i(let x)?: v = x; case .d(let x)?: v = Int64(x); case .s(let s)?: v = Int64(s) ?? 0; case nil: v = 0 }
            let cc: Character = (conv == "D" || conv == "i" || conv == "U") ? (conv == "U" ? "u" : "d") : (conv == "O" ? "o" : (conv == "C" ? "c" : conv))
            out += String(format: "%" + flags + "ll" + String(cc), v)
        case "f", "F", "e", "E", "g", "G", "a", "A":
            let v: Double
            switch arg { case .i(let x)?: v = Double(x); case .d(let x)?: v = x; case .s(let s)?: v = Double(s) ?? 0; case nil: v = 0 }
            out += String(format: "%" + flags + String(conv), v)
        default:
            out += String(format[i...j])
        }
        i = format.index(after: j)
    }
    return out
}

final class _L10n: @unchecked Sendable {
    nonisolated(unsafe) static let shared = _L10n()

    /// The simulator's language, e.g. "pl" (set by SwiftCode when it launches the app).
    let language: String
    let region: String?
    let developmentRegion: String
    /// language → table → key → entry
    private var lproj: [String: [String: [String: _LocEntry]]] = [:]
    /// tables that aren't inside a .lproj folder (unlocalized resources)
    private var loose: [String: [String: _LocEntry]] = [:]
    /// .xcstrings: table → key → language → entry
    private var catalogs: [String: [String: [String: _LocEntry]]] = [:]
    private var catalogSource: [String: String] = [:]

    var localeIdentifier: String { region.map { "\(language)_\($0)" } ?? language }
    let locale: Locale

    init() {
        let env = ProcessInfo.processInfo.environment
        let dev = env["SWIFTCODE_DEVREGION"].flatMap { $0.isEmpty ? nil : $0 } ?? "en"
        let lang = env["SWIFTCODE_LANG"].flatMap { $0.isEmpty ? nil : $0 } ?? dev
        let reg = env["SWIFTCODE_REGION"].flatMap { $0.isEmpty ? nil : $0 }
        developmentRegion = dev; language = lang; region = reg
        locale = Locale(identifier: reg.map { "\(lang)_\($0)" } ?? lang)
        if let root = env["SWIFTCODE_PROJECT"] { load(root) }
    }

    /// Lookup order like Bundle.localizedString: the preferred language, the development language, Base, unlocalized files.
    func lookup(_ key: String, table: String?, language: String?) -> _LocEntry? {
        let t = table ?? "Localizable"
        let lang = language ?? self.language
        for l in candidates(lang) {
            if let e = lproj[l]?[t]?[key] { return e }
            if let e = catalogs[t]?[key]?[l] { return e }
        }
        if let e = loose[t]?[key] { return e }
        // a catalog key with no translation shows its source text
        if let e = catalogs[t]?[key]?[catalogSource[t] ?? developmentRegion] { return e }
        return nil
    }

    private func candidates(_ lang: String) -> [String] {
        var out: [String] = []
        func add(_ s: String) { let k = s.lowercased(); if !out.contains(k) { out.append(k) } }
        add(lang)
        if let base = lang.split(separator: "-").first ?? lang.split(separator: "_").first { add(String(base)) }
        add(developmentRegion)
        add("base")
        return out
    }

    private func load(_ root: String) {
        let fm = FileManager.default
        guard let e = fm.enumerator(atPath: root) else { return }
        while let rel = e.nextObject() as? String {
            let lower = rel.lowercased().replacingOccurrences(of: "\\", with: "/")
            if lower.hasPrefix(".build") || lower.contains("/.build/") || lower.hasPrefix(".") { continue }
            let url = URL(fileURLWithPath: root).appendingPathComponent(rel)
            let file = url.lastPathComponent
            let ext = url.pathExtension.lowercased()
            let table = url.deletingPathExtension().lastPathComponent
            let parent = url.deletingLastPathComponent().lastPathComponent
            let lang: String? = parent.lowercased().hasSuffix(".lproj") ? String(parent.dropLast(6)).lowercased().replacingOccurrences(of: "_", with: "-") : nil
            switch ext {
            case "strings":
                guard let entries = _parseStringsFile(url) else { continue }
                merge(entries.mapValues { _LocEntry.plain($0) }, table: table, lang: lang)
            case "stringsdict":
                guard let data = try? Data(contentsOf: url),
                      let plist = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any] else { continue }
                var entries: [String: _LocEntry] = [:]
                for (key, value) in plist {
                    guard let d = value as? [String: Any], let format = d["NSStringLocalizedFormatKey"] as? String else { continue }
                    var vars: [String: [String: String]] = [:]
                    for (name, rule) in d where name != "NSStringLocalizedFormatKey" {
                        if let r = rule as? [String: Any] { vars[name] = r.compactMapValues { $0 as? String } }
                    }
                    entries[key] = .dict(format: format, vars: vars)
                }
                merge(entries, table: table, lang: lang)
            case "xcstrings":
                loadCatalog(url, table: table)
            default:
                _ = file
            }
        }
    }

    private func merge(_ entries: [String: _LocEntry], table: String, lang: String?) {
        if let lang {
            var tables = lproj[lang] ?? [:]
            tables[table, default: [:]].merge(entries) { _, new in new }
            lproj[lang] = tables
        } else {
            loose[table, default: [:]].merge(entries) { _, new in new }
        }
    }

    private func loadCatalog(_ url: URL, table: String) {
        guard let data = try? Data(contentsOf: url),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let strings = json["strings"] as? [String: Any] else { return }
        let source = (json["sourceLanguage"] as? String)?.lowercased() ?? developmentRegion
        catalogSource[table] = source
        var out: [String: [String: _LocEntry]] = [:]
        for (key, value) in strings {
            guard let entry = value as? [String: Any] else { continue }
            var perLang: [String: _LocEntry] = [:]
            for (lang, loc) in (entry["localizations"] as? [String: Any]) ?? [:] {
                guard let loc = loc as? [String: Any], let e = _catalogEntry(loc) else { continue }
                perLang[lang.lowercased()] = e
            }
            // untranslated source strings show the key itself
            if perLang[source] == nil { perLang[source] = .plain(key) }
            out[key] = perLang
        }
        catalogs[table] = out
    }
}

func _catalogEntry(_ loc: [String: Any]) -> _LocEntry? {
    if let unit = loc["stringUnit"] as? [String: Any], let v = unit["value"] as? String { return .plain(v) }
    guard let variations = loc["variations"] as? [String: Any] else { return nil }
    if let plural = variations["plural"] as? [String: Any] {
        var forms: [String: String] = [:]
        for (cat, v) in plural {
            if let d = v as? [String: Any], let unit = d["stringUnit"] as? [String: Any], let s = unit["value"] as? String { forms[cat] = s }
        }
        return .plural(forms)
    }
    if let device = variations["device"] as? [String: Any] {
        for k in ["iphone", "other"] {
            if let d = device[k] as? [String: Any], let e = _catalogEntry(d) { return e }
        }
    }
    return nil
}

/// Old-style property list strings file: `"key" = "value";` with /* */ and // comments, UTF-8 or UTF-16.
func _parseStringsFile(_ url: URL) -> [String: String]? {
    guard let data = try? Data(contentsOf: url) else { return nil }
    let text: String
    if data.starts(with: [0xFF, 0xFE]) || data.starts(with: [0xFE, 0xFF]) {
        text = String(data: data, encoding: .utf16) ?? ""
    } else {
        text = String(decoding: data.starts(with: [0xEF, 0xBB, 0xBF]) ? data.dropFirst(3) : data, as: UTF8.self)
    }
    var parser = _StringsParser(text)
    return try? parser.parse()
}

struct _StringsParseError: Error { let line: Int; let message: String }

struct _StringsParser {
    let chars: [Character]
    var i = 0
    init(_ s: String) { chars = Array(s) }

    var line: Int { chars[..<min(i, chars.count)].filter { $0 == "\n" }.count + 1 }

    mutating func skip() {
        while i < chars.count {
            if chars[i].isWhitespace { i += 1; continue }
            if chars[i] == "/", i + 1 < chars.count, chars[i + 1] == "/" { while i < chars.count, chars[i] != "\n" { i += 1 }; continue }
            if chars[i] == "/", i + 1 < chars.count, chars[i + 1] == "*" {
                i += 2
                while i + 1 < chars.count, !(chars[i] == "*" && chars[i + 1] == "/") { i += 1 }
                i += 2
                continue
            }
            break
        }
    }

    mutating func string() throws -> String {
        if i < chars.count, chars[i] == "\"" {
            i += 1
            var out = ""
            while i < chars.count, chars[i] != "\"" {
                if chars[i] == "\\", i + 1 < chars.count {
                    i += 1
                    switch chars[i] {
                    case "n": out.append("\n")
                    case "t": out.append("\t")
                    case "r": out.append("\r")
                    case "0": out.append("\0")
                    case "U", "u":
                        let hex = String(chars[(i + 1)..<min(i + 5, chars.count)])
                        if let v = UInt32(hex, radix: 16), let u = Unicode.Scalar(v) { out.unicodeScalars.append(u); i += 4 }
                    default: out.append(chars[i])
                    }
                } else {
                    out.append(chars[i])
                }
                i += 1
            }
            if i >= chars.count { throw _StringsParseError(line: line, message: "Unterminated string") }
            i += 1
            return out
        }
        // unquoted keys are allowed in old-style plists
        var out = ""
        while i < chars.count, chars[i].isLetter || chars[i].isNumber || "_.$:/-".contains(chars[i]) { out.append(chars[i]); i += 1 }
        if out.isEmpty { throw _StringsParseError(line: line, message: "Unexpected character '\(i < chars.count ? String(chars[i]) : "EOF")'") }
        return out
    }

    mutating func parse() throws -> [String: String] {
        var out: [String: String] = [:]
        skip()
        while i < chars.count {
            let key = try string()
            skip()
            if i < chars.count, chars[i] == ";" { out[key] = key; i += 1; skip(); continue }
            guard i < chars.count, chars[i] == "=" else { throw _StringsParseError(line: line, message: "Expected '=' after key \"\(key)\"") }
            i += 1
            skip()
            let value = try string()
            skip()
            guard i < chars.count, chars[i] == ";" else { throw _StringsParseError(line: line, message: "Missing ';' after \"\(key)\" = \"\(value)\"") }
            i += 1
            out[key] = value
            skip()
        }
        return out
    }
}
