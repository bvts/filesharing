import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

struct ContentView: View {
    @State private var fromPc: [TransferItem] = []
    @State private var fromPhone: [TransferItem] = []
    @State private var isPaired: Bool = false
    @State private var isRefreshing: Bool = false
    @State private var pairCodeInput: String = ""
    @State private var showSettings: Bool = false
    @State private var errorMessage: String?
    @State private var activeShareSheetUrl: URL?

    // In-app upload states
    @State private var selectedPhotoItem: PhotosPickerItem? = nil
    @State private var showFilePicker: Bool = false
    @State private var isUploading: Bool = false
    @State private var uploadStatusText: String? = nil

    // Auto-polling timer
    @State private var pollTimer: Timer? = nil

    var body: some View {
        NavigationStack {
            ZStack {
                Color(red: 0.02, green: 0.02, blue: 0.02)
                    .ignoresSafeArea()

                if !isPaired {
                    pairingView
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
            .sheet(item: $activeShareSheetUrl) { url in
                ShareActivityView(activityItems: [url])
            }
            .fileImporter(
                isPresented: $showFilePicker,
                allowedContentTypes: [.item],
                allowsMultipleSelection: false
            ) { result in
                handleFileSelection(result)
            }
            .onChange(of: selectedPhotoItem) { newItem in
                handlePhotoSelection(newItem)
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

    private var pairingView: some View {
        VStack(spacing: 24) {
            Spacer()

            VStack(spacing: 8) {
                Text("CONNECT TO PC")
                    .font(.system(size: 14, weight: .bold, design: .monospaced))
                    .foregroundColor(.white)

                Text("Enter the 6-digit code shown on your PC browser")
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundColor(.gray)
                    .multilineTextAlignment(.center)
            }

            TextField("000000", text: $pairCodeInput)
                .keyboardType(.numberPad)
                .font(.system(size: 28, weight: .bold, design: .monospaced))
                .multilineTextAlignment(.center)
                .padding()
                .background(Color(red: 0.08, green: 0.08, blue: 0.08))
                .overlay(Rectangle().stroke(Color.gray.opacity(0.3), lineWidth: 1))
                .foregroundColor(.white)
                .frame(width: 200)

            Button(action: pairWithCode) {
                Text("PAIR DEVICE")
                    .font(.system(size: 12, weight: .bold, design: .monospaced))
                    .foregroundColor(.black)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
                    .background(Color.white)
                    .cornerRadius(2)
            }
            .disabled(pairCodeInput.count != 6)

            if let err = errorMessage {
                Text(err)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(.red)
            }

            Spacer()
        }
        .padding(24)
    }

    private var mainTransfersView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
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
                .padding(.top, 12)

                // Upload Actions Section
                VStack(alignment: .leading, spacing: 10) {
                    Text("SEND TO PC")
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundColor(.gray)
                        .padding(.horizontal, 16)

                    HStack(spacing: 12) {
                        PhotosPicker(selection: $selectedPhotoItem, matching: .any(of: [.images, .videos])) {
                            HStack {
                                Image(systemName: "photo")
                                Text("PHOTO / VIDEO")
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
                                Image(systemName: "doc")
                                Text("ANY FILE")
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
                    Text("INCOMING (FROM PC)")
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
                    Text("OUTGOING (FROM PHONE)")
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
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(item.filename)
                    .font(.system(size: 13, weight: .medium, design: .monospaced))
                    .foregroundColor(.white)
                    .lineLimit(1)

                Text("\(item.formattedSize) · \(item.mimeType)")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.gray)
            }

            Spacer()

            if isIncoming {
                Button(action: { downloadItem(item) }) {
                    Text("GET")
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .foregroundColor(.black)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color.white)
                        .cornerRadius(2)
                }
            }

            Button(action: { deleteItem(item) }) {
                Text("DEL")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(.red.opacity(0.8))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
            }
        }
        .padding(14)
        .background(Color(red: 0.06, green: 0.06, blue: 0.06))
        .overlay(Rectangle().stroke(Color.gray.opacity(0.2), lineWidth: 1))
        .padding(.horizontal, 16)
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

    private func pairWithCode() {
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
                        let authToken: String
                    }
                    let res = try JSONDecoder().decode(PairRes.self, from: data)
                    TransferApiClient.shared.deviceId = res.deviceId
                    TransferApiClient.shared.authToken = res.authToken
                    await MainActor.run {
                        isPaired = true
                        refresh(silent: false)
                    }
                } else {
                    await MainActor.run {
                        errorMessage = "Invalid or expired pair code"
                    }
                }
            } catch {
                await MainActor.run {
                    errorMessage = "Network connection failed"
                }
            }
        }
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

    private func handlePhotoSelection(_ item: PhotosPickerItem?) {
        guard let item = item else { return }
        isUploading = true
        uploadStatusText = "PREPARING PHOTO..."

        Task {
            do {
                if let data = try await item.loadTransferable(type: Data.self) {
                    let filename = "photo_\(Int(Date().timeIntervalSince1970)).jpg"
                    let tempUrl = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
                    try data.write(to: tempUrl)

                    await MainActor.run { uploadStatusText = "UPLOADING TO PC..." }

                    _ = try await TransferApiClient.shared.uploadFile(
                        fileUrl: tempUrl,
                        filename: filename,
                        mimeType: "image/jpeg",
                        direction: "phone_to_pc"
                    )

                    await MainActor.run {
                        uploadStatusText = "UPLOADED TO PC"
                        isUploading = false
                        selectedPhotoItem = nil
                        refresh(silent: true)
                    }

                    DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
                        uploadStatusText = nil
                    }
                } else {
                    await MainActor.run {
                        uploadStatusText = "Failed to load photo"
                        isUploading = false
                    }
                }
            } catch {
                await MainActor.run {
                    uploadStatusText = "Upload error: \(error.localizedDescription)"
                    isUploading = false
                }
            }
        }
    }

    private func handleFileSelection(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            guard let url = urls.first else { return }
            isUploading = true
            uploadStatusText = "UPLOADING TO PC..."

            let didAccess = url.startAccessingSecurityScopedResource()
            defer {
                if didAccess { url.stopAccessingSecurityScopedResource() }
            }

            Task {
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

                    await MainActor.run {
                        uploadStatusText = "SENT TO PC"
                        isUploading = false
                        refresh(silent: true)
                    }

                    DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
                        uploadStatusText = nil
                    }
                } catch {
                    await MainActor.run {
                        uploadStatusText = "Upload error: \(error.localizedDescription)"
                        isUploading = false
                    }
                }
            }
        case .failure(let error):
            uploadStatusText = "File selection failed: \(error.localizedDescription)"
        }
    }

    private func deleteItem(_ item: TransferItem) {
        Task {
            try? await TransferApiClient.shared.deleteTransfer(id: item.id)
            refresh(silent: true)
        }
    }

    private func downloadItem(_ item: TransferItem) {
        guard let downloadUrl = URL(string: "\(TransferApiClient.shared.baseUrl)/api/transfers/\(item.id)/download") else { return }
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
                    activeShareSheetUrl = destination
                }
            } catch {
                print("Download failed: \(error)")
            }
        }
    }
}

// Share sheet wrapper to save into Files or AirDrop
struct ShareActivityView: UIViewControllerRepresentable {
    let activityItems: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

extension URL: Identifiable {
    public var id: String { absoluteString }
}
