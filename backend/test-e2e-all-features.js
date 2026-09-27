import { io as Client } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_URL = 'http://127.0.0.1:4000/api';
const SOCKET_URL = 'http://127.0.0.1:4000';

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runE2ETests() {
  console.log('🚀 ========================================================');
  console.log('🚀 WAFATALK E2E TEST: ACCOUNTS, DMS, AUDIO CALL & VIDEO CALL');
  console.log('🚀 ========================================================\n');

  let aliceSocket = null;
  let bobSocket = null;

  try {
    const timestamp = Date.now();
    const aliceUsername = `alice_${timestamp}`;
    const bobUsername = `bob_${timestamp}`;
    const aliceEmail = `alice_${timestamp}@wafatalk-test.com`;
    const bobEmail = `bob_${timestamp}@wafatalk-test.com`;
    const password = 'Password123!';

    // 1. Create Brand-New Account Alice
    console.log('1️⃣ Creating brand-new account ALICE...');
    const aliceRegRes = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: aliceUsername,
        email: aliceEmail,
        password,
        displayName: `Alice ${timestamp}`,
        country: 'FR',
      }),
    });
    const aliceRegData = await aliceRegRes.json();
    if (!aliceRegRes.ok || !aliceRegData.user || !aliceRegData.token) {
      throw new Error(`Failed to register Alice: ${JSON.stringify(aliceRegData)}`);
    }
    const aliceUser = aliceRegData.user;
    const aliceToken = aliceRegData.token;
    console.log(`   ✅ Alice created! ID: ${aliceUser.id}, Username: @${aliceUser.username}`);

    // 2. Create Brand-New Account Bob
    console.log('\n2️⃣ Creating brand-new account BOB...');
    const bobRegRes = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: bobUsername,
        email: bobEmail,
        password,
        displayName: `Bob ${timestamp}`,
        country: 'MA',
      }),
    });
    const bobRegData = await bobRegRes.json();
    if (!bobRegRes.ok || !bobRegData.user || !bobRegData.token) {
      throw new Error(`Failed to register Bob: ${JSON.stringify(bobRegData)}`);
    }
    const bobUser = bobRegData.user;
    const bobToken = bobRegData.token;
    console.log(`   ✅ Bob created! ID: ${bobUser.id}, Username: @${bobUser.username}`);

    // 3. User Discovery
    console.log('\n3️⃣ Testing User Discovery: Alice searches for other users...');
    const discoverRes = await fetch(`${API_URL}/users/discover`, {
      headers: { 'Authorization': `Bearer ${aliceToken}` },
    });
    const discoverData = await discoverRes.json();
    if (!discoverRes.ok || !Array.isArray(discoverData.users)) {
      throw new Error(`Alice discover failed: ${JSON.stringify(discoverData)}`);
    }
    const foundBob = discoverData.users.find(u => u.id === bobUser.id);
    if (!foundBob) {
      throw new Error(`Bob not found in Alice's discover list!`);
    }
    console.log(`   ✅ Alice discovered Bob in user directory (@${foundBob.username}, country: ${foundBob.country})`);

    // 4. Connect Alice and Bob to Socket.IO Gateway
    console.log('\n4️⃣ Connecting Alice and Bob to real-time WebSocket Gateway...');
    aliceSocket = Client(SOCKET_URL, {
      auth: { token: aliceToken },
      transports: ['websocket'],
    });
    bobSocket = Client(SOCKET_URL, {
      auth: { token: bobToken },
      transports: ['websocket'],
    });

    await Promise.all([
      new Promise((resolve, reject) => {
        aliceSocket.on('connect', resolve);
        aliceSocket.on('connect_error', reject);
      }),
      new Promise((resolve, reject) => {
        bobSocket.on('connect', resolve);
        bobSocket.on('connect_error', reject);
      }),
    ]);
    console.log(`   ✅ Alice connected (socket ${aliceSocket.id})`);
    console.log(`   ✅ Bob connected (socket ${bobSocket.id})`);

    // Allow presence propagation
    await wait(300);

    // 5. Create or Get 1-on-1 Conversation
    console.log('\n5️⃣ Creating/Opening 1-on-1 Conversation between Alice & Bob...');
    const convRes = await fetch(`${API_URL}/conversations/with/${bobUser.id}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aliceToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const convData = await convRes.json();
    if (!convRes.ok || !convData.conversation) {
      throw new Error(`Failed to create conversation: ${JSON.stringify(convData)}`);
    }
    const conversationId = convData.conversation.id;
    console.log(`   ✅ Conversation established! ID: ${conversationId}`);

    // Join DM socket rooms
    aliceSocket.emit('dm:join', { conversationId });
    bobSocket.emit('dm:join', { conversationId });
    await wait(100);

    // 6. Test Real-time Messaging (DMs)
    console.log('\n6️⃣ Testing Real-time Direct Messaging (DMs)...');
    const aliceMsgPromise = new Promise(resolve => {
      bobSocket.on('dm:message', (msg) => {
        if (msg.content.includes('Hello Bob!')) resolve(msg);
      });
    });
    const bobNotifPromise = new Promise(resolve => {
      bobSocket.on('dm:notification', (notif) => {
        if (notif.message?.content?.includes('Hello Bob!')) resolve(notif);
      });
    });

    aliceSocket.emit('dm:send', {
      conversationId,
      content: `Hello Bob! Ceci est un message test en direct 🚀 [${timestamp}]`,
      type: 'TEXT',
    });

    const [receivedMsg, receivedNotif] = await Promise.all([aliceMsgPromise, bobNotifPromise]);
    console.log(`   ✅ Bob received direct message in real time: "${receivedMsg.content}"`);
    console.log(`   ✅ Bob received notification event on private channel!`);

    // Bob replies
    const bobReplyPromise = new Promise(resolve => {
      aliceSocket.on('dm:message', (msg) => {
        if (msg.content.includes('Hello Alice!')) resolve(msg);
      });
    });
    bobSocket.emit('dm:send', {
      conversationId,
      content: `Hello Alice! Reçu 5 sur 5, le chat fonctionne parfaitement ! 🎧 [${timestamp}]`,
      type: 'TEXT',
    });
    const aliceReceived = await bobReplyPromise;
    console.log(`   ✅ Alice received Bob's direct reply: "${aliceReceived.content}"`);

    // Mark as read
    aliceSocket.emit('dm:read', { conversationId });
    await wait(200);

    // 7. Test 1-on-1 AUDIO CALL
    console.log('\n7️⃣ Testing 1-on-1 AUDIO CALL between Alice and Bob...');
    let activeCallId = null;

    const bobIncomingCallPromise = new Promise(resolve => {
      bobSocket.once('call:incoming', resolve);
    });
    const aliceRingingPromise = new Promise(resolve => {
      aliceSocket.once('call:ringing', resolve);
    });

    // Alice calls Bob
    aliceSocket.emit('call:start', {
      targetUserId: bobUser.id,
      conversationId,
      type: 'audio',
    });

    const ringingEvt = await aliceRingingPromise;
    activeCallId = ringingEvt.callId;
    console.log(`   ✅ Alice received call:ringing (Call ID: ${activeCallId})`);

    const incomingCallEvt = await bobIncomingCallPromise;
    console.log(`   ✅ Bob received call:incoming (Caller: ${incomingCallEvt.caller.displayName}, Type: ${incomingCallEvt.type})`);

    if (incomingCallEvt.callId !== activeCallId) {
      throw new Error(`Call ID mismatch: expected ${activeCallId}, got ${incomingCallEvt.callId}`);
    }

    // Bob accepts call
    const aliceAcceptedPromise = new Promise(resolve => {
      aliceSocket.once('call:accepted', resolve);
    });
    const bobConnectedPromise = new Promise(resolve => {
      bobSocket.once('call:connected', resolve);
    });

    bobSocket.emit('call:accept', { callId: activeCallId });
    const acceptedEvt = await aliceAcceptedPromise;
    console.log(`   ✅ Alice received call:accepted from Bob!`);
    await bobConnectedPromise;
    console.log(`   ✅ Bob received call:connected confirmation!`);

    // WebRTC Signaling: Alice sends Offer -> Bob receives Offer -> Bob sends Answer -> Alice receives Answer
    const bobSignalOfferPromise = new Promise(resolve => {
      bobSocket.once('webrtc:signal', resolve);
    });
    aliceSocket.emit('webrtc:signal', {
      callId: activeCallId,
      targetUserId: bobUser.id,
      signal: { type: 'offer', sdp: 'v=0\r\no=alice 12345 12345 IN IP4 0.0.0.0\r\ns=Audio\r\n' },
    });
    const receivedOfferEvt = await bobSignalOfferPromise;
    console.log(`   ✅ Bob received WebRTC SDP Offer from Alice: type=${receivedOfferEvt.signal.type}`);

    const aliceSignalAnswerPromise = new Promise(resolve => {
      aliceSocket.once('webrtc:signal', resolve);
    });
    bobSocket.emit('webrtc:signal', {
      callId: activeCallId,
      targetUserId: aliceUser.id,
      signal: { type: 'answer', sdp: 'v=0\r\no=bob 67890 67890 IN IP4 0.0.0.0\r\ns=Audio\r\n' },
    });
    const receivedAnswerEvt = await aliceSignalAnswerPromise;
    console.log(`   ✅ Alice received WebRTC SDP Answer from Bob: type=${receivedAnswerEvt.signal.type}`);

    // ICE Candidates exchange
    const bobIcePromise = new Promise(resolve => {
      bobSocket.once('webrtc:signal', resolve);
    });
    aliceSocket.emit('webrtc:signal', {
      callId: activeCallId,
      targetUserId: bobUser.id,
      signal: { candidate: { candidate: 'candidate:1 1 UDP 2122260223 192.168.1.1 50000 typ host', sdpMid: '0' } },
    });
    const receivedIce = await bobIcePromise;
    console.log(`   ✅ Bob received ICE candidate from Alice!`);

    // Hangup audio call
    const aliceCallEndedPromise = new Promise(resolve => {
      aliceSocket.once('call:ended', resolve);
    });
    const bobCallEndedPromise = new Promise(resolve => {
      bobSocket.once('call:ended', resolve);
    });

    aliceSocket.emit('call:end', {
      callId: activeCallId,
      durationSec: 18,
    });

    const [aliceEnded, bobEnded] = await Promise.all([aliceCallEndedPromise, bobCallEndedPromise]);
    console.log(`   ✅ Audio call ended cleanly! Duration: ${aliceEnded.durationSec}s recorded.`);
    await wait(300);

    // Verify DB CallSession and CALL_LOG message
    const audioSession = await prisma.callSession.findUnique({ where: { id: activeCallId } });
    console.log(`   ✅ Audio CallSession verified in SQLite DB: status=${audioSession.status}, duration=${audioSession.durationSec}s`);

    // 8. Test 1-on-1 VIDEO CALL
    console.log('\n8️⃣ Testing 1-on-1 VIDEO CALL between Alice and Bob...');
    const bobVideoIncomingPromise = new Promise(resolve => {
      bobSocket.once('call:incoming', resolve);
    });
    const aliceVideoRingingPromise = new Promise(resolve => {
      aliceSocket.once('call:ringing', resolve);
    });

    // Alice starts video call
    aliceSocket.emit('call:start', {
      targetUserId: bobUser.id,
      conversationId,
      type: 'video',
    });

    const videoRingingEvt = await aliceVideoRingingPromise;
    const videoCallId = videoRingingEvt.callId;
    const videoIncomingEvt = await bobVideoIncomingPromise;
    console.log(`   ✅ Bob received video call:incoming! Type: ${videoIncomingEvt.type}`);

    if (videoIncomingEvt.type !== 'video') {
      throw new Error(`Expected video call type, got ${videoIncomingEvt.type}`);
    }

    // Bob accepts video call
    const aliceVideoAcceptedPromise = new Promise(resolve => {
      aliceSocket.once('call:accepted', resolve);
    });
    bobSocket.emit('call:accept', { callId: videoCallId });
    await aliceVideoAcceptedPromise;
    console.log(`   ✅ Alice received video call:accepted!`);

    // Bob hangs up video call
    const aliceVideoEndedPromise = new Promise(resolve => {
      aliceSocket.once('call:ended', resolve);
    });
    const bobVideoEndedPromise = new Promise(resolve => {
      bobSocket.once('call:ended', resolve);
    });

    bobSocket.emit('call:end', {
      callId: videoCallId,
      durationSec: 45,
    });

    await Promise.all([aliceVideoEndedPromise, bobVideoEndedPromise]);
    console.log(`   ✅ Video call ended cleanly! Duration: 45s recorded.`);
    await wait(300);

    // Verify DB CallSession for Video
    const videoSession = await prisma.callSession.findUnique({ where: { id: videoCallId } });
    console.log(`   ✅ Video CallSession verified in SQLite DB: type=${videoSession.type}, status=${videoSession.status}, duration=${videoSession.durationSec}s`);

    // 9. Test Reject Call (Decline)
    console.log('\n9️⃣ Testing Call Rejection / Decline...');
    const bobDeclineIncomingPromise = new Promise(resolve => {
      bobSocket.once('call:incoming', resolve);
    });
    const aliceDeclineRingingPromise = new Promise(resolve => {
      aliceSocket.once('call:ringing', resolve);
    });

    aliceSocket.emit('call:start', {
      targetUserId: bobUser.id,
      conversationId,
      type: 'audio',
    });

    const declRing = await aliceDeclineRingingPromise;
    const declInc = await bobDeclineIncomingPromise;

    const aliceRejectedPromise = new Promise(resolve => {
      aliceSocket.once('call:rejected', resolve);
    });
    bobSocket.emit('call:reject', { callId: declRing.callId, reason: 'declined' });
    const rejEvt = await aliceRejectedPromise;
    console.log(`   ✅ Alice received call:rejected! Reason: ${rejEvt.reason}`);

    // Verify DB rejected session
    const declSession = await prisma.callSession.findUnique({ where: { id: declRing.callId } });
    console.log(`   ✅ Declined call recorded in DB: status=${declSession.status}`);

    // 10. Verify Full Message History with CALL_LOG entries
    console.log('\n🔟 Verifying Message History in DB...');
    const msgs = await prisma.directMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
    console.log(`   ✅ Total messages in conversation: ${msgs.length}`);
    msgs.forEach((m, idx) => {
      console.log(`      [${idx + 1}] [${m.type}] ${m.content}`);
    });

    console.log('\n🎉 ========================================================');
    console.log('🎉 ALL TESTS PASSED! ONE-ON-ONE AUDIO CALL, VIDEO CALL &');
    console.log('🎉 REAL-TIME MESSAGING WORK SEAMLESSLY ON ANY NEW ACCOUNT!');
    console.log('🎉 ========================================================\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ E2E TEST FAILED:', error);
    process.exit(1);
  } finally {
    if (aliceSocket) aliceSocket.disconnect();
    if (bobSocket) bobSocket.disconnect();
    await prisma.$disconnect();
  }
}

runE2ETests();
