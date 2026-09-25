import Foundation

public struct TransferItem: Identifiable, Codable {
    public let id: String
    public let deviceId: String
    public let filename: String
    public let mimeType: String
    public let sizeBytes: Int64
    public let direction: String
    public let status: String
    public let blobUrl: String
    public let createdAt: String
    public let expiresAt: String

    public var isImage: Bool {
        return mimeType.starts(with: "image/")
    }

    public var isVideo: Bool {
        return mimeType.starts(with: "video/")
    }

    public var formattedSize: String {
        ByteCountFormatter.string(fromByteCount: sizeBytes, countStyle: .file)
    }
}

public struct TransfersResponse: Codable {
    public let deviceId: String
    public let now: String
    public let summary: TransferSummary
    public let fromPhone: [TransferItem]
    public let fromPc: [TransferItem]
}

public struct TransferSummary: Codable {
    public let totalCount: Int
    public let totalSizeBytes: Int64
    public let oldestExpiresAt: String?
}
