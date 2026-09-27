import Foundation

public final class TransferApiClient {
    public static let shared = TransferApiClient()

    private var appGroupDefaults: UserDefaults? {
        UserDefaults(suiteName: "group.com.transfer.app")
    }

    private var sharedContainerUrl: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.transfer.app")
    }

    // Configurable endpoint
    public var baseUrl: String {
        get {
            if let groupVal = appGroupDefaults?.string(forKey: "server_url"), !groupVal.isEmpty {
                return groupVal
            }
            if let containerFile = sharedContainerUrl?.appendingPathComponent("server_url.txt"),
               let saved = try? String(contentsOf: containerFile, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines), !saved.isEmpty {
                return saved
            }
            return UserDefaults.standard.string(forKey: "server_url") ?? "http://localhost:3000"
        }
        set {
            appGroupDefaults?.set(newValue, forKey: "server_url")
            UserDefaults.standard.set(newValue, forKey: "server_url")
            if let containerFile = sharedContainerUrl?.appendingPathComponent("server_url.txt") {
                try? newValue.write(to: containerFile, atomically: true, encoding: .utf8)
            }
        }
    }

    public var authToken: String? {
        get {
            if let token = KeychainHelper.loadString(key: "auth_token"), !token.isEmpty {
                return token
            }
            if let groupToken = appGroupDefaults?.string(forKey: "auth_token"), !groupToken.isEmpty {
                return groupToken
            }
            if let containerFile = sharedContainerUrl?.appendingPathComponent("auth_token.txt"),
               let saved = try? String(contentsOf: containerFile, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines), !saved.isEmpty {
                return saved
            }
            return UserDefaults.standard.string(forKey: "auth_token")
        }
        set {
            if let token = newValue {
                _ = KeychainHelper.saveString(key: "auth_token", value: token)
                appGroupDefaults?.set(token, forKey: "auth_token")
                UserDefaults.standard.set(token, forKey: "auth_token")
                if let containerFile = sharedContainerUrl?.appendingPathComponent("auth_token.txt") {
                    try? token.write(to: containerFile, atomically: true, encoding: .utf8)
                }
            } else {
                KeychainHelper.delete(key: "auth_token")
                appGroupDefaults?.removeObject(forKey: "auth_token")
                UserDefaults.standard.removeObject(forKey: "auth_token")
                if let containerFile = sharedContainerUrl?.appendingPathComponent("auth_token.txt") {
                    try? FileManager.default.removeItem(at: containerFile)
                }
            }
        }
    }

    public var deviceId: String? {
        get {
            if let groupDev = appGroupDefaults?.string(forKey: "device_id"), !groupDev.isEmpty {
                return groupDev
            }
            if let containerFile = sharedContainerUrl?.appendingPathComponent("device_id.txt"),
               let saved = try? String(contentsOf: containerFile, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines), !saved.isEmpty {
                return saved
            }
            return UserDefaults.standard.string(forKey: "device_id")
        }
        set {
            appGroupDefaults?.set(newValue, forKey: "device_id")
            UserDefaults.standard.set(newValue, forKey: "device_id")
            if let containerFile = sharedContainerUrl?.appendingPathComponent("device_id.txt") {
                if let val = newValue {
                    try? val.write(to: containerFile, atomically: true, encoding: .utf8)
                } else {
                    try? FileManager.default.removeItem(at: containerFile)
                }
            }
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
            throw NSError(domain: "TransferApp", code: 400, userInfo: [NSLocalizedDescriptionKey: "Invalid server URL: \(baseUrl)"])
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
            throw NSError(domain: "TransferApp", code: 500, userInfo: [NSLocalizedDescriptionKey: "Upload failed with HTTP status \((response as? HTTPURLResponse)?.statusCode ?? 0)"])
        }

        struct UploadResponse: Codable {
            let success: Bool
            let transfer: TransferItem
        }

        let decoded = try JSONDecoder().decode(UploadResponse.self, from: data)
        return decoded.transfer
    }
}
