import SwiftUI
import Charts
import MapKit
import PhotosUI

@main struct Gallery: App {
    var body: some Scene { WindowGroup { GalleryView() } }
}

struct GalleryView: View {
    enum Field: Hashable { case title }
    @FocusState var focus: Field?
    @State var title = "Zażółć"
    @State var sheet = false
    @State var alert = false
    @State var photo: PhotosPickerItem?
    @Environment(\.openURL) var openURL
    let here = CLLocationCoordinate2D(latitude: 52.23, longitude: 21.01)
    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack {
                    TextField("Title", text: $title).focused($focus, equals: .title)
                    Text(title).onKeyPress(.return) { focus = nil; return .handled }
                        .contextMenu { Button("Clear") { title = "" } } preview: { Text(title) }
                        .sensoryFeedback(.selection, trigger: focus)
                    ControlGroup {
                        Button("Inspect") { sheet = true }
                        Button("Alert") { alert = true }
                    }
                    AnimatedBadge()
                    PhotosPicker("Photo", selection: $photo, matching: .images)
                    ShareLink(item: title)
                    Link("Website", destination: URL(string: "https://example.com")!)
                    Canvas { context, size in
                        context.fill(Path(ellipseIn: CGRect(origin: .zero, size: size)), with: .color(.orange))
                    }.frame(width: 80, height: 50)
                    GeometryReader { proxy in Text("Width \(Int(proxy.size.width))") }.frame(height: 30)
                    Map(initialPosition: .region(MKCoordinateRegion(center: here, span: .init(latitudeDelta: 1, longitudeDelta: 1)))) {
                        Marker("Warszawa", coordinate: here)
                        Annotation("Centrum", coordinate: here) { Text("A") }
                    }.frame(height: 120)
                    Chart { BarMark(x: .value("Day", "Mon"), y: .value("Total", 3)) }.frame(height: 100)
                    AsyncImage(url: nil) { phase in Text(phase.image == nil ? "Placeholder" : "Image") }
                    ProgressView(value: 0.5).progressViewStyle(.linear)
                }.scrollTargetLayout()
            }.scrollTargetBehavior(.viewAligned)
            .refreshable { }
            .navigationTitle("Gallery")
            .toolbarBackground(Color.blue, for: .navigationBar)
            .searchable(text: $title) { Text("Łódź").searchCompletion("Łódź") }
            .inspector(isPresented: $sheet) { Text("Inspector content") }
            .alert("Attention", isPresented: $alert) { Button("OK") {} }
        }
    }
}

private struct AnimatedBadge: View {
    struct Values { var opacity = 1.0 }
    @State var selected = false
    @Namespace var namespace
    var body: some View {
        VStack {
            Button("Animate") { withAnimation(.easeInOut(duration: 0.3)) { selected.toggle() } }
            PhaseAnimator([false, true], trigger: selected) { bright in
                Text("Phase").opacity(bright ? 1 : 0.5)
            }
            KeyframeAnimator(initialValue: Values(), trigger: selected) { value in
                Text("Keyframe").opacity(value.opacity)
            } keyframes: { _ in
                KeyframeTrack(\.opacity) { LinearKeyframe(0.5, duration: 0.25); LinearKeyframe(1.0, duration: 0.25) }
            }
            if selected { Text("Selected").matchedGeometryEffect(id: "badge", in: namespace).transition(.scale) }
        }
    }
}
