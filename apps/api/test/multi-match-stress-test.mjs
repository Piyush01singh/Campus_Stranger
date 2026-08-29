import { io } from 'socket.io-client';

const API_BASE = 'https://campus-stranger.onrender.com';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class TestClient {
  constructor(name, token) {
    this.name = name;
    this.token = token;
    this.socket = null;
    this.isAuthenticated = false;
    this.authPromise = null;
    this.errors = [];
  }

  connect() {
    if (this.socket && this.socket.connected && this.isAuthenticated) {
      return Promise.resolve(this.socket);
    }

    if (this.authPromise) {
      return this.authPromise;
    }

    this.socket = io(API_BASE, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: false,
    });

    this.socket.onAny((event, ...args) => {
      console.log(`[${this.name}] Received Event '${event}':`, JSON.stringify(args));
    });

    this.socket.on('chat:error', (err) => {
      this.errors.push(err);
      console.error(`[${this.name}] 🔴 Server Error:`, err);
    });

    this.authPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`[${this.name}] Auth timed out`));
      }, 10000);

      this.socket.once('authenticated', (user) => {
        clearTimeout(timer);
        this.isAuthenticated = true;
        resolve(this.socket);
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

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.isAuthenticated = false;
    this.authPromise = null;
  }
}

async function runMatchmakingStressTest() {
  const TOTAL_ROUNDS = 10;
  console.log('================================================================');
  console.log(` Starting 10-Repetition Race Condition Matchmaking Stress Test `);
  console.log(` Target: ${API_BASE}`);
  console.log('================================================================\n');

  let successCount = 0;

  for (let i = 1; i <= TOTAL_ROUNDS; i++) {
    console.log(`\n--- Iteration ${i}/${TOTAL_ROUNDS} ---`);

    // 1. Create Guest A and Guest B
    const resA = await fetch(`${API_BASE}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: `Stress_UserA_${i}` }),
    });
    const dataA = (await resA.json()).data;

    const resB = await fetch(`${API_BASE}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: `Stress_UserB_${i}` }),
    });
    const dataB = (await resB.json()).data;

    const clientA = new TestClient(`UserA_${i}`, dataA.accessToken);
    const clientB = new TestClient(`UserB_${i}`, dataB.accessToken);

    // Connect and authenticate both clients
    await Promise.all([clientA.connect(), clientB.connect()]);

    let matchA = null;
    let matchB = null;

    const matchAPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`User A match timeout on iteration ${i}`)), 8000);
      clientA.socket.once('match:found', (payload) => {
        clearTimeout(timer);
        matchA = payload;
        resolve(payload);
      });
    });

    const matchBPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`User B match timeout on iteration ${i}`)), 8000);
      clientB.socket.once('match:found', (payload) => {
        clearTimeout(timer);
        matchB = payload;
        resolve(payload);
      });
    });

    // Both initiate matchmaking
    await clientA.joinMatchmaking();
    await sleep(50);
    await clientB.joinMatchmaking();

    await Promise.all([matchAPromise, matchBPromise]);

    if (!matchA || !matchB) {
      throw new Error(`Iteration ${i}: Matchmaking did not complete`);
    }

    console.log(`[Iteration ${i}] User A matched with: ${matchA.partnerDisplayName}, Conv: ${matchA.conversationId}`);
    console.log(`[Iteration ${i}] User B matched with: ${matchB.partnerDisplayName}, Conv: ${matchB.conversationId}`);

    if (matchA.conversationId !== matchB.conversationId) {
      throw new Error(`Iteration ${i}: Conversation IDs do not match (A: ${matchA.conversationId}, B: ${matchB.conversationId})`);
    }

    if (clientA.errors.length > 0 || clientB.errors.length > 0) {
      throw new Error(`Iteration ${i}: Encountered unexpected socket errors`);
    }

    // Test message transmission
    const msgPromise = new Promise((resolve) => {
      clientB.socket.once('chat:message', resolve);
    });

    clientA.socket.emit('chat:send', {
      clientMessageId: `cmsg_${i}`,
      conversationId: matchA.conversationId,
      encryptedPayload: {
        ciphertext: `Ciphertext_Payload_Iteration_${i}`,
        iv: `iv_${i}`,
        tag: `tag_${i}`,
        ephemPublicKey: `ephem_${i}`,
        protocolVersion: 1,
        keyId: `step_${i}`,
      },
    });

    const received = await msgPromise;
    if (received.envelope.encryptedPayload.ciphertext !== `Ciphertext_Payload_Iteration_${i}`) {
      throw new Error(`Iteration ${i}: Ciphertext mismatch`);
    }

    console.log(`✅ Iteration ${i} PASSED: Matched in ${matchA.conversationId}, E2EE message delivered.`);
    successCount++;

    clientA.disconnect();
    clientB.disconnect();

    await sleep(200); // brief pause between iterations
  }

  console.log('\n================================================================');
  console.log(`🎉 STRESS TEST COMPLETED: ${successCount}/${TOTAL_ROUNDS} Repetitions Succeeded!`);
  console.log(' Zero UNAUTHORIZED race condition errors encountered.');
  console.log('================================================================\n');
}

runMatchmakingStressTest().catch((err) => {
  console.error('\n❌ STRESS TEST FAILED:', err);
  process.exit(1);
});
