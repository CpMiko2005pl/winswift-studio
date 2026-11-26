import SwiftUI

@main struct Demo: App { var body: some Scene { WindowGroup { Rows() } } }
private struct RowID: Hashable, CustomStringConvertible {
    let number: Int
    var description: String { "row" }
}
private struct Counter: View {
    let id: RowID
    @State var taps = 0
    var body: some View { Button("Row \(id.number) = \(taps)") { taps += 1 } }
}
private struct Rows: View {
    @State var rows = [RowID(number: 1), RowID(number: 2)]
    @State var generation = 0
    var body: some View {
        VStack {
            ForEach(rows, id: \.self) { row in Counter(id: row).id(generation) }
            Button("Reverse") { rows.reverse() }
            Button("Reset") { generation += 1 }
        }
    }
}
