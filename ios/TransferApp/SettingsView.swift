import SwiftUI

struct SettingsView: View {
    @Binding var isPaired: Bool
    @Environment(\.dismiss) private var dismiss
    @State private var serverUrl: String = TransferApiClient.shared.baseUrl
    @State private var newPairCode: String?
    @State private var isGeneratingCode: Bool = false

    var body: some View {
        NavigationStack {
            List {
                Section(header: Text("ACCOUNT & IDENTITY").font(.system(size: 10, design: .monospaced))) {
                    if let uid = TransferApiClient.shared.userId {
                        HStack {
                            Text("USER ID")
                                .font(.system(size: 12, design: .monospaced))
                            Spacer()
                            Text(uid)
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundColor(.gray)
                        }
                    }

                    HStack {
                        Text("DEVICE ID")
                            .font(.system(size: 12, design: .monospaced))
                        Spacer()
                        Text(TransferApiClient.shared.deviceId ?? "UNSET")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(.gray)
                    }

                    if isPaired {
                        Button(action: generateNewPairCode) {
                            Text(isGeneratingCode ? "GENERATING..." : "PAIR NEW COMPUTER")
                                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                                .foregroundColor(.white)
                        }

                        if let code = newPairCode {
                            HStack {
                                Text("CODE FOR PC:")
                                    .font(.system(size: 12, design: .monospaced))
                                Spacer()
                                Text(code)
                                    .font(.system(size: 18, weight: .bold, design: .monospaced))
                                    .foregroundColor(.white)
                            }
                        }

                        Button(role: .destructive, action: unpairDevice) {
                            Text("LOG OUT / UNPAIR DEVICE")
                                .font(.system(size: 12, design: .monospaced))
                                .foregroundColor(.red)
                        }
                    }
                }

                Section(header: Text("SERVER CONFIGURATION").font(.system(size: 10, design: .monospaced))) {
                    TextField("Server URL", text: $serverUrl)
                        .font(.system(size: 12, design: .monospaced))
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                    
                    Button("SAVE SERVER URL") {
                        TransferApiClient.shared.baseUrl = serverUrl
                    }
                    .font(.system(size: 11, design: .monospaced))
                }

                Section(header: Text("STORAGE CLEANUP").font(.system(size: 10, design: .monospaced))) {
                    Button(role: .destructive, action: clearAllTransfers) {
                        Text("DELETE ALL TEMPORARY FILES")
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundColor(.red)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("SETTINGS")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("DONE") { dismiss() }
                        .font(.system(size: 12, weight: .bold, design: .monospaced))
                        .foregroundColor(.white)
                }
            }
        }
    }

    private func generateNewPairCode() {
        isGeneratingCode = true
        Task {
            do {
                guard let url = URL(string: "\(TransferApiClient.shared.baseUrl)/api/pair/start") else { return }
                var req = URLRequest(url: url)
                req.httpMethod = "POST"
                req.setValue("application/json", forHTTPHeaderField: "Content-Type")
                if let token = TransferApiClient.shared.authToken {
                    req.setValue(token, forHTTPHeaderField: "x-transfer-auth")
                }
                let body: [String: Any] = ["deviceId": TransferApiClient.shared.deviceId ?? ""]
                req.httpBody = try JSONSerialization.data(withJSONObject: body)

                let (data, _) = try await URLSession.shared.data(for: req)
                struct CodeRes: Codable {
                    let code: String
                }
                let res = try JSONDecoder().decode(CodeRes.self, from: data)
                await MainActor.run {
                    newPairCode = res.code
                    isGeneratingCode = false
                }
            } catch {
                await MainActor.run {
                    isGeneratingCode = false
                }
            }
        }
    }

    private func unpairDevice() {
        TransferApiClient.shared.logout()
        isPaired = false
        dismiss()
    }

    private func clearAllTransfers() {
        Task {
            try? await TransferApiClient.shared.clearAllTransfers()
            dismiss()
        }
    }
}
