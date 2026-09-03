import SwiftUI
import SwiftData

struct ContentView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \Conversation.updatedAt, order: .reverse) private var conversations: [Conversation]
    @State private var selectedConversation: Conversation?

    var body: some View {
        NavigationStack {
            Group {
                if let selectedConversation {
                    ChatView(conversation: selectedConversation)
                } else {
                    VStack(spacing: 18) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 54))
                        Text("Nova")
                            .font(.largeTitle.bold())
                        Text("Local intelligence. Your memory. Your tools.")
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                        Button("Start conversation", action: createConversation)
                            .buttonStyle(.borderedProminent)
                    }
                    .padding()
                }
            }
            .navigationTitle(selectedConversation?.title ?? "Nova")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: createConversation) {
                        Image(systemName: "square.and.pencil")
                    }
                }
            }
        }
        .onAppear {
            if selectedConversation == nil {
                selectedConversation = conversations.first
            }
        }
    }

    private func createConversation() {
        let conversation = Conversation()
        modelContext.insert(conversation)
        try? modelContext.save()
        selectedConversation = conversation
    }
}

private struct ChatView: View {
    @Environment(\.modelContext) private var modelContext
    @Bindable var conversation: Conversation
    @StateObject private var viewModel = ChatViewModel()

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(conversation.messages.sorted(by: { $0.createdAt < $1.createdAt })) { message in
                            MessageBubble(message: message)
                                .id(message.id)
                        }

                        if viewModel.isThinking {
                            HStack {
                                ProgressView()
                                Text("Nova is thinking…")
                                    .foregroundStyle(.secondary)
                                Spacer()
                            }
                            .padding(.horizontal)
                        }
                    }
                    .padding(.vertical)
                }
                .onChange(of: conversation.messages.count) {
                    guard let last = conversation.messages.last else { return }
                    withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }

            if let error = viewModel.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .padding(.horizontal)
            }

            HStack(alignment: .bottom, spacing: 10) {
                TextField("Message Nova", text: $viewModel.draft, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(1...6)

                Button {
                    Task {
                        await viewModel.send(in: conversation, context: modelContext)
                    }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 30))
                }
                .disabled(viewModel.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || viewModel.isThinking)
            }
            .padding()
            .background(.ultraThinMaterial)
        }
    }
}

private struct MessageBubble: View {
    let message: ChatMessage

    var body: some View {
        HStack {
            if message.role == .user { Spacer(minLength: 48) }

            Text(message.content)
                .textSelection(.enabled)
                .padding(12)
                .background(message.role == .user ? AnyShapeStyle(.tint) : AnyShapeStyle(.thinMaterial))
                .foregroundStyle(message.role == .user ? .white : .primary)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

            if message.role != .user { Spacer(minLength: 48) }
        }
        .padding(.horizontal)
    }
}
