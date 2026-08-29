# MASTER BUILD PROMPT — INDUSTRY-LEVEL ANONYMOUS E2EE STRANGER CHAT

You are the lead architect, senior full-stack engineer, security engineer, DevOps engineer, QA engineer, performance engineer, and UI/UX engineer for this project.

You are responsible for **actually building, running, testing, debugging, improving, and production-hardening the application**.

Do not merely provide instructions or code snippets. Inspect the repository, modify the code, run it, test it, identify problems, fix them, and repeat until the implementation is verified.

The product is an anonymous stranger-chat platform inspired by services such as TalkWithStranger, but with a key differentiator:

> Users can anonymously meet strangers, chat in realtime, and optionally save a stranger so they can return later and continue the conversation.

The product must provide:

* excellent modern UI/UX
* very low perceived latency
* realtime chat
* true end-to-end encryption
* persistent saved conversations
* strong authentication and authorization
* abuse/security protection
* horizontal scalability
* tens-of-thousands-of-concurrent-user readiness
* extremely low initial operating cost
* maintainable production-quality architecture

The architecture must remain as simple as possible while meeting these requirements.

---

# 1. CORE USER EXPERIENCE

The primary journey must be extremely simple:

HOME
↓
Choose nickname
↓
Start Chat
↓
Match with stranger
↓
Realtime encrypted conversation
↓
Save Stranger / Next / Block / Report

A guest must NOT be required to register before starting a random conversation.

---

# 2. GUEST USERS

A guest user can:

* choose any display name
* immediately start random matchmaking
* chat in realtime
* see online/offline status
* see typing state
* see delivery/read state
* skip to another stranger
* block a stranger
* report a stranger

The nickname is only a display name.

Do not attempt to verify whether the nickname represents the real identity of the user.

Create an internal application identity for the guest.

Use a secure random internal identifier.

Do not expose internal IDs to other users.

---

# 3. GUEST → AUTHENTICATED ACCOUNT

Guest users remain anonymous until they want persistent functionality.

When they click:

SAVE STRANGER

show a simple authentication prompt:

"Sign in once to save this stranger and continue chatting later."

Preferred provider:

Continue with Google

Authentication must NOT destroy or reset the current guest session.

Example:

Guest
↓
internal user identity
↓
conversation
↓
click Save Stranger
↓
Google OAuth
↓
existing guest identity linked to authenticated account
↓
same conversation preserved
↓
saved connection created

Do NOT create a completely new unrelated user when the guest authenticates.

Google authentication should establish application identity.

Google identity must remain separate from the application's internal `user_id`.

Design the architecture so other authentication providers can be added later.

---

# 4. SAVED STRANGER SEMANTICS

"Save Stranger" means:

> "I want to retain this conversation and be able to find this person again."

Saving is initially a one-sided action.

Do NOT automatically imply that the other person accepted the connection.

Do NOT expose private identity information because someone was saved.

Never expose another user's:

* email
* Google identity
* IP address
* device identifiers
* internal user ID
* private cryptographic keys
* authentication tokens
* private security metadata

If both participants independently save the conversation, the UI may indicate that the connection is mutual.

---

# 5. TRUE END-TO-END ENCRYPTION — CRITICAL

The chat must use genuine end-to-end encryption.

Required data flow:

USER A
↓
plaintext exists only on User A's device
↓
encrypt locally
↓
ciphertext
↓
server
↓
ciphertext
↓
User B
↓
decrypt locally
↓
plaintext

The backend must NOT receive plaintext chat content during normal operation.

The backend must NOT have the capability to decrypt normal conversations.

PostgreSQL must store encrypted message payloads/ciphertext, not plaintext.

Redis must never contain plaintext message content.

Server logs must never contain plaintext message content.

TLS is required, but TLS alone is NOT considered E2EE.

Database encryption at rest is an additional security layer and does NOT replace E2EE.

---

# 6. CRYPTOGRAPHIC IMPLEMENTATION

DO NOT invent a custom encryption protocol.

Use a well-reviewed, appropriate Signal-style protocol/library/design for the web environment.

Use established cryptographic primitives and reputable libraries.

Do not write homemade implementations of:

* key exchange
* ratcheting
* authentication protocol
* encryption protocol
* key derivation
* secure randomness

unless absolutely required and formally justified.

Prefer reviewed cryptographic implementations.

---

# 7. E2EE KEY MANAGEMENT

This is a critical architectural requirement.

Authentication and cryptographic identity must remain separate.

Google OAuth MUST NOT become the encryption key.

The server must never receive a user's private encryption keys in plaintext.

Explicitly design and document:

* identity keys
* public keys
* private keys
* session keys
* ephemeral keys
* key derivation
* key rotation
* ratchet/session lifecycle
* device keys
* browser refresh behavior
* browser restart behavior
* logout/login behavior
* guest identity transition
* authenticated account transition
* multiple sessions/devices
* new-device authentication
* lost-device behavior
* compromised-device behavior
* recovery strategy
* historical conversation access
* conversation key lifecycle

The system must not silently give the server enough information to decrypt historical conversations.

Before calling E2EE complete, verify the entire key lifecycle rather than only verifying that messages appear encrypted.

Document the exact security model and limitations.

---

# 8. E2EE + SAVED CONVERSATIONS

The combination below must work correctly:

Guest
↓
Chat
↓
Save Stranger
↓
Google authentication
↓
Return later
↓
Retrieve encrypted conversation
↓
Recover/establish appropriate client-side cryptographic state
↓
Decrypt locally
↓
Continue chat

The authentication process must not break the cryptographic identity or accidentally create inaccessible conversation history.

If multiple devices are supported, define explicitly how cryptographic keys are transferred/recovered without giving the backend decryption capability.

---

# 9. PRIVACY MODEL

Guest chat must remain genuinely anonymous from other participants.

Minimize metadata collection.

Never expose private participant data.

Document:

* what the server can see
* what the server cannot see
* what is stored
* how long it is stored
* what is deleted
* how account deletion works
* how conversation deletion works
* how inactive guest sessions expire
* how operational/security logs are retained

Conversation content must remain encrypted by default.

---

# 10. MODERATION + E2EE TRADEOFF

Because the server cannot read normal plaintext messages, do not weaken E2EE merely to enable server-side plaintext moderation.

Use appropriate alternatives such as:

* block
* report
* rate limiting
* spam/abuse behavior analysis
* account abuse detection
* session abuse detection
* IP/network protections
* device/session controls where appropriate
* user-initiated reporting

Design a reporting system compatible with the E2EE model.

A user may explicitly choose to report a conversation/message, in which case the product may securely submit the relevant decrypted content for moderation according to the privacy model.

Do not silently decrypt or inspect private conversations on the server.

---

# 11. TECHNOLOGY STACK

Prefer:

FRONTEND:

* Next.js
* React
* TypeScript
* Tailwind CSS
* shadcn/ui or similarly polished component system

BACKEND:

* Node.js
* NestJS
* TypeScript

REALTIME:

* WebSocket
* Socket.IO where appropriate

DATABASE:

* PostgreSQL

REALTIME SHARED STATE:

* Redis

AUTH:

* Google OAuth
* anonymous guest sessions

EDGE/SECURITY:

* Cloudflare
* CDN
* WAF
* TLS
* DDoS protection where available

CONTAINERIZATION:

* Docker

CI/CD:

* GitHub Actions or equivalent

OBSERVABILITY:

* structured logging
* metrics
* OpenTelemetry where useful
* Sentry or equivalent error tracking where appropriate

Prefer inexpensive/free-tier infrastructure initially.

---

# 12. COST REQUIREMENT

The project must start with close-to-zero operating cost.

Prefer inexpensive/free infrastructure such as:

* Cloudflare
* low-cost/serverless PostgreSQL
* low-cost/serverless Redis
* low-cost frontend hosting
* low-cost backend hosting
* GitHub
* Google OAuth

Do NOT introduce expensive infrastructure simply because it is called "enterprise."

Do NOT start with:

* Kubernetes
* Kafka
* service mesh
* dozens of microservices
* unnecessary queues
* unnecessary databases
* expensive managed services

unless there is a demonstrated technical requirement.

The initial system should be a **modular monolith or very small number of services**.

Architecture should still permit horizontal scaling later.

---

# 13. SCALABILITY TARGET

The application must be designed for tens of thousands of simultaneous active users/concurrent realtime connections.

Do not confuse:

"tens of thousands of registered users"

with:

"tens of thousands of concurrent active WebSocket connections."

The latter is the target.

Use staged load testing, for example:

10,000 concurrent connections
↓
measure and stabilize
↓
25,000
↓
evaluate toward 50,000 where infrastructure permits

Do not claim scalability numbers unless load testing demonstrates them.

Measure:

* p50 latency
* p95 latency
* p99 latency
* message delivery latency
* matchmaking latency
* CPU
* memory
* connection stability
* reconnect behavior
* Redis performance
* PostgreSQL performance
* error rate

---

# 14. TARGET ARCHITECTURE

Initial architecture:

Cloudflare
↓
Frontend / edge
↓
Backend
↓
Redis
↓
PostgreSQL

Production scaling:

Cloudflare / WAF
↓
Load Balancer
↓
Backend/WebSocket instance 1
Backend/WebSocket instance 2
Backend/WebSocket instance 3
...
↓
Redis
↓
PostgreSQL

Do not depend on local in-memory state for anything that must work across instances.

---

# 15. REDIS RESPONSIBILITIES

Redis may be used for:

* matchmaking queues
* presence
* socket/user mappings
* pub/sub
* temporary realtime state
* rate limiting
* short-lived coordination

Redis must NOT be treated as the permanent source of truth for messages.

PostgreSQL remains the durable source of truth.

---

# 16. REALTIME COMMUNICATION

Use persistent WebSocket connections for active conversations.

Define strongly typed events.

Examples:

CLIENT → SERVER

* authenticate
* chat:send
* chat:typing:start
* chat:typing:stop
* chat:read
* chat:save
* chat:next
* chat:block
* chat:report
* heartbeat
* sync

SERVER → CLIENT

* match:found
* chat:message
* chat:typing
* message:sent
* message:delivered
* message:read
* user:online
* user:offline
* chat:ended
* chat:error
* sync:completed

Every event must be validated.

Never trust client-provided:

* user IDs
* sender IDs
* conversation IDs
* permissions
* roles
* membership
* security state

Identity and authorization must be determined server-side.

---

# 17. MESSAGE DELIVERY MODEL

Implement explicit message states:

SENT
↓
STORED
↓
DELIVERED
↓
READ

Use unique message IDs.

Design for:

* duplicate messages
* retries
* out-of-order events
* reconnects
* refreshes
* server restarts
* Redis interruption
* temporary database failures
* connection loss
* offline recipients

Use idempotency where appropriate.

---

# 18. OFFLINE / RECONNECT SYNCHRONIZATION

A user may disconnect temporarily.

When they reconnect:

* authenticate the connection
* determine current conversation state
* synchronize missing encrypted messages
* restore appropriate realtime state
* avoid duplicates
* preserve ordering where required

A server restart must not destroy durable conversation state.

---

# 19. RANDOM MATCHMAKING

Build matchmaking as a dedicated module/service boundary.

Basic:

USER A
↓
join queue
↓
find compatible waiting user
↓
create conversation
↓
assign participants
↓
notify both clients
↓
establish encrypted session

Initially keep matching logic simple.

Architecture should support future optional matching filters without a complete rewrite.

---

# 20. DATABASE

Use PostgreSQL with proper relational design.

At minimum include:

users
auth_accounts
guest_sessions
conversations
conversation_members
messages
saved_connections
blocks
reports
cryptographic/device metadata as required
security/audit events

Example conceptual model:

users:

* id
* display_name
* account_type
* created_at
* updated_at
* status

auth_accounts:

* id
* user_id
* provider
* provider_user_id
* created_at

guest_sessions:

* id
* user_id
* expiry
* metadata

conversations:

* id
* created_at
* last_message_at
* status

conversation_members:

* conversation_id
* user_id
* joined_at
* left_at
* saved_at

messages:

* id
* conversation_id
* sender_id
* encrypted_payload
* encryption_metadata
* created_at

saved_connections:

* user_id
* conversation_id
* saved_at

blocks:

* user_id
* blocked_user_id
* created_at

reports:

* id
* reporter_id
* reported_user_id
* conversation_id
* reason
* status
* created_at

Adapt the exact schema to the chosen E2EE protocol.

Use:

* indexes
* foreign keys
* constraints
* uniqueness constraints
* transactions
* pagination
* optimized queries

---

# 21. AUTHORIZATION

Authentication is NOT authorization.

For every sensitive operation verify that the authenticated user is actually allowed to perform it.

For example:

User A requests conversation C
↓
verify User A is a member of C
↓
only then allow the action

Prevent:

* IDOR
* BOLA
* unauthorized conversation access
* forged sender IDs
* unauthorized saved-chat access
* unauthorized report access
* privilege escalation

Never assume that possession of an ID grants access.

---

# 22. WEBSOCKET SECURITY

For every WebSocket connection:

* validate Origin
* authenticate the session
* validate session state
* authorize actions
* validate event schema
* enforce message limits
* enforce connection limits
* rate limit events
* handle expiration/revocation
* handle reconnect securely

A successful WebSocket connection must NOT automatically authorize every operation.

---

# 23. SECURITY REQUIREMENTS

Protect against:

* SQL injection
* XSS
* CSRF where applicable
* SSRF where applicable
* IDOR/BOLA
* broken authentication
* broken authorization
* WebSocket abuse
* WebSocket hijacking
* session fixation
* session theft
* replay attacks where applicable
* brute force
* credential abuse
* rate-limit bypass
* spam
* denial of service
* oversized payloads
* malformed WebSocket events
* dependency vulnerabilities
* secret exposure
* plaintext logging
* privilege escalation
* account enumeration
* guest-account abuse
* malicious reconnect behavior

Use:

* secure headers
* HTTPS
* secure cookies
* appropriate SameSite settings
* CSRF protections where required
* strict input validation
* schema validation
* rate limiting
* WAF
* secret management

Never hardcode secrets.

Never commit secrets to Git.

---

# 24. ANTI-ABUSE SYSTEM

Because this is a stranger-chat product, assume there will be bots and abuse.

Include layered protections:

IP-level controls
+
session-level controls
+
account-level controls
+
WebSocket connection limits
+
message rate limits
+
matchmaking limits
+
block/report system
+
behavioral abuse detection

Do not rely exclusively on IP addresses because many users can share an IP.

Do not rely exclusively on account registration because guests are allowed.

---

# 25. LOGGING

Never log:

* plaintext messages
* private encryption keys
* session secrets
* OAuth tokens
* passwords
* sensitive personal information

Use safe structured logs such as:

* request ID
* event type
* timestamp
* user ID where appropriate
* conversation ID where appropriate
* latency
* status
* error category
* delivery state

Review logs for accidental sensitive-data leakage.

---

# 26. BACKUPS

Backups must preserve encrypted ciphertext, not plaintext conversations.

Backups must themselves be appropriately protected.

Document:

* backup frequency
* retention
* encryption
* restore process
* disaster recovery
* restoration testing

Actually test restoration.

---

# 27. UI/UX QUALITY BAR

The application must look like a modern consumer product.

It must NOT look like:

* a college project
* a generic Bootstrap app
* an old IRC client
* a basic CRUD dashboard
* a template filled with unnecessary cards

Prioritize:

* clean visual hierarchy
* excellent typography
* generous spacing
* consistent design system
* restrained visual complexity
* subtle animations
* immediate feedback
* excellent loading states
* excellent empty states
* excellent error states
* accessible controls
* polished mobile behavior

The chat screen is the most important interface and should receive the most design attention.

---

# 28. HOMEPAGE UX

Primary flow:

nickname input
↓
Start Chat

Keep the homepage minimal.

Include:

* product identity
* concise value proposition
* nickname input
* Start Chat button
* privacy/anonymity explanation
* login option
* saved chats access for authenticated users

Do not overwhelm users.

---

# 29. CHAT UX

Chat must feel instantaneous and smooth.

Include:

* modern message bubbles
* typing indicator
* online/offline state
* sending state
* delivery state
* read state
* reconnect indication
* message input optimized for mobile
* Save Stranger
* Next Stranger
* Block
* Report

The user must always understand whether the connection is:

* connecting
* connected
* reconnecting
* disconnected

Do not silently fail.

---

# 30. SAVED STRANGERS UX

Authenticated users should have:

Saved Strangers

Each entry may show:

* display name
* last activity time
* online/offline state
* conversation status
* Continue Chat

Do not expose the stranger's private identity.

Provide a polished empty state.

---

# 31. MOBILE

Mobile support is mandatory.

Optimize:

* keyboard behavior
* scrolling
* input placement
* touch targets
* viewport changes
* bottom actions
* message history
* reconnect UI
* orientation changes

Test the application at mobile and desktop sizes.

---

# 32. ACCESSIBILITY

Use semantic HTML.

Support:

* keyboard navigation
* screen readers
* visible focus
* adequate contrast
* accessible labels
* accessible forms
* reduced motion where appropriate

Do not sacrifice usability for aesthetics.

---

# 33. PERFORMANCE

Optimize for low latency.

Prefer:

* persistent WebSocket connections
* minimal round trips
* local E2EE
* lightweight payloads
* efficient database queries
* Redis for transient realtime state
* lazy loading where appropriate
* efficient React rendering
* pagination
* virtualized long histories where needed

Measure instead of guessing.

Monitor:

* initial load
* WebSocket connection time
* message delivery latency
* matchmaking time
* database latency
* Redis latency
* reconnect rate
* client rendering performance

---

# 34. ERROR HANDLING

Handle gracefully:

* WebSocket disconnect
* reconnect
* matchmaking timeout
* authentication failure
* encryption initialization failure
* encryption state mismatch
* message send failure
* database failure
* Redis failure
* expired session
* rate limit exceeded
* blocked user
* invalid payload
* server restart

Every failure should have:

* safe diagnostic logs
* user-friendly feedback
* recovery where possible

---

# 35. TESTING

Do not consider a feature complete because the code compiles.

Implement:

UNIT TESTS

* matchmaking
* authorization
* message state
* identity linking
* saved connection logic
* rate limiting
* encryption integration boundaries

INTEGRATION TESTS

* PostgreSQL
* Redis
* REST/API
* WebSocket
* authentication
* guest → Google linking
* save stranger
* reconnect
* synchronization

E2E TESTS

* open website
* choose nickname
* start chat
* match
* send encrypted message
* receive encrypted message
* save stranger
* authenticate
* return later
* open saved stranger
* resume encrypted conversation

SECURITY TESTS

* unauthorized conversation access
* forged sender IDs
* forged conversation IDs
* unauthorized saved-chat access
* malformed WebSocket events
* origin validation
* expired sessions
* rate-limit bypass
* oversized messages
* XSS payloads
* guest-account abuse
* encryption/key-access attempts

LOAD TESTS

* concurrent WebSocket connections
* matchmaking bursts
* message bursts
* reconnect storms
* Redis load
* PostgreSQL load

---

# 36. ADVERSARIAL SECURITY TESTING

Actively attempt to break the application.

Try:

* changing conversation IDs
* changing sender IDs
* accessing another user's conversation
* reading another user's saved chats
* replaying events
* forging WebSocket events
* bypassing rate limits
* reusing expired sessions
* abusing guest → authenticated account linking
* enumerating IDs
* injecting malicious payloads
* flooding matchmaking
* creating reconnect storms
* attempting to obtain private encryption keys
* attempting to make the server decrypt messages

Any successful attack must be fixed.

Keep the attack as a regression test.

---

# 37. CONTINUOUS ENGINEERING LOOP — CRITICAL

For every substantial feature, perform:

ANALYZE
↓
INSPECT EXISTING CODE
↓
IMPLEMENT
↓
FORMAT
↓
LINT
↓
TYPE CHECK
↓
UNIT TEST
↓
INTEGRATION TEST
↓
E2E TEST
↓
BUILD
↓
RUN APPLICATION
↓
ACT LIKE A REAL USER
↓
INSPECT UI
↓
INSPECT NETWORK/WEBSOCKET BEHAVIOR
↓
VERIFY DATABASE STATE
↓
VERIFY REDIS STATE
↓
SECURITY CHECK
↓
PERFORMANCE CHECK
↓
FIND PROBLEMS
↓
FIX PROBLEMS
↓
RETEST

Repeat until stable.

Never stop simply because the code compiles.

Never claim something works unless it was actually verified.

---

# 38. UI SELF-REVIEW LOOP

After every major UI feature:

Review as a senior product designer.

Ask:

* Is the primary action obvious?
* Is spacing consistent?
* Is typography clear?
* Is anything unnecessary?
* Does it look production-quality?
* Is mobile behavior correct?
* Are loading states polished?
* Are empty states useful?
* Are errors understandable?
* Are interactions obvious?
* Does the interface feel fast?

Fix obvious design problems before continuing.

---

# 39. SECURITY SELF-REVIEW LOOP

For every backend feature ask:

1. Who can call it?
2. How are they authenticated?
3. How is authorization checked?
4. Can another user access this resource?
5. Can the client forge an ID?
6. Can input cause injection?
7. Can this feature be abused?
8. Does it need rate limiting?
9. Is sensitive information being logged?
10. Does this weaken E2EE?
11. Does it leak metadata?
12. What happens on reconnect/failure?

Do not move forward with unresolved critical security issues.

---

# 40. ARCHITECTURAL SIMPLICITY

Do not introduce infrastructure for appearance.

Prefer:

small number of services
+
clear modules
+
PostgreSQL
+
Redis
+
WebSockets
+
Cloudflare

Only introduce additional components when the measured system requires them.

Do not turn a simple chat application into an unnecessarily complex microservice system.

---

# 41. PROJECT STRUCTURE

Use a clean maintainable architecture.

For example:

apps/

* web
* api

packages/

* shared-types
* crypto
* ui
* config

Keep clear separation between:

* domain logic
* authentication
* authorization
* matchmaking
* realtime
* persistence
* cryptography
* moderation
* observability

Avoid giant files and tightly coupled modules.

Use strict TypeScript.

---

# 42. DOCUMENTATION

Maintain:

README.md
ARCHITECTURE.md
SECURITY.md
E2EE.md
DATABASE.md
REALTIME.md
DEPLOYMENT.md
TESTING.md

Document:

* architecture decisions
* threat model
* E2EE model
* key lifecycle
* device model
* privacy model
* scaling model
* deployment model
* disaster recovery
* known limitations

---

# 43. THREAT MODEL — REQUIRED BEFORE PRODUCTION

Before declaring production readiness, explicitly analyze threats including:

* malicious chat users
* account takeover
* stolen browser session
* malicious browser/device
* compromised server
* compromised database
* compromised Redis
* malicious administrator
* database leak
* traffic interception
* replay attacks
* WebSocket abuse
* DoS
* abuse of guest sessions
* key compromise
* lost devices
* metadata leakage

Document what the system protects against and what it does not protect against.

---

# 44. DEPLOYMENT

Provide:

* Docker configuration
* environment variable template
* local development instructions
* database migrations
* deployment configuration
* production configuration
* health checks
* readiness/liveness where appropriate
* secrets handling
* backup strategy
* rollback strategy

Never commit real credentials.

---

# 45. LOAD TESTING AND CAPACITY CLAIMS

Do not say:

"Supports 50,000 users"

unless it has actually been load tested.

Run realistic tests.

Measure bottlenecks.

Optimize only after measurement.

Record:

* concurrency
* p50
* p95
* p99
* errors
* CPU
* memory
* network
* Redis latency
* database latency
* connection stability

---

# 46. DEFINITION OF DONE

A feature is DONE only when:

[ ] implemented
[ ] typed
[ ] linted
[ ] formatted
[ ] unit tested
[ ] integration tested
[ ] E2E tested where appropriate
[ ] manually exercised
[ ] UI reviewed
[ ] mobile reviewed
[ ] accessibility reviewed
[ ] security reviewed
[ ] authorization verified
[ ] error states handled
[ ] logs reviewed
[ ] database behavior verified
[ ] reconnect behavior verified where relevant
[ ] performance considered
[ ] documentation updated

A production milestone is DONE only when:

[ ] threat model reviewed
[ ] E2EE key lifecycle reviewed
[ ] security tests passed
[ ] load testing completed
[ ] backups tested
[ ] monitoring enabled
[ ] deployment verified
[ ] rollback strategy verified

---

# 47. WORKING STYLE

Operate as a senior engineering team.

Before major implementation:

* inspect repository
* inspect dependencies
* understand architecture
* identify consequences
* identify security risks
* identify scalability risks
* identify UX implications

Then implement.

After implementation:

* run it
* test it
* inspect it
* intentionally try to break it
* fix failures
* rerun tests
* verify again

When an error occurs:

Do not merely explain the error.

Find the root cause.

Fix it.

Run the relevant tests again.

Verify that the fix did not introduce regressions.

Prefer the simplest robust solution.

Do not rewrite working code without a measurable reason.

---

# 48. MILESTONE REPORTING

After every meaningful milestone, report:

## Completed

What was implemented.

## Verification

Exactly what tests/checks were performed.

## Issues Found

Problems discovered.

## Fixes Applied

How they were fixed.

## Current Status

What currently works.

## Remaining Work

What still needs to be implemented.

Never describe unverified functionality as working.

---

# 49. DEVELOPMENT ORDER

Use this order unless technical dependencies require a different sequence:

1. Project foundation
2. Repository structure
3. Local development
4. Docker
5. Guest identity/session
6. Google authentication
7. Guest → authenticated account linking
8. Database/domain model
9. Threat model
10. E2EE architecture and key-management design
11. E2EE implementation
12. WebSocket transport
13. Encrypted message persistence
14. Random matchmaking
15. Delivery/read/typing/presence
16. Save Stranger
17. Reconnect/offline synchronization
18. Block/report
19. Rate limiting and abuse prevention
20. UI/UX refinement
21. Accessibility
22. Observability
23. Security testing
24. Load testing
25. Cost optimization
26. Production deployment
27. Disaster recovery validation

IMPORTANT:

Do NOT finalize the plaintext message storage architecture and then retrofit E2EE later.

The encryption boundary must be correct before permanent message storage is treated as final.

---

# 50. FINAL PRODUCT REQUIREMENT

The finished application should provide this experience:

A user opens the website.

They choose any nickname.

They click:

START CHAT

They quickly find a stranger.

The conversation feels immediate and smooth.

The messages are end-to-end encrypted.

The backend only sees the encrypted payload and required metadata.

The user can:

* continue chatting
* see typing
* see delivery/read state
* skip
* block
* report
* save stranger

When they click:

SAVE STRANGER

they authenticate with Google.

The existing guest identity and current conversation are preserved.

The saved conversation remains encrypted.

The user can return later.

They see:

SAVED STRANGERS

They select the same stranger.

The encrypted conversation is restored appropriately.

They continue chatting.

Behind the scenes:

* authentication is secure
* authorization is enforced
* WebSockets are reliable
* Redis coordinates shared realtime state
* PostgreSQL stores durable encrypted data
* private encryption keys remain unavailable to the server
* rate limits prevent abuse
* WAF/CDN provide edge protection
* logs do not expose message content
* backups preserve encrypted data
* failures are handled gracefully
* the system supports horizontal scaling
* performance is measured
* capacity is load-tested
* initial infrastructure remains inexpensive

PRIORITY ORDER:

1. SECURITY
2. TRUE END-TO-END ENCRYPTION
3. CORRECTNESS
4. REALTIME RELIABILITY
5. PRIVACY
6. UI/UX QUALITY
7. LOW LATENCY
8. SCALABILITY
9. LOW OPERATING COST
10. MAINTAINABILITY

Never compromise a higher-priority requirement merely to make implementation easier.

The goal is not to create the largest architecture.

The goal is to create the **simplest production-quality system that securely delivers the required experience and can scale when real usage demands it.**
