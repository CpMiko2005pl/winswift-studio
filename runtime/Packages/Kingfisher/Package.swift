// swift-tools-version:5.9
// Kingfisher for WinSwift Studio: the SwiftUI side of https://github.com/onevcat/Kingfisher (KFImage, ImageCache,
// ImagePrefetcher, KingfisherManager) on top of the SwiftUI for Windows runtime. WinSwift builds this package in place
// of the real one, which needs UIKit; Xcode on a Mac links the real Kingfisher from the same project.
import PackageDescription

let package = Package(
    name: "Kingfisher",
    products: [.library(name: "Kingfisher", targets: ["Kingfisher"])],
    targets: [.target(name: "Kingfisher", path: "Sources/Kingfisher")]
)
