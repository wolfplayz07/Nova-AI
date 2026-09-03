import Foundation
import SwiftData

@MainActor
final class ChatViewModel: ObservableObject {
    @Published var draft = ""
    @Published var isThinking = false
    @Published var errorMessage: String?

    private let agent = NovaAgent()

    func send(in conversation: Conversation, context: ModelContext) async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isThinking else { return }

        draft = ""
        errorMessage = nil
        isThinking = true

        let userMessage = ChatMessage(role: .user, content: text, conversation: conversation)
        conversation.messages.append(userMessage)
        conversation.updatedAt = Date()

        if conversation.messages.filter({ $0.role == .user }).count == 1 {
            conversation.title = String(text.prefix(40))
        }

        do {
            try context.save()

            let history = conversation.messages
                .sorted { $0.createdAt < $1.createdAt }
                .map { ModelMessage(role: $0.role, content: $0.content) }

            let reply = try await agent.respond(to: history)
            let assistantMessage = ChatMessage(role: .assistant, content: reply, conversation: conversation)
            conversation.messages.append(assistantMessage)
            conversation.updatedAt = Date()
            try context.save()
        } catch {
            errorMessage = error.localizedDescription
        }

        isThinking = false
    }
}
