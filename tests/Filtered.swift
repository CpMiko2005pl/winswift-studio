import SwiftUI
import SwiftData

@Model final class Row {
    var title: String
    var visible: Bool
    init(_ title: String, _ visible: Bool) { self.title = title; self.visible = visible }
}
@main struct StoreApp: App {
    var body: some Scene { WindowGroup { Rows() }.modelContainer(for: Row.self) }
}
struct Rows: View {
    @Environment(\.modelContext) var context
    @Query(filter: #Predicate<Row> { $0.visible }, sort: \Row.title, order: .reverse) var visible: [Row]
    var body: some View {
        VStack {
            Text(visible.map(\.title).joined(separator: ","))
            Button("Seed") {
                context.insert(Row("Alfa", true)); context.insert(Row("Ukryty", false)); context.insert(Row("Zeta", true))
                try? context.save()
            }
            Button("Delete first") { if let first = visible.first { context.delete(first) } }
        }
    }
}
