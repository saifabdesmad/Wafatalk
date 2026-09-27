import { io as Client } from 'socket.io-client';

const API_URL = 'http://127.0.0.1:4000/api';
const SOCKET_URL = 'http://127.0.0.1:4000';

async function testCancelCall() {
  console.log('🧪 Testing Caller Cancel While Ringing...');

  const t1 = Date.now();
  const reg1Res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: `userA_${t1}`, email: `userA_${t1}@test.com`, password: 'Password123!' }),
  });
  const reg1 = await reg1Res.json();

  const t2 = Date.now() + 1;
  const reg2Res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: `userB_${t2}`, email: `userB_${t2}@test.com`, password: 'Password123!' }),
  });
  const reg2 = await reg2Res.json();

  if (!reg1.user || !reg2.user) {
    console.error('Registration failed:', { reg1, reg2 });
    process.exit(1);
  }

  const u1 = reg1.user;
  const u2 = reg2.user;
  const token1 = reg1.token;
  const token2 = reg2.token;

  const sock1 = Client(SOCKET_URL, { auth: { token: token1 } });
  const sock2 = Client(SOCKET_URL, { auth: { token: token2 } });

  await new Promise(r => sock1.on('connect', r));
  await new Promise(r => sock2.on('connect', r));

  const convRes = await fetch(`${API_URL}/conversations/with/${u2.id}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token1}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const convData = await convRes.json();
  const conv = convData.conversation;

  // sock1 calls sock2
  const incomingPromise = new Promise(r => sock2.once('call:incoming', r));
  const ringingPromise = new Promise(r => sock1.once('call:ringing', r));

  sock1.emit('call:start', { targetUserId: u2.id, conversationId: conv.id, type: 'audio' });

  const ring = await ringingPromise;
  const inc = await incomingPromise;
  console.log('✅ Call is ringing at recipient...');

  // sock1 cancels/hangs up while ringing
  const u2EndedPromise = new Promise(r => sock2.once('call:ended', r));
  sock1.emit('call:end', { callId: ring.callId, durationSec: 0 });

  const u2Ended = await u2EndedPromise;
  console.log('✅ Recipient received call:ended cleanly when caller cancelled while ringing!');

  sock1.disconnect();
  sock2.disconnect();
  console.log('🎉 Cancel while ringing test passed 100%!');
  process.exit(0);
}

testCancelCall().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
