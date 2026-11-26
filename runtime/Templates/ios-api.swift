import SwiftUI

private struct Post: Identifiable, Decodable {
    let id: Int
    let title: String
}

struct ContentView: View {
    @State private var posts: [Post] = []
    @State private var error: String?

    private func load() async {
        do {
            let url = URL(string: "https://jsonplaceholder.typicode.com/posts")!
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                throw URLError(.badServerResponse)
            }
            posts = try JSONDecoder().decode([Post].self, from: data)
            error = nil
        } catch { self.error = error.localizedDescription }
    }

    var body: some View {
        NavigationStack {
            VStack {
                if let error {
                    Text(error)
                    Button("Try again") { Task { await load() } }
                } else if posts.isEmpty { ProgressView("Loading posts") }
                List(posts) { post in Text(post.title) }.refreshable { await load() }
            }
            .navigationTitle("Posts")
        }
        .task { await load() }
    }
}

#Preview { ContentView() }
