import { io } from 'socket.io-client';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Read .env for live connection strings if available
let envVars = {};
try {
  const envContent = readFileSync(resolve(process.cwd(), '.env'), 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [k, ...v] = trimmed.split('=');
      envVars[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
    }
  }
} catch {
  // Ignore if .env is missing
}

const PORT = process.env.CONTAINER_PORT || 8085;
const BASE_URL = `http://localhost:${PORT}`;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runSmokeTest() {
  console.log(`[Smoke Test] Starting container smoke test against ${BASE_URL}...`);

  // 1. Check Liveness Probe
  console.log('[Smoke Test] 1. Testing GET /api/health/live...');
  const liveRes = await fetch(`${BASE_URL}/api/health/live`);
  if (!liveRes.ok) throw new Error(`Liveness failed with status ${liveRes.status}`);
  const liveJson = await liveRes.json();
  console.log('[Smoke Test] Liveness Response:', liveJson);

  // 2. Check Readiness Probe
  console.log('[Smoke Test] 2. Testing GET /api/health...');
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  if (!healthRes.ok) throw new Error(`Health check failed with status ${healthRes.status}`);
  const healthJson = await healthRes.json();
  console.log('[Smoke Test] Health Response:', healthJson);

  // 3. Create Two Guest Accounts
  console.log('[Smoke Test] 3. Creating Guest User A & User B...');
  const guestARes = await fetch(`${BASE_URL}/api/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Alice_Smoke' }),
  });
  const guestA = (await guestARes.json()).data;
  console.log('[Smoke Test] Guest A created:', guestA.user.id, guestA.user.displayName);

  const guestBRes = await fetch(`${BASE_URL}/api/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Bob_Smoke' }),
  });
  const guestB = (await guestBRes.json()).data;
  console.log('[Smoke Test] Guest B created:', guestB.user.id, guestB.user.displayName);

  // 4. Connect WebSockets for both users
  console.log('[Smoke Test] 4. Connecting WebSockets for User A and User B...');
  const socketA = io(BASE_URL, {
    transports: ['websocket', 'polling'],
    forceNew: true,
  });
  const socketB = io(BASE_URL, {
    transports: ['websocket', 'polling'],
    forceNew: true,
  });

  await new Promise((res) => socketA.on('connect', res));
  await new Promise((res) => socketB.on('connect', res));
  console.log('[Smoke Test] Both sockets connected.');

  // 5. Authenticate sockets
  console.log('[Smoke Test] 5. Authenticating sockets with JWT tokens...');
  socketA.emit('authenticate', {
    token: guestA.accessToken,
    preKeyBundle: { identityKey: 'idKeyA_mock', signedPreKey: 'preKeyA_mock' },
  });
  socketB.emit('authenticate', {
    token: guestB.accessToken,
    preKeyBundle: { identityKey: 'idKeyB_mock', signedPreKey: 'preKeyB_mock' },
  });

  await new Promise((res) => socketA.on('authenticated', res));
  await new Promise((res) => socketB.on('authenticated', res));
  console.log('[Smoke Test] Both sockets authenticated.');

  // 6. Join matchmaking queue
  console.log('[Smoke Test] 6. Joining matchmaking queue...');
  let matchA, matchB;
  const matchAPromise = new Promise((res) => socketA.on('match:found', (p) => { matchA = p; res(p); }));
  const matchBPromise = new Promise((res) => socketB.on('match:found', (p) => { matchB = p; res(p); }));

  socketA.emit('match:join', { preKeyBundle: { identityKey: 'idKeyA_mock', signedPreKey: 'preKeyA_mock' } });
  await sleep(100);
  socketB.emit('match:join', { preKeyBundle: { identityKey: 'idKeyB_mock', signedPreKey: 'preKeyB_mock' } });

  await Promise.all([matchAPromise, matchBPromise]);
  console.log('[Smoke Test] Match found! Conversation ID:', matchA.conversationId);

  // 7. Send Encrypted Message from User A to User B
  console.log('[Smoke Test] 7. User A sending encrypted message envelope to User B...');
  const encryptedPayload = {
    ciphertext: 'U21va2VUZXN0RW5jcnlwdGVkTWVzc2FnZVBheWxvYWRCYXNlNjQ=',
    iv: 'aXZfc21va2VfdGVzdF85Ng==',
    tag: 'dGFnX3Ntb2tlX3Rlc3RfMTI4',
    ephemPublicKey: 'ZXBoZW1fcHVibGljX2tleV9iYXNlNjQ=',
    protocolVersion: 1,
    keyId: 'step_0',
  };

  const messagePromise = new Promise((res) => {
    socketB.on('chat:message', (payload) => {
      res(payload);
    });
  });

  const ackPromise = new Promise((res) => {
    socketA.on('message:sent', (ack) => {
      res(ack);
    });
  });

  socketA.emit('chat:send', {
    clientMessageId: 'client_msg_101',
    conversationId: matchA.conversationId,
    encryptedPayload,
  });

  const [ack, receivedMsg] = await Promise.all([ackPromise, messagePromise]);
  console.log('[Smoke Test] User A received server ACK:', ack);
  console.log('[Smoke Test] User B received encrypted envelope:', receivedMsg.envelope.id);

  // 8. Fetch stored messages from REST API to verify persistence
  console.log('[Smoke Test] 8. Verifying ciphertext message persistence via REST API...');
  const historyRes = await fetch(`${BASE_URL}/api/conversations/${matchA.conversationId}/messages`, {
    headers: { Authorization: `Bearer ${guestA.accessToken}` },
  });
  if (!historyRes.ok) throw new Error(`Failed to fetch history: ${historyRes.status}`);
  const historyJson = await historyRes.json();
  console.log('[Smoke Test] Fetched persisted message count:', historyJson.data.length);
  if (historyJson.data.length < 1) throw new Error('Persisted messages should not be empty');

  // Disconnect sockets
  socketA.disconnect();
  socketB.disconnect();

  console.log('✅ [Smoke Test] SUCCESS: All container smoke tests passed with zero errors!');
}

runSmokeTest().catch((err) => {
  console.error('❌ [Smoke Test] FAILED:', err);
  process.exit(1);
});
