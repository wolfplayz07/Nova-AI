import Foundation

protocol LocalModelEngine: Sendable {
    var displayName: String { get }
    func generate(messages: [ModelMessage], memories: [MemoryFact]) async throws -> String
}

struct ModelMessage: Sendable {
    let role: MessageRole
    let content: String
}

struct MemoryFact: Sendable {
    let key: String
    let value: String
    let category: String
}

/// On-device stand-in until a real local model (MLX) or an API is added.
/// No network. Personality + memory + a few local tools only.
struct BootstrapModelEngine: LocalModelEngine {
    let displayName = "Nova Local"

    func generate(messages: [ModelMessage], memories: [MemoryFact]) async throws -> String {
        guard let latest = messages.last(where: { $0.role == .user }) else {
            return greeting(memories: memories)
        }

        let text = latest.content.trimmingCharacters(in: .whitespacesAndNewlines)
        let lower = text.lowercased()

        if isGreeting(lower) {
            return greeting(memories: memories)
        }

        if lower.contains("who are you") || lower.contains("what are you") {
            return "I'm Nova, your personal assistant. Right now I run only on this device. No cloud, no API. I can remember facts you give me, keep this chat, and handle simple local questions. A stronger brain can be plugged in later."
        }

        if lower.contains("what do you know") || lower.contains("what do you remember") || lower == "memory" {
            return memoryDump(memories)
        }

        if lower.hasPrefix("remember ") || lower.hasPrefix("remember that ") {
            return "Got it. I'll keep that in local memory on this phone."
        }

        if lower.contains("what time") || lower == "time" {
            return "It's \(formatted(Date(), "h:mm a"))."
        }

        if lower.contains("what day") || lower.contains("what's the date") || lower.contains("what is the date") || lower == "date" {
            return "Today is \(formatted(Date(), "EEEE, MMMM d, yyyy"))."
        }

        if let name = value(for: "name", in: memories), looksLikeNameQuestion(lower) {
            return "Your name is \(name)."
        }

        if looksLikeIdentityQuestion(lower), let line = identityLine(memories) {
            return line
        }

        return fallback(for: text, memories: memories)
    }

    private func greeting(memories: [MemoryFact]) -> String {
        if let name = value(for: "name", in: memories) {
            return "Hey \(name). Nova is here, local only. What do you want to do?"
        }
        return "Hey. I'm Nova. I'm running locally on this device. Tell me something to remember, or just talk."
    }

    private func fallback(for text: String, memories: [MemoryFact]) -> String {
        let known: String
        if memories.isEmpty {
            known = "I don't have any saved facts yet. Say remember my name is ... and I'll store it on this phone."
        } else {
            known = "I already know: " + memories.prefix(4).map { "\($0.key) = \($0.value)" }.joined(separator: "; ") + "."
        }
        return "I heard you. Local Nova can't reason like a full model yet, but I kept your message.\n\n\(known)\n\nYou said: \"\(text)\""
    }

    private func memoryDump(_ memories: [MemoryFact]) -> String {
        guard !memories.isEmpty else {
            return "Local memory is empty. Say something like: remember my name is Alex."
        }
        let lines = memories.map { "- \($0.key): \($0.value)" }
        return "Here's what I'm keeping on this device:\n" + lines.joined(separator: "\n")
    }

    private func value(for key: String, in memories: [MemoryFact]) -> String? {
        memories.first { $0.key.caseInsensitiveCompare(key) == .orderedSame }?.value
    }

    private func identityLine(_ memories: [MemoryFact]) -> String? {
        guard !memories.isEmpty else { return nil }
        return "From local memory: " + memories.map { "\($0.key) is \($0.value)" }.joined(separator: ", ") + "."
    }

    private func isGreeting(_ lower: String) -> Bool {
        ["hi", "hey", "hello", "yo", "sup", "good morning", "good night"].contains(lower)
    }

    private func looksLikeNameQuestion(_ lower: String) -> Bool {
        lower.contains("what's my name") || lower.contains("what is my name") || lower.contains("who am i")
    }

    private func looksLikeIdentityQuestion(_ lower: String) -> Bool {
        lower.contains("who am i") || lower.contains("what do you know about me")
    }

    private func formatted(_ date: Date, _ format: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = .current
        formatter.dateFormat = format
        return formatter.string(from: date)
    }
}
