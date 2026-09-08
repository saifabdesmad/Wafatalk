/**
 * WAFATALK — APPLICATION LOGIC & INTERACTION ENGINE
 * Complete Auth flow, Salons Hub, Live Voice Stage, Interactive Gifting & Particle FX
 */

document.addEventListener('DOMContentLoaded', () => {

  // =========================================================================
  // 1. STATE & MOCK DATA
  // =========================================================================
  const state = {
    currentUser: null,
    theme: localStorage.getItem('wafatalk_theme') || 'light',
    activeCategory: 'all',
    searchQuery: '',
    currentRoom: null,
    isMicMuted: false,
    isAudioMuted: false,
    userPoints: 450,
  };

  // Backend API Base Configuration (Production VPS with IONOS SSL + Local dev fallback)
  const PRODUCTION_API_URL = 'https://api.wafatalk.com/api';
  const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://127.0.0.1:4000/api'
    : PRODUCTION_API_URL;

  // Mock Salons Data
  const salonsData = [
    {
      id: 'salon-1',
      name: 'Chill & Discussion du Soir ☕',
      topic: 'On refait le monde dans la bienveillance. Ambiance tamisée & thé à la menthe.',
      category: 'chill',
      isLive: true,
      hasVoice: true,
      participantsCount: 8,
      bannerBg: 'linear-gradient(135deg, #0d837d, #14a39b)',
      avatars: [
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=80&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&auto=format&fit=crop&q=80',
      ]
    },
    {
      id: 'salon-2',
      name: 'Gaming Squads & Tournois 🎮',
      topic: 'Valorant, EA FC & Rocket League. Venez trouver vos coéquipiers pour monter en rang !',
      category: 'gaming',
      isLive: true,
      hasVoice: true,
      participantsCount: 14,
      bannerBg: 'linear-gradient(135deg, #f25b3e, #ff7a59)',
      avatars: [
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=80&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=80&auto=format&fit=crop&q=80',
      ]
    },
    {
      id: 'salon-3',
      name: 'Vocal Musique & Jam Session 🎵',
      topic: 'Écoute d\'albums, partage de playlists lo-fi et impro guitare en direct.',
      category: 'music',
      isLive: true,
      hasVoice: true,
      participantsCount: 11,
      bannerBg: 'linear-gradient(135deg, #f8b84e, #ea580c)',
      avatars: [
        'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=80&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=80&auto=format&fit=crop&q=80',
      ]
    },
    {
      id: 'salon-4',
      name: 'Débats Tech & IA Antigravity 🤖',
      topic: 'Tendances du web, agents autonomes et projets de création numérique.',
      category: 'vocal',
      isLive: true,
      hasVoice: true,
      participantsCount: 9,
      bannerBg: 'linear-gradient(135deg, #094a46, #0d837d)',
      avatars: [
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&auto=format&fit=crop&q=80',
      ]
    },
    {
      id: 'salon-5',
      name: 'Le Cercle Privé des VIP 🔒',
      topic: 'Salon exclusif pour organiser les sorties du week-end et échanger en toute discrétion.',
      category: 'private',
      isLive: false,
      hasVoice: true,
      participantsCount: 5,
      bannerBg: 'linear-gradient(135deg, #1f2937, #374151)',
      avatars: [
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&auto=format&fit=crop&q=80',
      ]
    },
    {
      id: 'salon-6',
      name: 'Pause Café & Rires 😂',
      topic: 'Anecdotes légères, mèmes et bonne humeur garantie avant le weekend !',
      category: 'chill',
      isLive: true,
      hasVoice: true,
      participantsCount: 16,
      bannerBg: 'linear-gradient(135deg, #10b981, #0d837d)',
      avatars: [
        'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=80&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=80&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&auto=format&fit=crop&q=80',
      ]
    }
  ];

  // Mock Friends Data
  const friendsData = [
    { name: 'Sarah B.', role: 'En vocal', status: 'in-room', room: 'Chill & Discussion', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&auto=format&fit=crop&q=80' },
    { name: 'Youssef K.', role: 'En ligne', status: 'online', room: 'Disponible', avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=80&auto=format&fit=crop&q=80' },
    { name: 'Lina M.', role: 'En vocal', status: 'in-room', room: 'Gaming Squads', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&auto=format&fit=crop&q=80' },
    { name: 'Karim D.', role: 'Absent', status: 'idle', room: 'Retour dans 10m', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&auto=format&fit=crop&q=80' },
    { name: 'Inès T.', role: 'En ligne', status: 'online', room: 'Écoute de la musique', avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=80&auto=format&fit=crop&q=80' }
  ];

  // Stage Voices Simulation in Room
  const stageParticipants = [
    { name: 'Alexandre (Vous)', role: 'Hôte du salon', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80', isSpeaking: false },
    { name: 'Sarah B.', role: 'Modérateur', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80', isSpeaking: true },
    { name: 'Youssef K.', role: 'Participant VIP', avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=100&auto=format&fit=crop&q=80', isSpeaking: false },
    { name: 'Lina M.', role: 'Participant', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80', isSpeaking: false },
    { name: 'Mehdi R.', role: 'Participant', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80', isSpeaking: false },
    { name: 'Chloé V.', role: 'Participant', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&auto=format&fit=crop&q=80', isSpeaking: true }
  ];

  // =========================================================================
  // 2. DOM ELEMENTS SELECTION
  // =========================================================================
  const authScreen = document.getElementById('authScreen');
  const hubScreen = document.getElementById('hubScreen');

  // Theme Toggles
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const hubThemeToggleBtn = document.getElementById('hubThemeToggleBtn');

  // Auth Tabs
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const segmentIndicator = document.getElementById('segmentIndicator');
  const formLogin = document.getElementById('formLogin');
  const btnGoogleAuth = document.getElementById('btnGoogleAuth');
  const btnAppleAuth = document.getElementById('btnAppleAuth');
  const btnDiscordAuth = document.getElementById('btnDiscordAuth');
  const socialAuthModal = document.getElementById('socialAuthModal');
  const btnCloseSocialModal = document.getElementById('btnCloseSocialModal');
  const btnChooseDefaultGoogle = document.getElementById('btnChooseDefaultGoogle');
  const formCustomSocial = document.getElementById('formCustomSocial');
  const customSocialEmail = document.getElementById('customSocialEmail');
  const customSocialName = document.getElementById('customSocialName');

  // Password Toggles
  const passwordToggleBtns = document.querySelectorAll('.password-toggle-btn');
  const regPasswordInput = document.getElementById('regPassword');
  const strengthFill = document.getElementById('strengthFill');

  // Salons Hub Elements
  const salonsGrid = document.getElementById('salonsGrid');
  const salonSearchInput = document.getElementById('salonSearchInput');
  const categoryPills = document.querySelectorAll('.category-pill');
  const salonCountBadge = document.getElementById('salonCountBadge');
  const friendsList = document.getElementById('friendsList');

  // Profile and Notification Dropdowns
  const btnUserMenu = document.getElementById('btnUserMenu');
  const profileDropdown = document.getElementById('profileDropdown');
  const btnNotifications = document.getElementById('btnNotifications');
  const notifDropdown = document.getElementById('notifDropdown');
  const btnLogout = document.getElementById('btnLogout');

  // Modals
  const liveSalonModal = document.getElementById('liveSalonModal');
  const btnCloseSalonModal = document.getElementById('btnCloseSalonModal');
  const btnLeaveRoom = document.getElementById('btnLeaveRoom');
  const voiceStageGrid = document.getElementById('voiceStageGrid');
  const chatMessagesScroll = document.getElementById('chatMessagesScroll');
  const chatForm = document.getElementById('chatForm');
  const chatInputText = document.getElementById('chatInputText');

  // Voice Controls
  const btnToggleMic = document.getElementById('btnToggleMic');
  const btnToggleAudio = document.getElementById('btnToggleAudio');

  // Gifting Modal & Actions
  const giftShopModal = document.getElementById('giftShopModal');
  const btnOpenGiftShop = document.getElementById('btnOpenGiftShop');
  const btnSidebarGiftTrigger = document.getElementById('btnSidebarGiftTrigger');
  const btnModalGiftTrigger = document.getElementById('btnModalGiftTrigger');
  const btnCloseGiftModal = document.getElementById('btnCloseGiftModal');
  const btnSendCommunityGift = document.getElementById('btnSendCommunityGift');

  // Create Salon Modal
  const createSalonModal = document.getElementById('createSalonModal');
  const btnOpenCreateSalon = document.getElementById('btnOpenCreateSalon');
  const btnCloseCreateModal = document.getElementById('btnCloseCreateModal');
  const btnCancelCreate = document.getElementById('btnCancelCreate');
  const formCreateSalon = document.getElementById('formCreateSalon');

  // Toast Container
  const toastContainer = document.getElementById('toastContainer');

  // Canvas
  const fxCanvas = document.getElementById('fxCanvas');
  const ctx = fxCanvas.getContext('2d');


  // =========================================================================
  // 3. THEME MANAGEMENT
  // =========================================================================
  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('wafatalk_theme', theme);
  }

  function toggleTheme() {
    const nextTheme = state.theme === 'light' ? 'dark' : 'light';
    applyTheme(nextTheme);
    showToast(`Thème basculé en mode ${nextTheme === 'dark' ? 'Sombre 🌙' : 'Clair ☀️'}`, 'amber');
  }

  applyTheme(state.theme);
  themeToggleBtn?.addEventListener('click', toggleTheme);
  hubThemeToggleBtn?.addEventListener('click', toggleTheme);


  // =========================================================================
  // 4. AUTHENTICATION LOGIC & TRANSITION
  // =========================================================================
  function switchAuthTab(mode) {
    if (mode === 'login') {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      segmentIndicator.style.transform = 'translateX(0)';
      formLogin.classList.remove('hidden');
      formRegister.classList.add('hidden');
    } else {
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      segmentIndicator.style.transform = 'translateX(100%)';
      formRegister.classList.remove('hidden');
      formLogin.classList.add('hidden');
    }
  }

  tabLogin?.addEventListener('click', () => switchAuthTab('login'));
  tabRegister?.addEventListener('click', () => switchAuthTab('register'));

  // Password Visibility Toggle
  passwordToggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input');
      const eyeOpen = btn.querySelector('.eye-open');
      const eyeClosed = btn.querySelector('.eye-closed');
      
      if (input.type === 'password') {
        input.type = 'text';
        eyeOpen.classList.add('hidden');
        eyeClosed.classList.remove('hidden');
      } else {
        input.type = 'password';
        eyeOpen.classList.remove('hidden');
        eyeClosed.classList.add('hidden');
      }
    });
  });

  // Password Strength Visual Indicator
  regPasswordInput?.addEventListener('input', (e) => {
    const val = e.target.value;
    let strength = 0;
    if (val.length >= 6) strength += 30;
    if (/[A-Z]/.test(val)) strength += 30;
    if (/[0-9!@#$%^&*]/.test(val)) strength += 40;

    strengthFill.style.width = `${Math.min(100, strength)}%`;
    if (strength < 40) {
      strengthFill.style.backgroundColor = 'var(--coral-primary)';
    } else if (strength < 80) {
      strengthFill.style.backgroundColor = 'var(--amber-primary)';
    } else {
      strengthFill.style.backgroundColor = 'var(--success-color)';
    }
  });

  // Shake Element on Error Feedback
  function shakeElement(el) {
    if (!el) return;
    el.classList.add('shake-anim');
    setTimeout(() => el.classList.remove('shake-anim'), 400);
  }

  // Session Token Management
  function getAuthToken() {
    return localStorage.getItem('wafatalk_token');
  }

  function setAuthSession(token, user) {
    localStorage.setItem('wafatalk_token', token);
    localStorage.setItem('wafatalk_user', JSON.stringify(user));
    state.currentUser = user;
    state.userPoints = user.wafaPoints ?? state.userPoints;
  }

  function clearAuthSession() {
    localStorage.removeItem('wafatalk_token');
    localStorage.removeItem('wafatalk_user');
    state.currentUser = null;
  }

  // Successful Login Transition to Hub
  function authenticateUser(userData, playFx = true) {
    state.currentUser = userData;
    if (userData.wafaPoints !== undefined) {
      state.userPoints = userData.wafaPoints;
    }

    const displayName = userData.displayName || userData.name || 'Ami WafaTalk';
    const email = userData.email || '';
    const avatar = userData.avatarUrl || userData.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80';

    if (playFx) {
      launchParticles(window.innerWidth / 2, window.innerHeight / 2, 'confetti');
      playTone(520, 'sine', 0.2);
      showToast(`Bienvenue sur WafaTalk, ${displayName} ! ✨`, 'success');
    }

    // Smooth Screen Transition
    authScreen.style.opacity = '0';
    setTimeout(() => {
      authScreen.classList.remove('active');
      hubScreen.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      hubScreen.style.opacity = '1';

      // Update UI with real user info
      const navUserName = document.getElementById('navUserName');
      const heroUserGreeting = document.getElementById('heroUserGreeting');
      const navUserAvatar = document.getElementById('navUserAvatar');
      const menuFullName = document.getElementById('menuFullName');
      const menuEmail = document.getElementById('menuEmail');
      const userPointsVal = document.getElementById('userPointsVal');
      const dropdownUserPoints = document.getElementById('dropdownUserPoints');

      if (navUserName) navUserName.textContent = displayName.split(' ')[0];
      if (heroUserGreeting) heroUserGreeting.textContent = displayName.split(' ')[0];
      if (navUserAvatar) navUserAvatar.src = avatar;
      if (menuFullName) menuFullName.textContent = displayName;
      if (menuEmail) menuEmail.textContent = email;
      if (userPointsVal) userPointsVal.textContent = state.userPoints;
      if (dropdownUserPoints) dropdownUserPoints.textContent = state.userPoints;

      renderSalons();
      renderFriends();
    }, 350);
  }

  // Check Existing Session on page load
  async function checkExistingSession() {
    const token = getAuthToken();
    if (!token) return;

    // Check cached session first for instant load or offline fallback
    const cachedUserJson = localStorage.getItem('wafatalk_user');
    let cachedUser = null;
    if (cachedUserJson) {
      try { cachedUser = JSON.parse(cachedUserJson); } catch (e) {}
    }

    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          setAuthSession(token, data.user);
          authenticateUser(data.user, false);
          return;
        }
      }
      if (res.status === 401) {
        clearAuthSession();
        return;
      }
    } catch (err) {
      // Offline / Vercel fallback: restore cached user session if present
      if (cachedUser) {
        authenticateUser(cachedUser, false);
      }
    }
  }

  // Handle Login Submission
  formLogin?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSubmit = document.getElementById('btnLoginSubmit');
    const spinner = document.getElementById('loginSpinner');
    const btnText = btnSubmit.querySelector('.btn-text');
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    btnText.textContent = 'Connexion en cours...';
    spinner.classList.remove('hidden');
    btnSubmit.disabled = true;

    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: email, password }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user && data.token) {
          setAuthSession(data.token, data.user);
          authenticateUser(data.user, true);
          return;
        }
      } else if (res.status === 401 || res.status === 400) {
        const data = await res.json();
        showToast(data.message || 'Identifiants incorrects', 'coral');
        shakeElement(formLogin);
        playTone(220, 'sawtooth', 0.25);
        return;
      }
      throw new Error('Fallback local auth');
    } catch (err) {
      // Offline / Vercel Fallback: match local accounts
      const localUsers = JSON.parse(localStorage.getItem('wafatalk_local_users') || '[]');
      const found = localUsers.find(u => 
        (u.email.toLowerCase() === email.toLowerCase() || u.username.toLowerCase() === email.toLowerCase()) &&
        u.password === password
      );

      if (found) {
        const token = `local_token_${found.id}`;
        setAuthSession(token, found);
        authenticateUser(found, true);
        return;
      }

      // Pre-seeded Alexandre check in offline mode
      if ((email.toLowerCase() === 'alexandre@wafatalk.com' || email.toLowerCase() === 'alexandre') &&
          (password === 'wafatalk2026' || password === 'demo123456')) {
        const alexUser = {
          id: 'user-alexandre',
          username: 'alexandre',
          email: 'alexandre@wafatalk.com',
          displayName: 'Alexandre',
          avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
          wafaPoints: 450,
          role: 'ADMIN',
          status: 'ONLINE'
        };
        setAuthSession('local_token_alexandre', alexUser);
        authenticateUser(alexUser, true);
        return;
      }

      showToast('Identifiants incorrects', 'coral');
      shakeElement(formLogin);
      playTone(220, 'sawtooth', 0.25);
    } finally {
      btnSubmit.disabled = false;
      spinner.classList.add('hidden');
      btnText.textContent = 'Se connecter à WafaTalk';
    }
  });

  // Handle Register Submission
  formRegister?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSubmit = document.getElementById('btnRegSubmit');
    const spinner = document.getElementById('regSpinner');
    const btnText = btnSubmit.querySelector('.btn-text');
    const username = document.getElementById('regUsername').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;

    btnText.textContent = 'Création du compte...';
    spinner.classList.remove('hidden');
    btnSubmit.disabled = true;

    try {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          email,
          password,
          displayName: username,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user && data.token) {
          setAuthSession(data.token, data.user);
          formRegister.reset();
          if (strengthFill) strengthFill.style.width = '0%';
          authenticateUser(data.user, true);
          showToast(`Compte créé avec succès ! Bienvenue ${data.user.displayName || username} 🎈`, 'success');
          return;
        }
      } else if (res.status === 400) {
        const data = await res.json();
        showToast(data.message || 'Erreur lors de la création du compte', 'coral');
        shakeElement(formRegister);
        playTone(220, 'sawtooth', 0.25);
        return;
      }
      throw new Error('Fallback local register');
    } catch (err) {
      // Offline / Vercel Fallback: Create account in browser localStorage
      const localUsers = JSON.parse(localStorage.getItem('wafatalk_local_users') || '[]');
      const cleanEmail = email.toLowerCase();
      const cleanUsername = username.replace(/\s+/g, '_');

      const exists = localUsers.find(u => u.email.toLowerCase() === cleanEmail || u.username.toLowerCase() === cleanUsername.toLowerCase());
      if (exists) {
        showToast(exists.email.toLowerCase() === cleanEmail ? 'Cette adresse email est déjà associée à un compte.' : 'Ce nom d\'utilisateur est déjà pris.', 'coral');
        shakeElement(formRegister);
        playTone(220, 'sawtooth', 0.25);
        return;
      }

      const newUser = {
        id: `user-${Date.now()}`,
        username: cleanUsername,
        email: cleanEmail,
        displayName: username,
        password: password,
        avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanUsername)}`,
        wafaPoints: 150,
        role: 'USER',
        status: 'ONLINE',
        createdAt: new Date().toISOString()
      };

      localUsers.push(newUser);
      localStorage.setItem('wafatalk_local_users', JSON.stringify(localUsers));

      const fakeToken = `local_token_${newUser.id}`;
      setAuthSession(fakeToken, newUser);
      formRegister.reset();
      if (strengthFill) strengthFill.style.width = '0%';
      authenticateUser(newUser, true);
      showToast(`Compte créé avec succès ! Bienvenue ${username} 🎈`, 'success');
    } finally {
      btnSubmit.disabled = false;
      spinner.classList.add('hidden');
      btnText.textContent = 'Créer mon compte';
    }
  });

  // Forgot Password interactive handler
  const linkForgotPassword = document.getElementById('linkForgotPassword');
  linkForgotPassword?.addEventListener('click', (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail')?.value.trim() || 'votre adresse email';
    showToast(`Un lien de réinitialisation sécurisé a été envoyé à ${email} 📩`, 'teal');
    playTone(440, 'sine', 0.15);
  });

  // Social Auth Modal Handler (Google / Gmail, Apple, Discord)
  let activeSocialProvider = 'Google';

  function openSocialModal(provider) {
    activeSocialProvider = provider;
    if (!socialAuthModal) return;

    const title = document.getElementById('socialModalTitle');
    const desc = document.getElementById('socialModalDesc');
    const icon = document.getElementById('socialModalIcon');
    const nameEl = document.getElementById('socialAccountName');
    const emailEl = document.getElementById('socialAccountEmail');
    const emailLabel = document.getElementById('customSocialEmailLabel');
    const emailInput = document.getElementById('customSocialEmail');
    const dividerText = document.getElementById('socialDividerText');

    if (provider === 'Google') {
      title.textContent = 'Connexion avec Google';
      desc.textContent = 'Accédez immédiatement à votre compte ou inscrivez-vous avec votre adresse Gmail.';
      icon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.3 8.9 5 12 5z"/><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"/><path fill="#FBBC05" d="M5.3 14.7c-.2-.7-.4-1.5-.4-2.7 0-1.1.2-2 .4-2.7L1.6 6.4C.6 8.3 0 10.1 0 12s.6 3.7 1.6 5.6l3.7-2.9z"/><path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.8-2.5 1.2-4.3 1.2-3.1 0-5.8-2.3-6.7-5.3L1.6 16C3.5 19.8 7.4 23 12 23z"/></svg>`;
      nameEl.textContent = 'Alexandre Moreau';
      emailEl.textContent = 'alexandre.moreau@gmail.com';
      emailLabel.textContent = 'Votre adresse Gmail';
      emailInput.placeholder = 'votre.adresse@gmail.com';
      dividerText.textContent = 'ou entrez une autre adresse Gmail';
    } else if (provider === 'Apple') {
      title.textContent = 'Connexion avec Apple';
      desc.textContent = 'Utilisez votre identifiant Apple ID pour vous connecter en toute confidentialité.';
      icon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.38c.62-.75 1.04-1.8 0.92-2.88-.9.04-1.99.6-2.63 1.35-.58.65-1.09 1.73-0.96 2.76 1 .08 2.05-.48 2.67-1.23z"/></svg>`;
      nameEl.textContent = 'Alexandre Moreau';
      emailEl.textContent = 'alexandre.moreau@icloud.com';
      emailLabel.textContent = 'Votre identifiant Apple';
      emailInput.placeholder = 'votre.nom@icloud.com';
      dividerText.textContent = 'ou entrez une autre adresse Apple ID';
    } else {
      title.textContent = 'Connexion avec Discord';
      desc.textContent = 'Rejoignez WafaTalk instantanément avec votre compte Discord.';
      icon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="#5865F2"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>`;
      nameEl.textContent = 'Alexandre (Discord)';
      emailEl.textContent = 'alexandre#2026@discord.gg';
      emailLabel.textContent = 'Votre email Discord';
      emailInput.placeholder = 'pseudo@discord.gg';
      dividerText.textContent = 'ou entrez une autre adresse Discord';
    }

    socialAuthModal.classList.remove('hidden');
  }

  async function executeSocialAuth(provider, email, displayName) {
    const btnConfirm = document.getElementById('btnConfirmSocialAuth');
    const spinner = document.getElementById('socialSpinner');
    const btnText = btnConfirm?.querySelector('.btn-text');

    if (btnText) btnText.textContent = 'Connexion...';
    if (spinner) spinner.classList.remove('hidden');
    if (btnConfirm) btnConfirm.disabled = true;

    try {
      const res = await fetch(`${API_BASE_URL}/auth/social`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          email,
          displayName,
          avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(displayName || email)}`
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user && data.token) {
          socialAuthModal?.classList.add('hidden');
          formCustomSocial?.reset();
          setAuthSession(data.token, data.user);
          authenticateUser(data.user, true);
          showToast(`Connecté avec succès via ${provider} ! ✨`, 'success');
          return;
        }
      }
      throw new Error('Fallback social');
    } catch (err) {
      // Offline / Vercel Fallback: register or retrieve user in localStorage
      const cleanEmail = email.toLowerCase();
      const localUsers = JSON.parse(localStorage.getItem('wafatalk_local_users') || '[]');
      let user = localUsers.find(u => u.email.toLowerCase() === cleanEmail);

      if (!user) {
        user = {
          id: `social-${Date.now()}`,
          username: cleanEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') || 'user',
          email: cleanEmail,
          displayName: displayName || cleanEmail.split('@')[0],
          avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(displayName || cleanEmail)}`,
          wafaPoints: 150,
          role: 'USER',
          status: 'ONLINE',
          createdAt: new Date().toISOString()
        };
        localUsers.push(user);
        localStorage.setItem('wafatalk_local_users', JSON.stringify(localUsers));
      }

      socialAuthModal?.classList.add('hidden');
      formCustomSocial?.reset();
      setAuthSession(`local_social_${user.id}`, user);
      authenticateUser(user, true);
      showToast(`Connecté avec succès via ${provider} ! ✨`, 'success');
    } finally {
      if (btnConfirm) btnConfirm.disabled = false;
      if (spinner) spinner.classList.add('hidden');
      if (btnText) btnText.textContent = 'Continuer avec ce compte';
    }
  }

  // Social Button Triggers
  btnGoogleAuth?.addEventListener('click', () => openSocialModal('Google'));
  btnAppleAuth?.addEventListener('click', () => openSocialModal('Apple'));
  btnDiscordAuth?.addEventListener('click', () => openSocialModal('Discord'));

  // Close Social Modal
  btnCloseSocialModal?.addEventListener('click', () => {
    socialAuthModal?.classList.add('hidden');
  });

  socialAuthModal?.addEventListener('click', (e) => {
    if (e.target === socialAuthModal) {
      socialAuthModal.classList.add('hidden');
    }
  });

  // Suggested Account Click
  btnChooseDefaultGoogle?.addEventListener('click', async () => {
    btnChooseDefaultGoogle.style.opacity = '0.5';
    btnChooseDefaultGoogle.style.pointerEvents = 'none';
    const email = document.getElementById('socialAccountEmail')?.textContent || 'alexandre.moreau@gmail.com';
    const name = document.getElementById('socialAccountName')?.textContent || 'Alexandre Moreau';
    try {
      await executeSocialAuth(activeSocialProvider, email, name);
    } finally {
      btnChooseDefaultGoogle.style.opacity = '1';
      btnChooseDefaultGoogle.style.pointerEvents = 'auto';
    }
  });

  // Custom Social Form Submit
  formCustomSocial?.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = customSocialEmail?.value.trim();
    const name = customSocialName?.value.trim();
    if (!email || !name) return;
    executeSocialAuth(activeSocialProvider, email, name);
  });

  // Logout Action
  btnLogout?.addEventListener('click', async () => {
    profileDropdown.classList.add('hidden');
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST' });
    } catch (e) {}

    clearAuthSession();

    hubScreen.style.opacity = '0';
    setTimeout(() => {
      hubScreen.classList.remove('active');
      authScreen.classList.add('active');
      authScreen.style.opacity = '1';
      showToast('Déconnexion effectuée. À bientôt sur WafaTalk !', 'coral');
    }, 300);
  });

  // Load Salons from Backend API
  async function loadSalonsFromApi() {
    try {
      const res = await fetch(`${API_BASE_URL}/salons`);
      const data = await res.json();
      if (data.success && Array.isArray(data.salons) && data.salons.length > 0) {
        data.salons.forEach(bs => {
          const idx = salonsData.findIndex(s => s.id === bs.id);
          const formatted = {
            id: bs.id,
            name: bs.name,
            topic: bs.topic || 'Salon communautaire WafaTalk',
            category: (bs.category || 'chill').toLowerCase(),
            isLive: bs.isLive ?? true,
            hasVoice: bs.hasVoice ?? true,
            participantsCount: bs._count?.members || bs.participantsCount || 4,
            bannerBg: bs.bannerBg || 'linear-gradient(135deg, #0d837d, #14a39b)',
            avatars: [
              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&auto=format&fit=crop&q=80',
              'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=80&auto=format&fit=crop&q=80'
            ]
          };
          if (idx !== -1) {
            salonsData[idx] = { ...salonsData[idx], ...formatted };
          } else {
            salonsData.push(formatted);
          }
        });
        renderSalons();
      }
    } catch (e) {
      // Offline fallback: keep mock salonsData
    }
  }

  // Check existing session on load
  checkExistingSession();
  loadSalonsFromApi();

  // =========================================================================
  // 5. HUB / SALONS RENDERING & FILTERING
  // =========================================================================
  function renderSalons() {
    if (!salonsGrid) return;
    salonsGrid.innerHTML = '';

    const filtered = salonsData.filter(s => {
      const matchesCategory = state.activeCategory === 'all' || s.category === state.activeCategory;
      const matchesSearch = s.name.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
                            s.topic.toLowerCase().includes(state.searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });

    if (salonCountBadge) {
      salonCountBadge.textContent = `${filtered.length} Salon${filtered.length > 1 ? 's' : ''} disponible${filtered.length > 1 ? 's' : ''}`;
    }

    if (filtered.length === 0) {
      salonsGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 48px; background: var(--bg-surface); border-radius: var(--radius-lg); border: 1px dashed var(--border-medium);">
          <div style="font-size: 2.5rem; margin-bottom: 12px;">🔍</div>
          <h4 style="font-size: 1.2rem; font-weight: 700; margin-bottom: 6px;">Aucun salon trouvé</h4>
          <p style="color: var(--text-muted); font-size: 0.9rem;">Essayez un autre mot-clé ou créez votre propre salon maintenant !</p>
        </div>
      `;
      return;
    }

    filtered.forEach(salon => {
      const card = document.createElement('div');
      card.className = 'salon-card';
      card.dataset.id = salon.id;

      card.innerHTML = `
        <div class="salon-card-banner" style="background: ${salon.bannerBg};">
          <div class="salon-banner-overlay"></div>
          <span class="salon-card-badge ${salon.isLive ? 'live-active' : ''}">
            <span class="live-dot pulse"></span>
            <span>${salon.isLive ? 'EN DIRECT' : 'SALON RÉSERVÉ'}</span>
          </span>
          <span class="salon-card-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
            <span>${salon.participantsCount}</span>
          </span>
        </div>

        <div class="salon-card-content">
          <div class="salon-card-title-row">
            <h4 class="salon-card-title">${salon.name}</h4>
          </div>
          <p class="salon-card-topic">${salon.topic}</p>
        </div>

        <div class="salon-card-footer">
          <div class="salon-avatars-pile">
            ${salon.avatars.map(av => `<img src="${av}" alt="Participant" class="pile-avatar">`).join('')}
            <div class="pile-more">+${Math.max(1, salon.participantsCount - salon.avatars.length)}</div>
          </div>
          <button type="button" class="btn btn-primary btn-sm btn-join-salon" data-id="${salon.id}">
            <span>Rejoindre</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          </button>
        </div>
      `;

      card.querySelector('.btn-join-salon')?.addEventListener('click', () => {
        openLiveSalon(salon);
      });

      salonsGrid.appendChild(card);
    });
  }

  // Category Filtering
  categoryPills.forEach(pill => {
    pill.addEventListener('click', () => {
      categoryPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.activeCategory = pill.dataset.category;
      renderSalons();
    });
  });

  // Search Filter with instant reaction & Ctrl+K support
  salonSearchInput?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderSalons();
  });

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      salonSearchInput?.focus();
    }
  });

  // Render Friends List in Sidebar
  function renderFriends() {
    if (!friendsList) return;
    friendsList.innerHTML = '';

    friendsData.forEach(friend => {
      const item = document.createElement('div');
      item.className = 'friend-item';
      item.innerHTML = `
        <div class="friend-item-left">
          <div class="friend-avatar-wrap">
            <img src="${friend.avatar}" alt="${friend.name}" class="friend-avatar">
            <span class="friend-status-dot ${friend.status}"></span>
          </div>
          <div class="friend-meta">
            <span class="friend-name">${friend.name}</span>
            <span class="friend-activity">${friend.room}</span>
          </div>
        </div>
        <button type="button" class="friend-action-btn" title="Envoyer un cadeau ou discuter">
          🎁
        </button>
      `;

      item.querySelector('.friend-action-btn')?.addEventListener('click', () => {
        openGiftShop();
      });

      friendsList.appendChild(item);
    });
  }


  // =========================================================================
  // 6. LIVE SALON MODAL EXPERIENCE
  // =========================================================================
  function openLiveSalon(salon) {
    state.currentRoom = salon;

    document.getElementById('liveSalonTitle').textContent = salon.name;
    document.getElementById('liveSalonTopic').textContent = salon.topic;
    document.getElementById('modalRoomCategory').textContent = `${salon.category.toUpperCase()} • HD AUDIO`;

    renderVoiceStage();
    initSalonChat(salon);

    liveSalonModal.classList.remove('hidden');
    playTone(440, 'sine', 0.15);
    showToast(`Connexion au salon vocal "${salon.name}" établie !`, 'teal');
  }

  function closeLiveSalon() {
    liveSalonModal.classList.add('hidden');
    state.currentRoom = null;
    showToast('Vous avez quitté le salon.', 'coral');
  }

  btnCloseSalonModal?.addEventListener('click', closeLiveSalon);
  btnLeaveRoom?.addEventListener('click', closeLiveSalon);

  // Render Avatars in Voice Stage with speaking simulator
  function renderVoiceStage() {
    if (!voiceStageGrid) return;
    voiceStageGrid.innerHTML = '';

    stageParticipants.forEach((p, idx) => {
      const card = document.createElement('div');
      card.className = `stage-avatar-card ${p.isSpeaking ? 'is-speaking' : ''}`;
      card.id = `stageUser_${idx}`;

      card.innerHTML = `
        <div class="stage-avatar-img-wrap">
          <img src="${p.avatar}" alt="${p.name}" class="stage-avatar-img">
        </div>
        <span class="stage-user-name">${p.name}</span>
        <span class="stage-user-role">${p.role}</span>
      `;

      voiceStageGrid.appendChild(card);
    });
  }

  // Simulate active speaker voice activity pulses
  setInterval(() => {
    if (!state.currentRoom || liveSalonModal.classList.contains('hidden')) return;
    const randIdx = Math.floor(Math.random() * stageParticipants.length);
    const card = document.getElementById(`stageUser_${randIdx}`);
    if (card) {
      card.classList.toggle('is-speaking');
    }
  }, 2200);

  // Voice Controls Bar
  btnToggleMic?.addEventListener('click', () => {
    state.isMicMuted = !state.isMicMuted;
    btnToggleMic.classList.toggle('muted', state.isMicMuted);
    btnToggleMic.querySelector('.mic-on-icon').classList.toggle('hidden', state.isMicMuted);
    btnToggleMic.querySelector('.mic-off-icon').classList.toggle('hidden', !state.isMicMuted);
    btnToggleMic.querySelector('.ctrl-label').textContent = state.isMicMuted ? 'Coupé' : 'Micro';
    showToast(state.isMicMuted ? 'Microphone désactivé' : 'Microphone activé', state.isMicMuted ? 'coral' : 'success');
  });

  btnToggleAudio?.addEventListener('click', () => {
    state.isAudioMuted = !state.isAudioMuted;
    btnToggleAudio.classList.toggle('muted', state.isAudioMuted);
    btnToggleAudio.querySelector('.ctrl-label').textContent = state.isAudioMuted ? 'Sourdine' : 'Audio HD';
    showToast(state.isAudioMuted ? 'Son coupé' : 'Son rétabli', state.isAudioMuted ? 'coral' : 'teal');
  });

  // Salon Chat System
  function initSalonChat(salon) {
    if (!chatMessagesScroll) return;
    chatMessagesScroll.innerHTML = `
      <div class="chat-msg">
        <img src="assets/wafatalk-icon.png" class="chat-msg-avatar" alt="WafaTalk Bot">
        <div class="chat-msg-body">
          <div class="chat-msg-author">
            <strong>WafaBot</strong>
            <span class="chat-msg-time">À l'instant</span>
          </div>
          <p class="chat-msg-text">Bienvenue dans <strong>${salon.name}</strong> ! Partagez vos pensées et respectez les règles d'amitié.</p>
        </div>
      </div>
      <div class="chat-msg">
        <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&auto=format&fit=crop&q=80" class="chat-msg-avatar" alt="Sarah">
        <div class="chat-msg-body">
          <div class="chat-msg-author">
            <strong>Sarah B.</strong>
            <span class="chat-msg-time">Il y a 2m</span>
          </div>
          <p class="chat-msg-text">Hello tout le monde ! On parlait de notre projet de podcast, installez-vous ! 🎉</p>
        </div>
      </div>
    `;
    chatMessagesScroll.scrollTop = chatMessagesScroll.scrollHeight;
  }

  // Handle Chat Input Message
  chatForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInputText.value.trim();
    if (!text) return;

    const user = state.currentUser || { name: 'Alexandre', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&auto=format&fit=crop&q=80' };

    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg self';
    msgEl.innerHTML = `
      <img src="${user.avatar}" class="chat-msg-avatar" alt="${user.name}">
      <div class="chat-msg-body">
        <div class="chat-msg-author">
          <strong>Vous</strong>
          <span class="chat-msg-time">À l'instant</span>
        </div>
        <p class="chat-msg-text">${escapeHtml(text)}</p>
      </div>
    `;

    chatMessagesScroll.appendChild(msgEl);
    chatInputText.value = '';
    chatMessagesScroll.scrollTop = chatMessagesScroll.scrollHeight;
    playTone(600, 'sine', 0.08);
  });


  // =========================================================================
  // 7. INTERACTIVE GIFTING & CELEBRATION ENGINE
  // =========================================================================
  function openGiftShop() {
    giftShopModal.classList.remove('hidden');
  }

  function closeGiftShop() {
    giftShopModal.classList.add('hidden');
  }

  btnOpenGiftShop?.addEventListener('click', openGiftShop);
  btnSidebarGiftTrigger?.addEventListener('click', openGiftShop);
  btnModalGiftTrigger?.addEventListener('click', openGiftShop);
  btnSendCommunityGift?.addEventListener('click', openGiftShop);
  btnCloseGiftModal?.addEventListener('click', closeGiftShop);

  // Send Gift Action
  document.querySelectorAll('.btn-send-gift').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.gift-card-item');
      const giftName = card.dataset.name;
      const giftType = card.dataset.gift;

      closeGiftShop();

      // Launch particles & sounds
      launchParticles(window.innerWidth / 2, window.innerHeight / 2, giftType);
      playGiftChime();

      showToast(`✨ Cadeau envoyé : ${giftName} ! Vos amis adorent ! 🎁`, 'amber');

      // If inside live salon, append celebration announcement
      if (state.currentRoom && !liveSalonModal.classList.contains('hidden')) {
        const giftMsg = document.createElement('div');
        giftMsg.className = 'chat-msg';
        giftMsg.innerHTML = `
          <div style="font-size: 1.6rem;">🎁</div>
          <div class="chat-msg-body" style="background: linear-gradient(135deg, var(--amber-primary), var(--coral-primary)); color: #fff;">
            <div class="chat-msg-author">
              <strong>Célébration WafaTalk !</strong>
            </div>
            <p class="chat-msg-text"><strong>Vous</strong> avez offert un <strong>${giftName}</strong> à tout le salon ! 🎉</p>
          </div>
        `;
        chatMessagesScroll.appendChild(giftMsg);
        chatMessagesScroll.scrollTop = chatMessagesScroll.scrollHeight;
      }
    });
  });


  // =========================================================================
  // 8. CREATE SALON MODAL
  // =========================================================================
  btnOpenCreateSalon?.addEventListener('click', () => {
    createSalonModal.classList.remove('hidden');
  });

  function closeCreateModal() {
    createSalonModal.classList.add('hidden');
  }

  btnCloseCreateModal?.addEventListener('click', closeCreateModal);
  btnCancelCreate?.addEventListener('click', closeCreateModal);

  formCreateSalon?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('newSalonName').value.trim();
    const topic = document.getElementById('newSalonTopic').value.trim();
    const category = document.getElementById('newSalonCategory').value;
    const voiceEnabled = document.getElementById('newSalonVoiceEnabled').checked;

    const newSalon = {
      id: `salon-${Date.now()}`,
      name: name,
      topic: topic,
      category: category,
      isLive: true,
      hasVoice: voiceEnabled,
      participantsCount: 1,
      bannerBg: 'linear-gradient(135deg, #0d837d, #f25b3e)',
      avatars: [
        state.currentUser?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&auto=format&fit=crop&q=80'
      ]
    };

    salonsData.unshift(newSalon);
    renderSalons();
    closeCreateModal();
    formCreateSalon.reset();

    // Persist to backend if authenticated
    const token = getAuthToken();
    if (token) {
      fetch(`${API_BASE_URL}/salons`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name,
          topic,
          category: category.toUpperCase(),
          hasVoice: voiceEnabled,
          isPrivate: category === 'private'
        })
      }).then(r => r.json()).then(data => {
        if (data.success && data.salon) {
          loadSalonsFromApi();
        }
      }).catch(() => {});
    }

    showToast(`Le salon "${name}" a été créé avec succès ! 🎙️`, 'teal');
    openLiveSalon(newSalon);
  });


  // =========================================================================
  // 9. DROPDOWNS & NAVIGATION TOGGLES
  // =========================================================================
  btnUserMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
    profileDropdown.classList.toggle('hidden');
    notifDropdown?.classList.add('hidden');
  });

  btnNotifications?.addEventListener('click', (e) => {
    e.stopPropagation();
    notifDropdown.classList.toggle('hidden');
    profileDropdown?.classList.add('hidden');
  });

  document.addEventListener('click', () => {
    profileDropdown?.classList.add('hidden');
    notifDropdown?.classList.add('hidden');
  });

  // Quick Join Trending Room button
  document.getElementById('btnQuickJoinTrending')?.addEventListener('click', () => {
    if (salonsData.length > 0) {
      openLiveSalon(salonsData[1]); // Join gaming or chill
    }
  });


  // =========================================================================
  // 10. TOAST NOTIFICATION SYSTEM
  // =========================================================================
  function showToast(message, type = 'teal') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }


  // =========================================================================
  // 11. AUDIO SYNTHESIZER (WEB AUDIO API — NO EXTERNAL ASSETS)
  // =========================================================================
  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playTone(freq, type = 'sine', duration = 0.15) {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (err) {
      // Audio autoplay policy fallback
    }
  }

  function playGiftChime() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 joyful arpeggio
      notes.forEach((freq, idx) => {
        setTimeout(() => playTone(freq, 'triangle', 0.25), idx * 75);
      });
    } catch (err) {}
  }


  // =========================================================================
  // 12. CANVAS PARTICLE FX (CONFETTI & HEARTS)
  // =========================================================================
  let particles = [];
  let isAnimating = false;

  function resizeCanvas() {
    fxCanvas.width = window.innerWidth;
    fxCanvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  function launchParticles(x, y, type = 'confetti') {
    const colors = ['#0d837d', '#14a39b', '#f25b3e', '#ff7a59', '#f8b84e', '#ffd166'];
    const count = type === 'fireworks' ? 120 : 60;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 8 + 2;
      particles.push({
        x: x || window.innerWidth / 2,
        y: y || window.innerHeight / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (type === 'fireworks' ? 3 : 1),
        size: Math.random() * 7 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        rotation: Math.random() * 360,
        vr: (Math.random() - 0.5) * 10,
        isHeart: type === 'heart'
      });
    }

    if (!isAnimating) {
      isAnimating = true;
      requestAnimationFrame(animateParticles);
    }
  }

  function animateParticles() {
    ctx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.18; // gravity
      p.alpha -= 0.015;
      p.rotation += p.vr;

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);

      if (p.isHeart) {
        ctx.font = `${p.size * 2}px sans-serif`;
        ctx.fillText('💖', 0, 0);
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      }

      ctx.restore();

      if (p.alpha <= 0 || p.y > fxCanvas.height) {
        particles.splice(i, 1);
      }
    }

    if (particles.length > 0) {
      requestAnimationFrame(animateParticles);
    } else {
      isAnimating = false;
      ctx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    }
  }


  // =========================================================================
  // 13. UTILITIES
  // =========================================================================
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

});
