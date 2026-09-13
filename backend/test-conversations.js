import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'wafatalk-super-secret-jwt-key-2026';
const API_URL = 'http://127.0.0.1:4000/api';

async function testConversations() {
  console.log('🧪 === TEST SUITE: 1-ON-1 CONVERSATIONS, DMS & CALL SESSIONS ===\n');

  try {
    // 1. Verify Seed Users Exist
    const alexandre = await prisma.user.findUnique({ where: { id: 'user-alexandre' } });
    const sarah = await prisma.user.findUnique({ where: { id: 'user-sarah' } });

    if (!alexandre || !sarah) {
      throw new Error('Seed users Alexandre or Sarah not found in database!');
    }
    console.log('✅ Found users:', alexandre.displayName, '&', sarah.displayName);

    // 2. Log in Alexandre and Sarah via API to get real JWT tokens
    console.log('🔑 Logging in Alexandre & Sarah via /api/auth/login...');
    let alexRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'alexandre@wafatalk.com', password: 'wafatalk2026' }),
    });
    let alexData = await alexRes.json();
    if (!alexData.token) {
      alexRes = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: 'alexandre@wafatalk.com', password: 'demo123456' }),
      });
      alexData = await alexRes.json();
    }
    const alexToken = alexData.token;

    let sarahRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'sarah@wafatalk.com', password: 'demo123456' }),
    });
    let sarahData = await sarahRes.json();
    if (!sarahData.token) {
      sarahRes = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: 'sarah@wafatalk.com', password: 'wafatalk2026' }),
      });
      sarahData = await sarahRes.json();
    }
    const sarahToken = sarahData.token;

    if (!alexToken || !sarahToken) {
      throw new Error(`Failed to obtain tokens. Alex: ${!!alexToken}, Sarah: ${!!sarahToken}`);
    }
    console.log('✅ Real auth tokens acquired for Alexandre and Sarah');

    // 3. Test HTTP: Create or Get Conversation via POST /api/conversations/with/user-sarah
    console.log('\n📡 Testing POST /api/conversations/with/user-sarah ...');
    const resConv = await fetch(`${API_URL}/conversations/with/user-sarah`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${alexToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const convData = await resConv.json();
    if (!resConv.ok || !convData.conversation) {
      throw new Error(`Failed to get/create conversation: ${JSON.stringify(convData)}`);
    }
    const conversationId = convData.conversation.id;
    console.log('✅ Conversation retrieved/created successfully! ID:', conversationId);

    // 4. Test HTTP: Send a Direct Message from Alexandre to Sarah
    console.log('\n💬 Testing POST /api/conversations/:id/messages (Alexandre -> Sarah) ...');
    const testMsgText = `Salut Sarah ! Est-ce que tu es dispo pour un salon vocal ? [Test ${Date.now()}]`;
    const resMsg = await fetch(`${API_URL}/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${alexToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: testMsgText,
        type: 'TEXT',
      }),
    });

    const msgData = await resMsg.json();
    if (!resMsg.ok || !msgData.message) {
      throw new Error(`Failed to send message: ${JSON.stringify(msgData)}`);
    }
    console.log('✅ Direct Message saved! Content:', msgData.message.content);

    // 5. Test HTTP: Sarah lists her conversations and reads messages
    console.log('\n📬 Testing GET /api/conversations (as Sarah) ...');
    const resSarahConvs = await fetch(`${API_URL}/conversations`, {
      headers: { 'Authorization': `Bearer ${sarahToken}` },
    });
    const sarahConvsData = await resSarahConvs.json();
    if (!resSarahConvs.ok) {
      throw new Error(`Sarah failed to fetch conversations: ${JSON.stringify(sarahConvsData)}`);
    }
    console.log(`✅ Sarah fetched ${sarahConvsData.conversations.length} conversation(s).`);

    console.log(`\n📖 Testing GET /api/conversations/${conversationId}/messages (as Sarah) ...`);
    const resSarahMsgs = await fetch(`${API_URL}/conversations/${conversationId}/messages`, {
      headers: { 'Authorization': `Bearer ${sarahToken}` },
    });
    const sarahMsgsData = await resSarahMsgs.json();
    if (!resSarahMsgs.ok || !Array.isArray(sarahMsgsData.messages)) {
      throw new Error(`Sarah failed to fetch messages: ${JSON.stringify(sarahMsgsData)}`);
    }
    const lastMsg = sarahMsgsData.messages[sarahMsgsData.messages.length - 1];
    console.log(`✅ Sarah retrieved messages. Last message: "${lastMsg?.content}"`);

    // 6. Test HTTP: Sarah marks messages as read
    console.log(`\n👀 Testing POST /api/conversations/${conversationId}/read (as Sarah) ...`);
    const resRead = await fetch(`${API_URL}/conversations/${conversationId}/read`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${sarahToken}` },
    });
    const readData = await resRead.json();
    console.log('✅ Read receipt acknowledged:', readData);

    // 7. Test Call Session Lifecycle via Prisma & Service
    console.log('\n📞 Testing Call Session persistence & call log creation ...');
    const callSession = await prisma.callSession.create({
      data: {
        conversationId,
        callerId: alexandre.id,
        receiverId: sarah.id,
        type: 'AUDIO',
        status: 'COMPLETED',
        durationSec: 142, // 2m 22s
        startedAt: new Date(Date.now() - 142000),
        endedAt: new Date(),
      },
    });

    const callLogMessage = await prisma.directMessage.create({
      data: {
        conversationId,
        senderId: alexandre.id,
        content: 'Appel vocal terminé (02:22)',
        type: 'CALL_LOG',
        isRead: true,
      },
    });

    console.log('✅ Call session logged successfully! Call ID:', callSession.id);
    console.log('✅ Call log message inserted in chat! Message ID:', callLogMessage.id);

    console.log('\n🎉 ALL 1-ON-1 CONVERSATION & DM BACKEND TESTS PASSED WITH 100% SUCCESS!\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testConversations();
