import Foundation
import SwiftData

@Model
final class MemoryItem {
    var id: UUID
    var key: String
    var value: String
    var category: String
    var createdAt: Date
    var updatedAt: Date

    init(key: String, value: String, category: String = "general") {
        self.id = UUID()
        self.key = key
        self.value = value
        self.category = category
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}
