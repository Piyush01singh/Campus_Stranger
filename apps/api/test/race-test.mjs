import { io } from 'socket.io-client';

async function testRace() {
  const res = await fetch('https://campus-stranger.onrender.com/api/auth/guest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'RaceTester' })
  });
  const data = (await res.json()).data;
  console.log('Guest token obtained for user:', data.user.displayName);

  const s = io('https://campus-stranger.onrender.com', {
    transports: ['websocket', 'polling']
  });

  s.on('chat:error', (err) => console.log('🔴 SERVER ERROR RECEIVED:', err));
  s.on('authenticated', (u) => console.log('🟢 AUTHENTICATED EVENT RECEIVED:', u.displayName));
  s.on('match:found', (m) => console.log('🟢 MATCH FOUND:', m.conversationId));

  s.on('connect', () => {
    console.log('Socket connected, emitting authenticate & match:join immediately without waiting for authenticated...');
    s.emit('authenticate', { token: data.accessToken });
    s.emit('match:join', {});
  });

  setTimeout(() => {
    s.disconnect();
    console.log('Test completed.');
    process.exit(0);
  }, 4000);
}

testRace();
