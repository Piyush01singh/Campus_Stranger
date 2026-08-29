import { io } from 'socket.io-client';

const API_BASE = 'https://campus-stranger.onrender.com';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class BrowserDeviceSimulator {
  constructor(name, token) {
    this.name = name;
    this.token = token;
    this.socket = null;
    this.isAuthenticated = false;
    this.authPromise = null;
    this.matchFoundCallback = null;
    this.messageReceivedCallback = null;
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
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      this.socket.on('connect', () => {
        console.log(`[${this.name}] Socket connected. ID: ${this.socket.id}, Transport: ${this.socket.io.engine.transport.name}`);
      });

      this.socket.on('disconnect', (reason, description) => {
        this.isAuthenticated = false;
        console.log(`[${this.name}] Socket disconnected. Reason: ${reason}, Description: ${JSON.stringify(description)}`);
      });

      this.socket.on('connect_error', (err) => {
        console.warn(`[${this.name}] Connect error:`, err.message);
      });

      this.socket.on('chat:error', (err) => {
        console.error(`[${this.name}] 🔴 Server Error:`, JSON.stringify(err));
      });

      this.socket.on('match:found', (payload) => {
        console.log(`[${this.name}] 🟢 Received 'match:found'! Partner: ${payload.partnerDisplayName}, ConvId: ${payload.conversationId}`);
        if (this.matchFoundCallback) this.matchFoundCallback(payload);
      });

      this.socket.on('chat:message', (payload) => {
        console.log(`[${this.name}] 🟢 Received 'chat:message': ID=${payload.envelope.id}`);
        if (this.messageReceivedCallback) this.messageReceivedCallback(payload);
      });
    } else if (!this.socket.connected) {
      this.socket.connect();
    }

    this.authPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`[${this.name}] Authentication timed out`));
      }, 10000);

      this.socket.once('authenticated', (user) => {
        clearTimeout(timer);
        this.isAuthenticated = true;
        console.log(`[${this.name}] 🟢 Authenticated on server as: ${user.displayName} (${user.userId})`);
        resolve(this.socket);
      });

      this.socket.once('chat:error', (err) => {
        if (err?.code === 'UNAUTHORIZED') {
          clearTimeout(timer);
          reject(new Error(`[${this.name}] Unauthorized error: ${err.message}`));
        }
      });

      const sendAuth = () => {
        console.log(`[${this.name}] Emitting authenticate event...`);
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
    console.log(`[${this.name}] Emitting match:join...`);
    this.socket.emit('match:join', {
      preKeyBundle: { identityKey: `idKey_${this.name}`, signedPreKey: `preKey_${this.name}` },
    });
  }

  waitForMatch(timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`[${this.name}] Match timeout (${timeoutMs}ms)`)), timeoutMs);
      this.matchFoundCallback = (payload) => {
        clearTimeout(timer);
        resolve(payload);
      };
    });
  }

  waitForMessage(timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`[${this.name}] Message receive timeout (${timeoutMs}ms)`)), timeoutMs);
      this.messageReceivedCallback = (payload) => {
        clearTimeout(timer);
        resolve(payload);
      };
    });
  }

  sendEncryptedMessage(conversationId, ciphertext) {
    const payload = {
      clientMessageId: `cmsg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      conversationId,
      encryptedPayload: {
        ciphertext,
        iv: `iv_${this.name}`,
        tag: `tag_${this.name}`,
        ephemPublicKey: `ephem_${this.name}`,
        protocolVersion: 1,
        keyId: `step_${this.name}`,
      },
    };
    this.socket.emit('chat:send', payload);
    return payload;
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.isAuthenticated = false;
    this.authPromise = null;
  }
}

async function runDeviceDiagnostic() {
  console.log('================================================================');
  console.log('  CampusStranger Multi-Device Matchmaking Production Diagnostic ');
  console.log(`  Target: ${API_BASE}`);
  console.log('================================================================\n');

  // 1. Device 1 (Laptop) - Create Guest
  console.log('--- Step 1: Device 1 (Laptop) HTTP Guest Creation ---');
  const res1 = await fetch(`${API_BASE}/api/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Alice_Laptop' }),
  });
  if (!res1.ok) throw new Error(`Laptop guest creation failed: ${res1.status}`);
  const data1 = (await res1.json()).data;
  console.log(`[Laptop] Guest created: User=${data1.user.displayName}, ID=${data1.user.id}`);

  // 2. Device 2 (Phone) - Create Guest
  console.log('\n--- Step 2: Device 2 (Phone) HTTP Guest Creation ---');
  const res2 = await fetch(`${API_BASE}/api/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Bob_Phone' }),
  });
  if (!res2.ok) throw new Error(`Phone guest creation failed: ${res2.status}`);
  const data2 = (await res2.json()).data;
  console.log(`[Phone] Guest created: User=${data2.user.displayName}, ID=${data2.user.id}`);

  // 3. Instantiate simulators
  const laptop = new BrowserDeviceSimulator('Laptop_Alice', data1.accessToken);
  const phone = new BrowserDeviceSimulator('Phone_Bob', data2.accessToken);

  // Setup match promises
  const laptopMatchPromise = laptop.waitForMatch();
  const phoneMatchPromise = phone.waitForMatch();

  // 4. Laptop enters matchmaking
  console.log('\n--- Step 3: Laptop connects and joins matchmaking ---');
  await laptop.joinMatchmaking();

  console.log('Waiting 1000ms before Phone user joins matchmaking...');
  await sleep(1000);

  // 5. Phone enters matchmaking
  console.log('\n--- Step 4: Phone connects and joins matchmaking ---');
  await phone.joinMatchmaking();

  // 6. Await matches on both devices
  console.log('\n--- Step 5: Awaiting Matchmaking Resolution ---');
  const [matchLaptop, matchPhone] = await Promise.all([laptopMatchPromise, phoneMatchPromise]);

  console.log('\n🎉 MATCH SUCCESSFUL!');
  console.log(`[Laptop] Matched with: ${matchLaptop.partnerDisplayName}, ConvId: ${matchLaptop.conversationId}`);
  console.log(`[Phone]  Matched with: ${matchPhone.partnerDisplayName}, ConvId: ${matchPhone.conversationId}`);

  if (matchLaptop.conversationId !== matchPhone.conversationId) {
    throw new Error(`Conversation ID mismatch: Laptop=${matchLaptop.conversationId}, Phone=${matchPhone.conversationId}`);
  }

  // 7. Bidirectional E2EE Messaging
  console.log('\n--- Step 6: Bidirectional E2EE Message Exchange ---');
  const phoneMsgPromise = phone.waitForMessage();
  laptop.sendEncryptedMessage(matchLaptop.conversationId, 'HelloFromLaptopAlice_E2EE');
  const phoneReceived = await phoneMsgPromise;
  console.log(`[Phone] Received: ${phoneReceived.envelope.encryptedPayload.ciphertext}`);

  const laptopMsgPromise = laptop.waitForMessage();
  phone.sendEncryptedMessage(matchPhone.conversationId, 'HelloFromPhoneBob_E2EE_Reply');
  const laptopReceived = await laptopMsgPromise;
  console.log(`[Laptop] Received: ${laptopReceived.envelope.encryptedPayload.ciphertext}`);

  // Cleanup
  laptop.disconnect();
  phone.disconnect();

  console.log('\n================================================================');
  console.log('✅ ALL DIAGNOSTIC CHECKS PASSED: LAPTOP & PHONE MATCHED CLEANLY');
  console.log('================================================================\n');
}

runDeviceDiagnostic().catch((err) => {
  console.error('\n❌ DIAGNOSTIC FAILED:', err);
  process.exit(1);
});
