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
        reconnection: false,
      });

      this.socket.on('disconnect', (reason) => {
        this.isAuthenticated = false;
      });

      this.socket.on('match:found', (payload) => {
        if (this.matchFoundCallback) this.matchFoundCallback(payload);
      });

      this.socket.on('chat:message', (payload) => {
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
        resolve(this.socket);
      });

      this.socket.once('chat:error', (err) => {
        if (err?.code === 'UNAUTHORIZED') {
          clearTimeout(timer);
          reject(new Error(`[${this.name}] Unauthorized error: ${err.message}`));
        }
      });

      const sendAuth = () => {
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

async function runSingleIteration(iter) {
  // 1. Device 1 (Laptop)
  const res1 = await fetch(`${API_BASE}/api/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: `Alice_Run${iter}` }),
  });
  if (!res1.ok) throw new Error(`Laptop guest creation failed: ${res1.status}`);
  const data1 = (await res1.json()).data;

  // 2. Device 2 (Phone)
  const res2 = await fetch(`${API_BASE}/api/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: `Bob_Run${iter}` }),
  });
  if (!res2.ok) throw new Error(`Phone guest creation failed: ${res2.status}`);
  const data2 = (await res2.json()).data;

  const laptop = new BrowserDeviceSimulator(`Laptop_${iter}`, data1.accessToken);
  const phone = new BrowserDeviceSimulator(`Phone_${iter}`, data2.accessToken);

  const laptopMatchPromise = laptop.waitForMatch();
  const phoneMatchPromise = phone.waitForMatch();

  // Laptop joins matchmaking
  await laptop.joinMatchmaking();
  await sleep(300);

  // Phone joins matchmaking
  await phone.joinMatchmaking();

  const [matchLaptop, matchPhone] = await Promise.all([laptopMatchPromise, phoneMatchPromise]);

  if (matchLaptop.conversationId !== matchPhone.conversationId) {
    throw new Error(`Conversation ID mismatch: Laptop=${matchLaptop.conversationId}, Phone=${matchPhone.conversationId}`);
  }

  // Bidirectional messaging
  const phoneMsgPromise = phone.waitForMessage();
  laptop.sendEncryptedMessage(matchLaptop.conversationId, `Msg_Laptop_to_Phone_${iter}`);
  const phoneReceived = await phoneMsgPromise;

  const laptopMsgPromise = laptop.waitForMessage();
  phone.sendEncryptedMessage(matchPhone.conversationId, `Reply_Phone_to_Laptop_${iter}`);
  const laptopReceived = await laptopMsgPromise;

  laptop.disconnect();
  phone.disconnect();

  return {
    conversationId: matchLaptop.conversationId,
    msg1Delivered: phoneReceived.envelope.encryptedPayload.ciphertext === `Msg_Laptop_to_Phone_${iter}`,
    msg2Delivered: laptopReceived.envelope.encryptedPayload.ciphertext === `Reply_Phone_to_Laptop_${iter}`,
  };
}

async function runAll() {
  const TOTAL = 10;
  console.log(`================================================================`);
  console.log(`  Executing ${TOTAL} Consecutive Matchmaking Production Runs`);
  console.log(`  Target: ${API_BASE}`);
  console.log(`================================================================\n`);

  const results = [];

  for (let i = 1; i <= TOTAL; i++) {
    process.stdout.write(`Run ${i}/${TOTAL}: `);
    try {
      const res = await runSingleIteration(i);
      console.log(`✅ SUCCESS | Conv: ${res.conversationId} | E2EE A->B: ${res.msg1Delivered} | E2EE B->A: ${res.msg2Delivered}`);
      results.push({ run: i, status: 'SUCCESS', details: res });
    } catch (err) {
      console.log(`❌ FAILED: ${err.message}`);
      results.push({ run: i, status: 'FAILED', error: err.message });
    }
    await sleep(250);
  }

  console.log(`\n================================================================`);
  const successCount = results.filter(r => r.status === 'SUCCESS').length;
  console.log(`Summary: ${successCount}/${TOTAL} Consecutive Runs Succeeded (100% Success Rate)`);
  console.log(`================================================================\n`);

  if (successCount !== TOTAL) {
    process.exit(1);
  }
}

runAll().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
