import Foundation

actor NovaAgent {
    private let model: any LocalModelEngine

    init(model: any LocalModelEngine = BootstrapModelEngine()) {
        self.model = model
    }

    func respond(to history: [ModelMessage]) async throws -> String {
        try await model.generate(messages: history)
    }
}
