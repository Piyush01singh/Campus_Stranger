# System Architecture & Technical Design

## High-Level Topology

```text
[ Browser Client (Next.js 14 / React / WebCrypto) ]
                       │
       ┌───────────────┴───────────────┐
       ▼                               ▼
 [ REST API (NestJS) ]       [ WebSocket Gateway (Socket.IO) ]
       │                               │
       └───────────────┬───────────────┘
                       ▼
       ┌───────────────────────────────┐
       │   Durable Layer: PostgreSQL   │
       │   Transient Layer: Redis      │
       └───────────────────────────────┘
```

## Zero-Knowledge Client E2EE Architecture

1. **Key Generation**:
   - Each client generates an ECDH P-256 (X25519) identity key pair using `window.crypto.subtle`.
   - Private keys are stored strictly in browser IndexedDB/LocalStorage.
   - Public prekey bundles are shared through the backend strictly as routing metadata.

2. **Handshake & Session Derivation**:
   - During random matchmaking, public identity and signed prekeys are exchanged.
   - Both clients independently compute the ECDH shared secret and derive matching root and send/recv chain keys via `HKDF-SHA256`.

3. **Message Ratcheting**:
   - Every message advances the ratchet chain key and derives an ephemeral AES-256-GCM symmetric key.
   - The server routes and stores only `IEncryptedPayload` (`ciphertext`, `iv`, `protocolVersion`, `keyId`).
   - The backend contains ZERO plaintext message content.

## Identity & Account Linking

- **Guest Users**: Assigned a random internal `UserId`, arbitrary display name, and session JWT.
- **Google Authentication**: Links an `AuthAccount` record to the existing `UserId`.
- **Session Preservation**: Upgrading to Google OAuth preserves active conversations, saved stranger connections, and cryptographic identity without creating duplicate user records.
