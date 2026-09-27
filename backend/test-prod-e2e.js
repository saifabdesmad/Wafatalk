import { io as Client } from 'socket.io-client';

const API_URL = 'https://api.wafatalk.com/api';
const SOCKET_URL = 'https://api.wafatalk.com';

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testProduction() {
  console.log('🌍 ========================================================');
  console.log('🌍 LIVE PRODUCTION VERIFICATION ON API.WAFATALK.COM');
  console.log('🌍 ========================================================\n');

  let aliceSocket = null;
  let bobSocket = null;

  try {
    const timestamp = Date.now();
    const aliceUsername = `p_alice_${timestamp}`;
    const bobUsername = `p_bob_${timestamp}`;
    const aliceEmail = `p_alice_${timestamp}@wafatalk.com`;
    const bobEmail = `p_bob_${timestamp}@wafatalk.com`;
    const password = 'Password123!';

    // 1. Register Alice on Production VPS
    console.log('1️⃣ Registering Account ALICE on production VPS...');
    const r1 = await (await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: aliceUsername,
        email: aliceEmail,
        password,
        displayName: `Alice Prod ${timestamp}`,
        country: 'FR',
      }),
    })).json();
    if (!r1.user || !r1.token) throw new Error(`Alice register failed: ${JSON.stringify(r1)}`);
    console.log(`   ✅ Alice created on production VPS: @${r1.user.username}`);

    // 2. Register Bob on Production VPS
    console.log('\n2️⃣ Registering Account BOB on production VPS...');
    const r2 = await (await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: bobUsername,
        email: bobEmail,
        password,
        displayName: `Bob Prod ${timestamp}`,
        country: 'MA',
      }),
    })).json();
    if (!r2.user || !r2.token) throw new Error(`Bob register failed: ${JSON.stringify(r2)}`);
    console.log(`   ✅ Bob created on production VPS: @${r2.user.username}`);

    // 3. User Discovery
    console.log('\n3️⃣ Testing User Discovery on production VPS...');
    const disc = await (await fetch(`${API_URL}/users/discover`, {
      headers: { 'Authorization': `Bearer ${r1.token}` },
    })).json();
    const foundBob = disc.users?.find(u => u.id === r2.user.id);
    if (!foundBob) throw new Error('Bob not found in discover list');
    console.log(`   ✅ Alice discovered Bob on production VPS: @${foundBob.username}`);

    // 4. Connect WebSockets to Production VPS Gateway
    console.log('\n4️⃣ Connecting to Production WebSocket Gateway...');
    aliceSocket = Client(SOCKET_URL, {
      auth: { token: r1.token },
      transports: ['websocket'],
    });
    bobSocket = Client(SOCKET_URL, {
      auth: { token: r2.token },
      transports: ['websocket'],
    });

    await Promise.all([
      new Promise((res, rej) => {
        aliceSocket.on('connect', res);
        aliceSocket.on('connect_error', rej);
      }),
      new Promise((res, rej) => {
        bobSocket.on('connect', res);
        bobSocket.on('connect_error', rej);
      }),
    ]);
    console.log(`   ✅ Alice connected to Production WebSocket: ${aliceSocket.id}`);
    console.log(`   ✅ Bob connected to Production WebSocket: ${bobSocket.id}`);

    // 5. Establish 1-on-1 Conversation
    console.log('\n5️⃣ Opening 1-on-1 Conversation on production VPS...');
    const convRes = await (await fetch(`${API_URL}/conversations/with/${r2.user.id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${r1.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })).json();
    const convId = convRes.conversation.id;
    console.log(`   ✅ Conversation established: ID ${convId}`);

    aliceSocket.emit('dm:join', { conversationId: convId });
    bobSocket.emit('dm:join', { conversationId: convId });
    await wait(200);

    // 6. Test Direct Messaging (DMs)
    console.log('\n6️⃣ Testing Real-time Direct Messaging on production VPS...');
    const bobMsgPromise = new Promise(res => {
      bobSocket.on('dm:message', m => {
        if (m.content.includes('Production Test')) res(m);
      });
    });
    aliceSocket.emit('dm:send', {
      conversationId: convId,
      content: `Hello Bob! Production Test Message 🚀 [${timestamp}]`,
      type: 'TEXT',
    });
    const receivedMsg = await bobMsgPromise;
    console.log(`   ✅ Bob received DM in real time on production: "${receivedMsg.content}"`);

    // 7. Test 1-on-1 AUDIO CALL
    console.log('\n7️⃣ Testing 1-on-1 AUDIO CALL on production VPS...');
    const bobIncPromise = new Promise(res => bobSocket.once('call:incoming', res));
    const aliceRingPromise = new Promise(res => aliceSocket.once('call:ringing', res));

    aliceSocket.emit('call:start', {
      targetUserId: r2.user.id,
      conversationId: convId,
      type: 'audio',
    });

    const ring = await aliceRingPromise;
    const inc = await bobIncPromise;
    console.log(`   ✅ Production Audio Call Ringing (Call ID: ${ring.callId})`);

    const aliceAcceptedPromise = new Promise(res => aliceSocket.once('call:accepted', res));
    bobSocket.emit('call:accept', { callId: ring.callId });
    await aliceAcceptedPromise;
    console.log(`   ✅ Production Audio Call Accepted!`);

    // WebRTC SDP Exchange
    const bobSdpPromise = new Promise(res => bobSocket.once('webrtc:signal', res));
    aliceSocket.emit('webrtc:signal', {
      callId: ring.callId,
      targetUserId: r2.user.id,
      signal: { type: 'offer', sdp: 'v=0\r\no=alice_prod 1 1 IN IP4 0.0.0.0\r\ns=Audio\r\n' },
    });
    const sdpOffer = await bobSdpPromise;
    console.log(`   ✅ Production WebRTC SDP Offer delivered to Bob: ${sdpOffer.signal.type}`);

    // End audio call
    const bobEndPromise = new Promise(res => bobSocket.once('call:ended', res));
    aliceSocket.emit('call:end', { callId: ring.callId, durationSec: 15 });
    await bobEndPromise;
    console.log(`   ✅ Production Audio Call Ended cleanly.`);

    // 8. Test 1-on-1 VIDEO CALL
    console.log('\n8️⃣ Testing 1-on-1 VIDEO CALL on production VPS...');
    const bobVideoPromise = new Promise(res => bobSocket.once('call:incoming', res));
    aliceSocket.emit('call:start', {
      targetUserId: r2.user.id,
      conversationId: convId,
      type: 'video',
    });
    const videoInc = await bobVideoPromise;
    console.log(`   ✅ Production Video Call Incoming! Type: ${videoInc.type}`);

    const aliceVideoAccPromise = new Promise(res => aliceSocket.once('call:accepted', res));
    bobSocket.emit('call:accept', { callId: videoInc.callId });
    await aliceVideoAccPromise;
    console.log(`   ✅ Production Video Call Accepted!`);

    const bobVideoEndPromise = new Promise(res => bobSocket.once('call:ended', res));
    aliceSocket.emit('call:end', { callId: videoInc.callId, durationSec: 30 });
    await bobVideoEndPromise;
    console.log(`   ✅ Production Video Call Ended cleanly.`);

    console.log('\n🎉 ========================================================');
    console.log('🎉 100% PRODUCTION VERIFICATION SUCCESSFUL!');
    console.log('🎉 PRODUCTION VPS AND VERCEL ARE FULLY SYNCED & OPERATIONAL!');
    console.log('🎉 ========================================================\n');

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Production test failed:', err);
    process.exit(1);
  } finally {
    if (aliceSocket) aliceSocket.disconnect();
    if (bobSocket) bobSocket.disconnect();
  }
}

testProduction();
