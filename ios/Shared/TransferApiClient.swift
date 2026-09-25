import Foundation

public final class TransferApiClient {
    public static let shared = TransferApiClient()

    // Configurable endpoint (defaults to production or localhost)
    public var baseUrl: String {
        get {
            UserDefaults(suiteName: "group.com.transfer.app")?.string(forKey: "server_url") ?? "http://localhost:3000"
        }
        set {
            UserDefaults(suiteName: "group.com.transfer.app")?.set(newValue, forKey: "server_url")
        }
    }

    public var authToken: String? {
        get {
            KeychainHelper.loadString(key: "auth_token")
        }
        set {
            if let token = newValue {
                _ = KeychainHelper.saveString(key: "auth_token", value: token)
            } else {
                KeychainHelper.delete(key: "auth_token")
            }
        }
    }

    public var deviceId: String? {
        get {
            UserDefaults(suiteName: "group.com.transfer.app")?.string(forKey: "device_id")
        }
        set {
            UserDefaults(suiteName: "group.com.transfer.app")?.set(newValue, forKey: "device_id")
        }
    }

    private init() {}

    public func fetchTransfers() async throws -> TransfersResponse {
        guard let token = authToken else {
            throw NSError(domain: "TransferApp", code: 401, userInfo: [NSLocalizedDescriptionKey: "Unpaired device"])
        }

        guard let url = URL(string: "\(baseUrl)/api/transfers") else {
            throw NSError(domain: "TransferApp", code: 400, userInfo: [NSLocalizedDescriptionKey: "Invalid server URL"])
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue(token, forHTTPHeaderField: "x-transfer-auth")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
            throw NSError(domain: "TransferApp", code: 500, userInfo: [NSLocalizedDescriptionKey: "Failed to fetch transfers"])
        }

        return try JSONDecoder().decode(TransfersResponse.self, from: data)
    }

    public func deleteTransfer(id: String) async throws {
        guard let token = authToken else { return }
        guard let url = URL(string: "\(baseUrl)/api/transfers/\(id)") else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue(token, forHTTPHeaderField: "x-transfer-auth")

        _ = try await URLSession.shared.data(for: request)
    }

    public func clearAllTransfers() async throws {
        guard let token = authToken else { return }
        guard let url = URL(string: "\(baseUrl)/api/transfers?action=clear_all") else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue(token, forHTTPHeaderField: "x-transfer-auth")

        _ = try await URLSession.shared.data(for: request)
    }

    public func uploadFile(
        fileUrl: URL,
        filename: String,
        mimeType: String,
        direction: String = "phone_to_pc",
        progressHandler: ((Double) -> Void)? = nil
    ) async throws -> TransferItem {
        guard let token = authToken else {
            throw NSError(domain: "TransferApp", code: 401, userInfo: [NSLocalizedDescriptionKey: "Device is not paired"])
        }

        guard let url = URL(string: "\(baseUrl)/api/transfers") else {
            throw NSError(domain: "TransferApp", code: 400, userInfo: [NSLocalizedDescriptionKey: "Invalid server URL"])
        }

        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue(token, forHTTPHeaderField: "x-transfer-auth")

        var body = Data()

        // Direction field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"direction\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(direction)\r\n".data(using: .utf8)!)

        // File field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)

        let fileData = try Data(contentsOf: fileUrl)
        body.append(fileData)
        body.append("\r\n".data(using: .utf8)!)

        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        let (data, response) = try await URLSession.shared.upload(for: request, from: body)
        guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
            throw NSError(domain: "TransferApp", code: 500, userInfo: [NSLocalizedDescriptionKey: "Upload failed"])
        }

        struct UploadResponse: Codable {
            let success: Bool
            let transfer: TransferItem
        }

        let decoded = try JSONDecoder().decode(UploadResponse.self, from: data)
        return decoded.transfer
    }
}
