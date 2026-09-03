import Foundation

protocol LocalModelEngine: Sendable {
    var displayName: String { get }
    func generate(messages: [ModelMessage]) async throws -> String
}

struct ModelMessage: Sendable {
    let role: MessageRole
    let content: String
}

struct BootstrapModelEngine: LocalModelEngine {
    let displayName = "Nova Bootstrap"

    func generate(messages: [ModelMessage]) async throws -> String {
        guard let latest = messages.last(where: { $0.role == .user }) else {
            return "I'm ready."
        }

        return "Nova is running. The on-device model is the next layer to install. You said: \"\(latest.content)\""
    }
}
