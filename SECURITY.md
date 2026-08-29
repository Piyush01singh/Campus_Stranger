# Security, Privacy & Abuse Prevention Policy

## Core Security Commitments & Architecture

### 1. Zero Plaintext Storage & Zero-Knowledge Boundary
* **No Plaintext Ingest**: The backend REST API, Socket.IO WebSocket gateway, Redis coordinator, and PostgreSQL database NEVER receive, process, or store unencrypted chat messages during standard operation.
* **Client-Side Cryptography**: All message payloads are encrypted client-side using authenticated `AES-256-GCM` with 96-bit CSPRNG IVs, 128-bit authentication tags, and Authenticated Associated Data (AAD) binding (`CampusStranger-AAD:${conversationId}:${ephemPublicKey}:${step}`).
* **Zero Secret Transmission**: Client private keys (Identity private keys, ephemeral DH ratchet private keys, root keys, and chain keys) NEVER leave the client's local browser device.
* **Server Boundary Defense**: Runtime boundary validators (`assertNeverContainsPrivateKey` and `assertEncryptedPayloadValid`) strictly reject any inbound payload containing private key properties or unencrypted text.

### 2. Authentication & Guest Session Security
* **Server-Derived Identity**: Client-provided user IDs or roles are never trusted. All authenticated operations strictly derive `UserId` from verified JWT session signatures (`sub` claim).
* **Guest Session Isolation**: Anonymous guests receive secure random IDs (`usr_${timestamp}_${random}`) and short-lived guest sessions stored with expiration metadata.
* **Account Linking Protection**:
  - Upgrading an anonymous guest via Google OAuth links an `AuthAccount` record to the existing `UserId` without destroying ongoing conversations, saved connections, blocks, or local cryptographic keys.
  - When linking to an already-existing Google user, all active conversation memberships, messages, saved connections, blocks, and reports are atomically migrated via relational foreign key updates.
  - Development mock linking (`POST /api/auth/google/mock-link`) is strictly disabled in production (`NODE_ENV === 'production'`).

### 3. Strict Authorization & IDOR / BOLA Prevention
* **Conversation Membership Validation**: All conversation operations (`save`, `messages`, `sync`) verify that the authenticated `req.user.id` is an active member in PostgreSQL before executing.
* **Private Message History Access**: Accessing encrypted message history (`GET /api/conversations/:id/messages`) requires verified membership; unauthorized attempts return `403 Forbidden`.
* **Moderation BOLA Defense**: Submitting a user report (`POST /api/moderation/report` or `chat:report`) verifies:
  - Reporter is a confirmed participant in the conversation.
  - Reported user is the other participant in that specific conversation.
  - Reporter cannot report themselves (`reporterId !== reportedUserId`).
* **Self-Action Prevention**: Users cannot block themselves (`POST /api/moderation/block`).

### 4. Realtime Abuse & Rate Limiting Controls
* **Configurable Distributed Rate Limits (Redis-Backed)**:
  - `ws:send:${userId}`: Max 30 messages per 10 seconds.
  - `ws:match_join:${userId}`: Max 10 matchmaking joins per 10 seconds.
  - `ws:next:${userId}`: Max 10 partner skips per 10 seconds.
  - `ws:typing:${userId}`: Max 20 typing events per 10 seconds.
  - `ws:report:${userId}`: Max 5 reports per 10 seconds.
  - `ws:block:${userId}`: Max 10 blocks per 10 seconds.
  - `ws:sync:${userId}`: Max 20 sync requests per 10 seconds.
  - `ws:auth:${socketId}`: Max 10 auth attempts per 10 seconds.
* **Payload Size Limits**: Ciphertext payloads exceeding 64KB are rejected immediately to prevent memory exhaustion attacks.
* **Oversized Field Bounds**: All REST DTOs enforce strict `@MaxLength` constraints on display names, aliases, IDs, and report details.

### 5. Instant Two-Way Block List Enforcement
* **Bidirectional Blocking**: When User A blocks User B:
  - User A and User B can never be matched together in random matchmaking.
  - Active conversations between the two are immediately ended.
  - Attempting to send messages in ended/blocked conversations is rejected with `403 Forbidden`.
  - Block state persists durably in PostgreSQL (`blocks` table with unique constraint `(user_id, blocked_user_id)`).

### 6. Honest Cryptographic Classification & Threat Model
* **Classification**: `🟡 CUSTOM / NOT FORMALLY VERIFIED` (Custom Double Ratchet-inspired implementation using W3C WebCrypto API primitives: NIST P-256 ECDH + HKDF-SHA256 + AES-256-GCM with AAD).
* **Limitations**:
  - Does NOT claim formal cryptographic verification or official Signal protocol compliance.
  - Client-side encryption protects against eavesdropping by server, database, Redis, and network intermediaries.
  - It does NOT protect against full physical device compromise, browser malware, or client-side XSS if arbitrary script execution occurs on the origin.
  - Multi-device message history recovery is not supported without peer-to-peer key transfer, as the server holds zero escrow keys.

