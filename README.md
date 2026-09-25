# TRANSFER // Personal Phone ↔ PC File Transfer

A minimal, personal, zero-friction cross-device file transfer utility designed to move files between an iPhone and a PC browser with temporary, self-expiring storage.

## Architecture

- **Web / Server (`web/`)**: Next.js App Router, TypeScript, pure technical dark CSS (`#050505`), Vercel deployment, Vercel Blob object storage with local filesystem fallback for development.
- **iOS (`ios/`)**: Native Swift / SwiftUI app (`TransferApp`) and native iOS Share Extension (`ShareExtension`) supporting Photos, Files, Videos, and Documents via App Group (`group.com.transfer.app`) and Keychain storage.
- **CI/CD (`.github/workflows/ios-build.yml`)**: GitHub Actions macOS workflow to compile and export the iOS application into an installable `.ipa`.

---

## Philosophy & Design

- **Technical, minimal, dark**: Strict `#050505` background, monospaced typography (Geist Mono / JetBrains Mono), soft 1px borders, zero marketing fluff, zero emojis, zero fake loading screens.
- **Zero Accounts**: Pairing is instant using single-use 6-digit PINs and cryptographically signed session tokens stored in Keychain and HTTP-only cookies.
- **Temporary Storage**: Files live in object storage with a strict TTL (default 24h). Expired files are lazily cleaned on request or explicitly cleared via `CLEAR EXPIRED` / `CLEAR ALL`.

---

## Directory Structure

```text
├── .github/
│   └── workflows/
│       └── ios-build.yml              # Automated macOS IPA build & signing workflow
├── ios/
│   ├── Shared/
│   │   ├── KeychainHelper.swift       # Secure token persistence in Keychain
│   │   ├── TransferModels.swift       # JSON transfer metadata models
│   │   └── TransferApiClient.swift    # URLSession client for app and extension
│   ├── TransferApp/
│   │   ├── TransferApp.swift          # SwiftUI App lifecycle
│   │   ├── ContentView.swift          # Main technical inbox & outbox UI
│   │   ├── SettingsView.swift         # Server configuration & pairing
│   │   └── Info.plist / .entitlements
│   ├── ShareExtension/
│   │   ├── ShareViewController.swift  # Native Share Sheet handler
│   │   └── Info.plist / .entitlements
│   └── TransferApp.xcodeproj/         # Complete Xcode 14+ / 15+ project configuration
├── web/
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   ├── pair/start/route.ts
│   │   │   │   ├── pair/complete/route.ts
│   │   │   │   ├── transfers/route.ts
│   │   │   │   ├── transfers/[id]/download/route.ts
│   │   │   │   ├── transfers/[id]/route.ts
│   │   │   │   └── upload-token/route.ts
│   │   │   ├── globals.css            # Dark mono technical stylesheet
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx               # Minimal utility dashboard
│   │   └── lib/
│   │       ├── auth.ts                # Session token verification
│   │       ├── crypto.ts              # HMAC SHA-256 tokens & PIN generator
│   │       ├── metadata.ts            # State manager & expiration sweeper
│   │       ├── storage.ts             # Vercel Blob & local fallback
│   │       └── types.ts
│   └── tests/                         # Node test runner suite
├── .env.example
├── CONSTRAINTS.md
├── SPEC.md
└── package.json
```

---

## Local Development (Windows / macOS / Linux)

### 1. Prerequisites
- Node.js (18.16.0 or later)
- npm

### 2. Setup & Run Web App
```bash
# In the web folder
cd web
npm install

# Run development server
npm run dev
```

Visit `http://localhost:3000`. If unconfigured, the app runs using local `.local-storage/` on disk without requiring any external accounts.

### 3. Run Automated Tests
```bash
cd web
npm test
```

### 4. Production Build & Typecheck
```bash
cd web
npm run typecheck
npm run build
```

---

## Production Deployment (Vercel)

1. Push this repository to GitHub.
2. In Vercel, import the repository and set the **Root Directory** to `web`.
3. In the Vercel project dashboard, go to the **Storage** tab and create a **Blob** store.
4. Vercel will automatically inject `BLOB_READ_WRITE_TOKEN`.
5. Add the following environment variables:
   - `TRANSFER_AUTH_SECRET`: A secure random 32+ character string.
   - `NEXT_PUBLIC_APP_URL`: Your Vercel production URL (e.g. `https://your-transfer-app.vercel.app`).
   - `TRANSFER_EXPIRATION_HOURS`: `24` (or your preferred expiration window).

---

## iOS Build & GitHub Actions IPA Setup

The native iOS app is built on macOS GitHub Actions runners, so you do not need Xcode on your Windows development machine.

### GitHub Secrets for Code Signing:
Add these repository secrets in **Settings -> Secrets and variables -> Actions**:

| Secret Name | Description |
|---|---|
| `BUILD_CERTIFICATE_BASE64` | Base64-encoded Apple Distribution / Development `.p12` certificate |
| `P12_PASSWORD` | Password for the `.p12` file |
| `BUILD_PROVISION_PROFILE_BASE64` | Base64-encoded `.mobileprovision` file for `com.transfer.app` |
| `KEYCHAIN_PASSWORD` | Temporary password used to unlock runner keychain |

When these secrets are provided, every push or manual workflow dispatch will build and export `TransferApp.ipa` and upload it to the GitHub Actions Artifacts tab for instant installation via Apple Configurator, TestFlight, or AltStore.
