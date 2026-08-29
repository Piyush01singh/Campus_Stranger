# End-to-End Encryption (E2EE) Specification

## Cryptographic Primitives

| Operation          | Algorithm / Standard                   | Key / Block Size                  |
| :----------------- | :------------------------------------- | :-------------------------------- |
| Key Agreement      | ECDH (P-256 / X25519)                  | 256-bit                           |
| Key Derivation     | HKDF-SHA256                            | 256-bit                           |
| Message Encryption | AES-GCM                                | 256-bit Key / 96-bit (12-byte) IV |
| Web Environment    | Web Cryptography API (`crypto.subtle`) | Standard W3C Spec                 |

## Message Envelope Structure

```typescript
export interface IEncryptedPayload {
  ciphertext: string; // Base64 AES-GCM encrypted data
  iv: string; // Base64 12-byte initialization vector
  protocolVersion: number; // Protocol scheme (1)
  keyId?: string; // Ratchet step identifier
}
```

## Security Boundaries & Guarantees

1. The server operates strictly as an encrypted ciphertext relay and storage node.
2. In the event of a total server or database compromise, historical message contents remain undecryptable without client-held private keys.
3. Private key material is never exposed over WebSockets, HTTP headers, cookies, or logs.
