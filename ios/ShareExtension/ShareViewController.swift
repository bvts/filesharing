import UIKit
import Social
import UniformTypeIdentifiers

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
        guard let extensionItem = extensionContext?.inputItems.first as? NSExtensionItem,
              let attachments = extensionItem.attachments else {
            finishWithError("No files found")
            return
        }

        Task {
            var uploadedCount = 0
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
                    print("Error uploading attachment: \(error)")
                }
            }

            await MainActor.run {
                if uploadedCount > 0 {
                    self.statusLabel.text = "SENT TO PC"
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                        self.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
                    }
                } else {
                    self.finishWithError("Transfer failed")
                }
            }
        }
    }

    private func loadItem(itemProvider: NSItemProvider) async throws -> (URL, String, String) {
        if itemProvider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
            return try await loadFileRepresentation(itemProvider: itemProvider, type: UTType.image)
        } else if itemProvider.hasItemConformingToTypeIdentifier(UTType.movie.identifier) {
            return try await loadFileRepresentation(itemProvider: itemProvider, type: UTType.movie)
        } else if itemProvider.hasItemConformingToTypeIdentifier(UTType.pdf.identifier) {
            return try await loadFileRepresentation(itemProvider: itemProvider, type: UTType.pdf)
        } else if itemProvider.hasItemConformingToTypeIdentifier(UTType.audio.identifier) {
            return try await loadFileRepresentation(itemProvider: itemProvider, type: UTType.audio)
        } else {
            return try await loadFileRepresentation(itemProvider: itemProvider, type: UTType.item)
        }
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

                // Copy to temporary location so it persists beyond callback scope
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

    private func finishWithError(_ message: String) {
        statusLabel.text = message
        statusLabel.textColor = .red
        activityIndicator.stopAnimating()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            self.extensionContext?.cancelRequest(withError: NSError(domain: "ShareExtension", code: 500, userInfo: [NSLocalizedDescriptionKey: message]))
        }
    }
}
