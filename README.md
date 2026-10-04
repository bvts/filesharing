# TRANSFER // Personal Phone ↔ PC File Transfer

A minimal, secure, personal cross-device file transfer system designed to instantly move files and images between an iPhone (iOS App & Share Sheet) and a PC browser with private, self-expiring storage.

---

## Features

- **Private & Authenticated**: Complete user authentication (Sign Up / Login / Logout) with PBKDF2 salted password hashing, secure HTTP-only cookies, and persistent Bearer/Keychain tokens. Files are strictly isolated to the authenticated user and cannot be accessed by guessing IDs or URLs.
- **Native iOS Share Sheet Integration**: Native iOS 16/17/18+ share sheet trigger from incoming and outgoing files directly sharing into native iOS apps (Files, AirDrop, Messages, etc.).
- **Bulk Transfers**: Drag-and-drop or select multiple photos, videos, and documents at once with real-time percentage progress and partial failure reporting.
- **Responsive Mobile Layout**: Safe-area aware (`env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`), zero horizontal overflow, and text truncation preventing layout clipping on iPhone.
- **Ephemeral Storage**: Configurable TTL (default 24h) with automated lazy expiration cleanup and manual one-click prune options.
- **Dual Storage Engine**: Production-ready Vercel Blob adapter with private directory scoping (`transfers/{userId}/{transferId}/{file}`) and a local storage filesystem fallback for offline development.

---

## Architecture & Project Structure

```text
├── .github/
│   └── workflows/
│       └── ios-build.yml              # Automated macOS IPA build & signing workflow
├── ios/
│   ├── Shared/
│   │   ├── KeychainHelper.swift       # Secure token persistence in Keychain & App Group
│   │   ├── TransferModels.swift       # Decodable models for transfers and summaries
│   │   └── TransferApiClient.swift    # URLSession client handling auth, streaming, & queues
│   ├── TransferApp/
│   │   ├── TransferApp.swift          # SwiftUI App lifecycle
│   │   ├── ContentView.swift          # Main dashboard, bulk upload, native share sheet, & auth
│   │   ├── SettingsView.swift         # Server configuration, account status, & pairing
│   │   └── Info.plist / .entitlements
│   ├── ShareExtension/
│   │   ├── ShareViewController.swift  # Native iOS Share Sheet handler for photos & files
│   │   └── Info.plist / .entitlements
│   └── TransferApp.xcodeproj/         # Complete Xcode 14+ / 15+ project configuration
├── web/
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   ├── auth/              # Sign up, login, logout, me
│   │   │   │   ├── pair/              # Start, complete, poll 6-digit linking
│   │   │   │   ├── transfers/         # Upload, list, delete, clear
│   │   │   │   │   └── [id]/download/ # User-scoped authorized download
│   │   │   │   └── storage/raw/       # Authenticated raw stream
│   │   │   ├── globals.css            # Safe area variables & dark monospace styles
│   │   │   ├── layout.tsx             # Viewport configuration & mobile meta
│   │   │   └── page.tsx               # Utility dashboard with bulk dropzone & auth
│   │   └── lib/
│   │       ├── auth.ts                # Session & request verification
│   │       ├── crypto.ts              # Password hashing & HMAC-SHA256 session tokens
│   │       ├── metadata.ts            # State manager, user store, & expiration engine
│   │       ├── storage.ts             # Vercel Blob & local fallback
│   │       └── types.ts
│   └── tests/                         # Node test runner suite (crypto, auth, lifecycle)
├── .env.example
├── CONSTRAINTS.md
├── SPEC.md
└── package.json
```

---

## Environment Variables

Create a `.env.local` file inside `web/` (or configure in your Vercel project settings):

```env
# Optional: Secret used for HMAC-SHA256 session and pairing token signing (recommended in production)
TRANSFER_AUTH_SECRET=your_super_secret_key_minimum_32_characters_long

# Optional: Vercel Blob storage token. If omitted, files are saved locally to disk in tmpdir/.local-storage
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxxxxxxxxx

# Optional: Hours before uploaded files expire and are automatically pruned (default: 24)
TRANSFER_EXPIRATION_HOURS=24

# Optional: Maximum upload size in bytes (default: 524288000 = 500 MB)
MAX_UPLOAD_SIZE_BYTES=524288000

# Optional: Public URL of the web app (e.g., https://transfer.yourdomain.com)
NEXT_PUBLIC_APP_URL=https://transfer.yourdomain.com
```

---

## Local Setup & Development

### 1. Prerequisites
- Node.js (18.16.0 or later)
- npm

### 2. Install & Run Web App
```bash
# In the web folder
cd web
npm install

# Start development server
npm run dev
```
Open `http://localhost:3000` in your browser. Create an account or sign in.

### 3. Run Automated Tests
```bash
cd web
npm test
```
Runs the full test suite including:
- Password hashing & salt verification
- HMAC token signing & tamper rejection
- Single-use pairing code consumption & status tracking
- Strict user isolation (User A cannot access or download User B's transfers)
- Automatic lazy expiration cleanup

### 4. Build Web App for Production
```bash
cd web
npm run typecheck
npm run build
```

---

## iOS App Setup & Building

1. **Direct Sideloading / Xcode**:
   - Open `ios/TransferApp.xcodeproj` in Xcode.
   - Set your Development Team under Signing & Capabilities.
   - Deploy `TransferApp` to your iPhone.
2. **Connecting to your Server**:
   - In `TransferApp` on iPhone, tap the Settings icon in the top right.
   - Enter your hosted server URL (e.g. `https://your-vercel-domain.vercel.app`).
   - Log in with your username/password OR enter the 6-digit pair code shown on your PC dashboard.
3. **Sharing to PC from any app**:
   - In Photos or Files, select any photo, video, or document.
   - Tap **Share** -> Choose **Transfer**.
   - The file is streamed to your private PC inbox.
4. **Sending to iPhone from PC**:
   - Drag and drop files onto the web dropzone.
   - In `TransferApp` on iPhone, the files appear in "INCOMING". Tap **SHARE** or **GET** to open in native iOS Files or other apps.
