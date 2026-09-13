// Comprehensive Auth Test Script for WafaTalk
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
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
        displayName: 'Wafa Tester',
        birthDate: '2001-05-14',
        country: 'FR',
        termsAccepted: true,
      })
    });
    const data = await res.json();
    if (res.status === 201 && data.success && data.token && data.user.email === testGmail && data.user.country === 'FR' && data.user.birthDate) {
      console.log(`✅ Test 5: Register with birthDate, country, terms (${testGmail}) successful`);
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

  // Test 10: Reject invalid username containing forbidden characters (spaces, special symbols, etc.)
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'invalid user@94!',
        email: `invalid.user.${Date.now()}@test.com`,
        password: 'Password123!',
        birthDate: '2000-01-01',
        country: 'FR',
        termsAccepted: true
      })
    });
    const data = await res.json();
    if (res.status === 400 && data.success === false) {
      console.log('✅ Test 10: Username with illegal characters correctly rejected with 400');
      passed++;
    } else {
      throw new Error(`Expected 400 rejection, got ${res.status}: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    console.error('❌ Test 10 FAILED:', err.message);
    failed++;
  }

  // Test 11: Accept valid username with uppercase, lowercase, numbers, hyphen and underscore
  const validSpecialUser = `User_Name-99_${Date.now().toString().slice(-3)}`;
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: validSpecialUser,
        email: `valid.${Date.now()}@test.com`,
        password: 'Password123!',
        birthDate: '1998-07-22',
        country: 'MA',
        termsAccepted: true
      })
    });
    const data = await res.json();
    if (res.status === 201 && data.success && data.user.username === validSpecialUser) {
      console.log(`✅ Test 11: Valid username with [a-zA-Z0-9_-] (${validSpecialUser}) accepted`);
      passed++;
    } else {
      throw new Error(JSON.stringify(data));
    }
  } catch (err) {
    console.error('❌ Test 11 FAILED:', err.message);
    failed++;
  }

  // Test 12: Send verification OTP code
  const verifyEmail = `otp.user.${Date.now()}@test.com`;
  const verifyUsername = `WafaOtp_${Date.now().toString().slice(-4)}`;
  let capturedOtp = null;
  try {
    const res = await fetch(`${API_BASE}/auth/send-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: verifyEmail,
        username: verifyUsername,
      })
    });
    const data = await res.json();
    const verif = await prisma.emailVerification.findUnique({ where: { email: verifyEmail.toLowerCase() } });
    if (res.status === 200 && data.success && verif?.code) {
      console.log(`✅ Test 12: /api/auth/send-verification generated OTP and dispatched email to ${verifyEmail}`);
      capturedOtp = verif.code;
      passed++;
    } else {
      throw new Error(`Expected 200 and db entry, got ${res.status}: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    console.error('❌ Test 12 FAILED:', err.message);
    failed++;
  }

  // Test 13: Prevent sending verification code to an already registered email (e.g. alexandre)
  try {
    const res = await fetch(`${API_BASE}/auth/send-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alexandre@wafatalk.com',
        username: `new_user_${Date.now().toString().slice(-3)}`,
      })
    });
    const data = await res.json();
    if (res.status === 400 && data.success === false) {
      console.log('✅ Test 13: Duplicate email correctly blocked before sending verification code');
      passed++;
    } else {
      throw new Error(`Expected 400 rejection, got ${res.status}: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    console.error('❌ Test 13 FAILED:', err.message);
    failed++;
  }

  // Test 14: Reject incorrect OTP code
  try {
    const res = await fetch(`${API_BASE}/auth/verify-and-register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: verifyEmail,
        code: '000000',
        username: verifyUsername,
        password: 'Password123!',
        birthDate: '1999-03-12',
        country: 'FR',
        termsAccepted: true,
      })
    });
    const data = await res.json();
    if (res.status === 400 && data.success === false) {
      console.log('✅ Test 14: Incorrect OTP code rejected with 400');
      passed++;
    } else {
      throw new Error(`Expected 400 rejection, got ${res.status}: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    console.error('❌ Test 14 FAILED:', err.message);
    failed++;
  }

  // Test 15: Complete registration with valid OTP code
  try {
    const res = await fetch(`${API_BASE}/auth/verify-and-register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: verifyEmail,
        code: capturedOtp,
        username: verifyUsername,
        password: 'Password123!',
        birthDate: '1999-03-12',
        country: 'FR',
        termsAccepted: true,
      })
    });
    const data = await res.json();
    if (res.status === 201 && data.success && data.token && data.user.isEmailVerified === true) {
      console.log(`✅ Test 15: Account verified and created successfully (isEmailVerified=true)`);
      passed++;
    } else {
      throw new Error(`Expected 201 with verified user, got ${res.status}: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    console.error('❌ Test 15 FAILED:', err.message);
    failed++;
  }

  await prisma.$disconnect();
  console.log(`\n--- Test Results: ${passed} PASSED, ${failed} FAILED ---`);
  if (failed === 0) {
    console.log('🎉 ALL AUTH & EMAIL VERIFICATION TESTS PASSED PERFECTLY!');
  } else {
    process.exit(1);
  }
}

runTests();
