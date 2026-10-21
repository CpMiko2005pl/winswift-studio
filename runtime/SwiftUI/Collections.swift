// Collection helpers SwiftUI adds on Apple platforms.

extension RangeReplaceableCollection where Self: MutableCollection {
    public mutating func remove(atOffsets offsets: IndexSet) {
        for offset in offsets.sorted(by: >) {
            remove(at: index(startIndex, offsetBy: offset))
        }
    }
}

extension MutableCollection where Self: RangeReplaceableCollection {
    public mutating func move(fromOffsets source: IndexSet, toOffset destination: Int) {
        let moving = source.sorted().map { self[index(startIndex, offsetBy: $0)] }
        var dest = destination
        for offset in source.sorted(by: >) {
            remove(at: index(startIndex, offsetBy: offset))
            if offset < dest { dest -= 1 }
        }
        insert(contentsOf: moving, at: index(startIndex, offsetBy: dest))
    }
}
