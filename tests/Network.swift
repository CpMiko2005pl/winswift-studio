import SwiftUI

struct Record: Codable { let title: String; let date: Date }

@main struct NetworkApp: App {
    var body: some Scene { WindowGroup { NetworkView() } }
}
struct NetworkView: View {
    @State var result = "Loading"
    var body: some View {
        VStack {
            Text(result)
            if let endpoint = ProcessInfo.processInfo.environment["TEST_ENDPOINT"], let url = URL(string: endpoint) {
                AsyncImage(url: url.appendingPathComponent("icon.png")) { phase in
                    if let image = phase.image { image.resizable() } else { ProgressView() }
                }
            }
        }.task {
            guard let raw = ProcessInfo.processInfo.environment["TEST_ENDPOINT"], let url = URL(string: raw) else { return }
            do {
                let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
                let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
                let (data, _) = try await URLSession.shared.data(from: url)
                let record = try decoder.decode(Record.self, from: data)
                var request = URLRequest(url: url)
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                let (echo, _) = try await URLSession.shared.upload(for: request, from: encoder.encode(record))
                let saved = try decoder.decode(Record.self, from: echo)
                let viaTask: Data = try await withCheckedThrowingContinuation { continuation in
                    URLSession.shared.dataTask(with: url) { data, _, error in
                        if let error { continuation.resume(throwing: error) }
                        else { continuation.resume(returning: data ?? Data()) }
                    }.resume()
                }
                result = try decoder.decode(Record.self, from: viaTask).title + "/" + saved.title
            } catch { result = "Network error: " + error.localizedDescription }
        }
    }
}
