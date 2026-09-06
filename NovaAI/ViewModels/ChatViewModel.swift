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

        if let parsed = LocalMemoryParser.parse(text) {
            upsertMemory(key: parsed.key, value: parsed.value, context: context)
        }

        do {
            try context.save()

            let history = conversation.messages
                .sorted { $0.createdAt < $1.createdAt }
                .map { ModelMessage(role: $0.role, content: $0.content) }

            let memories = fetchMemories(context)
            let reply = try await agent.respond(to: history, memories: memories)
            let assistantMessage = ChatMessage(role: .assistant, content: reply, conversation: conversation)
            conversation.messages.append(assistantMessage)
            conversation.updatedAt = Date()
            try context.save()
        } catch {
            errorMessage = error.localizedDescription
        }

        isThinking = false
    }

    private func fetchMemories(_ context: ModelContext) -> [MemoryFact] {
        let descriptor = FetchDescriptor<MemoryItem>(sortBy: [SortDescriptor(\MemoryItem.updatedAt, order: .reverse)])
        let items = (try? context.fetch(descriptor)) ?? []
        return items.map { MemoryFact(key: $0.key, value: $0.value, category: $0.category) }
    }

    private func upsertMemory(key: String, value: String, context: ModelContext) {
        let descriptor = FetchDescriptor<MemoryItem>()
        let items = (try? context.fetch(descriptor)) ?? []
        if let existing = items.first(where: { $0.key.caseInsensitiveCompare(key) == .orderedSame }) {
            existing.value = value
            existing.updatedAt = Date()
        } else {
            context.insert(MemoryItem(key: key, value: value))
        }
    }
}
