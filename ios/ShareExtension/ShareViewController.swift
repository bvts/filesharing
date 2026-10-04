import UIKit
import UniformTypeIdentifiers

@objc(ShareViewController)
class ShareViewController: UIViewController {
    private let statusLabel = UILabel()
    private let activityIndicator = UIActivityIndicatorView(style: .medium)

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        processAndUploadSharedItems()
    }

    private func setupUI() {
        view.backgroundColor = UIColor(red: 0.03, green: 0.03, blue: 0.03, alpha: 0.95)

        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        statusLabel.textColor = .white
        statusLabel.font = UIFont.monospacedSystemFont(ofSize: 13, weight: .semibold)
        statusLabel.text = "UPLOADING TO PC..."
        statusLabel.textAlignment = .center

        activityIndicator.translatesAutoresizingMaskIntoConstraints = false
        activityIndicator.color = .white
        activityIndicator.startAnimating()

        view.addSubview(statusLabel)
        view.addSubview(activityIndicator)

        NSLayoutConstraint.activate([
            activityIndicator.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            activityIndicator.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: -20),
            statusLabel.topAnchor.constraint(equalTo: activityIndicator.bottomAnchor, constant: 16),
            statusLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            statusLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
        ])
    }

    private func processAndUploadSharedItems() {
        guard TransferApiClient.shared.authToken != nil else {
            finishWithError("Open Transfer app to pair first")
            return
        }

        guard let extensionItem = extensionContext?.inputItems.first as? NSExtensionItem,
              let attachments = extensionItem.attachments, !attachments.isEmpty else {
            finishWithError("No items found to share")
            return
        }

        Task {
            var uploadedCount = 0
            var lastErrorMessage: String = "Transfer failed"

            for itemProvider in attachments {
                do {
                    let (fileUrl, originalFilename, mimeType) = try await loadItem(itemProvider: itemProvider)
                    _ = try await TransferApiClient.shared.uploadFile(
                        fileUrl: fileUrl,
                        filename: originalFilename,
                        mimeType: mimeType,
                        direction: "phone_to_pc"
                    )
                    uploadedCount += 1
                } catch {
                    print("[ShareExtension] Error uploading attachment: \(error)")
                    lastErrorMessage = error.localizedDescription
                }
            }

            await MainActor.run {
                if uploadedCount > 0 {
                    self.statusLabel.text = "SENT TO PC"
                    self.activityIndicator.stopAnimating()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                        self.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
                    }
                } else {
                    self.finishWithError(lastErrorMessage)
                }
            }
        }
    }

    private func loadItem(itemProvider: NSItemProvider) async throws -> (URL, String, String) {
        let candidateTypes: [UTType] = [.image, .movie, .pdf, .audio, .text, .data, .item]

        // 1. Try file representation with security scoping
        for type in candidateTypes {
            if itemProvider.hasItemConformingToTypeIdentifier(type.identifier) {
                if let result = try? await loadFileRepresentation(itemProvider: itemProvider, type: type) {
                    return result
                }
            }
        }

        // 2. Fallback: Try data representation
        for type in candidateTypes {
            if itemProvider.hasItemConformingToTypeIdentifier(type.identifier) {
                if let result = try? await loadDataRepresentation(itemProvider: itemProvider, type: type) {
                    return result
                }
            }
        }

        throw NSError(domain: "ShareExtension", code: 415, userInfo: [NSLocalizedDescriptionKey: "Unsupported content type"])
    }

    private func loadFileRepresentation(itemProvider: NSItemProvider, type: UTType) async throws -> (URL, String, String) {
        return try await withCheckedThrowingContinuation { continuation in
            itemProvider.loadFileRepresentation(forTypeIdentifier: type.identifier) { sourceUrl, error in
                if let error = error {
                    continuation.resume(throwing: error)
                    return
                }

                guard let sourceUrl = sourceUrl else {
                    continuation.resume(throwing: NSError(domain: "ShareExtension", code: 404, userInfo: nil))
                    return
                }

                let didAccess = sourceUrl.startAccessingSecurityScopedResource()
                defer {
                    if didAccess { sourceUrl.stopAccessingSecurityScopedResource() }
                }

                let tempDir = FileManager.default.temporaryDirectory
                let targetUrl = tempDir.appendingPathComponent(sourceUrl.lastPathComponent)
                try? FileManager.default.removeItem(at: targetUrl)

                do {
                    try FileManager.default.copyItem(at: sourceUrl, to: targetUrl)
                    let mime = type.preferredMIMEType ?? "application/octet-stream"
                    continuation.resume(returning: (targetUrl, sourceUrl.lastPathComponent, mime))
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    private func loadDataRepresentation(itemProvider: NSItemProvider, type: UTType) async throws -> (URL, String, String) {
        return try await withCheckedThrowingContinuation { continuation in
            itemProvider.loadDataRepresentation(forTypeIdentifier: type.identifier) { data, error in
                if let error = error {
                    continuation.resume(throwing: error)
                    return
                }

                guard let data = data else {
                    continuation.resume(throwing: NSError(domain: "ShareExtension", code: 404, userInfo: nil))
                    return
                }

                let ext = type.preferredFilenameExtension ?? "bin"
                let filename = "share_\(Int(Date().timeIntervalSince1970)).\(ext)"
                let targetUrl = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
                try? FileManager.default.removeItem(at: targetUrl)

                do {
                    try data.write(to: targetUrl)
                    let mime = type.preferredMIMEType ?? "application/octet-stream"
                    continuation.resume(returning: (targetUrl, filename, mime))
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    private func finishWithError(_ message: String) {
        statusLabel.text = message
        statusLabel.textColor = .red
        activityIndicator.stopAnimating()
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            self.extensionContext?.cancelRequest(withError: NSError(domain: "ShareExtension", code: 500, userInfo: [NSLocalizedDescriptionKey: message]))
        }
    }
}
