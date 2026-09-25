# SPECIFICATION: Cross-Device File Sharing System (AirDrop / Snapdrop / Portal Alternative)

## 1. Executive Brief
A production-grade, secure, ephemeral cross-device file sharing system enabling instant bidirectional transfers between Phones (iOS / Android) and PCs (Windows / macOS / Linux) over local network or remote server relay. Features a complete pair/room session system (QR code, 6-digit PIN), temporary encrypted storage with automated TTL expiration & auto-pruning, real-time WebSocket live updates, production REST API, and native iOS Share Extension code.

## 2. Goals & Non-Goals
### Goals
- Instant zero-friction device pairing via 6-digit PIN or QR code.
- Bidirectional transfer: Phone → Server → PC and PC → Server → Phone.
- Ephemeral temporary storage with configurable TTL (e.g. 5m, 15m, 1h, 24h) and auto-expiration cleanup worker.
- "Burn-after-reading" (auto-delete upon download) option.
- Real-time signaling via WebSockets for instant file arrival alerts on connected paired screens.
- Ready-to-use Swift iOS Share Extension code and manifest for native iOS integration.
- PWA & Web Share Target API support for mobile web sharing.
- High-grade UI: Glassmorphism, dark cyberpunk/modern styling, responsive desktop & mobile screens.

### Non-Goals
- Permanent cloud archival (DropBox/Google Drive clone) — this is explicitly an ephemeral transfer tool.
- User accounts / login barriers — transfers are session/pair token based for zero-friction.

## 3. Architecture & Data Flow
```
       [iOS / Android Mobile]              [Node.js / Express Server]              [Desktop PC Web]
      (Mobile Web / iOS Share Ext)                                            (Browser Dashboard)
                 |                                      |                               |
                 |--- 1. Request Pairing Session ------>|                               |
                 |<-- 2. Return Session ID + 6-digit ---|                               |
                 |       (or scan PC QR code)           |                               |
                 |                                      |<--- 3. PC joins with PIN -----|
                 |                                      |==== 4. WS Pair Connected =====|
                 |                                      |                               |
  [Phone->PC]    |--- 5. POST /api/transfer/upload ---->|                               |
                 |       (multipart stream + SHA256)    |--- 6. WS Notification -------->|
                 |                                      |<-- 7. GET /api/transfer/:id --|
                 |                                      |       (stream download)       |
                 |                                      |                               |
  [PC->Phone]    |                                      |<--- 8. POST /api/transfer ----|
                 |<-- 9. WS Push Notification ----------|                               |
                 |--- 10. GET /api/transfer/:id ------->|                               |
```

## 4. API Specification
- `POST /api/sessions/create`: Creates a session with 6-digit pair code, QR payload, and auth token.
- `POST /api/sessions/join`: Join a session with a 6-digit code.
- `GET /api/sessions/:id`: Get session details, connected peers, and transfer history.
- `POST /api/transfers/upload`: Multipart upload with fields: `sessionId`, `burnAfterReading`, `ttlMinutes`. Returns transfer metadata, SHA256 checksum, download URL.
- `GET /api/transfers/:id/download`: Stream file to client with proper Content-Disposition and MIME type.
- `DELETE /api/transfers/:id`: Explicit transfer deletion.
- `GET /api/health`: Server health, active storage stats, active sessions count.
- `WS /ws`: Real-time session signaling (`join`, `peer_joined`, `transfer_ready`, `transfer_progress`, `transfer_downloaded`, `peer_left`).

## 5. Storage & Expiration Engine
- Directory: `data/uploads/`
- Database: SQLite database `data/storage.db` tracking:
  - `sessions` (`id`, `code`, `created_at`, `expires_at`, `status`)
  - `transfers` (`id`, `session_id`, `filename`, `filesize`, `mimetype`, `storage_path`, `sha256`, `burn_after_reading`, `created_at`, `expires_at`, `download_count`)
- Background Worker: Ticks every 30 seconds, deletes physical files on disk where `expires_at < NOW` or `burn_after_reading = 1 AND download_count >= 1`.

## 6. iOS Native Share Extension
- Path: `ios/ShareExtension/`
- Swift source: `ShareViewController.swift` that handles `kUTTypeData`, `kUTTypeImage`, `kUTTypeMovie`, streams chunks to the configured server endpoint with session token saved in App Group `UserDefaults`, and provides UI progress feedback.
- `Info.plist` with extension activation rules.
