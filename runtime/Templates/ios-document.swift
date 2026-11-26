import SwiftUI

struct ContentView: View {
    @State private var text = ""
    @State private var importing = false
    @State private var exporting = false
    @State private var message = ""

    var body: some View {
        VStack {
            ControlGroup {
                Button("Open…") { importing = true }
                Button("Save as…") { exporting = true }
            }
            TextEditor(text: $text)
            if !message.isEmpty { Text(message) }
        }
        .padding()
        .fileImporter(isPresented: $importing, allowedContentTypes: [.plainText]) { result in
            do { text = try String(contentsOf: result.get(), encoding: .utf8); message = "" }
            catch { message = error.localizedDescription }
        }
        .fileExporter(isPresented: $exporting, document: TextFile(text), contentType: .plainText, defaultFilename: "Note.txt") { result in
            if case .failure(let error) = result { message = error.localizedDescription }
        }
    }
}

private struct TextFile: FileDocument {
    static let readableContentTypes = [UTType.plainText]
    var text: String
    init(_ text: String) { self.text = text }
    init(configuration: ReadConfiguration) throws {
        text = String(decoding: configuration.file.regularFileContents ?? Data(), as: UTF8.self)
    }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: Data(text.utf8))
    }
}

#Preview { ContentView() }
