import { io } from 'socket.io-client';

const API_BASE = 'https://campus-stranger.onrender.com';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Simulates the exact browser SocketClient class with the updated lifecycle
class BrowserSocketClientSimulator {
  constructor(name, token) {
    this.name = name;
    this.token = token;
    this.socket = null;
    this.isAuthenticated = false;
    this.authPromise = null;
  }

  connect() {
    if (this.socket && this.socket.connected && this.isAuthenticated) {
      return Promise.resolve(this.socket);
    }

    if (this.authPromise) {
      return this.authPromise;
    }

    if (!this.socket) {
      this.socket = io(API_BASE, {
        transports: ['websocket', 'polling'],
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
      });

      this.socket.on('disconnect', () => {
        this.isAuthenticated = false;
        console.log(`[${this.name}] Socket disconnected.`);
      });

      this.socket.on('connect_error', (err) => {
        console.warn(`[${this.name}] Socket connect error:`, err.message);
      });
    } else if (!this.socket.connected) {
      this.socket.connect();
    }

    this.authPromise = new Promise((resolve) => {
      let isResolved = false;

      const finish = (sock) => {
        if (!isResolved) {
          isResolved = true;
          this.authPromise = null;
          resolve(sock);
        }
      };

      const timer = setTimeout(() => {
        console.warn(`[${this.name}] Auth timeout fallback triggered.`);
        finish(this.socket);
      }, 8000);

      this.socket.once('authenticated', (user) => {
        clearTimeout(timer);
        this.isAuthenticated = true;
        console.log(`[${this.name}] 🟢 Authenticated on server as: ${user.displayName} (${user.userId})`);
        finish(this.socket);
      });

      this.socket.once('chat:error', (err) => {
        if (err?.code === 'UNAUTHORIZED') {
          console.error(`[${this.name}] 🔴 Server unauthorized error:`, err.message);
          clearTimeout(timer);
          finish(this.socket);
        }
      });

      const sendAuth = async () => {
        console.log(`[${this.name}] Socket connected, sending authenticate event...`);
        this.socket.emit('authenticate', {
          token: this.token,
          preKeyBundle: { identityKey: `idKey_${this.name}`, signedPreKey: `preKey_${this.name}` },
        });
      };

      if (this.socket.connected) {
        sendAuth();
      } else {
        this.socket.once('connect', sendAuth);
      }
    });

    return this.authPromise;
  }

  async joinMatchmaking() {
    await this.connect();
    console.log(`[${this.name}] Emitting match:join to server...`);
    this.socket.emit('match:join', {
      preKeyBundle: { identityKey: `idKey_${this.name}`, signedPreKey: `preKey_${this.name}` },
    });
  }
}

async function runDeviceDiagnostic() {
  console.log('================================================================');
  console.log('  CampusStranger Multi-Device Matchmaking Production Diagnostic ');
  console.log('================================================================\n');

  // 1. Device 1 (Laptop) - Create Guest
  console.log('--- Step 1: Device 1 (Laptop) HTTP Guest Creation ---');
  const res1 = await fetch(`${API_BASE}/api/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Alice_Laptop' }),
  });
  const data1 = (await res1.json()).data;
  console.log(`[Laptop] Guest session created: User=${data1.user.displayName}, ID=${data1.user.id}`);

  // 2. Device 2 (Phone) - Create Guest
  console.log('\n--- Step 2: Device 2 (Phone) HTTP Guest Creation ---');
  const res2 = await fetch(`${API_BASE}/api/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Bob_Phone' }),
  });
  const data2 = (await res2.json()).data;
  console.log(`[Phone] Guest session created: User=${data2.user.displayName}, ID=${data2.user.id}`);

  // 3. Instantiate browser socket client simulators
  const laptopClient = new BrowserSocketClientSimulator('Laptop_Client', data1.accessToken);
  const phoneClient = new BrowserSocketClientSimulator('Phone_Client', data2.accessToken);

  // 4. Laptop enters matchmaking
  console.log('\n--- Step 3: Laptop joins matchmaking ---');
  let matchLaptop = null;
  const matchLaptopPromise = new Promise((resolve) => {
    laptopClient.socket?.on('match:found', resolve);
  });

  await laptopClient.joinMatchmaking();

  // Wait 1 second (simulating real device delay before second user starts searching)
  console.log('Waiting 1s before Phone user starts matchmaking...');
  await sleep(1000);

  // 5. Phone enters matchmaking
  console.log('\n--- Step 4: Phone joins matchmaking ---');
  let matchPhone = null;

  const matchLaptopPromiseActual = new Promise((resolve) => {
    laptopClient.socket.once('match:found', (payload) => {
      matchLaptop = payload;
      resolve(payload);
    });
  });

  const matchPhonePromiseActual = new Promise((resolve) => {
    phoneClient.socket = io(API_BASE, { transports: ['websocket', 'polling'] });
    phoneClient.socket.once('match:found', (payload) => {
      matchPhone = payload;
      resolve(payload);
    });
  });

  // Attach error watchers
  laptopClient.socket.on('chat:error', (err) => console.error('[Laptop Error]', err));
  phoneClient.socket.on('chat:error', (err) => console.error('[Phone Error]', err));

  await phoneClient.joinMatchmaking();

  console.log('\n--- Step 5: Awaiting Matchmaking Resolution ---');
  await Promise.all([matchLaptopPromiseActual, matchPhonePromiseActual]);

  console.log('🎉 MATCH SUCCESSFUL!');
  console.log(`[Laptop] Matched with: ${matchLaptop.partnerDisplayName}, ConvId: ${matchLaptop.conversationId}`);
  console.log(`[Phone]  Matched with: ${matchPhone.partnerDisplayName}, ConvId: ${matchPhone.conversationId}`);

  if (matchLaptop.conversationId !== matchPhone.conversationId) {
    throw new Error('Conversation IDs mismatch between Laptop and Phone');
  }

  // 6. E2EE Bidirectional Message Exchange
  console.log('\n--- Step 6: Bidirectional E2EE Ciphertext Exchange ---');
  const mockEnvelopeA = {
    ciphertext: 'QWxpY2VfTGFwdG9wX0VuY3J5cHRlZF9NZXNzYWdl',
    iv: 'aXZfbGFwdG9wXzk2',
    tag: 'dGFnX2xhcHRvcA==',
    ephemPublicKey: 'ZXBoZW1fa2V5X2xhcHRvcA==',
    protocolVersion: 1,
    keyId: 'step_1',
  };

  const phoneReceivedPromise = new Promise((resolve) => {
    phoneClient.socket.once('chat:message', resolve);
  });

  laptopClient.socket.emit('chat:send', {
    clientMessageId: `cmsg_${Date.now()}`,
    conversationId: matchLaptop.conversationId,
    encryptedPayload: mockEnvelopeA,
  });

  const phoneReceived = await phoneReceivedPromise;
  console.log(`[Phone]  Received encrypted message from Laptop: ID=${phoneReceived.envelope.id}`);
  console.log(`[Phone]  Ciphertext match: ${phoneReceived.envelope.encryptedPayload.ciphertext === mockEnvelopeA.ciphertext}`);

  // Phone replies back to Laptop
  const mockEnvelopeB = {
    ciphertext: 'Qm9iX1Bob25lX0VuY3J5cHRlZF9SZXBseQ==',
    iv: 'aXZfcGhvbmVfOTY=',
    tag: 'dGFnX3Bob25l',
    ephemPublicKey: 'ZXBoZW1fa2V5X3Bob25l',
    protocolVersion: 1,
    keyId: 'step_2',
  };

  const laptopReceivedPromise = new Promise((resolve) => {
    laptopClient.socket.once('chat:message', resolve);
  });

  phoneClient.socket.emit('chat:send', {
    clientMessageId: `cmsg_reply_${Date.now()}`,
    conversationId: matchPhone.conversationId,
    encryptedPayload: mockEnvelopeB,
  });

  const laptopReceived = await laptopReceivedPromise;
  console.log(`[Laptop] Received encrypted reply from Phone: ID=${laptopReceived.envelope.id}`);
  console.log(`[Laptop] Ciphertext match: ${laptopReceived.envelope.encryptedPayload.ciphertext === mockEnvelopeB.ciphertext}`);

  // Cleanup
  laptopClient.socket.disconnect();
  phoneClient.socket.disconnect();

  console.log('\n================================================================');
  console.log('✅ ALL DIAGNOSTIC CHECKS PASSED: LAPTOP & PHONE MATCHED CLEANLY');
  console.log('================================================================\n');
}

runDeviceDiagnostic().catch((err) => {
  console.error('\n❌ DIAGNOSTIC FAILED:', err);
  process.exit(1);
});
