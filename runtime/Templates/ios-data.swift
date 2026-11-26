import SwiftUI
import SwiftData

@Model
final class Note {
    var title: String
    init(title: String) { self.title = title }
}

struct ContentView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Note.title) private var notes: [Note]
    @State private var draft = ""

    var body: some View {
        NavigationStack {
            List {
                TextField("New note", text: $draft)
                Button("Add note") {
                    guard !draft.isEmpty else { return }
                    context.insert(Note(title: draft))
                    draft = ""
                }
                ForEach(notes) { note in Text(note.title) }
                    .onDelete { offsets in
                        let removed = offsets.map { notes[$0] }
                        for note in removed { context.delete(note) }
                    }
            }
            .navigationTitle("Notes")
        }
    }
}

#Preview { ContentView().modelContainer(for: Note.self, inMemory: true) }
