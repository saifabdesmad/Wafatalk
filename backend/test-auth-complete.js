// Comprehensive Auth Test Script for WafaTalk
const API_BASE = 'http://127.0.0.1:4000/api';

async function runTests() {
  console.log('--- Starting WafaTalk Complete Auth Test ---');
  let passed = 0;
  let failed = 0;

  // Test 1: Health check
  try {
    const res = await fetch(`${API_BASE}/health`);
    const data = await res.json();
    if (data.status === 'ok') {
      console.log('✅ Test 1: Backend health OK');
      passed++;
    } else {
      throw new Error(JSON.stringify(data));
    }
  } catch (err) {
    console.error('❌ Test 1 FAILED:', err.message);
    failed++;
  }

  // Test 2: Standard Login with Seed User (Alexandre)
  let alexToken = null;
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'alexandre@wafatalk.com', password: 'wafatalk2026' })
    });
    const data = await res.json();
    if (res.status === 200 && data.success && data.token && data.user.email === 'alexandre@wafatalk.com') {
      console.log('✅ Test 2: Login with seeded admin (Alexandre) successful');
      alexToken = data.token;
      passed++;
    } else {
      throw new Error(JSON.stringify(data));
    }
  } catch (err) {
    console.error('❌ Test 2 FAILED:', err.message);
    failed++;
  }

  // Test 3: Session Verification /auth/me
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { 'Authorization': `Bearer ${alexToken}` }
    });
    const data = await res.json();
    if (res.status === 200 && data.success && data.user.username === 'alexandre') {
      console.log('✅ Test 3: /api/auth/me token verification successful');
      passed++;
    } else {
      throw new Error(JSON.stringify(data));
    }
  } catch (err) {
    console.error('❌ Test 3 FAILED:', err.message);
    failed++;
  }

  // Test 4: Demo 1-Click Login
  try {
    const res = await fetch(`${API_BASE}/auth/demo`, { method: 'POST' });
    const data = await res.json();
    if (res.status === 200 && data.success && data.token && data.user.username === 'alexandre') {
      console.log('✅ Test 4: Demo 1-click login successful');
      passed++;
    } else {
      throw new Error(JSON.stringify(data));
    }
  } catch (err) {
    console.error('❌ Test 4 FAILED:', err.message);
    failed++;
  }

  // Test 5: Register new account using Gmail
  const testGmail = `wafa.user.${Date.now()}@gmail.com`;
  const testUser = `wafa_user_${Date.now().toString().slice(-4)}`;
  let newGmailToken = null;
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: testUser,
        email: testGmail,
        password: 'Password123!',
        displayName: 'Wafa Tester'
      })
    });
    const data = await res.json();
    if (res.status === 201 && data.success && data.token && data.user.email === testGmail) {
      console.log(`✅ Test 5: Register with Gmail (${testGmail}) successful`);
      newGmailToken = data.token;
      passed++;
    } else {
      throw new Error(JSON.stringify(data));
    }
  } catch (err) {
    console.error('❌ Test 5 FAILED:', err.message);
    failed++;
  }

  // Test 6: Login with newly created Gmail account
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: testGmail, password: 'Password123!' })
    });
    const data = await res.json();
    if (res.status === 200 && data.success && data.token) {
      console.log('✅ Test 6: Login with newly created Gmail credentials successful');
      passed++;
    } else {
      throw new Error(JSON.stringify(data));
    }
  } catch (err) {
    console.error('❌ Test 6 FAILED:', err.message);
    failed++;
  }

  // Test 7: Duplicate registration error check (should fail gracefully)
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: testUser,
        email: testGmail,
        password: 'Password123!',
        displayName: 'Wafa Duplicate'
      })
    });
    const data = await res.json();
    if (res.status === 400 && data.success === false && data.message) {
      console.log(`✅ Test 7: Duplicate registration caught correctly: "${data.message}"`);
      passed++;
    } else {
      throw new Error(`Expected 400, got ${res.status}: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    console.error('❌ Test 7 FAILED:', err.message);
    failed++;
  }

  // Test 8: Social Auth (Google / Gmail instant login)
  const socialGmail = `google.user.${Date.now()}@gmail.com`;
  try {
    const res = await fetch(`${API_BASE}/auth/social`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'Google',
        email: socialGmail,
        displayName: 'Google Test User',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80'
      })
    });
    const data = await res.json();
    if (res.status === 200 && data.success && data.token && data.user.email === socialGmail) {
      console.log(`✅ Test 8: Social login with Gmail (${socialGmail}) successful`);
      passed++;
    } else {
      throw new Error(JSON.stringify(data));
    }
  } catch (err) {
    console.error('❌ Test 8 FAILED:', err.message);
    failed++;
  }

  // Test 9: Wrong password check (should fail with 401)
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'alexandre@wafatalk.com', password: 'WrongPassword999' })
    });
    const data = await res.json();
    if (res.status === 401 && data.success === false) {
      console.log(`✅ Test 9: Invalid credentials correctly rejected: "${data.message}"`);
      passed++;
    } else {
      throw new Error(`Expected 401, got ${res.status}`);
    }
  } catch (err) {
    console.error('❌ Test 9 FAILED:', err.message);
    failed++;
  }

  console.log(`\n--- Test Results: ${passed} PASSED, ${failed} FAILED ---`);
}

runTests();
