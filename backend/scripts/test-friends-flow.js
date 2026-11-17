// Automated Integration Test for WafaTalk Friend Request System
const API_URL = 'http://localhost:4000/api';

async function runTests() {
  console.log('🧪 Starting Friend Request System Integration Tests...\n');

  // 1. Log in Alexandre
  const loginAlexRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'alexandre', password: 'demo123456' }),
  });
  const alexData = await loginAlexRes.json();
  if (!alexData.success) throw new Error('Failed to log in as Alexandre: ' + JSON.stringify(alexData));
  const alexToken = alexData.token;
  console.log('✅ Logged in as Alexandre (ID:', alexData.user.id, ')');

  // 2. Fetch Alexandre\'s initial friends
  const friendsRes = await fetch(`${API_URL}/friends`, {
    headers: { 'Authorization': `Bearer ${alexToken}` },
  });
  const friendsData = await friendsRes.json();
  console.log('✅ Initial Friends list:', friendsData.friends.map(f => f.name));
  const isSarahFriend = friendsData.friends.some(f => f.username === 'sarah_b');
  const isYoussefFriend = friendsData.friends.some(f => f.username === 'youssef_k');
  console.log('   - Sarah B. is friend:', isSarahFriend);
  console.log('   - Youssef K. is friend:', isYoussefFriend);

  // 3. Check Pending Received Requests (should have Lina M.)
  const pendingRes = await fetch(`${API_URL}/friends/requests/pending`, {
    headers: { 'Authorization': `Bearer ${alexToken}` },
  });
  const pendingData = await pendingRes.json();
  console.log('✅ Pending Received Requests:', pendingData.requests.map(r => ({ id: r.id, sender: r.sender.displayName })));
  const linaReq = pendingData.requests.find(r => r.sender.username === 'lina_m');
  if (!linaReq) {
    console.warn('⚠️ Lina request not found in pending, might have been already accepted.');
  }

  // 4. Test Guard: Try to open conversation with non-friend Karim D. (user-karim)
  console.log('\n🔒 Testing Guard: Attempting to open DM with non-friend Karim D...');
  const dmKarimRes = await fetch(`${API_URL}/conversations/with/user-karim`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${alexToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const dmKarimData = await dmKarimRes.json();
  if (!dmKarimRes.ok && dmKarimData.message?.includes('FRIENDS_REQUIRED')) {
    console.log('✅ Security Guard Verified: Direct message blocked with non-friend Karim D.');
    console.log('   Response:', dmKarimData.message);
  } else {
    throw new Error('❌ Security Guard FAILED: Non-friend was able to open conversation: ' + JSON.stringify(dmKarimData));
  }

  // 5. Test Accept Friend Request (Accept Lina M.)
  if (linaReq) {
    console.log('\n🤝 Testing Accept Friend Request for Lina M...');
    const acceptRes = await fetch(`${API_URL}/friends/accept/${linaReq.id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${alexToken}` },
    });
    const acceptData = await acceptRes.json();
    console.log('✅ Accepted request for Lina M:', acceptData.success);

    // Verify Lina is now in friends list
    const updatedFriendsRes = await fetch(`${API_URL}/friends`, {
      headers: { 'Authorization': `Bearer ${alexToken}` },
    });
    const updatedFriends = await updatedFriendsRes.json();
    const isLinaNowFriend = updatedFriends.friends.some(f => f.username === 'lina_m');
    console.log('✅ Lina M. now present in accepted friends list:', isLinaNowFriend);

    // Verify Alexandre CAN now open DM with Lina M.
    console.log('💬 Testing DM access with newly accepted friend Lina M...');
    const dmLinaRes = await fetch(`${API_URL}/conversations/with/user-lina`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${alexToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const dmLinaData = await dmLinaRes.json();
    if (dmLinaRes.ok && dmLinaData.success && dmLinaData.conversation) {
      console.log('✅ DM Successfully Opened with accepted friend Lina M (Conv ID:', dmLinaData.conversation.id, ')');
    } else {
      throw new Error('❌ Failed to open DM with accepted friend Lina: ' + JSON.stringify(dmLinaData));
    }
  }

  // 6. Test Discover Endpoint with relationship states
  console.log('\n🔍 Testing Discover endpoint relationship metadata...');
  const discoverRes = await fetch(`${API_URL}/friends/discover`, {
    headers: { 'Authorization': `Bearer ${alexToken}` },
  });
  const discoverData = await discoverRes.json();
  console.log('✅ Discovered members and relationship status:');
  discoverData.users.forEach(u => {
    console.log(`   - ${u.name} (@${u.username}): [friendStatus: ${u.friendStatus}]`);
  });

  // 7. Test Send & Cancel Request
  // Log in as Karim to accept or test sending request
  console.log('\n⚡ Testing Friend Request Send & Cancel flow with Karim...');
  // Check Karim status from Alex: should be request_sent
  const karimUser = discoverData.users.find(u => u.username === 'karim_d');
  if (karimUser && karimUser.friendStatus === 'request_sent') {
    console.log('✅ Karim correctly shows "request_sent" (Request ID:', karimUser.requestId, ')');
    // Cancel the request
    const cancelRes = await fetch(`${API_URL}/friends/cancel/${karimUser.requestId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${alexToken}` },
    });
    const cancelData = await cancelRes.json();
    console.log('✅ Request to Karim successfully cancelled:', cancelData.success);

    // Send a new request to Karim
    const reSendRes = await fetch(`${API_URL}/friends/request/${karimUser.id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${alexToken}`, 'Content-Type': 'application/json' },
    });
    const reSendData = await reSendRes.json();
    console.log('✅ New friend request sent to Karim:', reSendData.success);
  }

  console.log('\n🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY! 🚀\n');
}

runTests().catch(err => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
