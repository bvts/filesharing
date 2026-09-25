# CONSTRAINTS & QUALITY BAR

## 1. Project Invariants
- **Architecture**: Complete bidirectional cross-device file sharing system.
  - **Phone → Server → PC**: Immediate sync or paired fetch via WebSocket/HTTP.
  - **PC → Server → Phone**: Desktop drop zone / web dashboard to mobile client / browser retrieval.
  - **iOS Share Extension Target**: Ready-to-compile Swift ShareExtension structure + Apple App Group + Keychain / Shared UserDefaults configuration + complete simulated Web Share / PWA Share Target & native bridge documentation and code.
- **Pairs & Rooms**: Ephemeral 6-digit numeric pairing code + secure cryptographic session token + QR code pairing.
- **Storage & Lifecycle**:
  - Secure temporary storage (`data/uploads/`).
  - Time-to-Live (TTL) expiration engine (configurable default 15 minutes / 1 hour / 24 hours).
  - One-time download mode (burn after reading).
  - Explicit deletion endpoint + automatic background sweeper pruning expired artifacts and database records.
- **Security & Transfer**:
  - SHA-256 integrity verification on upload and download.
  - File sanitization: no directory traversal, secure random storage filenames, strict mime-type validation.
  - Rate limiting on pairing attempts (prevent brute-forcing 6-digit PINs).
  - Zero plain passwords; room tokens signed with HMAC / cryptographic entropy.
- **Tech Stack**:
  - **Backend**: Node.js + Express + WebSocket (`ws`) + Multer (for robust multi-part streams) + SQLite (better-sqlite3 or sqlite3) for atomic tracking and TTL queries.
  - **Frontend (Web Dashboard & Mobile PWA)**: Vanilla CSS + modern ES modules (no bloated build steps required, immediate zero-config execution), responsive glassmorphic aesthetic w/ dark mode, real-time WebSocket push notifications, drag-and-drop, camera QR scanner support, audio/vibration feedback.
  - **iOS Native Asset Module**: Xcode Swift Share Extension (`ShareViewController.swift`, `Info.plist`, App Group bridge) cleanly placed in `ios/ShareExtension/` ready for Xcode integration.

## 2. Measurable Thresholds
- **Transfer latency**: WebSocket signaling < 50ms locally.
- **Storage safety**: Disk cleanup sweeper runs every 60 seconds; 0 leaked orphaned files.
- **Integrity**: Every uploaded chunk/file verified with client & server-side SHA-256 checksums.
- **Device Support**: Fully tested desktop and mobile responsive layout (viewport 360px to 4K).
- **Pairing Rate Limit**: Max 5 incorrect pair attempts per IP/session before 5-minute cooloff.

## 3. Non-Negotiables
- Do not stop at UI or mock endpoints. Full functional server with active file storage, streaming upload/download, WebSocket signaling, and clean iOS share extension implementation.
