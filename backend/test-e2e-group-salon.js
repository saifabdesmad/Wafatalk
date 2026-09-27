/**
 * Automated End-to-End Multi-User Group Salon Verification
 * Tests 3 concurrent users in a room:
 * - Roster synchronization for 3 members
 * - Real-time group messaging and typing indicators
 * - Group vocal call state sync (speaking / muted)
 * - Group video call state sync (camera toggle)
 * - WebRTC mesh signaling relay between participants
 * - Graceful user departure and disconnect notifications
 */

import { io } from 'socket.io-client';

const BASE_URL = 'http://127.0.0.1:4000';
const SALON_ID = 'salon-1';

function log(step, msg) {
  console.log(`[STEP ${step}] ${msg}`);
}

async function registerUser(name, email, password, country) {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Math.floor(Math.random() * 10000),
      displayName: name,
      email,
      password,
      country: country || 'FR',
      birthDate: '2000-01-01',
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Registration failed for ${name}: ${JSON.stringify(data)}`);
  return data;
}

function connectSocket(token, name) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE_URL, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });

    const timeout = setTimeout(() => {
      reject(new Error(`Socket connection timed out for ${name}`));
    }, 5000);

    socket.on('connect', () => {
      clearTimeout(timeout);
      resolve(socket);
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function runGroupSalonTest() {
  console.log('========================================================');
  console.log('🚀 STARTING MULTI-USER GROUP SALON VERIFICATION');
  console.log('========================================================\n');

  const ts = Date.now();
  // 1. Create 3 Accounts
  log(1, 'Registering 3 test users for multi-party group room...');
  const user1 = await registerUser('Alice Wafa', `alice_group_${ts}@test.com`, 'Secret123!', 'FR');
  const user2 = await registerUser('Bob Wafa', `bob_group_${ts}@test.com`, 'Secret123!', 'MA');
  const user3 = await registerUser('Charlie Wafa', `charlie_group_${ts}@test.com`, 'Secret123!', 'DZ');
  console.log(`  ✓ User 1: ${user1.user.displayName} (${user1.user.id})`);
  console.log(`  ✓ User 2: ${user2.user.displayName} (${user2.user.id})`);
  console.log(`  ✓ User 3: ${user3.user.displayName} (${user3.user.id})`);

  // 2. Connect 3 Sockets
  log(2, 'Connecting 3 concurrent WebSockets...');
  const socket1 = await connectSocket(user1.token, 'Alice');
  const socket2 = await connectSocket(user2.token, 'Bob');
  const socket3 = await connectSocket(user3.token, 'Charlie');
  console.log('  ✓ Alice socket connected:', socket1.id);
  console.log('  ✓ Bob socket connected:', socket2.id);
  console.log('  ✓ Charlie socket connected:', socket3.id);

  // 3. User 1 Joins Salon
  log(3, 'Alice joins salon:salon-1...');
  const u1RosterPromise = new Promise((resolve) => {
    socket1.once('salon:roster', (data) => resolve(data));
  });
  socket1.emit('salon:join', { salonId: SALON_ID });
  const u1Roster = await u1RosterPromise;
  console.log(`  ✓ Alice received roster with ${u1Roster.participants.length} member(s):`, u1Roster.participants.map(p => p.displayName));
  if (u1Roster.participants.length < 1) throw new Error('Expected at least Alice in roster');

  // 4. User 2 Joins Salon
  log(4, 'Bob joins salon:salon-1 (Verifying roster sync & user_joined broadcast)...');
  const u2RosterPromise = new Promise((resolve) => {
    socket2.once('salon:roster', (data) => resolve(data));
  });
  const u1ReceivedBobPromise = new Promise((resolve) => {
    socket1.once('salon:user_joined', (data) => resolve(data));
  });

  socket2.emit('salon:join', { salonId: SALON_ID });
  const [u2Roster, u1JoinedEvent] = await Promise.all([u2RosterPromise, u1ReceivedBobPromise]);
  console.log(`  ✓ Bob received roster with ${u2Roster.participants.length} members:`, u2Roster.participants.map(p => p.displayName));
  console.log(`  ✓ Alice received salon:user_joined for ${u1JoinedEvent.participant.displayName}`);
  if (u2Roster.participants.length < 2) throw new Error('Expected 2 members in Bob roster');
  if (u1JoinedEvent.participant.userId !== user2.user.id) throw new Error('Alice did not receive Bob join event');

  // 5. User 3 Joins Salon (3+ participants group room)
  log(5, 'Charlie joins salon:salon-1 (Verifying 3-party group expansion)...');
  const u3RosterPromise = new Promise((resolve) => {
    socket3.once('salon:roster', (data) => resolve(data));
  });
  const u1ReceivedCharliePromise = new Promise((resolve) => {
    socket1.once('salon:user_joined', (data) => resolve(data));
  });
  const u2ReceivedCharliePromise = new Promise((resolve) => {
    socket2.once('salon:user_joined', (data) => resolve(data));
  });

  socket3.emit('salon:join', { salonId: SALON_ID });
  const [u3Roster, u1Notif, u2Notif] = await Promise.all([
    u3RosterPromise,
    u1ReceivedCharliePromise,
    u2ReceivedCharliePromise,
  ]);
  console.log(`  ✓ Charlie received roster with ${u3Roster.participants.length} members:`, u3Roster.participants.map(p => p.displayName));
  console.log(`  ✓ Alice & Bob both notified that Charlie joined`);
  if (u3Roster.participants.length < 3) throw new Error('Expected 3 members in Charlie roster');

  // 6. Real-Time Group Chat & Typing
  log(6, 'Testing Real-Time Group Chat & Typing Indicator...');
  const u2MsgPromise = new Promise((resolve) => {
    socket2.once('chat:message', (msg) => resolve(msg));
  });
  const u3MsgPromise = new Promise((resolve) => {
    socket3.once('chat:message', (msg) => resolve(msg));
  });

  const chatContent = 'Salut tout le monde ! Bienvenue dans notre salon vocal et vidéo 🚀';
  socket1.emit('chat:send', { salonId: SALON_ID, content: chatContent, type: 'TEXT' });

  const [m2, m3] = await Promise.all([u2MsgPromise, u3MsgPromise]);
  console.log(`  ✓ Bob received group message from ${m2.user.displayName}: "${m2.content}"`);
  console.log(`  ✓ Charlie received group message from ${m3.user.displayName}: "${m3.content}"`);
  if (m2.content !== chatContent || m3.content !== chatContent) throw new Error('Message content mismatch');

  // Typing test
  const u1TypingPromise = new Promise((resolve) => {
    socket1.once('chat:user_typing', (data) => resolve(data));
  });
  socket3.emit('chat:typing', { salonId: SALON_ID, isTyping: true });
  const typingData = await u1TypingPromise;
  console.log(`  ✓ Alice received typing indicator from ${typingData.displayName}: isTyping=${typingData.isTyping}`);
  if (typingData.userId !== user3.user.id || !typingData.isTyping) throw new Error('Typing indicator mismatch');

  // 7. Vocal Call Activity Sync (Speaking & Mic Mute)
  log(7, 'Testing Group Vocal Call Activity State Sync...');
  const u1VoiceUpdatePromise = new Promise((resolve) => {
    socket1.once('salon:media_update', (data) => resolve(data));
  });
  const u3VoiceUpdatePromise = new Promise((resolve) => {
    socket3.once('salon:media_update', (data) => resolve(data));
  });

  // Bob starts speaking with mic active
  socket2.emit('salon:media_state', {
    salonId: SALON_ID,
    isSpeaking: true,
    isMuted: false,
    isCameraOn: false,
  });

  const [v1, v3] = await Promise.all([u1VoiceUpdatePromise, u3VoiceUpdatePromise]);
  console.log(`  ✓ Alice and Charlie notified that Bob is speaking (isSpeaking=${v1.isSpeaking})`);
  if (!v1.isSpeaking || !v3.isSpeaking) throw new Error('Voice speaking state not broadcasted');

  // Bob mutes
  const u1MutePromise = new Promise((resolve) => {
    socket1.once('salon:media_update', (data) => resolve(data));
  });
  socket2.emit('salon:media_state', {
    salonId: SALON_ID,
    isSpeaking: false,
    isMuted: true,
    isCameraOn: false,
  });
  const muteData = await u1MutePromise;
  console.log(`  ✓ Alice notified that Bob muted microphone (isMuted=${muteData.isMuted})`);
  if (!muteData.isMuted) throw new Error('Mic mute state not broadcasted');

  // 8. Video Call State Sync (Camera Active)
  log(8, 'Testing Group Video Call State Sync...');
  const u1CamPromise = new Promise((resolve) => {
    socket1.once('salon:media_update', (data) => resolve(data));
  });
  const u2CamPromise = new Promise((resolve) => {
    socket2.once('salon:media_update', (data) => resolve(data));
  });

  // Charlie turns on camera
  socket3.emit('salon:media_state', {
    salonId: SALON_ID,
    isSpeaking: false,
    isMuted: false,
    isCameraOn: true,
  });

  const [c1, c2] = await Promise.all([u1CamPromise, u2CamPromise]);
  console.log(`  ✓ Alice and Bob notified that Charlie turned on Video Camera (isCameraOn=${c1.isCameraOn})`);
  if (!c1.isCameraOn || !c2.isCameraOn) throw new Error('Camera state not broadcasted');

  // 9. WebRTC Multi-Peer Mesh Signaling Relay
  log(9, 'Testing WebRTC Multi-Peer Mesh Signaling Relay...');
  const u2SignalPromise = new Promise((resolve) => {
    socket2.once('salon:signal', (data) => resolve(data));
  });

  // Alice sends WebRTC offer signal to Bob
  const testOffer = { type: 'offer', sdp: 'v=0\r\no=alice-group-offer' };
  socket1.emit('salon:signal', {
    salonId: SALON_ID,
    targetUserId: user2.user.id,
    signal: testOffer,
  });

  const receivedSignal = await u2SignalPromise;
  console.log(`  ✓ Bob received WebRTC signal from ${receivedSignal.senderUser.displayName}:`, receivedSignal.signal.type);
  if (receivedSignal.signal.sdp !== testOffer.sdp) throw new Error('Signal SDP mismatch');

  // Bob replies with WebRTC answer signal to Alice
  const u1SignalPromise = new Promise((resolve) => {
    socket1.once('salon:signal', (data) => resolve(data));
  });

  const testAnswer = { type: 'answer', sdp: 'v=0\r\no=bob-group-answer' };
  socket2.emit('salon:signal', {
    salonId: SALON_ID,
    targetUserId: user1.user.id,
    signal: testAnswer,
  });

  const receivedAnswer = await u1SignalPromise;
  console.log(`  ✓ Alice received WebRTC answer signal from ${receivedAnswer.senderUser.displayName}:`, receivedAnswer.signal.type);
  if (receivedAnswer.signal.sdp !== testAnswer.sdp) throw new Error('Answer SDP mismatch');

  // 10. User Departure & Disconnect Cleanup
  log(10, 'Testing Departure & Disconnect Cleanup in Group Salon...');
  const u1CharlieLeftPromise = new Promise((resolve) => {
    socket1.once('salon:user_left', (data) => resolve(data));
  });

  // Charlie leaves salon
  socket3.emit('salon:leave', { salonId: SALON_ID });
  const charlieLeftEvent = await u1CharlieLeftPromise;
  console.log(`  ✓ Alice notified that Charlie left the salon (${charlieLeftEvent.displayName})`);
  if (charlieLeftEvent.userId !== user3.user.id) throw new Error('User left ID mismatch');

  // Bob disconnects socket entirely
  const u1BobLeftPromise = new Promise((resolve) => {
    socket1.once('salon:user_left', (data) => resolve(data));
  });
  socket2.disconnect();
  const bobLeftEvent = await u1BobLeftPromise;
  console.log(`  ✓ Alice notified that Bob disconnected from the salon (${bobLeftEvent.displayName})`);
  if (bobLeftEvent.userId !== user2.user.id) throw new Error('Disconnect cleanup mismatch');

  // Cleanup remaining socket
  socket1.disconnect();
  socket3.disconnect();

  console.log('\n========================================================');
  console.log('🎉 ALL MULTI-USER GROUP SALON TESTS PASSED 100% SUCCESS!');
  console.log('========================================================\n');
}

runGroupSalonTest().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
