import Foundation

enum LocalMemoryParser {
    /// Understands lines like:
    /// remember my name is Kevin
    /// remember that I live in Aurora
    /// remember favorite food = tacos
    static func parse(_ raw: String) -> (key: String, value: String)? {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let lower = text.lowercased()

        guard lower.hasPrefix("remember") else { return nil }

        text = String(text.dropFirst(8)).trimmingCharacters(in: .whitespacesAndNewlines)
        if text.lowercased().hasPrefix("that ") {
            text = String(text.dropFirst(5)).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if text.lowercased().hasPrefix("my ") {
            text = String(text.dropFirst(3)).trimmingCharacters(in: .whitespacesAndNewlines)
        }

        if let eq = text.range(of: " = ") {
            let key = String(text[..<eq.lowerBound]).trimmingCharacters(in: .whitespaces)
            let value = String(text[eq.upperBound...]).trimmingCharacters(in: .whitespaces)
            if !key.isEmpty, !value.isEmpty { return (key, value) }
        }

        if let range = text.range(of: " is ", options: .caseInsensitive) {
            let key = String(text[..<range.lowerBound]).trimmingCharacters(in: .whitespaces)
            let value = String(text[range.upperBound...]).trimmingCharacters(in: .whitespaces)
            if !key.isEmpty, !value.isEmpty { return (normalize(key), value) }
        }

        if text.lowercased().hasPrefix("i live in ") {
            return ("city", String(text.dropFirst(10)).trimmingCharacters(in: .whitespaces))
        }

        if !text.isEmpty {
            return ("note", text)
        }
        return nil
    }

    private static func normalize(_ key: String) -> String {
        let lower = key.lowercased()
        if lower == "name" || lower.hasSuffix(" name") { return "name" }
        return lower
    }
}
