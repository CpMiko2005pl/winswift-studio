import SwiftUI

// navigationDestination(isPresented:) must turn the binding false when the screen is closed
// (Back / dismiss), and setting it false must close the screen — the same as on iOS.
struct Detail: View {
    let number: Int
    @Binding var shown: Bool
    var body: some View {
        VStack {
            Text("Meal \(number)")
            Button("Close") { shown = false }
        }
    }
}

struct ContentView: View {
    @State private var number = 0
    @State private var showDetail = false

    var body: some View {
        NavigationStack {
            VStack {
                Text("shown=\(showDetail)")
                Button("Draw") {
                    Task {
                        try? await Task.sleep(nanoseconds: 50_000_000)
                        number += 1
                        showDetail = true
                    }
                }
            }
            .navigationDestination(isPresented: $showDetail) {
                Detail(number: number, shown: $showDetail)
            }
        }
    }
}

@main
struct NavBackApp: App {
    var body: some Scene {
        WindowGroup { ContentView() }
    }
}
