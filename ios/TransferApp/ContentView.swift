import SwiftUI
import UIKit
import PhotosUI
import UniformTypeIdentifiers
import CoreTransferable

struct ContentView: View {
    @State private var fromPc: [TransferItem] = []
    @State private var fromPhone: [TransferItem] = []
    @State private var isPaired: Bool = false
    @State private var isRefreshing: Bool = false
    @State private var showSettings: Bool = false
    @State private var errorMessage: String?

    // Auth screen mode: 0 = Pair Code, 1 = Login, 2 = Sign Up
    @State private var authModeIndex: Int = 0
    @State private var pairCodeInput: String = ""
    @State private var authUsername: String = ""
    @State private var authPassword: String = ""
    @State private var isAuthLoading: Bool = false

    // In-app bulk upload states
    @State private var selectedPhotoItems: [PhotosPickerItem] = []
    @State private var showFilePicker: Bool = false
    @State private var isUploading: Bool = false
    @State private var uploadStatusText: String? = nil
    @State private var downloadingItemId: String? = nil

    // Auto-polling timer
    @State private var pollTimer: Timer? = nil

    var body: some View {
        NavigationStack {
            ZStack {
                Color(red: 0.02, green: 0.02, blue: 0.02)
                    .ignoresSafeArea()

                if !isPaired {
                    authAndPairingView
                } else {
                    mainTransfersView
                }
            }
            .navigationTitle("TRANSFER")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showSettings = true }) {
                        Image(systemName: "slider.horizontal.3")
                            .font(.system(size: 13, weight: .semibold, design: .monospaced))
                            .foregroundColor(.white)
                    }
                }
            }
            .sheet(isPresented: $showSettings) {
                SettingsView(isPaired: $isPaired)
            }
            .fileImporter(
                isPresented: $showFilePicker,
                allowedContentTypes: [.item],
                allowsMultipleSelection: true
            ) { result in
                handleFileSelection(result)
            }
            .onChange(of: selectedPhotoItems.count) { newCount in
                if newCount > 0 {
                    let items = selectedPhotoItems
                    selectedPhotoItems = []
                    handlePhotosSelection(items)
                }
            }
            .onAppear {
                checkPairing()
                startPolling()
            }
            .onDisappear {
                stopPolling()
            }
        }
    }

    // MARK: - Auth & Pairing Screen
    private var authAndPairingView: some View {
        ScrollView {
            VStack(spacing: 20) {
                Spacer(minLength: 20)

                VStack(spacing: 6) {
                    Text("CONNECT TO PC")
                        .font(.system(size: 14, weight: .bold, design: .monospaced))
                        .foregroundColor(.white)

                    Text("Private cross-device file transfer")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(.gray)
                }

                // Mode Picker
                Picker("Auth Mode", selection: $authModeIndex) {
                    Text("PAIR CODE").tag(0)
                    Text("LOG IN").tag(1)
                    Text("SIGN UP").tag(2)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 24)

                if authModeIndex == 0 {
                    // Pair Code View
                    VStack(spacing: 16) {
                        Text("Enter the 6-digit code shown on your PC browser")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(.gray)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 16)

                        TextField("000000", text: $pairCodeInput)
                            .keyboardType(.numberPad)
                            .font(.system(size: 28, weight: .bold, design: .monospaced))
                            .multilineTextAlignment(.center)
                            .padding(12)
                            .background(Color(red: 0.08, green: 0.08, blue: 0.08))
                            .overlay(Rectangle().stroke(Color.gray.opacity(0.3), lineWidth: 1))
                            .foregroundColor(.white)
                            .frame(width: 220)

                        Button(action: pairWithCode) {
                            Text(isAuthLoading ? "PAIRING..." : "PAIR DEVICE")
                                .font(.system(size: 12, weight: .bold, design: .monospaced))
                                .foregroundColor(.black)
                                .frame(width: 220)
                                .padding(.vertical, 12)
                                .background(Color.white)
                                .cornerRadius(2)
                        }
                        .disabled(pairCodeInput.count != 6 || isAuthLoading)
                    }
                } else {
                    // Username & Password View (Login or Signup)
                    VStack(spacing: 14) {
                        TextField("Username", text: $authUsername)
                            .font(.system(size: 13, design: .monospaced))
                            .autocapitalization(.none)
                            .disableAutocorrection(true)
                            .padding(10)
                            .background(Color(red: 0.08, green: 0.08, blue: 0.08))
                            .overlay(Rectangle().stroke(Color.gray.opacity(0.3), lineWidth: 1))
                            .foregroundColor(.white)
                            .frame(maxWidth: 280)

                        SecureField("Password", text: $authPassword)
                            .font(.system(size: 13, design: .monospaced))
                            .padding(10)
                            .background(Color(red: 0.08, green: 0.08, blue: 0.08))
                            .overlay(Rectangle().stroke(Color.gray.opacity(0.3), lineWidth: 1))
                            .foregroundColor(.white)
                            .frame(maxWidth: 280)

                        Button(action: handleUserAuth) {
                            Text(isAuthLoading ? "PLEASE WAIT..." : (authModeIndex == 1 ? "SIGN IN" : "CREATE ACCOUNT"))
                                .font(.system(size: 12, weight: .bold, design: .monospaced))
                                .foregroundColor(.black)
                                .frame(maxWidth: 280)
                                .padding(.vertical, 12)
                                .background(Color.white)
                                .cornerRadius(2)
                        }
                        .disabled(authUsername.isEmpty || authPassword.isEmpty || isAuthLoading)
                    }
                }

                if let err = errorMessage {
                    Text(err)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(.red)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                }

                Spacer(minLength: 20)
            }
            .padding(.vertical, 24)
        }
    }

    // MARK: - Main Transfers Dashboard
    private var mainTransfersView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header status
                HStack {
                    Circle()
                        .fill(Color.green)
                        .frame(width: 6, height: 6)
                    Text("CONNECTED")
                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                        .foregroundColor(.green)

                    Spacer()

                    Button(action: { refresh(silent: false) }) {
                        Text(isRefreshing ? "SYNCING..." : "REFRESH")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(.gray)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 10)

                // Upload Actions Section (Bulk support)
                VStack(alignment: .leading, spacing: 8) {
                    Text("SEND TO PC")
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundColor(.gray)
                        .padding(.horizontal, 16)

                    HStack(spacing: 12) {
                        PhotosPicker(
                            selection: $selectedPhotoItems,
                            maxSelectionCount: 30,
                            matching: .any(of: [.images, .videos])
                        ) {
                            HStack {
                                Image(systemName: "photo.on.rectangle")
                                Text("PHOTOS")
                            }
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .foregroundColor(.black)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(Color.white)
                            .cornerRadius(2)
                        }
                        .disabled(isUploading)

                        Button(action: { showFilePicker = true }) {
                            HStack {
                                Image(systemName: "doc.on.doc")
                                Text("FILES")
                            }
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(Color(red: 0.12, green: 0.12, blue: 0.12))
                            .overlay(Rectangle().stroke(Color.gray.opacity(0.3), lineWidth: 1))
                            .cornerRadius(2)
                        }
                        .disabled(isUploading)
                    }
                    .padding(.horizontal, 16)

                    if let status = uploadStatusText {
                        Text(status)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(isUploading ? .yellow : .green)
                            .padding(.horizontal, 16)
                    }
                }

                // Section 1: INCOMING (From PC)
                VStack(alignment: .leading, spacing: 8) {
                    Text("INCOMING (FROM PC) [\(fromPc.count)]")
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundColor(.gray)
                        .padding(.horizontal, 16)

                    if fromPc.isEmpty {
                        emptyCard(text: "NO INCOMING TRANSFERS")
                    } else {
                        ForEach(fromPc) { item in
                            transferRow(item: item, isIncoming: true)
                        }
                    }
                }

                // Section 2: OUTGOING (From Phone)
                VStack(alignment: .leading, spacing: 8) {
                    Text("OUTGOING (FROM PHONE) [\(fromPhone.count)]")
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundColor(.gray)
                        .padding(.horizontal, 16)

                    if fromPhone.isEmpty {
                        emptyCard(text: "NO OUTGOING TRANSFERS")
                    } else {
                        ForEach(fromPhone) { item in
                            transferRow(item: item, isIncoming: false)
                        }
                    }
                }
            }
            .padding(.bottom, 32)
        }
        .refreshable {
            refresh(silent: false)
        }
    }

    private func emptyCard(text: String) -> some View {
        HStack {
            Text(text)
                .font(.system(size: 12, design: .monospaced))
                .foregroundColor(.gray.opacity(0.6))
            Spacer()
        }
        .padding(16)
        .background(Color(red: 0.05, green: 0.05, blue: 0.05))
        .overlay(Rectangle().stroke(Color.gray.opacity(0.15), lineWidth: 1))
        .padding(.horizontal, 16)
    }

    private func transferRow(item: TransferItem, isIncoming: Bool) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(item.filename)
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                    .foregroundColor(.white)
                    .lineLimit(1)

                Text("\(item.formattedSize) · \(item.mimeType)")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.gray)
                    .lineLimit(1)
            }

            Spacer(minLength: 4)

            // SHARE button: downloads and opens native iOS share sheet
            Button(action: { downloadAndShare(item) }) {
                Text(downloadingItemId == item.id ? "..." : "SHARE")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundColor(.black)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
                    .background(Color.white)
                    .cornerRadius(2)
            }
            .disabled(downloadingItemId != nil)

            Button(action: { deleteItem(item) }) {
                Text("DEL")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.red.opacity(0.8))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 6)
            }
        }
        .padding(12)
        .background(Color(red: 0.06, green: 0.06, blue: 0.06))
        .overlay(Rectangle().stroke(Color.gray.opacity(0.2), lineWidth: 1))
        .padding(.horizontal, 16)
    }

    // MARK: - Native iOS Share Sheet Presentation
    @MainActor
    private func presentNativeShareSheet(url: URL) {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        guard let windowScene = scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first else {
            return
        }

        let rootVC = windowScene.windows.first(where: { $0.isKeyWindow })?.rootViewController
            ?? windowScene.windows.first?.rootViewController
        guard let root = rootVC else { return }

        var topVC = root
        while let presented = topVC.presentedViewController {
            topVC = presented
        }

        let activityVC = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        if let popover = activityVC.popoverPresentationController {
            popover.sourceView = topVC.view
            popover.sourceRect = CGRect(x: topVC.view.bounds.midX, y: topVC.view.bounds.midY, width: 0, height: 0)
            popover.permittedArrowDirections = []
        }

        topVC.present(activityVC, animated: true)
    }

    private func downloadAndShare(_ item: TransferItem) {
        guard let downloadUrl = URL(string: "\(TransferApiClient.shared.baseUrl)/api/transfers/\(item.id)/download") else { return }
        downloadingItemId = item.id

        Task {
            do {
                var req = URLRequest(url: downloadUrl)
                if let token = TransferApiClient.shared.authToken {
                    req.setValue(token, forHTTPHeaderField: "x-transfer-auth")
                }
                let (tempLocation, _) = try await URLSession.shared.download(for: req)
                let destination = FileManager.default.temporaryDirectory.appendingPathComponent(item.filename)
                try? FileManager.default.removeItem(at: destination)
                try FileManager.default.copyItem(at: tempLocation, to: destination)

                await MainActor.run {
                    downloadingItemId = nil
                    presentNativeShareSheet(url: destination)
                }
            } catch {
                await MainActor.run {
                    downloadingItemId = nil
                    print("Download error: \(error)")
                }
            }
        }
    }

    // MARK: - Bulk Upload Handlers
    private func handlePhotosSelection(_ items: [PhotosPickerItem]) {
        guard !items.isEmpty else { return }
        isUploading = true
        let total = items.count
        uploadStatusText = "PREPARING \(total) PHOTOS..."

        Task {
            var successCount = 0
            var failCount = 0

            for (index, item) in items.enumerated() {
                await MainActor.run {
                    uploadStatusText = "UPLOADING PHOTO \(index + 1) OF \(total)..."
                }

                do {
                    if let data = try await item.loadTransferable(type: Data.self) {
                        let filename = "photo_\(Int(Date().timeIntervalSince1970))_\(index + 1).jpg"
                        let tempUrl = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
                        try data.write(to: tempUrl)

                        _ = try await TransferApiClient.shared.uploadFile(
                            fileUrl: tempUrl,
                            filename: filename,
                            mimeType: "image/jpeg",
                            direction: "phone_to_pc"
                        )
                        successCount += 1
                    } else {
                        failCount += 1
                    }
                } catch {
                    failCount += 1
                }
            }

            await MainActor.run {
                if failCount == 0 {
                    uploadStatusText = "\(successCount) PHOTOS SENT TO PC"
                } else {
                    uploadStatusText = "UPLOADED \(successCount), FAILED \(failCount)"
                }
                isUploading = false
                refresh(silent: true)
            }

            DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
                uploadStatusText = nil
            }
        }
    }

    private func handleFileSelection(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            guard !urls.isEmpty else { return }
            isUploading = true
            let total = urls.count
            uploadStatusText = "UPLOADING \(total) FILES..."

            Task {
                var successCount = 0
                var failCount = 0

                for (index, url) in urls.enumerated() {
                    await MainActor.run {
                        uploadStatusText = "UPLOADING \(index + 1)/\(total): \(url.lastPathComponent)"
                    }

                    let didAccess = url.startAccessingSecurityScopedResource()
                    defer {
                        if didAccess { url.stopAccessingSecurityScopedResource() }
                    }

                    do {
                        let tempUrl = FileManager.default.temporaryDirectory.appendingPathComponent(url.lastPathComponent)
                        try? FileManager.default.removeItem(at: tempUrl)
                        try FileManager.default.copyItem(at: url, to: tempUrl)

                        let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"

                        _ = try await TransferApiClient.shared.uploadFile(
                            fileUrl: tempUrl,
                            filename: url.lastPathComponent,
                            mimeType: mime,
                            direction: "phone_to_pc"
                        )
                        successCount += 1
                    } catch {
                        failCount += 1
                    }
                }

                await MainActor.run {
                    if failCount == 0 {
                        uploadStatusText = "\(successCount) FILES SENT TO PC"
                    } else {
                        uploadStatusText = "UPLOADED \(successCount), FAILED \(failCount)"
                    }
                    isUploading = false
                    refresh(silent: true)
                }

                DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
                    uploadStatusText = nil
                }
            }
        case .failure(let error):
            uploadStatusText = "File selection failed: \(error.localizedDescription)"
        }
    }

    // MARK: - Pairing & Auth Handlers
    private func pairWithCode() {
        isAuthLoading = true
        errorMessage = nil

        Task {
            do {
                guard let url = URL(string: "\(TransferApiClient.shared.baseUrl)/api/pair/complete") else { return }
                var request = URLRequest(url: url)
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                let body = ["code": pairCodeInput, "clientType": "ios"]
                request.httpBody = try JSONSerialization.data(withJSONObject: body)

                let (data, response) = try await URLSession.shared.data(for: request)
                if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                    struct PairRes: Codable {
                        let deviceId: String
                        let userId: String?
                        let authToken: String
                    }
                    let res = try JSONDecoder().decode(PairRes.self, from: data)
                    TransferApiClient.shared.deviceId = res.deviceId
                    TransferApiClient.shared.userId = res.userId
                    TransferApiClient.shared.authToken = res.authToken
                    await MainActor.run {
                        isAuthLoading = false
                        isPaired = true
                        refresh(silent: false)
                    }
                } else {
                    await MainActor.run {
                        isAuthLoading = false
                        errorMessage = "Invalid or expired pair code"
                    }
                }
            } catch {
                await MainActor.run {
                    isAuthLoading = false
                    errorMessage = "Network connection failed"
                }
            }
        }
    }

    private func handleUserAuth() {
        isAuthLoading = true
        errorMessage = nil

        Task {
            do {
                if authModeIndex == 1 {
                    _ = try await TransferApiClient.shared.login(username: authUsername.trimmingCharacters(in: .whitespaces), password: authPassword)
                } else {
                    _ = try await TransferApiClient.shared.signup(username: authUsername.trimmingCharacters(in: .whitespaces), password: authPassword)
                }
                await MainActor.run {
                    isAuthLoading = false
                    isPaired = true
                    authPassword = ""
                    refresh(silent: false)
                }
            } catch {
                await MainActor.run {
                    isAuthLoading = false
                    errorMessage = error.localizedDescription
                }
            }
        }
    }

    private func checkPairing() {
        if TransferApiClient.shared.authToken != nil {
            isPaired = true
            refresh(silent: false)
        } else {
            isPaired = false
        }
    }

    private func startPolling() {
        stopPolling()
        pollTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: true) { _ in
            if isPaired {
                refresh(silent: true)
            }
        }
    }

    private func stopPolling() {
        pollTimer?.invalidate()
        pollTimer = nil
    }

    private func refresh(silent: Bool = false) {
        if !silent { isRefreshing = true }
        Task {
            do {
                let res = try await TransferApiClient.shared.fetchTransfers()
                await MainActor.run {
                    fromPc = res.fromPc
                    fromPhone = res.fromPhone
                    if !silent { isRefreshing = false }
                }
            } catch {
                await MainActor.run {
                    if !silent { isRefreshing = false }
                }
            }
        }
    }

    private func deleteItem(_ item: TransferItem) {
        Task {
            try? await TransferApiClient.shared.deleteTransfer(id: item.id)
            refresh(silent: true)
        }
    }
}
