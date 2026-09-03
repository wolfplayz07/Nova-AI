import Foundation
import SwiftData

@Model
final class Conversation {
    var id: UUID
    var title: String
    var createdAt: Date
    var updatedAt: Date
    @Relationship(deleteRule: .cascade, inverse: \ChatMessage.conversation)
    var messages: [ChatMessage]

    init(title: String = "New conversation") {
        self.id = UUID()
        self.title = title
        self.createdAt = Date()
        self.updatedAt = Date()
        self.messages = []
    }
}

@Model
final class ChatMessage {
    var id: UUID
    var roleRawValue: String
    var content: String
    var createdAt: Date
    var conversation: Conversation?

    init(role: MessageRole, content: String, conversation: Conversation? = nil) {
        self.id = UUID()
        self.roleRawValue = role.rawValue
        self.content = content
        self.createdAt = Date()
        self.conversation = conversation
    }

    var role: MessageRole {
        MessageRole(rawValue: roleRawValue) ?? .assistant
    }
}

enum MessageRole: String, Codable {
    case user
    case assistant
    case system
}
