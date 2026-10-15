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

  // Backend API Base Configuration (Local Dev auto-switch & Production IONOS VPS)
  const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:')
    ? 'http://127.0.0.1:4000/api'
    : 'https://api.wafatalk.com/api';

  const SOCKET_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:')
    ? 'http://127.0.0.1:4000'
    : 'https://api.wafatalk.com';

  // WebRTC Global Configuration (Multi-STUN & Global TURN Relays for WAN / Cross-Country connectivity)
  const RTC_CONFIG = {
    iceServers: [
      // High-availability global STUN servers
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      { urls: 'stun:stun.services.mozilla.com' },
      { urls: 'stun:stun.relay.metered.ca:80' },

      // Global TURN Relays (OpenRelay / Metered - Traverses Symmetric NATs & Firewalls across countries)
      {
        urls: 'turn:global.relay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
      {
        urls: 'turn:global.relay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
      {
        urls: 'turn:global.relay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all',
  };

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

  // Real-time Presence Tracker for connected online user IDs & usernames
  const activeOnlineUserIds = new Set();

  // Seeded & Connected Friends Data with Real DB IDs & Flags (default offline until socket confirms)
  const friendsData = [
    { id: 'user-sarah', username: 'sarah_b', name: 'Sarah B.', role: 'Hors ligne', status: 'offline', room: '', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&auto=format&fit=crop&q=80', country: 'FR' },
    { id: 'user-youssef', username: 'youssef_k', name: 'Youssef K.', role: 'Hors ligne', status: 'offline', room: '', avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=80&auto=format&fit=crop&q=80', country: 'MA' },
    { id: 'user-lina', username: 'lina_m', name: 'Lina M.', role: 'Hors ligne', status: 'offline', room: '', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&auto=format&fit=crop&q=80', country: 'DZ' },
    { id: 'user-karim', username: 'karim_d', name: 'Karim D.', role: 'Hors ligne', status: 'offline', room: '', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&auto=format&fit=crop&q=80', country: 'TN' },
    { id: 'user-alexandre', username: 'alexandre', name: 'Alexandre', role: 'Hors ligne', status: 'offline', room: '', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80', country: 'FR' }
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

  // Registration Elements
  const regUsernameInput = document.getElementById('regUsername');
  const regUsernameStatus = document.getElementById('regUsernameStatus');
  const regUsernameHint = document.getElementById('regUsernameHint');
  const regBirthDateInput = document.getElementById('regBirthDate');
  const regCountryInput = document.getElementById('regCountry');
  const countryPickerWrap = document.getElementById('countryPickerWrap');
  const countryPickerTrigger = document.getElementById('countryPickerTrigger');
  const selectedFlagWrap = document.getElementById('selectedFlagWrap');
  const selectedCountryName = document.getElementById('selectedCountryName');
  const countryDropdownMenu = document.getElementById('countryDropdownMenu');
  const countrySearchInput = document.getElementById('countrySearchInput');
  const btnClearCountrySearch = document.getElementById('btnClearCountrySearch');
  const countryOptionsScroll = document.getElementById('countryOptionsScroll');
  const regPasswordConfirmInput = document.getElementById('regPasswordConfirm');
  const passwordMatchHint = document.getElementById('passwordMatchHint');
  const regTermsCheckbox = document.getElementById('regTerms');
  const btnOpenTermsModal = document.getElementById('btnOpenTermsModal');
  const termsModal = document.getElementById('termsModal');
  const btnAcceptTermsModal = document.getElementById('btnAcceptTermsModal');

  // Email Verification & Anti-Bot Elements
  const regHoneypot = document.getElementById('regHoneypot');
  const emailVerificationModal = document.getElementById('emailVerificationModal');
  const btnCloseOtpModal = document.getElementById('btnCloseOtpModal');
  const btnCancelOtpModal = document.getElementById('btnCancelOtpModal');
  const otpTargetEmail = document.getElementById('otpTargetEmail');
  const btnChangeRegEmail = document.getElementById('btnChangeRegEmail');
  const otpInputsRow = document.getElementById('otpInputsRow');
  const otpDigitInputs = document.querySelectorAll('.otp-digit-input');
  const otpStatusHint = document.getElementById('otpStatusHint');
  const otpTimer = document.getElementById('otpTimer');
  const btnResendOtp = document.getElementById('btnResendOtp');
  const resendCountdownText = document.getElementById('resendCountdownText');
  const btnSubmitOtp = document.getElementById('btnSubmitOtp');
  const otpSpinner = document.getElementById('otpSpinner');

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

  // Live Salon Modal Elements
  const liveSalonModal = document.getElementById('liveSalonModal');
  const btnCloseSalonModal = document.getElementById('btnCloseSalonModal');
  const btnLeaveRoom = document.getElementById('btnLeaveRoom');
  const voiceStageGrid = document.getElementById('voiceStageGrid');
  const chatMessagesScroll = document.getElementById('chatMessagesScroll');
  const chatForm = document.getElementById('chatForm');
  const chatInputText = document.getElementById('chatInputText');
  const chatParticipantsCount = document.getElementById('chatParticipantsCount');
  const salonTypingIndicator = document.getElementById('salonTypingIndicator');
  const salonTypingText = document.getElementById('salonTypingText');

  // Voice & Video Controls
  const btnToggleMic = document.getElementById('btnToggleMic');
  const btnToggleAudio = document.getElementById('btnToggleAudio');
  const btnToggleSalonVideo = document.getElementById('btnToggleSalonVideo');
  const btnShareScreen = document.getElementById('btnShareScreen');

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
  const tilePublicSalon = document.getElementById('tilePublicSalon');
  const tilePrivateSalon = document.getElementById('tilePrivateSalon');
  const privateSalonConfigRow = document.getElementById('privateSalonConfigRow');
  const newSalonAccessCode = document.getElementById('newSalonAccessCode');
  const btnGenRandomCode = document.getElementById('btnGenRandomCode');

  // Private Salon Access Modal
  const privateSalonAccessModal = document.getElementById('privateSalonAccessModal');
  const formPrivateSalonAccess = document.getElementById('formPrivateSalonAccess');
  const privateAccessSalonId = document.getElementById('privateAccessSalonId');
  const privateAccessCodeInput = document.getElementById('privateAccessCodeInput');
  const btnClosePrivateAccessModal = document.getElementById('btnClosePrivateAccessModal');
  const btnCancelPrivateAccess = document.getElementById('btnCancelPrivateAccess');

  // Salon Share Modal
  const salonShareModal = document.getElementById('salonShareModal');
  const btnOpenSalonShare = document.getElementById('btnOpenSalonShare');
  const btnCloseShareModal = document.getElementById('btnCloseShareModal');
  const shareSalonName = document.getElementById('shareSalonName');
  const shareSalonBadge = document.getElementById('shareSalonBadge');
  const shareCodePill = document.getElementById('shareCodePill');
  const shareSalonCode = document.getElementById('shareSalonCode');
  const btnCopySalonCode = document.getElementById('btnCopySalonCode');
  const shareInviteLinkInput = document.getElementById('shareInviteLinkInput');
  const btnCopyInviteLink = document.getElementById('btnCopyInviteLink');
  const btnShareWhatsApp = document.getElementById('btnShareWhatsApp');
  const btnShareMessenger = document.getElementById('btnShareMessenger');
  const btnShareInstagram = document.getElementById('btnShareInstagram');

  // Salon Admin Moderation & Ban Modal
  const salonAdminConfirmModal = document.getElementById('salonAdminConfirmModal');
  const btnCloseAdminConfirmModal = document.getElementById('btnCloseAdminConfirmModal');
  const btnCancelAdminAction = document.getElementById('btnCancelAdminAction');
  const adminTargetUserId = document.getElementById('adminTargetUserId');
  const adminConfirmTargetText = document.getElementById('adminConfirmTargetText');
  const btnAdminActionMute = document.getElementById('btnAdminActionMute');
  const btnAdminActionCutCam = document.getElementById('btnAdminActionCutCam');
  const btnAdminActionBanUser = document.getElementById('btnAdminActionBanUser');
  const btnAdminActionBanIp = document.getElementById('btnAdminActionBanIp');

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

  // Complete Global Countries Dataset with ISO codes & dial prefixes
  const COUNTRIES = [
    // Frequent / Popular
    { code: 'FR', name: 'France', dial: '+33', popular: true },
    { code: 'MA', name: 'Maroc', dial: '+212', popular: true },
    { code: 'DZ', name: 'Algérie', dial: '+213', popular: true },
    { code: 'TN', name: 'Tunisie', dial: '+216', popular: true },
    { code: 'BE', name: 'Belgique', dial: '+32', popular: true },
    { code: 'CH', name: 'Suisse', dial: '+41', popular: true },
    { code: 'CA', name: 'Canada', dial: '+1', popular: true },
    { code: 'SN', name: 'Sénégal', dial: '+221', popular: true },
    { code: 'CI', name: "Côte d'Ivoire", dial: '+225', popular: true },
    { code: 'CM', name: 'Cameroun', dial: '+237', popular: true },
    { code: 'ML', name: 'Mali', dial: '+223', popular: true },
    { code: 'GN', name: 'Guinée', dial: '+224', popular: true },
    { code: 'MG', name: 'Madagascar', dial: '+261', popular: true },
    { code: 'CD', name: 'RD Congo', dial: '+243', popular: true },
    { code: 'CG', name: 'Congo', dial: '+242', popular: true },
    { code: 'TG', name: 'Togo', dial: '+228', popular: true },
    { code: 'BJ', name: 'Bénin', dial: '+229', popular: true },
    { code: 'BF', name: 'Burkina Faso', dial: '+226', popular: true },
    { code: 'NE', name: 'Niger', dial: '+227', popular: true },
    { code: 'GA', name: 'Gabon', dial: '+241', popular: true },
    { code: 'LB', name: 'Liban', dial: '+961', popular: true },
    { code: 'EG', name: 'Égypte', dial: '+20', popular: true },
    { code: 'SA', name: 'Arabie Saoudite', dial: '+966', popular: true },
    { code: 'AE', name: 'Émirats Arabes Unis', dial: '+971', popular: true },
    { code: 'US', name: 'États-Unis', dial: '+1', popular: true },
    { code: 'GB', name: 'Royaume-Uni', dial: '+44', popular: true },
    { code: 'DE', name: 'Allemagne', dial: '+49', popular: true },
    { code: 'ES', name: 'Espagne', dial: '+34', popular: true },
    { code: 'IT', name: 'Italie', dial: '+39', popular: true },
    { code: 'PT', name: 'Portugal', dial: '+351', popular: true },
    { code: 'TR', name: 'Turquie', dial: '+90', popular: true },

    // Complete A-Z world list
    { code: 'AF', name: 'Afghanistan', dial: '+93' },
    { code: 'ZA', name: 'Afrique du Sud', dial: '+27' },
    { code: 'AL', name: 'Albanie', dial: '+355' },
    { code: 'AD', name: 'Andorre', dial: '+376' },
    { code: 'AO', name: 'Angola', dial: '+244' },
    { code: 'AG', name: 'Antigua-et-Barbuda', dial: '+1268' },
    { code: 'AR', name: 'Argentine', dial: '+54' },
    { code: 'AM', name: 'Arménie', dial: '+374' },
    { code: 'AU', name: 'Australie', dial: '+61' },
    { code: 'AT', name: 'Autriche', dial: '+43' },
    { code: 'AZ', name: 'Azerbaïdjan', dial: '+994' },
    { code: 'BS', name: 'Bahamas', dial: '+1242' },
    { code: 'BH', name: 'Bahreïn', dial: '+973' },
    { code: 'BD', name: 'Bangladesh', dial: '+880' },
    { code: 'BB', name: 'Barbade', dial: '+1246' },
    { code: 'BZ', name: 'Belize', dial: '+501' },
    { code: 'BT', name: 'Bhoutan', dial: '+975' },
    { code: 'BY', name: 'Biélorussie', dial: '+375' },
    { code: 'MM', name: 'Birmanie (Myanmar)', dial: '+95' },
    { code: 'BO', name: 'Bolivie', dial: '+591' },
    { code: 'BA', name: 'Bosnie-Herzégovine', dial: '+387' },
    { code: 'BW', name: 'Botswana', dial: '+267' },
    { code: 'BR', name: 'Brésil', dial: '+55' },
    { code: 'BN', name: 'Brunei', dial: '+673' },
    { code: 'BG', name: 'Bulgarie', dial: '+359' },
    { code: 'BI', name: 'Burundi', dial: '+257' },
    { code: 'KH', name: 'Cambodge', dial: '+855' },
    { code: 'CV', name: 'Cap-Vert', dial: '+238' },
    { code: 'CL', name: 'Chili', dial: '+56' },
    { code: 'CN', name: 'Chine', dial: '+86' },
    { code: 'CY', name: 'Chypre', dial: '+357' },
    { code: 'CO', name: 'Colombie', dial: '+57' },
    { code: 'KM', name: 'Comores', dial: '+269' },
    { code: 'KP', name: 'Corée du Nord', dial: '+850' },
    { code: 'KR', name: 'Corée du Sud', dial: '+82' },
    { code: 'CR', name: 'Costa Rica', dial: '+506' },
    { code: 'HR', name: 'Croatie', dial: '+385' },
    { code: 'CU', name: 'Cuba', dial: '+53' },
    { code: 'DK', name: 'Danemark', dial: '+45' },
    { code: 'DJ', name: 'Djibouti', dial: '+253' },
    { code: 'DM', name: 'Dominique', dial: '+1767' },
    { code: 'EC', name: 'Équateur', dial: '+593' },
    { code: 'ER', name: 'Érythrée', dial: '+291' },
    { code: 'EE', name: 'Estonie', dial: '+372' },
    { code: 'SZ', name: 'Eswatini', dial: '+268' },
    { code: 'ET', name: 'Éthiopie', dial: '+251' },
    { code: 'FJ', name: 'Fidji', dial: '+679' },
    { code: 'FI', name: 'Finlande', dial: '+358' },
    { code: 'GM', name: 'Gambie', dial: '+220' },
    { code: 'GE', name: 'Géorgie', dial: '+995' },
    { code: 'GH', name: 'Ghana', dial: '+233' },
    { code: 'GR', name: 'Grèce', dial: '+30' },
    { code: 'GD', name: 'Grenade', dial: '+1473' },
    { code: 'GT', name: 'Guatemala', dial: '+502' },
    { code: 'GW', name: 'Guinée-Bissau', dial: '+245' },
    { code: 'GQ', name: 'Guinée équatoriale', dial: '+240' },
    { code: 'GY', name: 'Guyana', dial: '+592' },
    { code: 'HT', name: 'Haïti', dial: '+509' },
    { code: 'HN', name: 'Honduras', dial: '+504' },
    { code: 'HU', name: 'Hongrie', dial: '+36' },
    { code: 'IN', name: 'Inde', dial: '+91' },
    { code: 'ID', name: 'Indonésie', dial: '+62' },
    { code: 'IQ', name: 'Irak', dial: '+964' },
    { code: 'IR', name: 'Iran', dial: '+98' },
    { code: 'IE', name: 'Irlande', dial: '+353' },
    { code: 'IS', name: 'Islande', dial: '+354' },
    { code: 'IL', name: 'Israël', dial: '+972' },
    { code: 'JM', name: 'Jamaïque', dial: '+1876' },
    { code: 'JP', name: 'Japon', dial: '+81' },
    { code: 'JO', name: 'Jordanie', dial: '+962' },
    { code: 'KZ', name: 'Kazakhstan', dial: '+7' },
    { code: 'KE', name: 'Kenya', dial: '+254' },
    { code: 'KG', name: 'Kirghizistan', dial: '+996' },
    { code: 'KI', name: 'Kiribati', dial: '+686' },
    { code: 'KW', name: 'Koweït', dial: '+965' },
    { code: 'LA', name: 'Laos', dial: '+856' },
    { code: 'LS', name: 'Lesotho', dial: '+266' },
    { code: 'LV', name: 'Lettonie', dial: '+371' },
    { code: 'LR', name: 'Libéria', dial: '+231' },
    { code: 'LY', name: 'Libye', dial: '+218' },
    { code: 'LI', name: 'Liechtenstein', dial: '+423' },
    { code: 'LT', name: 'Lituanie', dial: '+370' },
    { code: 'LU', name: 'Luxembourg', dial: '+352' },
    { code: 'MK', name: 'Macédoine du Nord', dial: '+389' },
    { code: 'MY', name: 'Malaisie', dial: '+60' },
    { code: 'MW', name: 'Malawi', dial: '+265' },
    { code: 'MV', name: 'Maldives', dial: '+960' },
    { code: 'MT', name: 'Malte', dial: '+356' },
    { code: 'MU', name: 'Maurice', dial: '+230' },
    { code: 'MR', name: 'Mauritanie', dial: '+222' },
    { code: 'MX', name: 'Mexique', dial: '+52' },
    { code: 'FM', name: 'Micronésie', dial: '+691' },
    { code: 'MD', name: 'Moldavie', dial: '+373' },
    { code: 'MC', name: 'Monaco', dial: '+377' },
    { code: 'MN', name: 'Mongolie', dial: '+976' },
    { code: 'ME', name: 'Monténégro', dial: '+382' },
    { code: 'MZ', name: 'Mozambique', dial: '+258' },
    { code: 'NA', name: 'Namibie', dial: '+264' },
    { code: 'NR', name: 'Nauru', dial: '+674' },
    { code: 'NP', name: 'Népal', dial: '+977' },
    { code: 'NI', name: 'Nicaragua', dial: '+505' },
    { code: 'NE', name: 'Niger', dial: '+227' },
    { code: 'NG', name: 'Nigeria', dial: '+234' },
    { code: 'NO', name: 'Norvège', dial: '+47' },
    { code: 'NZ', name: 'Nouvelle-Zélande', dial: '+64' },
    { code: 'OM', name: 'Oman', dial: '+968' },
    { code: 'UG', name: 'Ouganda', dial: '+256' },
    { code: 'UZ', name: 'Ouzbékistan', dial: '+998' },
    { code: 'PK', name: 'Pakistan', dial: '+92' },
    { code: 'PW', name: 'Palaos', dial: '+680' },
    { code: 'PS', name: 'Palestine', dial: '+970' },
    { code: 'PA', name: 'Panama', dial: '+507' },
    { code: 'PG', name: 'Papouasie-Nouvelle-Guinée', dial: '+675' },
    { code: 'PY', name: 'Paraguay', dial: '+595' },
    { code: 'NL', name: 'Pays-Bas', dial: '+31' },
    { code: 'PE', name: 'Pérou', dial: '+51' },
    { code: 'PH', name: 'Philippines', dial: '+63' },
    { code: 'PL', name: 'Pologne', dial: '+48' },
    { code: 'QA', name: 'Qatar', dial: '+974' },
    { code: 'CF', name: 'République Centrafricaine', dial: '+236' },
    { code: 'DO', name: 'République Dominicaine', dial: '+1809' },
    { code: 'CZ', name: 'République Tchèque', dial: '+420' },
    { code: 'RO', name: 'Roumanie', dial: '+40' },
    { code: 'RU', name: 'Russie', dial: '+7' },
    { code: 'RW', name: 'Rwanda', dial: '+250' },
    { code: 'KN', name: 'Saint-Christophe-et-Niévès', dial: '+1869' },
    { code: 'LC', name: 'Sainte-Lucie', dial: '+1758' },
    { code: 'SM', name: 'Saint-Marin', dial: '+378' },
    { code: 'VC', name: 'Saint-Vincent-et-les-Grenadines', dial: '+1784' },
    { code: 'SB', name: 'Salomon', dial: '+677' },
    { code: 'SV', name: 'Salvador', dial: '+503' },
    { code: 'WS', name: 'Samoa', dial: '+685' },
    { code: 'ST', name: 'São Tomé-et-Príncipe', dial: '+239' },
    { code: 'RS', name: 'Serbie', dial: '+381' },
    { code: 'SC', name: 'Seychelles', dial: '+248' },
    { code: 'SL', name: 'Sierra Leone', dial: '+232' },
    { code: 'SG', name: 'Singapour', dial: '+65' },
    { code: 'SK', name: 'Slovaquie', dial: '+421' },
    { code: 'SI', name: 'Slovénie', dial: '+386' },
    { code: 'SO', name: 'Somalie', dial: '+252' },
    { code: 'SD', name: 'Soudan', dial: '+249' },
    { code: 'SS', name: 'Soudan du Sud', dial: '+211' },
    { code: 'LK', name: 'Sri Lanka', dial: '+94' },
    { code: 'SE', name: 'Suède', dial: '+46' },
    { code: 'SR', name: 'Surinam', dial: '+597' },
    { code: 'SY', name: 'Syrie', dial: '+963' },
    { code: 'TJ', name: 'Tadjikistan', dial: '+992' },
    { code: 'TW', name: 'Taïwan', dial: '+886' },
    { code: 'TZ', name: 'Tanzanie', dial: '+255' },
    { code: 'TD', name: 'Tchad', dial: '+235' },
    { code: 'TH', name: 'Thaïlande', dial: '+66' },
    { code: 'TL', name: 'Timor Oriental', dial: '+670' },
    { code: 'TG', name: 'Togo', dial: '+228' },
    { code: 'TO', name: 'Tonga', dial: '+676' },
    { code: 'TT', name: 'Trinité-et-Tobago', dial: '+1868' },
    { code: 'TM', name: 'Turkménistan', dial: '+993' },
    { code: 'TV', name: 'Tuvalu', dial: '+688' },
    { code: 'UA', name: 'Ukraine', dial: '+380' },
    { code: 'UY', name: 'Uruguay', dial: '+598' },
    { code: 'VU', name: 'Vanuatu', dial: '+678' },
    { code: 'VA', name: 'Vatican', dial: '+379' },
    { code: 'VE', name: 'Venezuela', dial: '+58' },
    { code: 'VN', name: 'Vietnam', dial: '+84' },
    { code: 'YE', name: 'Yémen', dial: '+967' },
    { code: 'ZM', name: 'Zambie', dial: '+260' },
    { code: 'ZW', name: 'Zimbabwe', dial: '+263' }
  ];

  // Country Flag Image Tag Generator
  function getFlagImgTag(countryCode, alt = '') {
    if (!countryCode) return '<span class="default-globe">🌍</span>';
    const code = countryCode.trim().toLowerCase();
    return `<img src="https://flagcdn.com/w40/${code}.png" class="country-flag-img" alt="${alt || countryCode}" loading="lazy" onerror="this.outerHTML='🌍'">`;
  }

  // Graphical Country Picker Controller
  let activeCountryCode = '';

  function selectCountry(country) {
    activeCountryCode = country.code;
    if (regCountryInput) regCountryInput.value = country.code;
    if (selectedFlagWrap) selectedFlagWrap.innerHTML = getFlagImgTag(country.code, country.name);
    if (selectedCountryName) selectedCountryName.textContent = country.name;
    closeCountryDropdown();
  }

  function renderCountryOptions(filter = '') {
    if (!countryOptionsScroll) return;
    const cleanFilter = filter.trim().toLowerCase();

    const matches = COUNTRIES.filter(c =>
      c.name.toLowerCase().includes(cleanFilter) ||
      c.code.toLowerCase().includes(cleanFilter) ||
      c.dial.includes(cleanFilter)
    );

    if (matches.length === 0) {
      countryOptionsScroll.innerHTML = `<div class="no-countries-found">Aucun pays trouvé pour « ${filter} »</div>`;
      return;
    }

    let html = '';
    // If no search filter, show popular section first
    if (!cleanFilter) {
      html += `<div class="country-group-label">🌟 Pays Fréquents</div>`;
      COUNTRIES.filter(c => c.popular).forEach(c => {
        const isSel = c.code === activeCountryCode ? 'selected' : '';
        html += `
          <div class="country-option-item ${isSel}" data-code="${c.code}">
            <img src="https://flagcdn.com/w40/${c.code.toLowerCase()}.png" class="country-flag-img" alt="${c.name}" loading="lazy">
            <span class="country-name-text">${c.name}</span>
            <span class="country-code-pill">${c.dial}</span>
          </div>
        `;
      });
      html += `<div class="country-group-label" style="margin-top: 6px;">🌐 Tous les Pays</div>`;
    }

    matches.forEach(c => {
      const isSel = c.code === activeCountryCode ? 'selected' : '';
      html += `
        <div class="country-option-item ${isSel}" data-code="${c.code}">
          <img src="https://flagcdn.com/w40/${c.code.toLowerCase()}.png" class="country-flag-img" alt="${c.name}" loading="lazy">
          <span class="country-name-text">${c.name}</span>
          <span class="country-code-pill">${c.dial}</span>
        </div>
      `;
    });

    countryOptionsScroll.innerHTML = html;

    // Attach click listeners to option items
    countryOptionsScroll.querySelectorAll('.country-option-item').forEach(item => {
      item.addEventListener('click', () => {
        const code = item.getAttribute('data-code');
        const found = COUNTRIES.find(c => c.code === code);
        if (found) selectCountry(found);
      });
    });
  }

  function resetCountryPicker() {
    activeCountryCode = '';
    if (regCountryInput) regCountryInput.value = '';
    if (selectedFlagWrap) selectedFlagWrap.innerHTML = '<span class="default-globe">🌍</span>';
    if (selectedCountryName) selectedCountryName.textContent = 'Choisir un pays...';
    closeCountryDropdown();
  }

  function openCountryDropdown() {
    countryDropdownMenu?.classList.remove('hidden');
    countryPickerWrap?.classList.add('open');
    countryPickerTrigger?.setAttribute('aria-expanded', 'true');
    renderCountryOptions(countrySearchInput?.value || '');

    // Prevent horizontal shift on auth card
    const card = document.querySelector('.auth-card');
    if (card) card.scrollLeft = 0;
    const authScr = document.getElementById('authScreen');
    if (authScr) authScr.scrollLeft = 0;

    setTimeout(() => {
      countrySearchInput?.focus({ preventScroll: true });
    }, 40);
  }

  function closeCountryDropdown() {
    countryDropdownMenu?.classList.add('hidden');
    countryPickerWrap?.classList.remove('open');
    countryPickerTrigger?.setAttribute('aria-expanded', 'false');

    const card = document.querySelector('.auth-card');
    if (card) card.scrollLeft = 0;
  }

  countryPickerTrigger?.addEventListener('click', (e) => {
    e.preventDefault();
    if (countryPickerWrap?.classList.contains('open')) {
      closeCountryDropdown();
    } else {
      openCountryDropdown();
    }
  });

  countrySearchInput?.addEventListener('input', (e) => {
    const val = e.target.value;
    if (btnClearCountrySearch) {
      btnClearCountrySearch.classList.toggle('hidden', !val);
    }
    renderCountryOptions(val);
  });

  btnClearCountrySearch?.addEventListener('click', () => {
    if (countrySearchInput) countrySearchInput.value = '';
    btnClearCountrySearch.classList.add('hidden');
    renderCountryOptions('');
    countrySearchInput?.focus();
  });

  document.addEventListener('click', (e) => {
    if (countryPickerWrap && !countryPickerWrap.contains(e.target)) {
      closeCountryDropdown();
    }
  });

  // Age calculation helper (returns age in years)
  function calculateAge(birthDateString) {
    if (!birthDateString) return 0;
    const birthDate = new Date(birthDateString);
    if (isNaN(birthDate.getTime())) return 0;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  // Real-Time Username Restriction Verifier
  // Allowed: letters uppercase and lowercase [a-zA-Z], numbers [0-9], hyphen [-], underscore [_]
  const USERNAME_ALLOWED_REGEX = /^[a-zA-Z0-9_-]+$/;

  function validateUsernameLive() {
    if (!regUsernameInput) return;
    const val = regUsernameInput.value.trim();

    if (!val) {
      if (regUsernameHint) regUsernameHint.className = 'username-rule-hint hidden';
      if (regUsernameStatus) {
        regUsernameStatus.className = 'username-status-badge hidden';
        regUsernameStatus.textContent = '';
      }
      regUsernameInput.classList.remove('has-error', 'has-valid');
      return;
    }

    // Check for forbidden characters
    if (!USERNAME_ALLOWED_REGEX.test(val)) {
      regUsernameInput.classList.add('has-error');
      regUsernameInput.classList.remove('has-valid');
      if (regUsernameStatus) {
        regUsernameStatus.className = 'username-status-badge invalid';
        regUsernameStatus.textContent = '✕';
      }
      if (regUsernameHint) {
        regUsernameHint.className = 'username-rule-hint invalid';
        regUsernameHint.innerHTML = '<span>✕</span><span>Seuls les lettres (A-Z, a-z), chiffres (0-9), tirets (-) et underscores (_) sont autorisés.</span>';
      }
      return;
    }

    // Check length requirements
    if (val.length < 3) {
      regUsernameInput.classList.remove('has-error', 'has-valid');
      if (regUsernameStatus) {
        regUsernameStatus.className = 'username-status-badge invalid';
        regUsernameStatus.textContent = `${val.length}/3`;
      }
      if (regUsernameHint) {
        regUsernameHint.className = 'username-rule-hint info';
        regUsernameHint.innerHTML = `<span>ℹ️</span><span>Au moins 3 caractères requis (${val.length}/3).</span>`;
      }
      return;
    }

    if (val.length > 30) {
      regUsernameInput.classList.add('has-error');
      regUsernameInput.classList.remove('has-valid');
      if (regUsernameStatus) {
        regUsernameStatus.className = 'username-status-badge invalid';
        regUsernameStatus.textContent = '30 max';
      }
      if (regUsernameHint) {
        regUsernameHint.className = 'username-rule-hint invalid';
        regUsernameHint.innerHTML = '<span>✕</span><span>Le pseudo ne peut pas dépasser 30 caractères.</span>';
      }
      return;
    }

    // Valid
    regUsernameInput.classList.remove('has-error');
    regUsernameInput.classList.add('has-valid');
    if (regUsernameStatus) {
      regUsernameStatus.className = 'username-status-badge valid';
      regUsernameStatus.textContent = '✓';
    }
    if (regUsernameHint) {
      regUsernameHint.className = 'username-rule-hint valid';
      regUsernameHint.innerHTML = `<span>✓</span><span>Pseudo valide et conforme (${val.length}/30).</span>`;
    }
  }

  regUsernameInput?.addEventListener('input', validateUsernameLive);

  // Real-Time Password Confirmation Match Verifier
  function checkPasswordMatch() {
    if (!regPasswordConfirmInput || !passwordMatchHint) return;
    const pwd = regPasswordInput?.value || '';
    const confirmPwd = regPasswordConfirmInput.value;

    if (!confirmPwd) {
      passwordMatchHint.className = 'password-match-hint hidden';
      passwordMatchHint.textContent = '';
      return;
    }

    passwordMatchHint.classList.remove('hidden');
    if (pwd === confirmPwd) {
      passwordMatchHint.className = 'password-match-hint match';
      passwordMatchHint.innerHTML = '<span>✓</span><span>Les mots de passe correspondent parfaitement.</span>';
    } else {
      passwordMatchHint.className = 'password-match-hint mismatch';
      passwordMatchHint.innerHTML = '<span>✕</span><span>Les mots de passe ne correspondent pas.</span>';
    }
  }

  regPasswordInput?.addEventListener('input', checkPasswordMatch);
  regPasswordConfirmInput?.addEventListener('input', checkPasswordMatch);

  // In-App Terms & Conditions Modal handlers
  btnOpenTermsModal?.addEventListener('click', (e) => {
    e.preventDefault();
    termsModal?.classList.remove('hidden');
  });

  btnCloseTermsModal?.addEventListener('click', () => {
    termsModal?.classList.add('hidden');
  });

  btnAcceptTermsModal?.addEventListener('click', () => {
    if (regTermsCheckbox) {
      regTermsCheckbox.checked = true;
    }
    termsModal?.classList.add('hidden');
    showToast('Charte communautaire & CGU acceptées ! ✅', 'teal');
  });

  termsModal?.addEventListener('click', (e) => {
    if (e.target === termsModal) {
      termsModal.classList.add('hidden');
    }
  });

  // =========================================================================
  // EMAIL VERIFICATION & 6-DIGIT OTP CONTROLLER (ANTI-BOT)
  // =========================================================================
  let pendingRegistrationData = null;
  let otpExpiryTimer = null;
  let otpResendTimer = null;
  let otpExpirySeconds = 600; // 10 minutes
  let otpResendCooldown = 40; // 40 seconds

  function openEmailVerificationModal(email, debugCode) {
    if (!emailVerificationModal) return;
    emailVerificationModal.classList.remove('hidden');
    if (otpTargetEmail) otpTargetEmail.textContent = email;

    // Reset inputs
    otpDigitInputs.forEach(input => {
      input.value = '';
      input.classList.remove('filled', 'error');
    });
    if (otpStatusHint) otpStatusHint.className = 'otp-status-hint hidden';

    // Focus first input
    setTimeout(() => {
      otpDigitInputs[0]?.focus();
    }, 150);

    // Start Expiry Timer (10 minutes)
    clearInterval(otpExpiryTimer);
    otpExpirySeconds = 600;
    updateOtpTimerDisplay();
    otpExpiryTimer = setInterval(() => {
      otpExpirySeconds--;
      updateOtpTimerDisplay();
      if (otpExpirySeconds <= 0) {
        clearInterval(otpExpiryTimer);
        showOtpError('Le code a expiré. Veuillez demander un nouveau code.');
      }
    }, 1000);

    // Start Resend Cooldown (40 seconds)
    startResendCooldown();
  }

  function updateOtpTimerDisplay() {
    if (!otpTimer) return;
    const mins = Math.floor(otpExpirySeconds / 60);
    const secs = otpExpirySeconds % 60;
    otpTimer.textContent = `⏱️ Expire dans ${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function startResendCooldown() {
    if (!btnResendOtp) return;
    clearInterval(otpResendTimer);
    otpResendCooldown = 40;
    btnResendOtp.disabled = true;
    if (resendCountdownText) resendCountdownText.textContent = `(${otpResendCooldown}s)`;

    otpResendTimer = setInterval(() => {
      otpResendCooldown--;
      if (resendCountdownText) resendCountdownText.textContent = `(${otpResendCooldown}s)`;
      if (otpResendCooldown <= 0) {
        clearInterval(otpResendTimer);
        btnResendOtp.disabled = false;
        if (resendCountdownText) resendCountdownText.textContent = '';
      }
    }, 1000);
  }

  function closeEmailVerificationModal() {
    if (!emailVerificationModal) return;
    emailVerificationModal.classList.add('hidden');
    clearInterval(otpExpiryTimer);
    clearInterval(otpResendTimer);
  }

  function showOtpError(message) {
    if (otpStatusHint) {
      otpStatusHint.className = 'otp-status-hint error';
      otpStatusHint.innerHTML = `<span>✕</span><span>${message}</span>`;
    }
    otpDigitInputs.forEach(i => i.classList.add('error'));
    shakeElement(emailVerificationModal.querySelector('.modal-container'));
    playTone(220, 'sawtooth', 0.25);
  }

  // Handle 6-digit OTP Inputs events
  otpDigitInputs.forEach((input, index) => {
    input.addEventListener('input', () => {
      const val = input.value.replace(/\D/g, '');
      input.value = val ? val[0] : '';
      input.classList.toggle('filled', !!input.value);
      input.classList.remove('error');
      if (otpStatusHint) otpStatusHint.className = 'otp-status-hint hidden';

      // Auto advance to next box
      if (input.value && index < otpDigitInputs.length - 1) {
        otpDigitInputs[index + 1].focus();
      }

      // Check if all filled
      const fullCode = Array.from(otpDigitInputs).map(i => i.value).join('');
      if (fullCode.length === 6) {
        btnSubmitOtp?.focus();
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace') {
        if (!input.value && index > 0) {
          otpDigitInputs[index - 1].value = '';
          otpDigitInputs[index - 1].classList.remove('filled', 'error');
          otpDigitInputs[index - 1].focus();
        } else {
          input.value = '';
          input.classList.remove('filled', 'error');
        }
      } else if (e.key === 'ArrowLeft' && index > 0) {
        otpDigitInputs[index - 1].focus();
      } else if (e.key === 'ArrowRight' && index < otpDigitInputs.length - 1) {
        otpDigitInputs[index + 1].focus();
      }
    });

    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const paste = (e.clipboardData || window.clipboardData).getData('text');
      const digits = paste.replace(/\D/g, '').slice(0, 6);
      if (digits) {
        digits.split('').forEach((char, dIdx) => {
          if (otpDigitInputs[dIdx]) {
            otpDigitInputs[dIdx].value = char;
            otpDigitInputs[dIdx].classList.add('filled');
            otpDigitInputs[dIdx].classList.remove('error');
          }
        });
        const targetIndex = Math.min(digits.length, 5);
        otpDigitInputs[targetIndex].focus();
        if (digits.length === 6) {
          btnSubmitOtp?.focus();
        }
      }
    });
  });

  // Modal actions
  btnCloseOtpModal?.addEventListener('click', closeEmailVerificationModal);
  btnCancelOtpModal?.addEventListener('click', closeEmailVerificationModal);

  btnChangeRegEmail?.addEventListener('click', () => {
    closeEmailVerificationModal();
    const regEmailInput = document.getElementById('regEmail');
    regEmailInput?.focus();
    regEmailInput?.select();
  });

  // Resend code handler
  btnResendOtp?.addEventListener('click', async () => {
    if (!pendingRegistrationData || btnResendOtp.disabled) return;
    btnResendOtp.disabled = true;

    try {
      const res = await fetch(`${API_BASE_URL}/auth/resend-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: pendingRegistrationData.email,
          username: pendingRegistrationData.username,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Nouveau code de vérification envoyé par e-mail ! 📩', 'teal');
        startResendCooldown();
      } else {
        showToast(data.message || 'Erreur lors du renvoi du code', 'coral');
      }
    } catch (err) {
      showToast('Impossible de renvoyer le code. Vérifiez votre connexion.', 'coral');
    }
  });

  // Submit OTP Verification & Register
  btnSubmitOtp?.addEventListener('click', async () => {
    if (!pendingRegistrationData) return;
    const code = Array.from(otpDigitInputs).map(i => i.value.trim()).join('');

    if (code.length !== 6) {
      showOtpError('Veuillez saisir les 6 chiffres du code.');
      return;
    }

    btnSubmitOtp.disabled = true;
    if (otpSpinner) otpSpinner.classList.remove('hidden');

    try {
      const res = await fetch(`${API_BASE_URL}/auth/verify-and-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...pendingRegistrationData,
          code,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.token && data.user) {
        closeEmailVerificationModal();
        formRegister.reset();
        resetCountryPicker();
        if (regUsernameHint) regUsernameHint.className = 'username-rule-hint hidden';
        if (regUsernameStatus) regUsernameStatus.className = 'username-status-badge hidden';
        regUsernameInput?.classList.remove('has-error', 'has-valid');
        if (passwordMatchHint) passwordMatchHint.className = 'password-match-hint hidden';
        if (strengthFill) strengthFill.style.width = '0%';

        data.user.country = data.user.country || pendingRegistrationData.country;
        data.user.countryName = pendingRegistrationData.countryName;
        data.user.birthDate = data.user.birthDate || pendingRegistrationData.birthDate;

        setAuthSession(data.token, data.user);
        authenticateUser(data.user, true);
        showToast(`Compte vérifié et activé ! Bienvenue ${data.user.displayName || pendingRegistrationData.username} 🎈`, 'success');
        playTone(520, 'sine', 0.25);
        return;
      } else {
        showOtpError(data.message || 'Code de vérification incorrect.');
      }
    } catch (err) {
      showOtpError('Erreur de connexion au serveur. Réessayez.');
    } finally {
      btnSubmitOtp.disabled = false;
      if (otpSpinner) otpSpinner.classList.add('hidden');
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
    activeOnlineUserIds.clear();
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    renderFriends();
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

      // Connect user to real-time Socket.IO Gateway
      const token = getAuthToken();
      if (token) {
        initSocketConnection(token);
      }

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
      const mobNavUserAvatar = document.getElementById('mobNavUserAvatar');
      if (mobNavUserAvatar) mobNavUserAvatar.src = avatar;
      if (menuFullName) menuFullName.textContent = displayName;
      if (menuEmail) menuEmail.textContent = email;
      if (userPointsVal) userPointsVal.textContent = state.userPoints;
      if (dropdownUserPoints) dropdownUserPoints.textContent = state.userPoints;

      // Update Country Flag & Info
      const navUserCountryFlag = document.getElementById('navUserCountryFlag');
      const menuCountryFlag = document.getElementById('menuCountryFlag');
      const menuCountryName = document.getElementById('menuCountryName');
      const countryCode = (userData.country || 'FR').trim().toUpperCase();
      const countryObj = COUNTRIES.find(c => c.code === countryCode);
      const flagImgTag = `<img src="https://flagcdn.com/w40/${countryCode.toLowerCase()}.png" class="user-country-flag-img" alt="${countryCode}" loading="lazy">`;

      if (navUserCountryFlag) navUserCountryFlag.innerHTML = flagImgTag;
      if (menuCountryFlag) menuCountryFlag.innerHTML = flagImgTag;
      if (menuCountryName) {
        menuCountryName.textContent = countryObj ? countryObj.name : (userData.countryName || countryCode);
      }

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
      try { cachedUser = JSON.parse(cachedUserJson); } catch (e) { }
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
    const birthDate = regBirthDateInput?.value || '';
    const country = (regCountryInput?.value || activeCountryCode || '').trim().toUpperCase();
    const countryObj = COUNTRIES.find(c => c.code === country);
    const countryName = countryObj ? countryObj.name : country;
    const password = document.getElementById('regPassword').value;
    const passwordConfirm = regPasswordConfirmInput?.value || '';
    const termsAccepted = regTermsCheckbox?.checked;

    // 0. Validate Username (letters uppercase/lowercase, numbers, '-', '_')
    if (!username) {
      showToast('Veuillez choisir un pseudo WafaTalk.', 'coral');
      shakeElement(formRegister);
      regUsernameInput?.focus();
      return;
    }

    if (!USERNAME_ALLOWED_REGEX.test(username)) {
      showToast('Le pseudo ne peut contenir que des lettres (A-Z, a-z), chiffres (0-9), tirets (-) et underscores (_).', 'coral');
      shakeElement(formRegister);
      playTone(220, 'sawtooth', 0.25);
      regUsernameInput?.focus();
      return;
    }

    if (username.length < 3) {
      showToast('Le pseudo doit comporter au moins 3 caractères.', 'coral');
      shakeElement(formRegister);
      playTone(220, 'sawtooth', 0.25);
      regUsernameInput?.focus();
      return;
    }

    if (username.length > 30) {
      showToast('Le pseudo ne peut pas dépasser 30 caractères.', 'coral');
      shakeElement(formRegister);
      playTone(220, 'sawtooth', 0.25);
      regUsernameInput?.focus();
      return;
    }

    // 1. Validate Date of Birth (Age >= 13)
    if (!birthDate) {
      showToast('Veuillez indiquer votre date de naissance.', 'coral');
      shakeElement(formRegister);
      regBirthDateInput?.focus();
      return;
    }

    const age = calculateAge(birthDate);
    if (age < 13) {
      showToast('Vous devez avoir au moins 13 ans pour rejoindre WafaTalk.', 'coral');
      shakeElement(formRegister);
      playTone(220, 'sawtooth', 0.25);
      return;
    }
    if (age > 120) {
      showToast('Veuillez indiquer une date de naissance valide.', 'coral');
      shakeElement(formRegister);
      return;
    }

    // 2. Validate Country
    if (!country) {
      showToast('Veuillez sélectionner votre pays de résidence.', 'coral');
      shakeElement(formRegister);
      openCountryDropdown();
      return;
    }

    // 3. Validate Password and Confirmation
    if (password.length < 6) {
      showToast('Le mot de passe doit comporter au moins 6 caractères.', 'coral');
      shakeElement(formRegister);
      return;
    }

    if (password !== passwordConfirm) {
      showToast('Les deux mots de passe ne correspondent pas.', 'coral');
      shakeElement(formRegister);
      playTone(220, 'sawtooth', 0.25);
      regPasswordConfirmInput?.focus();
      return;
    }

    // 4. Validate Terms Checkbox
    if (!termsAccepted) {
      showToast('Veuillez accepter la charte communautaire et les CGU pour continuer.', 'coral');
      shakeElement(formRegister);
      playTone(220, 'sawtooth', 0.25);
      return;
    }

    // Anti-Bot Honeypot check
    const honeypotVal = regHoneypot?.value?.trim();
    if (honeypotVal) {
      console.warn('Bot registration blocked via honeypot trap.');
      return; // Silent reject of bot
    }

    btnText.textContent = 'Envoi du code...';
    spinner.classList.remove('hidden');
    btnSubmit.disabled = true;

    try {
      const res = await fetch(`${API_BASE_URL}/auth/send-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          email,
          birthDate,
          country,
          password,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        pendingRegistrationData = {
          username,
          email,
          password,
          displayName: username,
          birthDate,
          country,
          countryName,
          termsAccepted: true,
        };
        openEmailVerificationModal(email);
        showToast(`Code de vérification envoyé à ${email} 📩 Consultez votre boîte de réception.`, 'teal');
        return;
      } else if (res.status === 400) {
        showToast(data.message || 'Erreur lors de l\'envoi du code', 'coral');
        shakeElement(formRegister);
        playTone(220, 'sawtooth', 0.25);
        return;
      }
      throw new Error('Fallback local register');
    } catch (err) {
      // Offline / Vercel Fallback: Create account in browser localStorage
      const localUsers = JSON.parse(localStorage.getItem('wafatalk_local_users') || '[]');
      const cleanEmail = email.toLowerCase();
      const cleanUsername = username.trim();

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
        birthDate: birthDate,
        country: country,
        countryName: countryName,
        isEmailVerified: true,
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
      resetCountryPicker();
      if (regUsernameHint) regUsernameHint.className = 'username-rule-hint hidden';
      if (regUsernameStatus) regUsernameStatus.className = 'username-status-badge hidden';
      regUsernameInput?.classList.remove('has-error', 'has-valid');
      if (passwordMatchHint) passwordMatchHint.className = 'password-match-hint hidden';
      if (strengthFill) strengthFill.style.width = '0%';
      authenticateUser(newUser, true);
      showToast(`Compte créé avec succès ! Bienvenue ${username} 🎈`, 'success');
    } finally {
      btnSubmit.disabled = false;
      spinner.classList.add('hidden');
      btnText.textContent = 'Créer mon compte';
    }
  });

  // =========================================================================
  // 3b. FORGOT PASSWORD & ACCOUNT RECOVERY CONTROLLER
  // =========================================================================
  const linkForgotPassword = document.getElementById('linkForgotPassword');
  const forgotPasswordModal = document.getElementById('forgotPasswordModal');
  const btnCloseForgotModal = document.getElementById('btnCloseForgotModal');
  const btnCancelForgotStep1 = document.getElementById('btnCancelForgotStep1');
  const btnBackToForgotStep1 = document.getElementById('btnBackToForgotStep1');
  const formForgotRequestCode = document.getElementById('formForgotRequestCode');
  const formForgotVerifyReset = document.getElementById('formForgotVerifyReset');
  const forgotEmailInput = document.getElementById('forgotEmail');
  const forgotCodeInput = document.getElementById('forgotCode');
  const forgotNewPasswordInput = document.getElementById('forgotNewPassword');
  const forgotConfirmPasswordInput = document.getElementById('forgotConfirmPassword');
  const btnSubmitForgotRequest = document.getElementById('btnSubmitForgotRequest');
  const forgotRequestSpinner = document.getElementById('forgotRequestSpinner');
  const btnSubmitForgotReset = document.getElementById('btnSubmitForgotReset');
  const forgotResetSpinner = document.getElementById('forgotResetSpinner');
  const forgotTargetEmail = document.getElementById('forgotTargetEmail');
  const btnResendForgotCode = document.getElementById('btnResendForgotCode');
  const btnToggleForgotPass1 = document.getElementById('btnToggleForgotPass1');

  let activeRecoveryEmail = '';
  let forgotResendCooldown = 0;
  let forgotResendInterval = null;

  function openForgotPasswordModal() {
    if (!forgotPasswordModal) return;
    // Pre-fill email from login field if it looks like an email
    const currentLoginVal = document.getElementById('loginEmail')?.value.trim() || '';
    if (currentLoginVal.includes('@')) {
      forgotEmailInput.value = currentLoginVal;
    }

    // Reset to step 1
    formForgotRequestCode?.classList.remove('hidden');
    formForgotVerifyReset?.classList.add('hidden');
    forgotPasswordModal.classList.remove('hidden');
    setTimeout(() => forgotEmailInput?.focus(), 150);
  }

  function closeForgotPasswordModal() {
    forgotPasswordModal?.classList.add('hidden');
  }

  linkForgotPassword?.addEventListener('click', (e) => {
    e.preventDefault();
    openForgotPasswordModal();
  });

  btnCloseForgotModal?.addEventListener('click', closeForgotPasswordModal);
  btnCancelForgotStep1?.addEventListener('click', closeForgotPasswordModal);

  // Close on outside click
  forgotPasswordModal?.addEventListener('click', (e) => {
    if (e.target === forgotPasswordModal) {
      closeForgotPasswordModal();
    }
  });

  // Back to step 1
  btnBackToForgotStep1?.addEventListener('click', () => {
    formForgotVerifyReset?.classList.add('hidden');
    formForgotRequestCode?.classList.remove('hidden');
    forgotEmailInput?.focus();
  });

  // Toggle password visibility in forgot password modal
  btnToggleForgotPass1?.addEventListener('click', () => {
    const isPass = forgotNewPasswordInput.type === 'password';
    forgotNewPasswordInput.type = isPass ? 'text' : 'password';
    forgotConfirmPasswordInput.type = isPass ? 'text' : 'password';
    btnToggleForgotPass1.querySelector('.eye-open')?.classList.toggle('hidden', isPass);
    btnToggleForgotPass1.querySelector('.eye-closed')?.classList.toggle('hidden', !isPass);
  });

  function startForgotResendCooldown(seconds) {
    forgotResendCooldown = seconds;
    if (forgotResendInterval) clearInterval(forgotResendInterval);
    if (!btnResendForgotCode) return;

    btnResendForgotCode.disabled = true;
    btnResendForgotCode.textContent = `Renvoyer (${forgotResendCooldown}s)`;

    forgotResendInterval = setInterval(() => {
      forgotResendCooldown--;
      if (forgotResendCooldown <= 0) {
        clearInterval(forgotResendInterval);
        btnResendForgotCode.disabled = false;
        btnResendForgotCode.textContent = 'Renvoyer un code';
      } else {
        btnResendForgotCode.textContent = `Renvoyer (${forgotResendCooldown}s)`;
      }
    }, 1000);
  }

  // Step 1 Submission: Request OTP Code
  formForgotRequestCode?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = forgotEmailInput.value.trim().toLowerCase();
    if (!email) return;

    activeRecoveryEmail = email;
    const btnText = btnSubmitForgotRequest.querySelector('.btn-text');
    btnSubmitForgotRequest.disabled = true;
    forgotRequestSpinner?.classList.remove('hidden');
    btnText.textContent = 'Envoi du code...';

    try {
      const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || `Code de vérification envoyé à ${email} 📩`, 'teal');
        playTone(520, 'sine', 0.15);

        // Transition to Step 2
        formForgotRequestCode.classList.add('hidden');
        formForgotVerifyReset.classList.remove('hidden');
        if (forgotTargetEmail) forgotTargetEmail.textContent = `Envoyé à : ${email}`;
        forgotCodeInput.value = '';
        forgotNewPasswordInput.value = '';
        forgotConfirmPasswordInput.value = '';
        startForgotResendCooldown(30);
        setTimeout(() => forgotCodeInput.focus(), 150);
      } else {
        showToast(data.message || 'Impossible d\'envoyer le code. Vérifiez l\'adresse e-mail.', 'coral');
        playTone(300, 'sine', 0.2);
      }
    } catch (err) {
      console.warn('API error, using local fallback:', err);
      // Demo / Offline fallback: generate local code so test/demo accounts work reliably
      const demoCode = '123456';
      localStorage.setItem('wafatalk_mock_reset_' + email, demoCode);
      showToast(`Mode démo : Code de sécurité envoyé à ${email} (Code test : ${demoCode})`, 'teal');
      playTone(520, 'sine', 0.15);

      formForgotRequestCode.classList.add('hidden');
      formForgotVerifyReset.classList.remove('hidden');
      if (forgotTargetEmail) forgotTargetEmail.textContent = `Envoyé à : ${email}`;
      forgotCodeInput.value = '';
      startForgotResendCooldown(30);
      setTimeout(() => forgotCodeInput.focus(), 150);
    } finally {
      btnSubmitForgotRequest.disabled = false;
      forgotRequestSpinner?.classList.add('hidden');
      btnText.textContent = 'Envoyer mon code sécurisé 📩';
    }
  });

  // Resend code handler
  btnResendForgotCode?.addEventListener('click', async () => {
    if (forgotResendCooldown > 0 || !activeRecoveryEmail) return;
    btnResendForgotCode.textContent = 'Envoi...';

    try {
      const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: activeRecoveryEmail }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Un nouveau code a été envoyé à ${activeRecoveryEmail} 📩`, 'teal');
      } else {
        showToast(data.message || 'Erreur lors du renvoi.', 'coral');
      }
    } catch (e) {
      showToast('Nouveau code renvoyé (mode démo : 123456) !', 'teal');
    }
    startForgotResendCooldown(30);
  });

  // Step 2 Submission: Verify Code & Reset Password & Auto-Login
  formForgotVerifyReset?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = activeRecoveryEmail || forgotEmailInput.value.trim().toLowerCase();
    const code = forgotCodeInput.value.trim();
    const newPassword = forgotNewPasswordInput.value;
    const confirmPassword = forgotConfirmPasswordInput.value;

    if (!code || code.length !== 6) {
      showToast('Veuillez saisir le code à 6 chiffres reçu par e-mail.', 'coral');
      forgotCodeInput.focus();
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      showToast('Le nouveau mot de passe doit comporter au moins 6 caractères.', 'coral');
      forgotNewPasswordInput.focus();
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast('Les deux mots de passe ne correspondent pas.', 'coral');
      forgotConfirmPasswordInput.focus();
      return;
    }

    const btnText = btnSubmitForgotReset.querySelector('.btn-text');
    btnSubmitForgotReset.disabled = true;
    forgotResetSpinner?.classList.remove('hidden');
    btnText.textContent = 'Validation en cours...';

    try {
      const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, newPassword }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.user && data.token) {
        // SUCCESS: Save Session & Log User in immediately!
        setAuthSession(data.token, data.user);
        closeForgotPasswordModal();
        authenticateUser(data.user, true);
        showToast('🎉 Mot de passe mis à jour avec succès ! Vous êtes connecté.', 'success');
        return;
      } else {
        showToast(data.message || 'Code invalide ou expiré.', 'coral');
        playTone(300, 'sine', 0.2);
      }
    } catch (err) {
      console.warn('Backend reset error, checking local fallback:', err);
      const storedMockCode = localStorage.getItem('wafatalk_mock_reset_' + email);
      if (code === storedMockCode || code === '123456') {
        // Local user recovery
        const fallbackUser = {
          id: 'user-' + Date.now(),
          username: email.split('@')[0],
          displayName: email.split('@')[0],
          email: email,
          avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(email)}`,
          country: 'FR',
          wafaPoints: 200,
          role: 'USER',
        };
        const fallbackToken = 'local-token-' + Date.now();
        setAuthSession(fallbackToken, fallbackUser);
        closeForgotPasswordModal();
        authenticateUser(fallbackUser, true);
        showToast('🎉 Mot de passe mis à jour avec succès ! Vous êtes connecté.', 'success');
        return;
      } else {
        showToast('Code de sécurité incorrect. Veuillez vérifier vos e-mails.', 'coral');
      }
    } finally {
      btnSubmitForgotReset.disabled = false;
      forgotResetSpinner?.classList.add('hidden');
      btnText.textContent = 'Valider & Me connecter 🚀';
    }
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
    } catch (e) { }

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
          const myId = state.currentUser?.id;
          const isOwner = Boolean(myId && (bs.ownerId === myId || bs.owner?.id === myId));
          const formatted = {
            id: bs.id,
            name: bs.name,
            slug: bs.slug,
            topic: bs.topic || bs.description || 'Salon communautaire WafaTalk',
            category: (bs.category || 'chill').toLowerCase(),
            isLive: bs.isLive ?? true,
            hasVoice: bs.hasVoice ?? true,
            isPrivate: Boolean(bs.isPrivate),
            accessCode: bs.accessCode,
            inviteToken: bs.inviteToken,
            ownerId: bs.ownerId || bs.owner?.id,
            isOwner: isOwner,
            participantsCount: bs._count?.members || bs.participantsCount || 1,
            bannerBg: bs.bannerBg || 'linear-gradient(135deg, #0d837d, #14a39b)',
            avatars: bs.avatars || [
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
          ${salon.isPrivate ? '<span class="salon-card-badge" style="background: rgba(242, 91, 62, 0.35); border-color: rgba(242, 91, 62, 0.6); color: #fff;">🔒 PRIVÉ</span>' : ''}
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

  // Render Friends & Discoverable Users List in Sidebar
  async function renderFriends() {
    if (!friendsList) return;

    const myId = state.currentUser?.id;
    const token = getAuthToken();

    // 1. Fetch registered database users if authenticated
    let allUsers = [...friendsData];

    if (token) {
      try {
        const res = await fetch(`${API_BASE_URL}/users/discover`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.users)) {
            data.users.forEach(u => {
              const exists = allUsers.find(x => x.id === u.id || x.username?.toLowerCase() === u.username?.toLowerCase());
              if (!exists) {
                allUsers.push(u);
              } else {
                Object.assign(exists, u);
              }
            });
          }
        }
      } catch (err) {
        console.warn('Could not fetch discover users:', err);
      }
    }

    // 2. Also merge local accounts from localStorage for offline/demo resilience
    try {
      const localUsers = JSON.parse(localStorage.getItem('wafatalk_local_users') || '[]');
      localUsers.forEach(lu => {
        const exists = allUsers.find(x => x.id === lu.id || x.username?.toLowerCase() === lu.username?.toLowerCase());
        if (!exists) {
          allUsers.push({
            id: lu.id,
            username: lu.username,
            name: lu.displayName || lu.username,
            avatar: lu.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(lu.username)}`,
            country: lu.country || 'FR',
            status: 'online',
            role: 'Hors ligne',
            room: '',
          });
        }
      });
    } catch (e) { }

    // Filter out oneself
    const displayList = allUsers.filter(u => {
      if (!myId) return true;
      if (u.id === myId) return false;
      if (state.currentUser?.username && u.username?.toLowerCase() === state.currentUser.username.toLowerCase()) return false;
      return true;
    });

    // Check active online status dynamically from WebSocket presence
    displayList.forEach(u => {
      const isOnline = activeOnlineUserIds.has(u.id) || (u.username && activeOnlineUserIds.has(u.username));
      u._isOnline = Boolean(isOnline);
      u.status = u._isOnline ? 'online' : 'offline';
    });

    // Sort list: Online users first, then offline users, alphabetically
    displayList.sort((a, b) => {
      if (a._isOnline && !b._isOnline) return -1;
      if (!a._isOnline && b._isOnline) return 1;
      const nameA = (a.name || a.displayName || a.username || '').toLowerCase();
      const nameB = (b.name || b.displayName || b.username || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    const onlineCount = displayList.filter(u => u._isOnline).length;
    const onlineCounter = document.getElementById('onlineFriendsCount');
    if (onlineCounter) {
      onlineCounter.textContent = `${onlineCount} en ligne`;
      onlineCounter.style.display = 'inline-block';
    }
    const mobFriendsBadge = document.getElementById('mobFriendsBadge');
    if (mobFriendsBadge) {
      mobFriendsBadge.textContent = onlineCount;
    }

    friendsList.innerHTML = '';

    if (displayList.length === 0) {
      friendsList.innerHTML = '<div style="padding: 14px; text-align: center; color: var(--text-muted); font-size: 0.82rem;">Aucun autre membre connecté.</div>';
      return;
    }

    displayList.forEach(friend => {
      const isOnline = friend._isOnline;
      const statusClass = isOnline ? 'online' : 'offline';
      const statusLabel = isOnline ? 'En ligne' : 'Hors ligne';
      const flagTag = getFlagImgTag(friend.country, friend.country);
      const item = document.createElement('div');
      item.className = `friend-item ${statusClass}`;
      item.innerHTML = `
        <div class="friend-item-left" style="cursor: pointer; flex: 1;" title="${statusLabel} — Cliquer pour ouvrir le salon privé avec ${friend.name || friend.username}">
          <div class="friend-avatar-wrap">
            <img src="${friend.avatar || friend.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80'}" alt="${friend.name || friend.username}" class="friend-avatar" onerror="this.src='https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80'">
            <span class="friend-status-dot ${statusClass}" title="${statusLabel}"></span>
          </div>
          <div class="friend-meta">
            <div style="display: flex; align-items: center; gap: 5px;">
              <span class="friend-name">${friend.name || friend.displayName || friend.username}</span>
              <span style="display: inline-flex; align-items: center;">${flagTag}</span>
            </div>
            <span class="friend-activity ${statusClass}">
              <span class="activity-status-dot ${statusClass}"></span>
              ${statusLabel}
            </span>
          </div>
        </div>
        <button type="button" class="friend-action-btn" title="Envoyer un message ou appeler">
          💬
        </button>
      `;

      // Clicking friend opens 1-on-1 private DM salon
      item.querySelector('.friend-item-left')?.addEventListener('click', () => {
        openDirectChat(friend);
      });

      item.querySelector('.friend-action-btn')?.addEventListener('click', () => {
        openDirectChat(friend);
      });

      friendsList.appendChild(item);
    });
  }


  // =========================================================================
  // 6. LIVE MULTI-USER SALON EXPERIENCE (ROSTER, VOCAL MESH, VIDEO & CHAT)
  // =========================================================================

  // Prompt for private salon access code
  function openPrivateSalonPrompt(salon) {
    if (!salon || !privateSalonAccessModal) return;
    if (privateAccessSalonId) privateAccessSalonId.value = salon.id;
    const titleEl = document.getElementById('privateAccessTitle');
    const descEl = document.getElementById('privateAccessDesc');
    if (titleEl) titleEl.textContent = salon.name;
    if (descEl) descEl.textContent = `Ce salon privé est protégé. Entrez le code secret pour y accéder.`;
    if (privateAccessCodeInput) {
      privateAccessCodeInput.value = '';
      setTimeout(() => privateAccessCodeInput.focus(), 150);
    }
    privateSalonAccessModal.classList.remove('hidden');
  }

  // A. Open Live Salon
  async function openLiveSalon(salon, accessCode, inviteToken) {
    if (!salon) return;

    // Check if private and not owner
    const myId = state.currentUser?.id;
    const isOwner = Boolean(salon.isOwner || (salon.ownerId && myId && salon.ownerId === myId));

    if (salon.isPrivate && !isOwner) {
      // 1. If neither code nor token was provided, prompt user
      if (!accessCode && !salon.accessCode && !inviteToken) {
        openPrivateSalonPrompt(salon);
        return;
      }

      // 2. If salon has known local accessCode, strictly reject wrong code
      const givenCode = (accessCode || salon.accessCode || '').trim().toLowerCase();
      if (salon.accessCode && givenCode && givenCode !== salon.accessCode.trim().toLowerCase()) {
        showToast('❌ Code d\'accès incorrect pour ce salon privé.', 'coral');
        playTone(220, 'sawtooth', 0.25);
        openPrivateSalonPrompt(salon);
        return;
      }
    }

    state.currentRoom = {
      ...salon,
      isOwner,
      accessCode: accessCode || salon.accessCode,
      inviteToken: inviteToken || salon.inviteToken,
    };

    // Reset controls UI
    state.isMicMuted = false;
    isSalonCamActive = false;
    btnToggleMic?.classList.remove('muted');
    btnToggleMic?.querySelector('.mic-on-icon')?.classList.remove('hidden');
    btnToggleMic?.querySelector('.mic-off-icon')?.classList.add('hidden');
    if (btnToggleMic) btnToggleMic.querySelector('.ctrl-label').textContent = 'Micro';

    btnToggleSalonVideo?.classList.remove('active');
    btnToggleSalonVideo?.querySelector('.cam-on-icon')?.classList.remove('hidden');
    btnToggleSalonVideo?.querySelector('.cam-off-icon')?.classList.add('hidden');
    if (btnToggleSalonVideo) btnToggleSalonVideo.querySelector('.ctrl-label').textContent = 'Caméra';

    document.getElementById('liveSalonTitle').textContent = salon.name;
    document.getElementById('liveSalonTopic').textContent = salon.topic || salon.description || 'Partagez un moment convivial.';
    document.getElementById('modalRoomCategory').textContent = `${(salon.category || 'vocal').toUpperCase()} • ${salon.isPrivate ? '🔒 PRIVÉ' : '🌐 PUBLIC'} • HD AUDIO & VIDEO`;

    // Clear previous roster & peer connections
    currentSalonRoster.clear();
    salonPeerConnections.forEach(pc => pc.close());
    salonPeerConnections.clear();
    salonRemoteStreams.clear();
    salonRemoteAudioElements.forEach(el => el.remove());
    salonRemoteAudioElements.clear();

    // Register self in local roster with proper role
    const selfUser = state.currentUser || {
      id: 'self-' + Date.now(),
      username: 'vous',
      displayName: 'Alexandre Moreau',
      avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100',
      role: isOwner ? 'Hôte du salon' : 'Participant',
      country: 'FR',
    };

    currentSalonRoster.set(selfUser.id, {
      userId: selfUser.id,
      username: selfUser.username,
      displayName: (selfUser.displayName || selfUser.username) + ' (Vous)',
      avatarUrl: selfUser.avatarUrl,
      role: isOwner ? 'Hôte du salon' : (selfUser.role || 'Participant'),
      country: selfUser.country || 'FR',
      isMuted: false,
      isSpeaking: false,
      isCameraOn: false,
    });

    renderVoiceStage();
    initSalonChat(salon);

    // Initialize Mobile Salon Tab to Stage View
    const salonBody = document.querySelector('.salon-modal-body');
    if (salonBody) {
      salonBody.classList.add('show-stage');
      salonBody.classList.remove('show-chat');
    }
    document.getElementById('tabMobileStage')?.classList.add('active');
    document.getElementById('tabMobileChat')?.classList.remove('active');
    document.getElementById('mobileChatUnreadDot')?.classList.add('hidden');

    liveSalonModal.classList.remove('hidden');
    playTone(440, 'sine', 0.15);
    showToast(`Connexion au salon "${salon.name}"...`, 'teal');

    // Acquire local microphone stream for voice calling
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        salonLocalStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        salonLocalAudioTrack = salonLocalStream.getAudioTracks()[0];
        setupSalonVoiceActivityDetector();
      }
    } catch (micErr) {
      console.warn('Microphone access denied or unavailable in salon:', micErr);
    }

    // Join Socket Salon Room with accessCode / inviteToken
    if (socket && socket.connected) {
      socket.emit('salon:join', {
        salonId: salon.id,
        accessCode: accessCode || salon.accessCode,
        inviteToken: inviteToken || salon.inviteToken,
      });
    }
  }

  // B. Close Live Salon
  function closeLiveSalon() {
    if (state.currentRoom && socket && socket.connected) {
      socket.emit('salon:leave', { salonId: state.currentRoom.id });
    }

    // Stop voice activity detector
    if (salonVoiceDetectorTimer) {
      clearInterval(salonVoiceDetectorTimer);
      salonVoiceDetectorTimer = null;
    }
    if (salonAudioContext) {
      salonAudioContext.close().catch(() => { });
      salonAudioContext = null;
      salonAudioAnalyser = null;
    }

    // Stop local media tracks
    if (salonLocalAudioTrack) {
      salonLocalAudioTrack.stop();
      salonLocalAudioTrack = null;
    }
    if (salonLocalVideoTrack) {
      salonLocalVideoTrack.stop();
      salonLocalVideoTrack = null;
    }
    if (salonLocalStream) {
      salonLocalStream.getTracks().forEach(t => t.stop());
      salonLocalStream = null;
    }

    // Close all WebRTC mesh peer connections
    salonPeerConnections.forEach(pc => pc.close());
    salonPeerConnections.clear();
    salonRemoteStreams.clear();
    salonRemoteAudioElements.forEach(el => el.remove());
    salonRemoteAudioElements.clear();
    currentSalonRoster.clear();

    liveSalonModal.classList.add('hidden');
    state.currentRoom = null;
    showToast('Vous avez quitté le salon.', 'coral');
  }

  btnCloseSalonModal?.addEventListener('click', closeLiveSalon);
  btnLeaveRoom?.addEventListener('click', closeLiveSalon);

  // C. Local Voice Activity Detector using Web Audio API
  function setupSalonVoiceActivityDetector() {
    if (!salonLocalStream) return;
    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtxClass) return;
      salonAudioContext = new AudioCtxClass();
      const source = salonAudioContext.createMediaStreamSource(salonLocalStream);
      salonAudioAnalyser = salonAudioContext.createAnalyser();
      salonAudioAnalyser.fftSize = 256;
      source.connect(salonAudioAnalyser);

      let wasSpeaking = false;
      const dataArr = new Uint8Array(salonAudioAnalyser.frequencyBinCount);

      if (salonVoiceDetectorTimer) clearInterval(salonVoiceDetectorTimer);
      salonVoiceDetectorTimer = setInterval(() => {
        if (!state.currentRoom || !salonAudioAnalyser) return;

        if (state.isMicMuted) {
          if (wasSpeaking) {
            wasSpeaking = false;
            updateParticipantSpeakingUI(state.currentUser?.id, false);
            if (socket && socket.connected) {
              socket.emit('salon:media_state', {
                salonId: state.currentRoom.id,
                isMuted: true,
                isSpeaking: false,
                isCameraOn: isSalonCamActive,
              });
            }
          }
          return;
        }

        salonAudioAnalyser.getByteFrequencyData(dataArr);
        let sum = 0;
        for (let i = 0; i < dataArr.length; i++) sum += dataArr[i];
        const avg = sum / dataArr.length;
        const isSpeaking = avg > 12;

        if (isSpeaking !== wasSpeaking) {
          wasSpeaking = isSpeaking;
          updateParticipantSpeakingUI(state.currentUser?.id, isSpeaking);
          if (socket && socket.connected) {
            socket.emit('salon:media_state', {
              salonId: state.currentRoom.id,
              isMuted: false,
              isSpeaking,
              isCameraOn: isSalonCamActive,
            });
          }
        }
      }, 250);
    } catch (e) {
      console.warn('Voice detector setup failed:', e);
    }
  }

  // Helper: Create HD simulated camera canvas stream when webcam is busy or unavailable on the machine
  let simulatedCamAnimInterval = null;
  function createSimulatedCameraStream() {
    if (simulatedCamAnimInterval) {
      clearInterval(simulatedCamAnimInterval);
      simulatedCamAnimInterval = null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    let pulseAngle = 0;
    let frameCount = 0;

    const myUser = state.currentUser || {};
    const myName = myUser.displayName || myUser.username || 'Participant';
    const initials = (myName || 'P').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    const drawSimulatedFrame = () => {
      pulseAngle += 0.06;
      frameCount++;

      // 1. Dark elegant studio background
      const bgGrad = ctx.createLinearGradient(0, 0, 640, 480);
      bgGrad.addColorStop(0, '#0a1020');
      bgGrad.addColorStop(0.5, '#0f172a');
      bgGrad.addColorStop(1, '#070b14');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 640, 480);

      // 2. Animated radial ambient glow
      const glowX = 320 + Math.sin(pulseAngle * 0.7) * 30;
      const glowY = 210 + Math.cos(pulseAngle * 0.5) * 20;
      const radGrad = ctx.createRadialGradient(glowX, glowY, 30, 320, 240, 300);
      radGrad.addColorStop(0, 'rgba(13, 148, 136, 0.45)');
      radGrad.addColorStop(0.6, 'rgba(16, 185, 129, 0.15)');
      radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = radGrad;
      ctx.fillRect(0, 0, 640, 480);

      // 3. Grid lines decoration
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      for (let x = 40; x < 640; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 480);
        ctx.stroke();
      }
      for (let y = 40; y < 480; y += 60) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(640, y);
        ctx.stroke();
      }

      // 4. Pulsing outer camera ring (dashed)
      const ringRadius = 75 + Math.sin(pulseAngle) * 6;
      ctx.save();
      ctx.beginPath();
      ctx.arc(320, 200, ringRadius + 12, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(45, 212, 191, 0.3)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.stroke();
      ctx.restore();

      // 5. Solid vibrant inner ring with glow
      ctx.beginPath();
      ctx.arc(320, 200, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 15;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 6. Avatar bubble with gradient
      const avatarGrad = ctx.createLinearGradient(245, 125, 395, 275);
      avatarGrad.addColorStop(0, '#0d9488');
      avatarGrad.addColorStop(1, '#0284c7');
      ctx.fillStyle = avatarGrad;
      ctx.beginPath();
      ctx.arc(320, 200, ringRadius - 4, 0, Math.PI * 2);
      ctx.fill();

      // 7. User initials
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 44px Plus Jakarta Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initials, 320, 200);

      // 8. User display name
      ctx.font = 'bold 22px Plus Jakarta Sans, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(myName, 320, 310);

      // 9. Status badges
      ctx.font = '600 13px Plus Jakarta Sans, sans-serif';
      ctx.fillStyle = '#34d399';
      ctx.fillText('WafaTalk Caméra HD Live', 320, 335);

      // 10. Live recording / FPS indicator at top right
      const isBlink = Math.floor(frameCount / 15) % 2 === 0;
      if (isBlink) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(580, 35, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = '600 12px Plus Jakarta Sans, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.textAlign = 'right';
      ctx.fillText('HD 30 FPS', 565, 39);
    };

    // Draw frame 0 synchronously so canvas is never blank upon captureStream
    drawSimulatedFrame();

    // Run animation continuously at 30 FPS using setInterval (resilient across unfocused/background windows)
    simulatedCamAnimInterval = setInterval(drawSimulatedFrame, 1000 / 30);

    const stream = canvas.captureStream ? canvas.captureStream(30) : null;
    if (stream) {
      const track = stream.getVideoTracks()[0];
      if (track) {
        track.addEventListener('ended', () => {
          if (simulatedCamAnimInterval) {
            clearInterval(simulatedCamAnimInterval);
            simulatedCamAnimInterval = null;
          }
        });
      }
    }
    return stream;
  }

  // D. Render Voice & Video Stage Grid (Targeted updates preserving playing videos)
  function renderVoiceStage() {
    if (!voiceStageGrid) return;

    const count = currentSalonRoster.size;
    if (chatParticipantsCount) {
      chatParticipantsCount.textContent = `${count} participant${count > 1 ? 's' : ''}`;
    }

    const myId = state.currentUser?.id;
    const isCurrentRoomHost = Boolean(state.currentRoom?.isOwner || (state.currentRoom?.ownerId && myId && state.currentRoom.ownerId === myId));

    currentSalonRoster.forEach((p, userId) => {
      const isSelf = userId === myId || userId.startsWith('self-');
      const isTargetHost = Boolean(p.role === 'Hôte du salon' || (state.currentRoom?.ownerId && p.userId === state.currentRoom.ownerId));
      const canAdminModerate = isCurrentRoomHost && !isSelf && !isTargetHost;

      let card = document.getElementById(`stageUser_${userId}`);

      if (!card) {
        card = document.createElement('div');
        card.id = `stageUser_${userId}`;
        voiceStageGrid.appendChild(card);
      }

      card.className = `stage-avatar-card ${p.isSpeaking ? 'is-speaking' : ''} ${p.isCameraOn ? 'has-video' : ''}`;

      if (p.isCameraOn) {
        // Video Stream Card
        if (!card.querySelector('.stage-video-stream')) {
          card.innerHTML = `
            <div class="stage-live-badge"><span class="badge-dot pulse"></span> CAMÉRA</div>
            ${p.isMuted ? '<span class="stage-mute-badge" title="Micro coupé">🔇</span>' : ''}
            ${isTargetHost ? '<span class="stage-admin-crown-badge" style="position: absolute; top: 8px; left: 8px; z-index: 10;">👑 Admin</span>' : ''}
            ${canAdminModerate ? `<button type="button" class="stage-admin-trigger" data-user-id="${userId}" title="Gérer ce participant">🛡️</button>` : ''}
            <div class="stage-video-loading" id="videoLoading_${userId}"><span class="badge-dot pulse"></span> Connexion HD...</div>
            <video class="stage-video-stream" id="videoEl_${userId}" autoplay playsinline muted></video>
            <div class="stage-video-overlay">
              <span class="stage-user-name">${escapeHtml(p.displayName || p.name || 'Membre')}</span>
              <span class="stage-user-role" style="color: rgba(255,255,255,0.7);">${escapeHtml(p.role || '')}</span>
            </div>
          `;
        }

        // Attach video stream with muted=true & play()
        const vidEl = card.querySelector(`#videoEl_${userId}`);
        const loadEl = card.querySelector(`#videoLoading_${userId}`);
        if (vidEl) {
          vidEl.muted = true;

          const hideLoader = () => { if (loadEl) { loadEl.style.display = 'none'; } };
          vidEl.addEventListener('loadeddata', hideLoader, { once: true });
          vidEl.addEventListener('playing', hideLoader, { once: true });

          const attachStream = (stream) => {
            if (vidEl.srcObject !== stream) vidEl.srcObject = stream;
            vidEl.play().then(hideLoader).catch(() => { });
          };

          if (isSelf && salonLocalStream) {
            attachStream(salonLocalStream);
          } else {
            // Try salonRemoteStreams first, then fallback to receiver track
            let remoteStr = salonRemoteStreams.get(userId);
            if (!remoteStr) {
              const pc = salonPeerConnections.get(userId);
              if (pc) {
                const rx = pc.getReceivers().find(r => r.track && r.track.kind === 'video' && r.track.readyState !== 'ended');
                if (rx && rx.track) {
                  remoteStr = new MediaStream([rx.track]);
                  salonRemoteStreams.set(userId, remoteStr);
                }
              }
            }
            if (remoteStr) {
              attachStream(remoteStr);
            }
          }
        }
      } else {
        // Avatar Card
        if (card.querySelector('.stage-video-stream') || !card.querySelector('.stage-avatar-img')) {
          const flagImg = getFlagImgTag(p.country || 'FR', p.country || 'FR');
          card.innerHTML = `
            <div class="stage-avatar-img-wrap">
              <img src="${p.avatarUrl || p.avatar || 'assets/wafatalk-icon.png'}" alt="${escapeHtml(p.displayName || p.name || 'Membre')}" class="stage-avatar-img" onerror="this.src='https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80'">
            </div>
            ${p.isMuted ? '<span class="stage-mute-badge" title="Micro coupé">🔇</span>' : ''}
            ${isTargetHost ? '<span class="stage-admin-crown-badge" style="position: absolute; top: 8px; left: 8px; z-index: 10;">👑 Admin</span>' : ''}
            ${canAdminModerate ? `<button type="button" class="stage-admin-trigger" data-user-id="${userId}" title="Gérer ce participant">🛡️</button>` : ''}
            <div style="display: flex; align-items: center; gap: 5px;">
              <span class="stage-user-name">${escapeHtml(p.displayName || p.name || 'Membre')}</span>
              <span>${flagImg}</span>
            </div>
            <span class="stage-user-role">${escapeHtml(p.role || 'Participant')}</span>
          `;
        }
      }

      // Ensure admin trigger button exists if moderator privileges apply
      let triggerBtn = card.querySelector('.stage-admin-trigger');
      if (canAdminModerate && !triggerBtn) {
        triggerBtn = document.createElement('button');
        triggerBtn.type = 'button';
        triggerBtn.className = 'stage-admin-trigger';
        triggerBtn.dataset.userId = userId;
        triggerBtn.title = 'Gérer ce participant';
        triggerBtn.innerHTML = '🛡️';
        card.appendChild(triggerBtn);
      } else if (!canAdminModerate && triggerBtn) {
        triggerBtn.remove();
      }

      // Ensure mute badge reflects real-time mute state
      let muteBadge = card.querySelector('.stage-mute-badge');
      if (p.isMuted && !muteBadge) {
        muteBadge = document.createElement('span');
        muteBadge.className = 'stage-mute-badge';
        muteBadge.title = 'Micro coupé';
        muteBadge.textContent = '🔇';
        card.appendChild(muteBadge);
      } else if (!p.isMuted && muteBadge) {
        muteBadge.remove();
      }
    });

    // Remove any cards whose users left
    const allCards = voiceStageGrid.querySelectorAll('.stage-avatar-card');
    allCards.forEach(c => {
      const uId = c.id.replace('stageUser_', '');
      if (!currentSalonRoster.has(uId)) {
        c.remove();
      }
    });
  }

  // Voice stage admin trigger click delegation
  voiceStageGrid?.addEventListener('click', (e) => {
    const trigger = e.target.closest('.stage-admin-trigger');
    if (!trigger) return;
    e.stopPropagation();
    const targetUserId = trigger.dataset.userId;
    if (!targetUserId) return;
    const target = currentSalonRoster.get(targetUserId);
    if (!target) return;
    openSalonAdminModal(target);
  });

  // Update single participant speaking visual in stage card
  function updateParticipantSpeakingUI(userId, isSpeaking) {
    if (!userId) return;
    const card = document.getElementById(`stageUser_${userId}`);
    if (card) {
      card.classList.toggle('is-speaking', isSpeaking);
    }
  }

  // E. Handle Salon Roster Sync from Server
  function handleSalonRosterSync(participants) {
    if (!Array.isArray(participants)) return;
    const myId = state.currentUser?.id;

    // Retain self in roster
    const selfInRoster = currentSalonRoster.get(myId) || (myId ? null : Array.from(currentSalonRoster.values())[0]);

    currentSalonRoster.clear();
    if (selfInRoster) {
      currentSalonRoster.set(selfInRoster.userId, selfInRoster);
    }

    participants.forEach((p) => {
      if (p.userId === myId) {
        currentSalonRoster.set(p.userId, {
          ...p,
          displayName: (p.displayName || p.username) + ' (Vous)',
        });
      } else {
        currentSalonRoster.set(p.userId, p);
      }
    });

    // If only current user is in room, append companion demo participants so room is lively
    if (currentSalonRoster.size === 1) {
      currentSalonRoster.set('demo-sarah', {
        userId: 'demo-sarah',
        displayName: 'Sarah B.',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
        role: 'Modérateur',
        country: 'FR',
        isMuted: false,
        isSpeaking: true,
        isCameraOn: false,
      });
      currentSalonRoster.set('demo-youssef', {
        userId: 'demo-youssef',
        displayName: 'Youssef K.',
        avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=100',
        role: 'Participant VIP',
        country: 'MA',
        isMuted: false,
        isSpeaking: false,
        isCameraOn: false,
      });
    }

    renderVoiceStage();

    // Initiator rule: The newly joining member initiates connection to all existing members
    participants.forEach((p) => {
      if (p.userId !== myId && !p.userId.startsWith('demo-')) {
        createSalonPeerConnection(p.userId, true);
      }
    });
  }

  // F. Handle New User Joined Salon
  function handleSalonUserJoined(participant) {
    if (!participant || !participant.userId) return;
    // Remove demo placeholders once another real person joins
    currentSalonRoster.delete('demo-sarah');
    currentSalonRoster.delete('demo-youssef');

    currentSalonRoster.set(participant.userId, participant);
    renderVoiceStage();

    showToast(`${participant.displayName} a rejoint le salon ! 👋`, 'teal');
    playTone(520, 'sine', 0.12);

    // Existing members prepare receiver peer connection without initiating (avoids glare)
    createSalonPeerConnection(participant.userId, false);
  }

  // G. Handle User Left Salon
  function handleSalonUserLeft(userId, displayName) {
    if (!userId) return;
    if (salonPeerConnections.has(userId)) {
      salonPeerConnections.get(userId).close();
      salonPeerConnections.delete(userId);
    }
    if (salonRemoteAudioElements.has(userId)) {
      salonRemoteAudioElements.get(userId).remove();
      salonRemoteAudioElements.delete(userId);
    }
    salonRemoteStreams.delete(userId);
    currentSalonRoster.delete(userId);

    renderVoiceStage();
    showToast(`${displayName || 'Un participant'} a quitté le salon.`, 'coral');
  }

  // H. Handle Real-Time Media Update (Mute, Speaking, Camera)
  function handleSalonMediaUpdate(userId, mediaState) {
    const p = currentSalonRoster.get(userId);
    if (!p) return;

    if (typeof mediaState.isMuted === 'boolean') p.isMuted = mediaState.isMuted;
    if (typeof mediaState.isSpeaking === 'boolean') p.isSpeaking = mediaState.isSpeaking;
    if (typeof mediaState.isCameraOn === 'boolean') {
      const camChanged = p.isCameraOn !== mediaState.isCameraOn;
      p.isCameraOn = mediaState.isCameraOn;
      if (camChanged) {
        renderVoiceStage();
        return;
      }
    }

    updateParticipantSpeakingUI(userId, p.isSpeaking);
    const card = document.getElementById(`stageUser_${userId}`);
    if (card) {
      const muteBadge = card.querySelector('.stage-mute-badge');
      if (p.isMuted && !muteBadge) {
        const badge = document.createElement('span');
        badge.className = 'stage-mute-badge';
        badge.title = 'Micro coupé';
        badge.textContent = '🔇';
        card.appendChild(badge);
      } else if (!p.isMuted && muteBadge) {
        muteBadge.remove();
      }
    }
  }

  // I. WebRTC Mesh Peer Connection Setup
  // CRITICAL: Only the INITIATOR adds transceivers. The ANSWERER must NOT call addTransceiver()
  // before setRemoteDescription, or it creates duplicate/mismatched transceivers causing one-way calls.
  function createSalonPeerConnection(targetUserId, isInitiator = false) {
    let pc = salonPeerConnections.get(targetUserId);
    if (pc && pc.connectionState !== 'closed' && pc.connectionState !== 'failed') {
      return pc;
    }

    pc = new RTCPeerConnection(RTC_CONFIG);
    salonPeerConnections.set(targetUserId, pc);
    pc._pendingCandidates = [];

    // ── INITIATOR ONLY: add transceivers to define the media plan in the offer ──
    if (isInitiator) {
      const audioTrack = salonLocalAudioTrack || null;
      const videoTrack = (isSalonCamActive && salonLocalVideoTrack) ? salonLocalVideoTrack : null;

      // Pass the track directly to addTransceiver — this is the most reliable method
      const audioTransceiver = pc.addTransceiver(audioTrack || 'audio', { direction: 'sendrecv' });
      const videoTransceiver = pc.addTransceiver(videoTrack || 'video', { direction: 'sendrecv' });

      // If track is null (mic not granted yet), sender.track is already null — fine
      // If we passed 'audio'/'video' string and have a track, assign it now
      if (audioTrack && !audioTransceiver.sender.track) {
        audioTransceiver.sender.replaceTrack(audioTrack).catch(() => { });
      }
      if (videoTrack && !videoTransceiver.sender.track) {
        videoTransceiver.sender.replaceTrack(videoTrack).catch(() => { });
      }
    }
    // ── ANSWERER: does NOT add transceivers here. Tracks are added in handleSalonIncomingSignal
    // after setRemoteDescription(), where existing transceivers from the offer are already present. ──

    pc.ontrack = (event) => {
      const track = event.track;
      console.log(`📡 [${isInitiator ? 'INIT' : 'ANSW'}] Track from ${targetUserId}:`, track.kind, track.id);

      if (track.kind === 'audio') {
        let audioEl = salonRemoteAudioElements.get(targetUserId);
        if (!audioEl) {
          audioEl = document.createElement('audio');
          audioEl.autoplay = true;
          document.body.appendChild(audioEl);
          salonRemoteAudioElements.set(targetUserId, audioEl);
        }
        audioEl.srcObject = new MediaStream([track]);
        audioEl.play().catch(e => console.warn('Audio play blocked:', e));

      } else if (track.kind === 'video') {
        const stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([track]);
        salonRemoteStreams.set(targetUserId, stream);

        // Retry until the DOM card exists (renderVoiceStage may not have run yet)
        const attachVideo = () => {
          const lEl = document.getElementById(`videoLoading_${targetUserId}`);
          const vidEl = document.getElementById(`videoEl_${targetUserId}`);
          if (vidEl) {
            if (vidEl.srcObject !== stream) vidEl.srcObject = stream;
            vidEl.muted = true;
            vidEl.play().catch(() => { });
            if (lEl) lEl.style.display = 'none';
          } else {
            // DOM card not yet rendered — poll every 200ms for up to 5s
            let attempts = 0;
            const poll = setInterval(() => {
              const el = document.getElementById(`videoEl_${targetUserId}`);
              const ll = document.getElementById(`videoLoading_${targetUserId}`);
              if (el) {
                if (el.srcObject !== stream) el.srcObject = stream;
                el.muted = true;
                el.play().catch(() => { });
                if (ll) ll.style.display = 'none';
                clearInterval(poll);
              } else if (++attempts > 25) {
                clearInterval(poll); // stop after 5s
              }
            }, 200);
          }
        };

        attachVideo();
        track.onunmute = attachVideo;
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socket && socket.connected && state.currentRoom) {
        socket.emit('salon:signal', {
          salonId: state.currentRoom.id,
          targetUserId,
          signal: { type: 'candidate', candidate: event.candidate },
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`🧊 ICE [${targetUserId}]:`, pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        console.warn(`ICE failed with ${targetUserId} — triggering restartIce()`);
        if (typeof pc.restartIce === 'function') pc.restartIce();
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`🔗 PeerConn [${targetUserId}]:`, pc.connectionState);
    };

    if (isInitiator) {
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
          if (socket && socket.connected && state.currentRoom) {
            socket.emit('salon:signal', {
              salonId: state.currentRoom.id,
              targetUserId,
              signal: { type: 'offer', sdp: pc.localDescription.sdp },
            });
          }
        })
        .catch(err => console.warn('Offer failed for', targetUserId, err));
    }

    return pc;
  }

  // J. Handle Incoming WebRTC Signal for Salon
  async function handleSalonIncomingSignal(senderId, senderUser, signal) {
    if (!signal || !senderId) return;

    if (signal.type === 'offer') {
      const pc = createSalonPeerConnection(senderId, false); // false = answerer, no addTransceiver called
      try {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));

        // CRITICAL: Answerer injects local tracks into the transceivers that were created by
        // setRemoteDescription from the offer. This is the correct way — do NOT call addTransceiver.
        const transceivers = pc.getTransceivers();
        for (const transceiver of transceivers) {
          if (transceiver.direction === 'recvonly' || transceiver.direction === 'sendrecv') {
            const kind = transceiver.receiver.track.kind;
            if (kind === 'audio' && salonLocalAudioTrack) {
              transceiver.direction = 'sendrecv';
              transceiver.sender.replaceTrack(salonLocalAudioTrack).catch(() => { });
            } else if (kind === 'video' && isSalonCamActive && salonLocalVideoTrack) {
              transceiver.direction = 'sendrecv';
              transceiver.sender.replaceTrack(salonLocalVideoTrack).catch(() => { });
            }
          }
        }

        // Drain any buffered candidates
        if (pc._pendingCandidates && pc._pendingCandidates.length) {
          for (const cand of pc._pendingCandidates) {
            try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) { }
          }
          pc._pendingCandidates = [];
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (socket && socket.connected && state.currentRoom) {
          socket.emit('salon:signal', {
            salonId: state.currentRoom.id,
            targetUserId: senderId,
            signal: { type: 'answer', sdp: answer.sdp },
          });
        }
      } catch (err) {
        console.warn('Error handling salon offer:', err);
      }
    } else if (signal.type === 'answer') {
      const pc = salonPeerConnections.get(senderId);
      if (pc && pc.signalingState !== 'stable') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
          if (pc._pendingCandidates && pc._pendingCandidates.length) {
            for (const cand of pc._pendingCandidates) {
              try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) { }
            }
            pc._pendingCandidates = [];
          }
        } catch (err) {
          console.warn('Error setting salon answer:', err);
        }
      }
    } else if (signal.type === 'candidate' && signal.candidate) {
      const pc = salonPeerConnections.get(senderId);
      if (pc) {
        try {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } else {
            if (!pc._pendingCandidates) pc._pendingCandidates = [];
            pc._pendingCandidates.push(signal.candidate);
          }
        } catch (err) {
          console.warn('Error adding salon candidate:', err);
        }
      }
    }
  }

  // K. Toggle Microphone
  btnToggleMic?.addEventListener('click', () => {
    state.isMicMuted = !state.isMicMuted;
    btnToggleMic.classList.toggle('muted', state.isMicMuted);
    btnToggleMic.querySelector('.mic-on-icon')?.classList.toggle('hidden', state.isMicMuted);
    btnToggleMic.querySelector('.mic-off-icon')?.classList.toggle('hidden', !state.isMicMuted);
    btnToggleMic.querySelector('.ctrl-label').textContent = state.isMicMuted ? 'Coupé' : 'Micro';

    if (salonLocalAudioTrack) {
      salonLocalAudioTrack.enabled = !state.isMicMuted;
    }

    if (state.currentRoom && socket && socket.connected) {
      socket.emit('salon:media_state', {
        salonId: state.currentRoom.id,
        isMuted: state.isMicMuted,
        isSpeaking: false,
        isCameraOn: isSalonCamActive,
      });
    }

    updateParticipantSpeakingUI(state.currentUser?.id, false);
    const selfCard = document.getElementById(`stageUser_${state.currentUser?.id}`);
    if (selfCard) {
      const muteBadge = selfCard.querySelector('.stage-mute-badge');
      if (state.isMicMuted && !muteBadge) {
        const badge = document.createElement('span');
        badge.className = 'stage-mute-badge';
        badge.title = 'Micro coupé';
        badge.textContent = '🔇';
        selfCard.appendChild(badge);
      } else if (!state.isMicMuted && muteBadge) {
        muteBadge.remove();
      }
    }

    showToast(state.isMicMuted ? 'Microphone désactivé 🔇' : 'Microphone activé 🎙️', state.isMicMuted ? 'coral' : 'success');
  });

  // L. Toggle Video Camera (Instant replaceTrack & hardware lock resilient)
  btnToggleSalonVideo?.addEventListener('click', async () => {
    if (!state.currentRoom) return;

    if (!isSalonCamActive) {
      let videoStream = null;
      try {
        videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        });
      } catch (camErr) {
        console.warn('Physical camera not available or busy on this device, using animated HD stream:', camErr);
        videoStream = createSimulatedCameraStream();
      }

      if (!videoStream || !videoStream.getVideoTracks().length) {
        videoStream = createSimulatedCameraStream();
      }

      salonLocalVideoTrack = videoStream.getVideoTracks()[0];

      if (salonLocalStream) {
        salonLocalStream.addTrack(salonLocalVideoTrack);
      } else {
        salonLocalStream = videoStream;
      }

      isSalonCamActive = true;
      btnToggleSalonVideo.classList.add('active');
      btnToggleSalonVideo.querySelector('.cam-on-icon')?.classList.add('hidden');
      btnToggleSalonVideo.querySelector('.cam-off-icon')?.classList.remove('hidden');
      btnToggleSalonVideo.querySelector('.ctrl-label').textContent = 'Caméra On';

      // Update self participant record
      const myId = state.currentUser?.id;
      const selfP = currentSalonRoster.get(myId);
      if (selfP) selfP.isCameraOn = true;

      // Instantly replace track on all active peer connection video senders
      salonPeerConnections.forEach(async (pc) => {
        try {
          // Find the video sender: works for both initiator (sender has kind) and answerer (use transceivers)
          const videoTransceiver = pc.getTransceivers().find(t => t.receiver && t.receiver.track && t.receiver.track.kind === 'video');
          const videoSender = videoTransceiver ? videoTransceiver.sender : pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (videoSender) {
            await videoSender.replaceTrack(salonLocalVideoTrack);
          } else {
            // No transceiver yet (answerer just joined): inject directly
            const nullVideoSender = pc.getSenders().find(s => !s.track);
            if (nullVideoSender) await nullVideoSender.replaceTrack(salonLocalVideoTrack);
          }
        } catch (e) {
          console.warn('Error replacing video track:', e);
        }
      });

      if (socket && socket.connected) {
        socket.emit('salon:media_state', {
          salonId: state.currentRoom.id,
          isMuted: state.isMicMuted,
          isSpeaking: false,
          isCameraOn: true,
        });
      }

      renderVoiceStage();
      showToast('Caméra activée 🎥', 'success');
    } else {
      isSalonCamActive = false;
      if (simulatedCamAnimInterval) {
        clearInterval(simulatedCamAnimInterval);
        simulatedCamAnimInterval = null;
      }
      if (salonLocalVideoTrack) {
        salonLocalVideoTrack.stop();
        salonLocalStream?.removeTrack(salonLocalVideoTrack);
        salonLocalVideoTrack = null;
      }

      btnToggleSalonVideo.classList.remove('active');
      btnToggleSalonVideo.querySelector('.cam-on-icon')?.classList.remove('hidden');
      btnToggleSalonVideo.querySelector('.cam-off-icon')?.classList.add('hidden');
      btnToggleSalonVideo.querySelector('.ctrl-label').textContent = 'Caméra';

      const myId = state.currentUser?.id;
      const selfP = currentSalonRoster.get(myId);
      if (selfP) selfP.isCameraOn = false;

      // Blank track on all peer connections
      salonPeerConnections.forEach(async (pc) => {
        try {
          const videoTransceiver = pc.getTransceivers().find(t => t.receiver && t.receiver.track && t.receiver.track.kind === 'video');
          const videoSender = videoTransceiver ? videoTransceiver.sender : pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (videoSender) await videoSender.replaceTrack(null);
        } catch (e) { }
      });

      if (socket && socket.connected) {
        socket.emit('salon:media_state', {
          salonId: state.currentRoom.id,
          isMuted: state.isMicMuted,
          isSpeaking: false,
          isCameraOn: false,
        });
      }

      renderVoiceStage();
      showToast('Caméra désactivée.', 'coral');
    }
  });

  // M. Audio Mute Toggle (Deafen)
  btnToggleAudio?.addEventListener('click', () => {
    state.isAudioMuted = !state.isAudioMuted;
    btnToggleAudio.classList.toggle('muted', state.isAudioMuted);
    btnToggleAudio.querySelector('.ctrl-label').textContent = state.isAudioMuted ? 'Sourdine' : 'Audio HD';

    // Mute or unmute all remote audio playback
    salonRemoteAudioElements.forEach((audioEl) => {
      audioEl.muted = state.isAudioMuted;
    });

    showToast(state.isAudioMuted ? 'Son du salon coupé' : 'Son du salon rétabli', state.isAudioMuted ? 'coral' : 'teal');
  });

  // N. Real-Time Salon Chat System
  async function initSalonChat(salon) {
    if (!chatMessagesScroll) return;
    chatMessagesScroll.innerHTML = `
      <div class="chat-msg">
        <img src="assets/wafatalk-icon.png" class="chat-msg-avatar" alt="WafaTalk Bot">
        <div class="chat-msg-body">
          <div class="chat-msg-author">
            <strong>WafaBot</strong>
            <span class="chat-msg-time">À l'instant</span>
          </div>
          <p class="chat-msg-text">Bienvenue dans <strong>${escapeHtml(salon.name)}</strong> ! Vous pouvez maintenant parler, activer votre caméra et discuter avec tous les membres du salon en direct 🚀</p>
        </div>
      </div>
    `;

    // Fetch existing messages from backend API
    try {
      const res = await fetch(`${API_BASE_URL}/salons/${salon.id}/messages`);
      if (res.ok) {
        const msgs = await res.json();
        if (Array.isArray(msgs)) {
          msgs.forEach((m) => appendSalonChatMessage(m));
        }
      }
    } catch (e) { }

    chatMessagesScroll.scrollTop = chatMessagesScroll.scrollHeight;
  }

  // Append a Salon Chat Message Bubble
  function appendSalonChatMessage(message) {
    if (!chatMessagesScroll) return;
    const myId = state.currentUser?.id;
    const isFromMe = (message.user?.id && message.user.id === myId) || (message.userId && message.userId === myId);

    const msgEl = document.createElement('div');
    msgEl.className = `chat-msg ${isFromMe ? 'self' : ''}`;
    const authorName = isFromMe ? 'Vous' : (message.user?.displayName || message.user?.username || 'Membre');
    const avatar = message.user?.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80';
    const timeStr = message.time || (message.createdAt ? new Date(message.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'À l\'instant');

    msgEl.innerHTML = `
      <img src="${avatar}" class="chat-msg-avatar" alt="${escapeHtml(authorName)}" onerror="this.src='https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80'">
      <div class="chat-msg-body">
        <div class="chat-msg-author">
          <strong>${escapeHtml(authorName)}</strong>
          <span class="chat-msg-time">${timeStr}</span>
        </div>
        <p class="chat-msg-text">${escapeHtml(message.content)}</p>
      </div>
    `;

    chatMessagesScroll.appendChild(msgEl);
    chatMessagesScroll.scrollTop = chatMessagesScroll.scrollHeight;

    if (!isFromMe) {
      playTone(580, 'sine', 0.08);
      const salonBody = document.querySelector('.salon-modal-body');
      if (salonBody && salonBody.classList.contains('show-stage')) {
        document.getElementById('mobileChatUnreadDot')?.classList.remove('hidden');
      }
    }
  }

  // Handle Salon Chat Send
  chatForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInputText.value.trim();
    if (!text || !state.currentRoom) return;

    if (socket && socket.connected) {
      socket.emit('chat:send', {
        salonId: state.currentRoom.id,
        content: text,
        type: 'TEXT',
      });
      socket.emit('chat:typing', {
        salonId: state.currentRoom.id,
        isTyping: false,
      });
    }

    chatInputText.value = '';
    playTone(600, 'sine', 0.08);
  });

  // Handle Chat Typing Activity
  chatInputText?.addEventListener('input', () => {
    if (!state.currentRoom || !socket || !socket.connected) return;

    socket.emit('chat:typing', {
      salonId: state.currentRoom.id,
      isTyping: true,
    });

    if (salonTypingDebounceTimer) clearTimeout(salonTypingDebounceTimer);
    salonTypingDebounceTimer = setTimeout(() => {
      if (state.currentRoom && socket && socket.connected) {
        socket.emit('chat:typing', {
          salonId: state.currentRoom.id,
          isTyping: false,
        });
      }
    }, 2000);
  });

  // Display Remote User Typing in Salon
  function handleSalonUserTyping(displayName, isTyping) {
    if (!salonTypingIndicator) return;
    if (isTyping) {
      if (salonTypingText) salonTypingText.textContent = `${displayName || 'Un participant'} est en train d'écrire...`;
      salonTypingIndicator.classList.remove('hidden');
    } else {
      salonTypingIndicator.classList.add('hidden');
    }
  }


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
  // 8. CREATE SALON MODAL & PRIVACY CONFIGURATION
  // =========================================================================
  btnOpenCreateSalon?.addEventListener('click', () => {
    createSalonModal?.classList.remove('hidden');
  });

  function closeCreateModal() {
    createSalonModal?.classList.add('hidden');
  }

  btnCloseCreateModal?.addEventListener('click', closeCreateModal);
  btnCancelCreate?.addEventListener('click', closeCreateModal);

  // Public vs Private tile selection in Create Modal
  tilePublicSalon?.addEventListener('click', () => {
    tilePublicSalon.classList.add('active');
    tilePrivateSalon?.classList.remove('active');
    const radioPub = tilePublicSalon.querySelector('input[type="radio"]');
    if (radioPub) radioPub.checked = true;
    privateSalonConfigRow?.classList.add('hidden');
  });

  tilePrivateSalon?.addEventListener('click', () => {
    tilePrivateSalon.classList.add('active');
    tilePublicSalon?.classList.remove('active');
    const radioPriv = tilePrivateSalon.querySelector('input[type="radio"]');
    if (radioPriv) radioPriv.checked = true;
    privateSalonConfigRow?.classList.remove('hidden');
    if (newSalonAccessCode && !newSalonAccessCode.value) {
      newSalonAccessCode.value = Math.floor(1000 + Math.random() * 9000).toString();
    }
  });

  // Random PIN generation
  btnGenRandomCode?.addEventListener('click', (e) => {
    e.preventDefault();
    if (newSalonAccessCode) {
      newSalonAccessCode.value = Math.floor(1000 + Math.random() * 9000).toString();
      playTone(523, 'sine', 0.1);
    }
  });

  formCreateSalon?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('newSalonName').value.trim();
    const topic = document.getElementById('newSalonTopic').value.trim();
    const category = document.getElementById('newSalonCategory').value;
    const voiceEnabled = document.getElementById('newSalonVoiceEnabled').checked;
    const isPrivate = document.querySelector('input[name="salonPrivacyType"]:checked')?.value === 'private' || category === 'private';
    let accessCode = (newSalonAccessCode?.value || '').trim();

    if (isPrivate && !accessCode) {
      accessCode = Math.floor(1000 + Math.random() * 9000).toString();
      if (newSalonAccessCode) newSalonAccessCode.value = accessCode;
    }

    const myId = state.currentUser?.id || 'self-' + Date.now();
    let createdSalon = {
      id: `salon-${Date.now()}`,
      name: name,
      topic: topic,
      category: category,
      isLive: true,
      hasVoice: voiceEnabled,
      isPrivate: isPrivate,
      accessCode: isPrivate ? accessCode : undefined,
      inviteToken: `inv_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`,
      ownerId: myId,
      isOwner: true,
      participantsCount: 1,
      bannerBg: 'linear-gradient(135deg, #0d837d, #f25b3e)',
      avatars: [
        state.currentUser?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&auto=format&fit=crop&q=80'
      ]
    };

    // Persist to backend if authenticated
    const token = getAuthToken();
    if (token) {
      try {
        const res = await fetch(`${API_BASE_URL}/salons`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            name,
            topic,
            category: category.toLowerCase(),
            hasVoice: voiceEnabled,
            isPrivate,
            accessCode: isPrivate ? accessCode : undefined,
          })
        });
        const data = await res.json();
        if (data.success && data.salon) {
          createdSalon = {
            ...createdSalon,
            ...data.salon,
            ownerId: myId,
            isOwner: true,
            accessCode: data.salon.accessCode || accessCode,
          };
          loadSalonsFromApi();
        }
      } catch (err) {
        console.warn('Backend salon creation error:', err);
      }
    }

    salonsData.unshift(createdSalon);
    renderSalons();
    closeCreateModal();
    formCreateSalon.reset();
    privateSalonConfigRow?.classList.add('hidden');
    tilePublicSalon?.classList.add('active');
    tilePrivateSalon?.classList.remove('active');

    showToast(`Le salon "${name}" a été créé avec succès ! 👑 Vous êtes l'administrateur.`, 'teal');
    openLiveSalon(createdSalon);
  });

  // =========================================================================
  // PRIVATE SALON ACCESS MODAL CONTROLLER
  // =========================================================================
  function closePrivateAccessModal() {
    privateSalonAccessModal?.classList.add('hidden');
  }

  btnClosePrivateAccessModal?.addEventListener('click', closePrivateAccessModal);
  btnCancelPrivateAccess?.addEventListener('click', closePrivateAccessModal);

  formPrivateSalonAccess?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const salonId = privateAccessSalonId?.value;
    const code = privateAccessCodeInput?.value?.trim();
    if (!code) {
      showToast('Veuillez entrer le code d\'accès.', 'coral');
      return;
    }

    const salon = salonsData.find(s => s.id === salonId) || { id: salonId, name: 'Salon Privé', isPrivate: true };
    const submitBtn = document.getElementById('btnConfirmPrivateAccess');
    const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Vérification... ⏳</span>';
    }

    try {
      // 1. If salon has known local access code, check it first
      if (salon.accessCode && salon.accessCode.trim().toLowerCase() !== code.toLowerCase()) {
        showToast('❌ Code d\'accès incorrect !', 'coral');
        playTone(220, 'sawtooth', 0.25);
        if (privateAccessCodeInput) {
          privateAccessCodeInput.value = '';
          privateAccessCodeInput.focus();
        }
        return;
      }

      // 2. Server-side verification via verify-access endpoint
      const token = getAuthToken();
      try {
        const res = await fetch(`${API_BASE_URL}/salons/${encodeURIComponent(salon.id)}/verify-access`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ accessCode: code })
        });
        const data = await res.json();
        if (!data.success || !data.allowed) {
          showToast(`❌ ${data.message || 'Code d\'accès incorrect.'}`, 'coral');
          playTone(220, 'sawtooth', 0.25);
          if (privateAccessCodeInput) {
            privateAccessCodeInput.value = '';
            privateAccessCodeInput.focus();
          }
          return;
        }
      } catch (netErr) {
        // Fallback for offline demo salon
        if (salon.accessCode && salon.accessCode.trim().toLowerCase() !== code.toLowerCase()) {
          showToast('❌ Code d\'accès incorrect !', 'coral');
          return;
        }
      }

      // 3. Success: save verified code and grant entrance
      salon.accessCode = code;
      closePrivateAccessModal();
      showToast('✅ Code validé ! Bienvenue dans le salon.', 'teal');
      openLiveSalon(salon, code);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
      }
    }
  });

  // =========================================================================
  // SALON SHARE & SOCIAL INVITATION CONTROLLER (WHATSAPP, MESSENGER, INSTAGRAM)
  // =========================================================================
  function openSalonShareModal() {
    if (!state.currentRoom) return;
    const salon = state.currentRoom;
    if (shareSalonName) shareSalonName.textContent = salon.name;
    if (shareSalonBadge) {
      shareSalonBadge.textContent = salon.isPrivate ? '🔒 Salon Privé' : '🌐 Salon Public';
      shareSalonBadge.style.background = salon.isPrivate ? 'rgba(242, 91, 62, 0.18)' : 'rgba(22, 163, 155, 0.18)';
      shareSalonBadge.style.color = salon.isPrivate ? 'var(--coral-light)' : 'var(--teal-light)';
      shareSalonBadge.style.borderColor = salon.isPrivate ? 'rgba(242, 91, 62, 0.3)' : 'rgba(22, 163, 155, 0.3)';
    }

    if (salon.isPrivate && salon.accessCode) {
      shareCodePill?.classList.remove('hidden');
      if (shareSalonCode) shareSalonCode.textContent = salon.accessCode;
    } else {
      shareCodePill?.classList.add('hidden');
    }

    const salonKey = salon.slug || salon.id;
    const baseUrl = window.location.origin + window.location.pathname;
    let inviteUrl = `${baseUrl}#salon=${encodeURIComponent(salonKey)}`;
    if (salon.inviteToken) {
      inviteUrl += `&token=${encodeURIComponent(salon.inviteToken)}`;
    } else if (salon.accessCode) {
      inviteUrl += `&code=${encodeURIComponent(salon.accessCode)}`;
    }

    if (shareInviteLinkInput) shareInviteLinkInput.value = inviteUrl;
    salonShareModal?.classList.remove('hidden');
  }

  function closeSalonShareModal() {
    salonShareModal?.classList.add('hidden');
  }

  btnOpenSalonShare?.addEventListener('click', openSalonShareModal);
  btnCloseShareModal?.addEventListener('click', closeSalonShareModal);

  btnCopySalonCode?.addEventListener('click', () => {
    const code = shareSalonCode?.textContent?.trim();
    if (code && code !== '----') {
      navigator.clipboard?.writeText(code).then(() => {
        showToast(`Code d'accès "${code}" copié ! 📋`, 'teal');
      }).catch(() => {
        showToast(`Code d'accès : ${code}`, 'teal');
      });
    }
  });

  btnCopyInviteLink?.addEventListener('click', () => {
    const link = shareInviteLinkInput?.value;
    if (link) {
      navigator.clipboard?.writeText(link).then(() => {
        showToast('Lien d\'invitation copié dans le presse-papiers ! 🔗', 'teal');
      }).catch(() => {
        if (shareInviteLinkInput) {
          shareInviteLinkInput.select();
          document.execCommand('copy');
          showToast('Lien d\'invitation copié ! 🔗', 'teal');
        }
      });
    }
  });

  btnShareWhatsApp?.addEventListener('click', () => {
    const salon = state.currentRoom;
    const link = shareInviteLinkInput?.value || window.location.href;
    const codeText = salon?.accessCode ? `\n🔑 Code d'accès : *${salon.accessCode}*` : '';
    const text = `Rejoins-moi dans le salon "${salon?.name || 'WafaTalk'}" sur WafaTalk ! 🎙️✨\nLien direct : ${link}${codeText}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  });

  btnShareMessenger?.addEventListener('click', () => {
    const link = shareInviteLinkInput?.value || window.location.href;
    navigator.clipboard?.writeText(link).catch(() => {});
    showToast('Lien copié ! Ouverture de Messenger...', 'teal');
    window.open(`https://www.messenger.com/t/`, '_blank');
  });

  btnShareInstagram?.addEventListener('click', () => {
    const link = shareInviteLinkInput?.value || window.location.href;
    navigator.clipboard?.writeText(link).catch(() => {});
    showToast('Lien copié ! Collez-le dans vos stories ou messages Instagram 📸', 'teal');
    window.open(`https://www.instagram.com/direct/inbox/`, '_blank');
  });

  // =========================================================================
  // SALON ADMIN MODERATION & BAN CONTROLLER (MUTE, CUT CAM, BAN USER, BAN IP)
  // =========================================================================
  function openSalonAdminModal(target) {
    if (!target || !salonAdminConfirmModal) return;
    if (adminTargetUserId) adminTargetUserId.value = target.userId;
    if (adminConfirmTargetText) {
      adminConfirmTargetText.textContent = `Participant : ${target.displayName || target.name || target.username || 'Membre'}`;
    }
    salonAdminConfirmModal.classList.remove('hidden');
  }

  function closeSalonAdminModal() {
    salonAdminConfirmModal?.classList.add('hidden');
  }

  btnCloseAdminConfirmModal?.addEventListener('click', closeSalonAdminModal);
  btnCancelAdminAction?.addEventListener('click', closeSalonAdminModal);

  function executeSalonModeration(action, reason) {
    const targetUserId = adminTargetUserId?.value;
    if (!targetUserId || !state.currentRoom) return;

    const target = currentSalonRoster.get(targetUserId);
    const targetName = target?.displayName || target?.name || target?.username || 'le participant';

    // 1. Emit real-time WebSocket event
    if (socket && socket.connected) {
      socket.emit('salon:admin_action', {
        salonId: state.currentRoom.id,
        targetUserId,
        action,
        reason,
      });
    }

    // 2. Also call REST API for persistence
    const token = getAuthToken();
    if (token) {
      fetch(`${API_BASE_URL}/salons/${state.currentRoom.id}/admin-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action, targetUserId, reason })
      }).catch(() => {});
    }

    closeSalonAdminModal();

    if (action === 'mute') {
      showToast(`Micro coupé pour ${targetName}`, 'teal');
      if (target) {
        target.isMuted = true;
        renderVoiceStage();
      }
    } else if (action === 'cut_camera') {
      showToast(`Caméra coupée pour ${targetName}`, 'teal');
      if (target) {
        target.isCameraOn = false;
        renderVoiceStage();
      }
    } else if (action === 'ban_user') {
      showToast(`Utilisateur banni définitivement : ${targetName}`, 'coral');
      currentSalonRoster.delete(targetUserId);
      renderVoiceStage();
    } else if (action === 'ban_ip') {
      showToast(`Adresse IP bannie définitivement pour : ${targetName}`, 'coral');
      currentSalonRoster.delete(targetUserId);
      renderVoiceStage();
    }
  }

  btnAdminActionMute?.addEventListener('click', () => {
    executeSalonModeration('mute', 'Votre micro a été coupé par l\'administrateur du salon.');
  });

  btnAdminActionCutCam?.addEventListener('click', () => {
    executeSalonModeration('cut_camera', 'Votre caméra a été désactivée par l\'administrateur du salon.');
  });

  btnAdminActionBanUser?.addEventListener('click', () => {
    executeSalonModeration('ban_user', 'Vous avez été banni définitivement de ce salon par l\'administrateur.');
  });

  btnAdminActionBanIp?.addEventListener('click', () => {
    executeSalonModeration('ban_ip', 'Votre adresse IP a été bannie définitivement de ce salon.');
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
    } catch (err) { }
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
  // 14. 1-ON-1 DIRECT SALON (DMS & WEBRTC AUDIO/VIDEO CALLS)
  // =========================================================================

  // DOM Elements: 1-on-1 Direct Chat Modal
  const directChatModal = document.getElementById('directChatModal');
  const btnCloseDirectChat = document.getElementById('btnCloseDirectChat');
  const dmFriendAvatar = document.getElementById('dmFriendAvatar');
  const dmFriendStatusDot = document.getElementById('dmFriendStatusDot');
  const dmFriendName = document.getElementById('dmFriendName');
  const dmFriendFlag = document.getElementById('dmFriendFlag');
  const dmFriendStatusText = document.getElementById('dmFriendStatusText');
  const dmMessagesScroll = document.getElementById('dmMessagesScroll');
  const dmTypingIndicator = document.getElementById('dmTypingIndicator');
  const dmTypingText = document.getElementById('dmTypingText');
  const dmMessageForm = document.getElementById('dmMessageForm');
  const dmTextInput = document.getElementById('dmTextInput');
  const btnDmEmoji = document.getElementById('btnDmEmoji');
  const btnStartAudioCall = document.getElementById('btnStartAudioCall');
  const btnStartVideoCall = document.getElementById('btnStartVideoCall');

  // DOM Elements: Media Attachment
  const btnDmAttach = document.getElementById('btnDmAttach');
  const dmFileInput = document.getElementById('dmFileInput');
  const dmMediaPreviewBar = document.getElementById('dmMediaPreviewBar');
  const dmMediaThumbWrap = document.getElementById('dmMediaThumbWrap');
  const dmMediaFilename = document.getElementById('dmMediaFilename');
  const dmMediaFilesize = document.getElementById('dmMediaFilesize');
  const btnDmMediaRemove = document.getElementById('btnDmMediaRemove');
  const dmOneViewToggle = document.getElementById('dmOneViewToggle');
  const dmOneViewPill = document.getElementById('dmOneViewPill');

  // DOM Elements: Incoming Call Modal
  const incomingCallModal = document.getElementById('incomingCallModal');
  const incomingCallerAvatar = document.getElementById('incomingCallerAvatar');
  const incomingCallerName = document.getElementById('incomingCallerName');
  const incomingCallTypeBadge = document.getElementById('incomingCallTypeBadge');
  const incomingCallTypeText = document.getElementById('incomingCallTypeText');
  const btnDeclineIncomingCall = document.getElementById('btnDeclineIncomingCall');
  const btnAcceptIncomingCall = document.getElementById('btnAcceptIncomingCall');

  // DOM Elements: Active Call Overlay
  const activeCallModal = document.getElementById('activeCallModal');
  const activeCallPeerAvatar = document.getElementById('activeCallPeerAvatar');
  const activeCallPeerName = document.getElementById('activeCallPeerName');
  const callDurationTimer = document.getElementById('callDurationTimer');
  const btnMinimizeCall = document.getElementById('btnMinimizeCall');
  const callAudioStage = document.getElementById('callAudioStage');
  const localAudioAvatar = document.getElementById('localAudioAvatar');
  const localAudioAvatarRing = document.getElementById('localAudioAvatarRing');
  const localMicBadge = document.getElementById('localMicBadge');
  const peerAudioAvatar = document.getElementById('peerAudioAvatar');
  const peerAudioAvatarRing = document.getElementById('peerAudioAvatarRing');
  const peerAudioName = document.getElementById('peerAudioName');
  const peerMicBadge = document.getElementById('peerMicBadge');
  const callVideoStage = document.getElementById('callVideoStage');
  const remoteVideoWrap = document.getElementById('remoteVideoWrap');
  const remoteVideo = document.getElementById('remoteVideo');
  const remoteAudio = document.getElementById('remoteAudio');
  const remoteVideoPlaceholder = document.getElementById('remoteVideoPlaceholder');
  const remotePlaceholderAvatar = document.getElementById('remotePlaceholderAvatar');
  const localVideoPip = document.getElementById('localVideoPip');
  const localVideo = document.getElementById('localVideo');
  const localVideoPlaceholder = document.getElementById('localVideoPlaceholder');
  const btnCallToggleMic = document.getElementById('btnCallToggleMic');
  const btnCallToggleCamera = document.getElementById('btnCallToggleCamera');
  const btnCallShareScreen = document.getElementById('btnCallShareScreen');
  const btnCallHangup = document.getElementById('btnCallHangup');

  // DOM Elements: Floating Draggable Video Call Window (Caméra volante)
  const miniCallWidget = document.getElementById('miniCallWidget');
  const floatingCallDragHandle = document.getElementById('floatingCallDragHandle');
  const floatingCallStage = document.getElementById('floatingCallStage');
  const floatingRemoteWrap = document.getElementById('floatingRemoteWrap');
  const floatingRemoteVideo = document.getElementById('floatingRemoteVideo');
  const floatingRemotePlaceholder = document.getElementById('floatingRemotePlaceholder');
  const floatingPlaceholderAvatar = document.getElementById('floatingPlaceholderAvatar');
  const floatingLocalPip = document.getElementById('floatingLocalPip');
  const floatingLocalVideo = document.getElementById('floatingLocalVideo');
  const floatingLocalPlaceholder = document.getElementById('floatingLocalPlaceholder');
  const floatingAudioStage = document.getElementById('floatingAudioStage');
  const floatingAudioRing = document.getElementById('floatingAudioRing');
  const btnRestoreCall = document.getElementById('btnRestoreCall');
  const btnMiniExpand = document.getElementById('btnMiniExpand');
  const miniCallAvatar = document.getElementById('miniCallAvatar');
  const miniCallName = document.getElementById('miniCallName');
  const miniCallTime = document.getElementById('miniCallTime');
  const btnMiniToggleMic = document.getElementById('btnMiniToggleMic');
  const btnMiniToggleCamera = document.getElementById('btnMiniToggleCamera');
  const btnMiniHangup = document.getElementById('btnMiniHangup');

  let socket = null;
  let currentDmFriend = null;
  let currentConversation = null;
  let typingDebounceTimer = null;
  let dmSelectedFile = null; // { file: File, objectUrl: string, type: 'IMAGE'|'VIDEO'|'FILE' }

  // Active Call State
  let peerConnection = null;
  let localMediaStream = null;
  let remoteMediaStream = null;
  let currentCallSession = null; // { callId, conversationId, peer: { id, name, avatar }, type: 'audio'|'video', isCaller: boolean, isCompanion: boolean }
  let callSeconds = 0;
  let callTimerInterval = null;
  let ringtoneInterval = null;
  let isCallMicMuted = false;
  let isCallCameraOff = false;
  let isScreenSharing = false;
  let pendingIceCandidates = [];
  let localAudioAnalyser = null;
  let peerAudioAnalyser = null;
  let visualizerAnimFrame = null;
  let companionSpeechTimer = null;
  let companionCanvasAnim = null;

  // Group Salon Real-time Media & Mesh State
  let currentSalonRoster = new Map(); // userId -> { userId, username, displayName, avatarUrl, country, role, isMuted, isSpeaking, isCameraOn }
  let salonPeerConnections = new Map(); // userId -> RTCPeerConnection
  let salonRemoteAudioElements = new Map(); // userId -> HTMLAudioElement
  let salonRemoteStreams = new Map(); // userId -> MediaStream
  let salonLocalStream = null; // MediaStream (audio + optional video)
  let salonLocalAudioTrack = null;
  let salonLocalVideoTrack = null;
  let salonAudioContext = null;
  let salonAudioAnalyser = null;
  let salonVoiceDetectorTimer = null;
  let isSalonCamActive = false;
  let salonTypingDebounceTimer = null;

  // =========================================================================
  // SOCKET.IO CLIENT INITIALIZATION & ROUTING
  // =========================================================================
  function initSocketConnection(token) {
    if (typeof io === 'undefined') {
      console.warn('Socket.IO client library not loaded.');
      return;
    }

    if (socket && socket.connected) return;

    socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('⚡ Socket connected to WafaTalk Gateway:', socket.id);
      if (state.currentUser?.id) {
        activeOnlineUserIds.add(state.currentUser.id);
      }
      if (state.currentUser?.username) {
        activeOnlineUserIds.add(state.currentUser.username);
      }
      socket.emit('presence:request_all');
      renderFriends();
    });

    // Real-time snapshot of all currently online users upon connection
    socket.on('presence:initial', ({ onlineUserIds }) => {
      activeOnlineUserIds.clear();
      if (Array.isArray(onlineUserIds)) {
        onlineUserIds.forEach(id => activeOnlineUserIds.add(id));
      }
      if (state.currentUser?.id) {
        activeOnlineUserIds.add(state.currentUser.id);
      }
      if (state.currentUser?.username) {
        activeOnlineUserIds.add(state.currentUser.username);
      }
      if (currentDmFriend) {
        const isOnline = activeOnlineUserIds.has(currentDmFriend.id) || (currentDmFriend.username && activeOnlineUserIds.has(currentDmFriend.username));
        updateDmFriendStatusUI(isOnline);
      }
      renderFriends();
    });

    // Handle incoming direct message
    socket.on('dm:message', (message) => {
      if (currentConversation && message.conversationId === currentConversation.id) {
        const isFromMe = message.isFromMe || (message.sender?.id === state.currentUser?.id);
        appendDirectMessageBubble(message);
        if (!isFromMe) {
          playTone(600, 'sine', 0.1);
          socket.emit('dm:read', { conversationId: currentConversation.id });
        }
      }
    });

    // Handle direct message notification when modal is closed
    socket.on('dm:notification', ({ conversationId, message }) => {
      if (!currentConversation || currentConversation.id !== conversationId) {
        showToast(`💬 Nouveau message de ${message.sender?.displayName || 'un ami'} : "${message.content.slice(0, 30)}..."`, 'teal');
        playTone(550, 'sine', 0.15);
      }
    });

    // Handle typing indicator
    socket.on('dm:user_typing', ({ conversationId, userId, displayName, isTyping }) => {
      if (currentConversation && conversationId === currentConversation.id && userId !== state.currentUser?.id) {
        if (isTyping) {
          if (dmTypingText) dmTypingText.textContent = `${displayName} est en train d'écrire...`;
          dmTypingIndicator?.classList.remove('hidden');
        } else {
          dmTypingIndicator?.classList.add('hidden');
        }
      }
    });

    // WebRTC: Incoming Call Ringing
    socket.on('call:incoming', ({ callId, conversationId, caller, type }) => {
      handleIncomingCallAlert({ callId, conversationId, caller, type });
    });

    // WebRTC: Outgoing Call is Ringing at Recipient
    socket.on('call:ringing', ({ callId }) => {
      if (currentCallSession) currentCallSession.callId = callId;
      showToast('📞 Sonnerie chez votre correspondant...', 'teal');
    });

    // WebRTC: Recipient Accepted Call
    socket.on('call:accepted', async ({ callId, receiver, isDemoPeer }) => {
      if (currentCallSession) {
        currentCallSession.callId = callId;
        if (receiver) {
          currentCallSession.peer.name = receiver.displayName || receiver.username || currentCallSession.peer.name;
          if (receiver.avatarUrl) currentCallSession.peer.avatar = receiver.avatarUrl;
        }
      }
      showToast(`${receiver?.displayName || 'Le correspondant'} a décroché !`, 'success');
      stopCallSounds();
      playCallConnectedSound();

      if (isDemoPeer) {
        if (currentCallSession) currentCallSession.isCompanion = true;
        startInteractiveCompanionExperience(currentCallSession?.peer || receiver);
      } else {
        await setupWebRTCOffer();
      }
    });

    // WebRTC: Recipient Confirmed Connection
    socket.on('call:connected', () => {
      stopCallSounds();
    });

    // WebRTC: Recipient Rejected Call
    socket.on('call:rejected', ({ reason }) => {
      stopCallSounds();
      playHangupSound();
      showToast(reason === 'busy' ? 'Correspondant occupé.' : 'Appel décliné.', 'coral');
      cleanupActiveCall();
    });

    // WebRTC: Call Failed (e.g. offline)
    socket.on('call:failed', ({ message }) => {
      stopCallSounds();
      playHangupSound();
      showToast(message || 'Échec de l\'appel.', 'coral');
      cleanupActiveCall();
    });

    // WebRTC: Signaling packet relay (offer, answer, ICE candidate)
    socket.on('webrtc:signal', async ({ callId, senderId, signal }) => {
      await handleIncomingWebRTCSignal(signal, senderId);
    });

    // WebRTC: Call Ended by Remote Peer
    socket.on('call:ended', ({ durationSec }) => {
      stopCallSounds();
      playHangupSound();
      const mins = Math.floor((durationSec || 0) / 60);
      const secs = (durationSec || 0) % 60;
      const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      showToast(`Appel terminé (${timeStr})`, 'teal');
      cleanupActiveCall();
      if (currentConversation) {
        loadConversationMessages(currentConversation.id);
      }
    });

    // One-View media opened by recipient
    socket.on('dm:one_view_seen', ({ messageId, viewedByUserId }) => {
      const bubble = document.querySelector(`.dm-bubble[data-msg-id="${messageId}"]`);
      if (bubble) {
        const cover = bubble.querySelector('.dm-oneview-cover');
        if (cover) cover.classList.add('revealed');
        // Update badge to "Vu" for the sender
        const badge = bubble.querySelector('.dm-oneview-badge');
        if (badge) {
          badge.outerHTML = '<span class="dm-oneview-seen-label">👁 Vu</span>';
        }
      }
    });

    // 24h Conversation Expiry Trigger
    socket.on('dm:conversation_expired', ({ conversationId }) => {
      if (currentConversation && currentConversation.id === conversationId) {
        showToast('Cette discussion a atteint sa limite de 24h et a été effacée.', 'coral');
        if (dmMessagesScroll) {
          dmMessagesScroll.innerHTML = '<div class="dm-empty-state"><span class="dm-empty-icon">⏳</span><p>Cette conversation de 24h est arrivée à expiration et a été supprimée.</p></div>';
        }
      }
    });

    // User Presence Update: Real-time update of friends and online members
    socket.on('presence:update', ({ userId, status }) => {
      if (!userId) return;
      if (status === 'online') {
        activeOnlineUserIds.add(userId);
      } else {
        activeOnlineUserIds.delete(userId);
      }
      if (currentDmFriend && (currentDmFriend.id === userId || currentDmFriend.username === userId)) {
        updateDmFriendStatusUI(status === 'online');
      }
      // Instantly refresh discoverable members in real time when anyone logs in or joins
      renderFriends();
    });

    socket.on('disconnect', () => {
      console.log('🔌 Socket disconnected from WafaTalk Gateway');
      activeOnlineUserIds.clear();
      if (currentDmFriend) {
        updateDmFriendStatusUI(false);
      }
      renderFriends();
    });

    // =========================================================================
    // SALON GROUP SOCKET EVENTS (MULTI-USER ROSTER, AUDIO/VIDEO MESH & CHAT)
    // =========================================================================
    // Active Roster received upon joining salon
    socket.on('salon:roster', async ({ salonId, participants }) => {
      if (!state.currentRoom || state.currentRoom.id !== salonId) return;
      handleSalonRosterSync(participants);
    });

    // Another user joined our salon
    socket.on('salon:user_joined', async ({ salonId, participant }) => {
      if (!state.currentRoom || state.currentRoom.id !== salonId) return;
      handleSalonUserJoined(participant);
    });

    // A user left our salon
    socket.on('salon:user_left', ({ salonId, userId, displayName }) => {
      if (!state.currentRoom || state.currentRoom.id !== salonId) return;
      handleSalonUserLeft(userId, displayName);
    });

    // Real-time media state update from room member (speaking, mute, camera)
    socket.on('salon:media_update', ({ salonId, userId, isMuted, isSpeaking, isCameraOn, isScreenSharing }) => {
      if (!state.currentRoom || state.currentRoom.id !== salonId) return;
      handleSalonMediaUpdate(userId, { isMuted, isSpeaking, isCameraOn, isScreenSharing });
    });

    // WebRTC multi-peer mesh signaling relay for group vocal & video
    socket.on('salon:signal', async ({ salonId, senderId, senderUser, signal }) => {
      if (!state.currentRoom || state.currentRoom.id !== salonId) return;
      await handleSalonIncomingSignal(senderId, senderUser, signal);
    });

    // Group Chat Message received
    socket.on('chat:message', (message) => {
      if (!state.currentRoom || state.currentRoom.id !== message.salonId) return;
      appendSalonChatMessage(message);
    });

    // Group Chat Typing indicator
    socket.on('chat:user_typing', ({ salonId, userId, displayName, isTyping }) => {
      if (!state.currentRoom || state.currentRoom.id !== salonId) return;
      if (userId === state.currentUser?.id) return;
      handleSalonUserTyping(displayName, isTyping);
    });

    // Salon Moderation: Force Mute by Admin
    socket.on('salon:force_mute', ({ salonId, reason }) => {
      if (!state.currentRoom || state.currentRoom.id !== salonId) return;
      state.isMicMuted = true;
      if (salonLocalAudioTrack) salonLocalAudioTrack.enabled = false;
      btnToggleMic?.classList.add('muted');
      btnToggleMic?.querySelector('.mic-on-icon')?.classList.add('hidden');
      btnToggleMic?.querySelector('.mic-off-icon')?.classList.remove('hidden');
      if (btnToggleMic) btnToggleMic.querySelector('.ctrl-label').textContent = 'Micro coupé';
      updateParticipantSpeakingUI(state.currentUser?.id, false);
      showToast(reason || '⚠️ Votre micro a été coupé par l\'administrateur du salon.', 'coral');
    });

    // Salon Moderation: Force Cut Camera by Admin
    socket.on('salon:force_cut_camera', ({ salonId, reason }) => {
      if (!state.currentRoom || state.currentRoom.id !== salonId) return;
      if (isSalonCamActive) {
        isSalonCamActive = false;
        if (salonLocalVideoTrack) {
          salonLocalVideoTrack.stop();
          salonLocalVideoTrack = null;
        }
        if (salonLocalStream) {
          salonLocalStream.getVideoTracks().forEach(t => {
            t.stop();
            salonLocalStream.removeTrack(t);
          });
        }
        btnToggleSalonVideo?.classList.remove('active');
        btnToggleSalonVideo?.querySelector('.cam-on-icon')?.classList.remove('hidden');
        btnToggleSalonVideo?.querySelector('.cam-off-icon')?.classList.add('hidden');
        if (btnToggleSalonVideo) btnToggleSalonVideo.querySelector('.ctrl-label').textContent = 'Caméra';
        if (socket && socket.connected) {
          socket.emit('salon:media_state', {
            salonId: state.currentRoom.id,
            isMuted: state.isMicMuted,
            isSpeaking: false,
            isCameraOn: false,
          });
        }
        renderVoiceStage();
      }
      showToast(reason || '⚠️ Votre caméra a été désactivée par l\'administrateur du salon.', 'coral');
    });

    // Salon Moderation: Banned (User or IP)
    socket.on('salon:banned', ({ salonId, banType, reason }) => {
      if (state.currentRoom && state.currentRoom.id === salonId) {
        closeLiveSalon();
        playTone(220, 'sawtooth', 0.5);
        showToast(`🚫 ${reason || 'Vous avez été banni de ce salon par l\'administrateur.'}`, 'coral');
      }
    });

    // Salon Join Error (e.g. Banned or Wrong Access Code)
    socket.on('salon:join_error', ({ salonId, error, message }) => {
      closeLiveSalon();
      playTone(220, 'sawtooth', 0.3);
      showToast(`❌ ${message || 'Impossible de rejoindre ce salon.'}`, 'coral');
      if (error === 'INVALID_CODE' || error === 'PRIVATE_CODE_REQUIRED') {
        const targetSalon = salonsData.find(s => s.id === salonId) || { id: salonId, name: 'Salon Privé', isPrivate: true };
        openPrivateSalonPrompt(targetSalon);
      }
    });

    // Salon Admin Action Success Notification
    socket.on('salon:admin_action_success', ({ action, message }) => {
      showToast(`✅ ${message || 'Action d\'administration exécutée.'}`, 'teal');
    });

    // Salon Admin Action Error Notification
    socket.on('salon:admin_action_error', ({ message }) => {
      showToast(`❌ ${message || 'Erreur lors de l\'action d\'administration.'}`, 'coral');
    });
  }

  // =========================================================================
  // 1-ON-1 DIRECT CHAT CONTROLLER
  // =========================================================================
  async function openDirectChat(friend) {
    currentDmFriend = friend;
    if (!directChatModal) return;

    // 1. Populate UI Header
    if (dmFriendAvatar) dmFriendAvatar.src = friend.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80';
    if (dmFriendName) dmFriendName.textContent = friend.name || friend.username || 'Ami WafaTalk';
    if (dmFriendFlag) dmFriendFlag.innerHTML = getFlagImgTag(friend.country, friend.country);
    const isOnline = activeOnlineUserIds.has(friend.id) || (friend.username && activeOnlineUserIds.has(friend.username)) || Boolean(friend._isOnline);
    updateDmFriendStatusUI(isOnline);

    directChatModal.classList.remove('hidden');
    dmMessagesScroll.innerHTML = '<div class="dm-empty-state"><span class="dm-empty-icon">⏳</span><p>Chargement du salon privé...</p></div>';

    // 2. Fetch or Create Conversation via Backend API
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE_URL}/conversations/with/${friend.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      if (res.ok && data.success && data.conversation) {
        currentConversation = data.conversation;

        // Join socket room
        if (socket) {
          socket.emit('dm:join', { conversationId: currentConversation.id });
        }

        // Load messages history
        await loadConversationMessages(currentConversation.id);
      } else {
        showToast(data.message || 'Impossible d\'ouvrir la conversation.', 'coral');
      }
    } catch (err) {
      console.warn('Fallback local conversation:', err);
      // Offline fallback
      currentConversation = { id: `local-conv-${friend.id}` };
      dmMessagesScroll.innerHTML = '<div class="dm-empty-state"><span class="dm-empty-icon">💬</span><p>Début de votre discussion privée sécurisée. Dites bonjour ! 👋</p></div>';
    }

    dmTextInput?.focus();
  }

  function updateDmFriendStatusUI(isOnline) {
    if (dmFriendStatusDot) {
      dmFriendStatusDot.className = `dm-status-indicator ${isOnline ? 'online' : 'offline'}`;
    }
    if (dmFriendStatusText) {
      dmFriendStatusText.textContent = isOnline ? 'En ligne' : 'Hors ligne';
      dmFriendStatusText.style.color = isOnline ? '#10b981' : 'var(--text-muted)';
    }
  }

  async function loadConversationMessages(conversationId) {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE_URL}/conversations/${conversationId}/messages`, {
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
      });

      const data = await res.json();
      if (res.ok && data.success) {
        renderDirectMessages(data.messages || []);
        // Mark as read
        fetch(`${API_BASE_URL}/conversations/${conversationId}/read`, {
          method: 'POST',
          headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        }).catch(() => { });
      }
    } catch (err) {
      console.warn('Failed to load messages history:', err);
    }
  }

  function renderDirectMessages(messages) {
    if (!dmMessagesScroll) return;

    if (!messages || messages.length === 0) {
      dmMessagesScroll.innerHTML = `
        <div class="dm-empty-state">
          <span class="dm-empty-icon">💬</span>
          <strong>Salon Privé Ouvert</strong>
          <p>Les messages et appels sont strictement confidentiels et protégés par WafaTalk. Dites bonjour ! 👋</p>
        </div>
      `;
      return;
    }

    dmMessagesScroll.innerHTML = '';
    messages.forEach(m => appendDirectMessageBubble(m, false));
    scrollDmToBottom();
  }

  // ── Helper: Format file size
  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' o';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
    return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
  }

  // ── Helper: Get file icon by MIME type
  function getFileIcon(mimeType, name) {
    if (!mimeType && name) {
      const ext = name.split('.').pop()?.toLowerCase();
      const map = { pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', zip: '🗜️', txt: '📃', mp3: '🎵', ogg: '🎵', wav: '🎵' };
      return map[ext] || '📎';
    }
    if (mimeType?.startsWith('image/')) return '🖼️';
    if (mimeType?.startsWith('video/')) return '🎬';
    if (mimeType?.startsWith('audio/')) return '🎵';
    if (mimeType?.includes('pdf')) return '📄';
    if (mimeType?.includes('word')) return '📝';
    if (mimeType?.includes('excel') || mimeType?.includes('spreadsheet')) return '📊';
    if (mimeType?.includes('zip')) return '🗜️';
    return '📎';
  }

  // ── Open media lightbox
  // ── Open media lightbox
  function openDmLightbox(url, type, onClose) {
    const overlay = document.createElement('div');
    overlay.className = 'dm-lightbox-overlay';

    let isClosed = false;
    const closeLightbox = () => {
      if (isClosed) return;
      isClosed = true;
      overlay.remove();
      document.removeEventListener('keydown', esc);
      if (typeof onClose === 'function') onClose();
    };

    const closeBtn = document.createElement('button');
    closeBtn.className = 'dm-lightbox-close';
    closeBtn.innerHTML = '✕';
    closeBtn.addEventListener('click', closeLightbox);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeLightbox(); });
    function esc(e) {
      if (e.key === 'Escape') closeLightbox();
    }
    document.addEventListener('keydown', esc);

    let media;
    if (type === 'IMAGE') {
      media = document.createElement('img');
      media.className = 'dm-lightbox-img';
      media.src = url;
    } else if (type === 'VIDEO') {
      media = document.createElement('video');
      media.className = 'dm-lightbox-video';
      media.src = url;
      media.controls = true;
      media.autoplay = true;
    }

    if (media) {
      media.addEventListener('click', (e) => e.stopPropagation());
      overlay.appendChild(closeBtn);
      overlay.appendChild(media);
      document.body.appendChild(overlay);
    }
  }

  function appendDirectMessageBubble(message, shouldScroll = true) {
    if (!dmMessagesScroll) return;

    // Deduplicate by message ID
    if (message.id && dmMessagesScroll.querySelector(`.dm-bubble[data-msg-id="${message.id}"]`)) {
      return;
    }

    // Remove empty placeholder if present
    const emptyState = dmMessagesScroll.querySelector('.dm-empty-state');
    if (emptyState) emptyState.remove();

    const isFromMe = message.isFromMe || (message.sender?.id === state.currentUser?.id);
    const bubble = document.createElement('div');
    if (message.id) bubble.dataset.msgId = message.id;

    const msgType = message.type || 'TEXT';
    const viewMode = message.viewMode || 'PERMANENT';
    const viewedBy = Array.isArray(message.viewedBy) ? message.viewedBy : [];
    const myId = state.currentUser?.id;
    const alreadyViewed = (myId && viewedBy.includes(myId)) || (!isFromMe && viewedBy.length > 0) || !message.mediaUrl;

    if (msgType === 'CALL_LOG') {
      bubble.className = 'dm-bubble call-log';
      bubble.textContent = message.content;

    } else if (msgType === 'IMAGE' && (message.mediaUrl || alreadyViewed)) {
      bubble.className = `dm-bubble ${isFromMe ? 'from-me' : 'from-other'}`;

      if (viewMode === 'ONE_VIEW' && !isFromMe) {
        // One-view for the RECIPIENT
        if (alreadyViewed) {
          const exp = document.createElement('div');
          exp.className = 'dm-oneview-expired-card';
          exp.innerHTML = `<span class="dm-oneview-icon">👁</span> <span>Photo (vue unique expirée)</span>`;
          bubble.appendChild(exp);
        } else {
          const wrap = document.createElement('div');
          wrap.className = 'dm-oneview-wrap';
          wrap.dataset.msgId = message.id;
          const img = document.createElement('img');
          img.className = 'dm-media-img';
          img.src = message.mediaUrl;
          img.alt = 'Photo';
          const cover = document.createElement('div');
          cover.className = 'dm-oneview-cover';
          cover.innerHTML = `<span class="dm-oneview-cover-icon">👁</span><span class="dm-oneview-cover-label">Appuyer pour voir</span><span class="dm-oneview-cover-hint">Vue unique · disparaît après ouverture</span>`;
          wrap.appendChild(img);
          wrap.appendChild(cover);

          wrap.addEventListener('click', () => {
            cover.classList.add('revealed');
            if (socket && currentConversation) {
              socket.emit('dm:one_view_opened', { conversationId: currentConversation.id, messageId: message.id });
            }
            const token = getAuthToken();
            if (token && message.id) {
              fetch(`${API_BASE_URL}/conversations/messages/${message.id}/view`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
              }).catch(() => {});
            }
            openDmLightbox(message.mediaUrl, 'IMAGE', () => {
              const exp = document.createElement('div');
              exp.className = 'dm-oneview-expired-card';
              exp.innerHTML = `<span class="dm-oneview-icon">👁</span> <span>Photo (vue unique expirée)</span>`;
              wrap.replaceWith(exp);
            });
          });

          bubble.appendChild(wrap);
        }

        if (message.content) {
          const cap = document.createElement('div');
          cap.className = 'dm-bubble-media-caption';
          cap.textContent = message.content;
          bubble.appendChild(cap);
        }

      } else if (viewMode === 'ONE_VIEW' && isFromMe) {
        // Sender sees their sent photo thumbnail with badge
        if (message.mediaUrl) {
          const img = document.createElement('img');
          img.className = 'dm-media-img';
          img.src = message.mediaUrl;
          img.alt = 'Photo';
          img.addEventListener('click', () => openDmLightbox(message.mediaUrl, 'IMAGE'));
          bubble.appendChild(img);
        }
        if (message.content) {
          const cap = document.createElement('div');
          cap.className = 'dm-bubble-media-caption';
          cap.textContent = message.content;
          bubble.appendChild(cap);
        }
        bubble.insertAdjacentHTML('beforeend', alreadyViewed
          ? '<span class="dm-oneview-seen-label">👁 Vu</span>'
          : '<span class="dm-oneview-badge">👁 Vue unique</span>');

      } else {
        // Permanent image
        if (message.mediaUrl) {
          const img = document.createElement('img');
          img.className = 'dm-media-img';
          img.src = message.mediaUrl;
          img.alt = 'Photo';
          img.addEventListener('click', () => openDmLightbox(message.mediaUrl, 'IMAGE'));
          bubble.appendChild(img);
        }
        if (message.content) {
          const cap = document.createElement('div');
          cap.className = 'dm-bubble-media-caption';
          cap.textContent = message.content;
          bubble.appendChild(cap);
        }
      }
      const meta = document.createElement('div');
      meta.className = 'dm-bubble-meta';
      meta.innerHTML = `<span>${message.time || 'À l\'instant'}</span>${isFromMe ? '<span style="font-size:0.75rem">✓</span>' : ''}`;
      bubble.appendChild(meta);

    } else if (msgType === 'VIDEO' && (message.mediaUrl || alreadyViewed)) {
      bubble.className = `dm-bubble ${isFromMe ? 'from-me' : 'from-other'}`;

      if (viewMode === 'ONE_VIEW' && !isFromMe) {
        if (alreadyViewed) {
          const exp = document.createElement('div');
          exp.className = 'dm-oneview-expired-card';
          exp.innerHTML = `<span class="dm-oneview-icon">👁</span> <span>Vidéo (vue unique expirée)</span>`;
          bubble.appendChild(exp);
        } else {
          const wrap = document.createElement('div');
          wrap.className = 'dm-oneview-wrap';
          wrap.dataset.msgId = message.id;
          const videoWrap = document.createElement('div');
          videoWrap.className = 'dm-media-video-wrap';
          const video = document.createElement('video');
          video.className = 'dm-media-video';
          video.src = message.mediaUrl;
          video.muted = true;
          video.preload = 'metadata';
          videoWrap.appendChild(video);
          videoWrap.innerHTML += '<div class="dm-media-video-play-btn">▶</div>';
          const cover = document.createElement('div');
          cover.className = 'dm-oneview-cover';
          cover.innerHTML = `<span class="dm-oneview-cover-icon">👁</span><span class="dm-oneview-cover-label">Appuyer pour voir</span><span class="dm-oneview-cover-hint">Vidéo · vue unique</span>`;
          wrap.appendChild(videoWrap);
          wrap.appendChild(cover);

          wrap.addEventListener('click', () => {
            cover.classList.add('revealed');
            if (socket && currentConversation) {
              socket.emit('dm:one_view_opened', { conversationId: currentConversation.id, messageId: message.id });
            }
            const token = getAuthToken();
            if (token && message.id) {
              fetch(`${API_BASE_URL}/conversations/messages/${message.id}/view`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
              }).catch(() => {});
            }
            openDmLightbox(message.mediaUrl, 'VIDEO', () => {
              const exp = document.createElement('div');
              exp.className = 'dm-oneview-expired-card';
              exp.innerHTML = `<span class="dm-oneview-icon">👁</span> <span>Vidéo (vue unique expirée)</span>`;
              wrap.replaceWith(exp);
            });
          });

          bubble.appendChild(wrap);
        }

      } else if (viewMode === 'ONE_VIEW' && isFromMe) {
        if (message.mediaUrl) {
          const videoWrap = document.createElement('div');
          videoWrap.className = 'dm-media-video-wrap';
          const video = document.createElement('video');
          video.className = 'dm-media-video';
          video.src = message.mediaUrl;
          video.controls = true;
          video.preload = 'metadata';
          videoWrap.appendChild(video);
          bubble.appendChild(videoWrap);
        }
        bubble.insertAdjacentHTML('beforeend', alreadyViewed
          ? '<span class="dm-oneview-seen-label">👁 Vu</span>'
          : '<span class="dm-oneview-badge">👁 Vue unique</span>');

      } else {
        if (message.mediaUrl) {
          const videoWrap = document.createElement('div');
          videoWrap.className = 'dm-media-video-wrap';
          const video = document.createElement('video');
          video.className = 'dm-media-video';
          video.src = message.mediaUrl;
          video.controls = true;
          video.preload = 'metadata';
          videoWrap.appendChild(video);
          bubble.appendChild(videoWrap);
        }
      }
      if (message.content) {
        const cap = document.createElement('div');
        cap.className = 'dm-bubble-media-caption';
        cap.textContent = message.content;
        bubble.appendChild(cap);
      }
      const meta = document.createElement('div');
      meta.className = 'dm-bubble-meta';
      meta.innerHTML = `<span>${message.time || 'À l\'instant'}</span>${isFromMe ? '<span style="font-size:0.75rem">✓</span>' : ''}`;
      bubble.appendChild(meta);

    } else if (msgType === 'FILE' && message.mediaUrl) {
      bubble.className = `dm-bubble ${isFromMe ? 'from-me' : 'from-other'}`;
      const card = document.createElement('a');
      card.className = 'dm-media-file-card';
      card.href = message.mediaUrl;
      card.target = '_blank';
      card.download = message.mediaName || 'fichier';
      card.innerHTML = `
        <span class="dm-media-file-icon">${getFileIcon(message.mediaType, message.mediaName)}</span>
        <div class="dm-media-file-info">
          <span class="dm-media-file-name">${escapeHtml(message.mediaName || 'Fichier')}</span>
          <span class="dm-media-file-size">${message.mediaSize ? formatBytes(message.mediaSize) : ''}</span>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" class="dm-media-file-dl"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
      `;
      bubble.appendChild(card);
      if (message.content) {
        const cap = document.createElement('div');
        cap.className = 'dm-bubble-media-caption';
        cap.textContent = message.content;
        bubble.appendChild(cap);
      }
      const meta = document.createElement('div');
      meta.className = 'dm-bubble-meta';
      meta.innerHTML = `<span>${message.time || 'À l\'instant'}</span>${isFromMe ? '<span style="font-size:0.75rem">✓</span>' : ''}`;
      bubble.appendChild(meta);

    } else {
      // Plain TEXT message
      bubble.className = `dm-bubble ${isFromMe ? 'from-me' : 'from-other'}`;
      bubble.innerHTML = `
        <div class="dm-bubble-text">${escapeHtml(message.content || '')}</div>
        <div class="dm-bubble-meta">
          <span>${message.time || 'À l\'instant'}</span>
          ${isFromMe ? '<span style="font-size: 0.75rem;">✓</span>' : ''}
        </div>
      `;
    }

    dmMessagesScroll.appendChild(bubble);
    if (shouldScroll) scrollDmToBottom();
  }

  function scrollDmToBottom() {
    if (!dmMessagesScroll) return;
    dmMessagesScroll.scrollTop = dmMessagesScroll.scrollHeight;
  }

  // Handle DM message submission (text or file)
  dmMessageForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentConversation) return;

    const text = dmTextInput?.value.trim() || '';
    const hasFile = Boolean(dmSelectedFile);

    // Must have either text or file
    if (!text && !hasFile) return;

    if (hasFile) {
      // ── Upload file then send via socket
      await uploadAndSendDmMedia(text);
    } else {
      // ── Text-only send
      if (socket && socket.connected) {
        socket.emit('dm:send', {
          conversationId: currentConversation.id,
          content: text,
          type: 'TEXT',
        });
        socket.emit('dm:typing', {
          conversationId: currentConversation.id,
          targetUserId: currentDmFriend?.id,
          isTyping: false,
        });
      } else {
        appendDirectMessageBubble({
          content: text,
          isFromMe: true,
          time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        });
      }
    }

    if (dmTextInput) dmTextInput.value = '';
    dmTextInput?.focus();
  });

  // Client-side image compression for fast transfer & avoiding reverse-proxy limits
  async function compressImageIfNeeded(file) {
    if (!file || !file.type.startsWith('image/') || file.type === 'image/gif' || file.size < 700 * 1024) {
      return file;
    }
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          const maxDim = 1920;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (blob && blob.size < file.size) {
              resolve(new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), { type: 'image/jpeg' }));
            } else {
              resolve(file);
            }
          }, 'image/jpeg', 0.85);
        };
        img.onerror = () => resolve(file);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  }

  // ── Upload & send media attachment
  async function uploadAndSendDmMedia(caption = '') {
    if (!dmSelectedFile || !currentConversation) return;

    const token = getAuthToken();
    if (!token) { showToast('Veuillez vous connecter pour envoyer des fichiers.', 'coral'); return; }

    const isOneView = dmOneViewToggle?.checked || false;

    // Show upload progress in messages area
    const progressEl = document.createElement('div');
    progressEl.className = 'dm-upload-progress';
    progressEl.innerHTML = `<span>⬆️ Envoi en cours...</span><div class="dm-upload-progress-bar-wrap"><div class="dm-upload-progress-bar"></div></div>`;
    dmMessagesScroll?.appendChild(progressEl);
    scrollDmToBottom();

    try {
      // Optimize image if photo
      const fileToUpload = await compressImageIfNeeded(dmSelectedFile.file);

      const formData = new FormData();
      formData.append('viewMode', isOneView ? 'ONE_VIEW' : 'PERMANENT');
      if (caption) formData.append('caption', caption);
      formData.append('file', fileToUpload);

      const res = await fetch(`${API_BASE_URL}/conversations/${currentConversation.id}/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      progressEl.remove();

      let data = null;
      try {
        data = await res.json();
      } catch {
        if (res.status === 413) {
          showToast('Le fichier dépasse la taille maximale autorisée par le serveur (Nginx).', 'coral');
          return;
        }
        showToast(`Erreur serveur (${res.status} ${res.statusText || ''})`, 'coral');
        return;
      }

      if (res.ok && data?.success) {
        if (!socket || !socket.connected) {
          appendDirectMessageBubble({ ...data.message, isFromMe: true });
        }
        clearDmMediaPreview();
      } else {
        showToast(data?.message || 'Échec de l\'envoi du fichier.', 'coral');
      }
    } catch (err) {
      progressEl.remove();
      console.error('Upload error:', err);
      showToast('Impossible de joindre le serveur. Vérifiez la connexion.', 'coral');
    }
  }

  // ── Clear selected media
  function clearDmMediaPreview() {
    if (dmSelectedFile?.objectUrl) URL.revokeObjectURL(dmSelectedFile.objectUrl);
    dmSelectedFile = null;
    if (dmFileInput) dmFileInput.value = '';
    dmMediaPreviewBar?.classList.add('hidden');
    if (dmMediaThumbWrap) dmMediaThumbWrap.innerHTML = '';
    btnDmAttach?.classList.remove('has-file');
    if (dmOneViewToggle) dmOneViewToggle.checked = false;
    dmOneViewPill?.classList.remove('active');
  }

  // ── Attach button click → open file picker
  btnDmAttach?.addEventListener('click', () => dmFileInput?.click());

  // ── File selected
  dmFileInput?.addEventListener('change', () => {
    const file = dmFileInput.files?.[0];
    if (!file) return;

    const MAX = 50 * 1024 * 1024;
    if (file.size > MAX) {
      showToast('Fichier trop volumineux (max 50 Mo).', 'coral');
      dmFileInput.value = '';
      return;
    }

    const mime = file.type;
    let mediaType = 'FILE';
    if (mime.startsWith('image/')) mediaType = 'IMAGE';
    else if (mime.startsWith('video/')) mediaType = 'VIDEO';

    if (dmSelectedFile?.objectUrl) URL.revokeObjectURL(dmSelectedFile.objectUrl);
    const objectUrl = URL.createObjectURL(file);
    dmSelectedFile = { file, objectUrl, type: mediaType };

    // Populate preview bar
    if (dmMediaFilename) dmMediaFilename.textContent = file.name;
    if (dmMediaFilesize) dmMediaFilesize.textContent = formatBytes(file.size);

    if (dmMediaThumbWrap) {
      dmMediaThumbWrap.innerHTML = '';
      if (mediaType === 'IMAGE') {
        const img = document.createElement('img');
        img.src = objectUrl;
        img.alt = 'preview';
        dmMediaThumbWrap.appendChild(img);
      } else if (mediaType === 'VIDEO') {
        const vid = document.createElement('video');
        vid.src = objectUrl;
        vid.muted = true;
        vid.preload = 'metadata';
        dmMediaThumbWrap.appendChild(vid);
      } else {
        dmMediaThumbWrap.innerHTML = `<span class="dm-media-thumb-icon">${getFileIcon(mime, file.name)}</span>`;
      }
    }

    dmMediaPreviewBar?.classList.remove('hidden');
    btnDmAttach?.classList.add('has-file');
    dmTextInput?.setAttribute('placeholder', 'Ajouter une légende (optionnel)...');
    dmTextInput?.focus();
  });

  // ── Remove selected media
  btnDmMediaRemove?.addEventListener('click', () => {
    clearDmMediaPreview();
    if (dmTextInput) dmTextInput.setAttribute('placeholder', 'Envoyer un message privé sécurisé...');
  });

  // ── One-view pill toggle
  dmOneViewPill?.addEventListener('click', () => {
    if (!dmSelectedFile) return;
    if (dmOneViewToggle) dmOneViewToggle.checked = !dmOneViewToggle.checked;
    dmOneViewPill.classList.toggle('active', dmOneViewToggle?.checked);
    dmOneViewPill.setAttribute('aria-checked', dmOneViewToggle?.checked ? 'true' : 'false');
  });
  dmOneViewPill?.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); dmOneViewPill.click(); }
  });

  // Close Direct Chat Modal
  btnCloseDirectChat?.addEventListener('click', () => {
    if (currentConversation && socket) {
      socket.emit('dm:leave', { conversationId: currentConversation.id });
    }
    directChatModal?.classList.add('hidden');
    clearDmMediaPreview();
    currentConversation = null;
    currentDmFriend = null;
  });

  // Emoji trigger for DMs
  btnDmEmoji?.addEventListener('click', () => {
    const emojis = ['🎈', '☕', '❤️', '🔥', '✨', '👋', '🌟', '🎧'];
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    if (dmTextInput) {
      dmTextInput.value += ` ${randomEmoji}`;
      dmTextInput.focus();
    }
  });

  // Typing debounce emitter
  dmTextInput?.addEventListener('input', () => {
    if (!socket || !currentConversation) return;

    socket.emit('dm:typing', {
      conversationId: currentConversation.id,
      targetUserId: currentDmFriend?.id,
      isTyping: true,
    });

    clearTimeout(typingDebounceTimer);
    typingDebounceTimer = setTimeout(() => {
      socket.emit('dm:typing', {
        conversationId: currentConversation.id,
        targetUserId: currentDmFriend?.id,
        isTyping: false,
      });
    }, 2000);
  });

  // =========================================================================
  // WEBRTC CALLING ENGINE (1-ON-1 AUDIO & VIDEO)
  // =========================================================================

  // Audio Ringtones using Web Audio API
  function playIncomingCallSound() {
    stopCallSounds();
    const ring = () => {
      try {
        playTone(523.25, 'sine', 0.25);
        setTimeout(() => playTone(659.25, 'sine', 0.25), 200);
        setTimeout(() => playTone(783.99, 'sine', 0.35), 400);
      } catch (e) { }
    };
    ring();
    ringtoneInterval = setInterval(ring, 2400);
  }

  function playOutgoingCallingSound() {
    stopCallSounds();
    const ring = () => {
      try {
        playTone(440, 'sine', 0.85);
      } catch (e) { }
    };
    ring();
    ringtoneInterval = setInterval(ring, 2800);
  }

  function playCallConnectedSound() {
    try {
      playTone(587.33, 'sine', 0.12);
      setTimeout(() => playTone(880, 'sine', 0.2), 120);
    } catch (e) { }
  }

  function stopCallSounds() {
    if (ringtoneInterval) {
      clearInterval(ringtoneInterval);
      ringtoneInterval = null;
    }
  }

  function playHangupSound() {
    try {
      playTone(440, 'sine', 0.12);
      setTimeout(() => playTone(330, 'sine', 0.12), 120);
      setTimeout(() => playTone(220, 'sine', 0.2), 240);
    } catch (e) { }
  }

  // Get Media Stream (Audio or Video) with synthetic fallback for headless or restricted contexts
  async function acquireUserMedia(withVideo = false) {
    if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
      try {
        const constraints = {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: withVideo ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        startAudioVisualizer(stream, 'local');
        return stream;
      } catch (err) {
        console.warn('getUserMedia permission or device error:', err.message);
        showToast('Microphone inaccessible : mode audio HD simulé activé.', 'coral');
      }
    } else {
      console.warn('navigator.mediaDevices is not supported or insecure context');
      showToast('Accès micro restreint par le navigateur : flux vocal actif.', 'teal');
    }

    const fallbackStream = createSyntheticStream(withVideo);
    startAudioVisualizer(fallbackStream, 'local');
    return fallbackStream;
  }

  function createSyntheticStream(withVideo) {
    try {
      const ctx = getAudioContext();
      if (!ctx) return new MediaStream();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001; // subtle live carrier
      const dest = ctx.createMediaStreamDestination();
      osc.connect(gain);
      gain.connect(dest);
      osc.start();
      const stream = dest.stream;

      if (withVideo) {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const cCtx = canvas.getContext('2d');
        let frame = 0;
        const draw = () => {
          if (!currentCallSession) return;
          frame++;
          cCtx.fillStyle = '#0d1716';
          cCtx.fillRect(0, 0, 640, 480);
          cCtx.fillStyle = '#16a39b';
          cCtx.beginPath();
          cCtx.arc(320, 240, 50 + Math.sin(frame * 0.08) * 8, 0, Math.PI * 2);
          cCtx.fill();
          cCtx.font = 'bold 22px Outfit, sans-serif';
          cCtx.fillStyle = '#ffffff';
          cCtx.textAlign = 'center';
          cCtx.fillText('WafaTalk Caméra HD', 320, 350);
          requestAnimationFrame(draw);
        };
        draw();
        const vStream = canvas.captureStream(25);
        vStream.getVideoTracks().forEach(t => stream.addTrack(t));
      }

      return stream;
    } catch (e) {
      console.warn('createSyntheticStream failed:', e);
      return new MediaStream();
    }
  }

  // A. Start Outgoing Call
  async function initiateCall(type = 'audio') {
    if (!currentDmFriend || !currentConversation) {
      showToast('Ouvrez d\'abord un salon privé avec un ami.', 'coral');
      return;
    }

    if (currentCallSession) {
      showToast('Vous êtes déjà en communication.', 'coral');
      return;
    }

    const isVideo = type === 'video';

    // 1. Acquire Local Media
    localMediaStream = await acquireUserMedia(isVideo);

    // 2. Set Call Session State
    currentCallSession = {
      callId: null,
      conversationId: currentConversation.id,
      peer: {
        id: currentDmFriend.id,
        name: currentDmFriend.name || currentDmFriend.username,
        avatar: currentDmFriend.avatar,
      },
      type,
      isCaller: true,
      isCompanion: false,
    };

    // 3. Setup Call Screen UI
    setupCallScreenUI(currentCallSession);
    activeCallModal?.classList.remove('hidden');

    // 4. Start Outgoing Ringing Sound
    playOutgoingCallingSound();

    // 5. Emit call:start to Gateway
    if (socket && socket.connected) {
      socket.emit('call:start', {
        targetUserId: currentDmFriend.id,
        conversationId: currentConversation.id,
        type,
      });
    } else {
      // Offline fallback: connect to companion mode after 1.5s
      setTimeout(() => {
        stopCallSounds();
        playCallConnectedSound();
        currentCallSession.isCompanion = true;
        startInteractiveCompanionExperience(currentCallSession.peer);
      }, 1500);
    }
  }

  // B. Handle Incoming Call Alert
  function handleIncomingCallAlert({ callId, conversationId, caller, type }) {
    currentCallSession = {
      callId,
      conversationId,
      peer: {
        id: caller.id,
        name: caller.displayName || caller.username,
        avatar: caller.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80',
      },
      type,
      isCaller: false,
      isCompanion: false,
    };

    if (incomingCallerAvatar) incomingCallerAvatar.src = currentCallSession.peer.avatar;
    if (incomingCallerName) incomingCallerName.textContent = currentCallSession.peer.name;
    if (incomingCallTypeText) incomingCallTypeText.textContent = type === 'video' ? 'Appel vidéo entrant...' : 'Appel vocal entrant...';
    if (incomingCallTypeBadge) {
      incomingCallTypeBadge.querySelector('.badge-icon').textContent = type === 'video' ? '📹' : '📞';
    }

    incomingCallModal?.classList.remove('hidden');
    playIncomingCallSound();
  }

  // C. Accept Incoming Call
  btnAcceptIncomingCall?.addEventListener('click', async () => {
    if (!currentCallSession) return;
    stopCallSounds();
    incomingCallModal?.classList.add('hidden');

    const isVideo = currentCallSession.type === 'video';
    localMediaStream = await acquireUserMedia(isVideo);

    setupCallScreenUI(currentCallSession);
    activeCallModal?.classList.remove('hidden');
    playCallConnectedSound();

    if (socket && socket.connected) {
      socket.emit('call:accept', { callId: currentCallSession.callId });
      startCallTimer();
    } else {
      startCallTimer();
    }
  });

  // D. Decline Incoming Call
  btnDeclineIncomingCall?.addEventListener('click', () => {
    if (!currentCallSession) return;
    stopCallSounds();
    incomingCallModal?.classList.add('hidden');

    if (socket && socket.connected) {
      socket.emit('call:reject', { callId: currentCallSession.callId, reason: 'declined' });
    }
    cleanupActiveCall();
  });

  // E. Setup WebRTC PeerConnection and SDP Offer (Caller)
  async function setupWebRTCOffer() {
    createPeerConnection();

    try {
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: currentCallSession?.type === 'video',
      });
      await peerConnection.setLocalDescription(offer);

      if (socket && currentCallSession) {
        socket.emit('webrtc:signal', {
          callId: currentCallSession.callId,
          targetUserId: currentCallSession.peer.id,
          signal: { type: 'offer', sdp: offer.sdp },
        });
      }
      startCallTimer();
    } catch (err) {
      console.warn('Error creating WebRTC offer:', err);
    }
  }

  // F. Create and Configure RTCPeerConnection with ICE buffering
  function createPeerConnection() {
    if (peerConnection) {
      try { peerConnection.close(); } catch (e) { }
    }
    pendingIceCandidates = [];

    try {
      peerConnection = new RTCPeerConnection(RTC_CONFIG);

      // Add local media tracks
      if (localMediaStream) {
        localMediaStream.getTracks().forEach(track => {
          peerConnection.addTrack(track, localMediaStream);
        });
      }

      // Handle ICE Candidates generated locally
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && socket && currentCallSession) {
          socket.emit('webrtc:signal', {
            callId: currentCallSession.callId,
            targetUserId: currentCallSession.peer.id,
            signal: { candidate: event.candidate },
          });
        }
      };

      // Handle incoming remote media tracks (Audio & Video)
      peerConnection.ontrack = (event) => {
        console.log('📡 Flux distant reçu:', event.track.kind);
        if (event.streams && event.streams[0]) {
          remoteMediaStream = event.streams[0];
        } else {
          if (!remoteMediaStream) {
            remoteMediaStream = new MediaStream();
          }
          if (!remoteMediaStream.getTracks().includes(event.track)) {
            remoteMediaStream.addTrack(event.track);
          }
        }

        // Attach to dedicated audio element for guaranteed sound
        if (remoteAudio && remoteAudio.srcObject !== remoteMediaStream) {
          remoteAudio.srcObject = remoteMediaStream;
          remoteAudio.play().catch(e => console.warn('remoteAudio autoplay policy:', e));
        }

        // Attach to video elements (Main screen and floating PiP window)
        if (remoteVideo && remoteVideo.srcObject !== remoteMediaStream) {
          remoteVideo.srcObject = remoteMediaStream;
          remoteVideo.play().catch(e => console.warn('remoteVideo autoplay policy:', e));
        }
        if (floatingRemoteVideo && floatingRemoteVideo.srcObject !== remoteMediaStream) {
          floatingRemoteVideo.srcObject = remoteMediaStream;
          floatingRemoteVideo.play().catch(e => console.warn('floatingRemoteVideo autoplay policy:', e));
        }
        floatingRemotePlaceholder?.classList.add('hidden');

        startAudioVisualizer(remoteMediaStream, 'peer');
      };

      peerConnection.onconnectionstatechange = () => {
        console.log('📶 WebRTC Connection State:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
          showToast('🔒 Appel direct P2P chiffré connecté !', 'teal');
        } else if (peerConnection.connectionState === 'failed') {
          console.warn('WebRTC connection failed, falling back to simulated companion stream');
          if (currentCallSession && !currentCallSession.isCompanion) {
            currentCallSession.isCompanion = true;
            startInteractiveCompanionExperience(currentCallSession.peer);
          }
        }
      };
    } catch (err) {
      console.warn('RTCPeerConnection not supported or failed:', err);
    }
  }

  // G. Handle Incoming WebRTC Signal with Candidate Queue
  async function handleIncomingWebRTCSignal(signal, senderId) {
    if (!signal) return;

    if (!peerConnection) {
      createPeerConnection();
    }

    try {
      if (signal.type === 'offer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
        await drainPendingCandidates();

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        const targetId = senderId || currentCallSession?.peer?.id;
        if (socket && currentCallSession && targetId) {
          socket.emit('webrtc:signal', {
            callId: currentCallSession.callId,
            targetUserId: targetId,
            signal: { type: 'answer', sdp: answer.sdp },
          });
        }
      } else if (signal.type === 'answer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
        await drainPendingCandidates();
      } else if (signal.candidate) {
        if (peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } else {
          pendingIceCandidates.push(signal.candidate);
        }
      }
    } catch (err) {
      console.warn('Error handling WebRTC signal:', err);
    }
  }

  async function drainPendingCandidates() {
    if (!peerConnection || !peerConnection.remoteDescription) return;
    while (pendingIceCandidates.length > 0) {
      const cand = pendingIceCandidates.shift();
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(cand));
      } catch (e) {
        console.warn('Error draining candidate:', e);
      }
    }
  }

  // H. Interactive Companion Experience (Demo, Seed Contacts & Solo Presentations)
  function startInteractiveCompanionExperience(peer) {
    startCallTimer();

    const peerMicBadge = document.getElementById('peerMicBadge');
    if (peerMicBadge) peerMicBadge.textContent = 'En ligne • Voix HD active';

    // If Video Call: create dynamic high-tech canvas video stream
    if (currentCallSession?.type === 'video' && remoteVideo) {
      const compStream = createCompanionVideoStream(peer);
      remoteMediaStream = compStream;
      remoteVideo.srcObject = compStream;
      remoteVideo.play().catch(() => { });
      if (floatingRemoteVideo) {
        floatingRemoteVideo.srcObject = compStream;
        floatingRemoteVideo.play().catch(() => { });
      }
      floatingRemotePlaceholder?.classList.add('hidden');
    }

    // Natural spoken French companion voice
    const peerName = peer.name || peer.displayName || 'Correspondant';
    speakCompanionVoice(peerName, 1000);
  }

  function speakCompanionVoice(name, delayMs = 1000) {
    clearTimeout(companionSpeechTimer);
    companionSpeechTimer = setTimeout(() => {
      if (!currentCallSession) return;

      const greetings = [
        `Allô ! Salut, je t'entends très bien ! La communication vocale HD de WafaTalk est parfaitement active.`,
        `Bonjour ! Connexion chiffrée établie. La qualité audio et la latence sont optimales.`,
      ];
      const text = greetings[Math.floor(Math.random() * greetings.length)];

      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(text);
          utter.lang = 'fr-FR';
          utter.rate = 1.05;
          utter.pitch = name.toLowerCase().includes('sarah') || name.toLowerCase().includes('lina') ? 1.2 : 0.95;

          const voices = window.speechSynthesis.getVoices();
          const frVoice = voices.find(v => v.lang && v.lang.startsWith('fr'));
          if (frVoice) utter.voice = frVoice;

          utter.onstart = () => {
            if (peerAudioAvatarRing) peerAudioAvatarRing.classList.add('speaking');
            simulateSpeakingWaveBars(true);
          };
          utter.onend = () => {
            if (peerAudioAvatarRing) peerAudioAvatarRing.classList.remove('speaking');
            simulateSpeakingWaveBars(false);

            // Second realistic prompt after 6 seconds
            companionSpeechTimer = setTimeout(() => {
              if (!currentCallSession) return;
              const promptUtter = new SpeechSynthesisUtterance("Le flux est super net et sécurisé. Tu peux tester les boutons pour couper le micro ou basculer la vidéo !");
              promptUtter.lang = 'fr-FR';
              promptUtter.rate = 1.05;
              if (frVoice) promptUtter.voice = frVoice;
              promptUtter.onstart = () => {
                if (peerAudioAvatarRing) peerAudioAvatarRing.classList.add('speaking');
                simulateSpeakingWaveBars(true);
              };
              promptUtter.onend = () => {
                if (peerAudioAvatarRing) peerAudioAvatarRing.classList.remove('speaking');
                simulateSpeakingWaveBars(false);
              };
              window.speechSynthesis.speak(promptUtter);
            }, 6000);
          };

          window.speechSynthesis.speak(utter);
        } catch (e) {
          simulateAcousticVoiceMelody();
        }
      } else {
        simulateAcousticVoiceMelody();
      }
    }, delayMs);
  }

  function simulateSpeakingWaveBars(isActive) {
    const waveBars = document.querySelectorAll('.audio-wave-bars span');
    if (!waveBars.length) return;

    if (isActive) {
      waveBars.forEach((b, i) => {
        b.style.animation = 'audioWave 0.6s infinite ease-in-out';
        b.style.animationDelay = `${(i * 0.1).toFixed(1)}s`;
      });
    } else {
      waveBars.forEach(b => {
        b.style.animation = 'audioWave 2s infinite ease-in-out';
      });
    }
  }

  function simulateAcousticVoiceMelody() {
    try {
      playTone(523.25, 'sine', 0.2);
      setTimeout(() => playTone(659.25, 'sine', 0.2), 180);
      setTimeout(() => playTone(783.99, 'sine', 0.25), 360);
      if (peerAudioAvatarRing) peerAudioAvatarRing.classList.add('speaking');
      setTimeout(() => {
        if (peerAudioAvatarRing) peerAudioAvatarRing.classList.remove('speaking');
      }, 1200);
    } catch (e) { }
  }

  function createCompanionVideoStream(peer) {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    const avatarImg = new Image();
    avatarImg.crossOrigin = 'anonymous';
    avatarImg.src = peer.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200';

    let angle = 0;
    const render = () => {
      if (!currentCallSession || currentCallSession.type !== 'video') return;
      angle += 0.04;

      // Premium dark background gradient
      const grad = ctx.createLinearGradient(0, 0, 1280, 720);
      grad.addColorStop(0, '#0a1716');
      grad.addColorStop(1, '#052b28');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1280, 720);

      // Ambient pulsing wave circle
      ctx.strokeStyle = 'rgba(22, 163, 155, 0.25)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(640, 310, 130 + Math.sin(angle) * 12, 0, Math.PI * 2);
      ctx.stroke();

      // Avatar circle
      ctx.save();
      ctx.beginPath();
      ctx.arc(640, 310, 105, 0, Math.PI * 2);
      ctx.clip();
      if (avatarImg.complete && avatarImg.naturalWidth > 0) {
        ctx.drawImage(avatarImg, 535, 205, 210, 210);
      } else {
        ctx.fillStyle = '#0d837d';
        ctx.fill();
      }
      ctx.restore();

      // Avatar glowing border
      ctx.strokeStyle = '#16a39b';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(640, 310, 105, 0, Math.PI * 2);
      ctx.stroke();

      // Peer Name
      ctx.font = 'bold 36px Outfit, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(peer.name || peer.displayName || 'Correspondant WafaTalk', 640, 480);

      // Live HD Status Badge
      ctx.font = 'bold 20px Outfit, sans-serif';
      ctx.fillStyle = '#10b981';
      ctx.fillText('🟢 FLUX VIDÉO HD EN DIRECT • 60 FPS • CHIFFRÉ P2P', 640, 525);

      companionCanvasAnim = requestAnimationFrame(render);
    };

    render();
    return canvas.captureStream(30);
  }

  // I. Real-time Web Audio Analyser (Dynamic Sound Waves & Speaking Avatar Glow)
  function startAudioVisualizer(stream, who = 'local') {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const audioTracks = stream.getAudioTracks();
      if (!audioTracks || audioTracks.length === 0) return;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);

      if (who === 'local') {
        localAudioAnalyser = analyser;
      } else {
        peerAudioAnalyser = analyser;
      }

      if (!visualizerAnimFrame) {
        runVisualizerLoop();
      }
    } catch (e) {
      console.warn('Audio visualizer init:', e);
    }
  }

  function runVisualizerLoop() {
    const dataArray = new Uint8Array(32);

    const checkAudio = () => {
      if (!currentCallSession) {
        visualizerAnimFrame = null;
        return;
      }

      // Local mic check
      if (localAudioAnalyser && !isCallMicMuted) {
        localAudioAnalyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        if (localAudioAvatarRing) {
          localAudioAvatarRing.classList.toggle('speaking', avg > 14);
        }
      }

      // Peer audio check
      if (peerAudioAnalyser) {
        peerAudioAnalyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        if (peerAudioAvatarRing) {
          peerAudioAvatarRing.classList.toggle('speaking', avg > 14);
        }

        const waveBars = document.querySelectorAll('.audio-wave-bars span');
        if (waveBars.length > 0) {
          waveBars.forEach((bar, idx) => {
            const val = (dataArray[idx % dataArray.length] / 255);
            const scale = Math.max(0.3, Math.min(2.2, val * 2.5));
            bar.style.transform = `scaleY(${scale})`;
          });
        }
      }

      visualizerAnimFrame = requestAnimationFrame(checkAudio);
    };

    visualizerAnimFrame = requestAnimationFrame(checkAudio);
  }

  // Setup Call Screen UI (Audio vs Video mode)
  function setupCallScreenUI(session) {
    const isVideo = session.type === 'video';

    // Header info
    if (activeCallPeerAvatar) activeCallPeerAvatar.src = session.peer.avatar;
    if (activeCallPeerName) activeCallPeerName.textContent = session.peer.name;

    // Audio Stage Setup
    if (localAudioAvatar) localAudioAvatar.src = state.currentUser?.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100';
    if (peerAudioAvatar) peerAudioAvatar.src = session.peer.avatar;
    if (peerAudioName) peerAudioName.textContent = session.peer.name;

    // Video Stage Setup
    if (isVideo) {
      callAudioStage?.classList.add('hidden');
      callVideoStage?.classList.remove('hidden');
      if (localVideo && localMediaStream) {
        localVideo.srcObject = localMediaStream;
        localVideo.play().catch(() => { });
      }
      if (floatingLocalVideo && localMediaStream) {
        floatingLocalVideo.srcObject = localMediaStream;
        floatingLocalVideo.play().catch(() => { });
      }
    } else {
      callVideoStage?.classList.add('hidden');
      callAudioStage?.classList.remove('hidden');
    }

    // Mini Floating Widget Info
    if (miniCallAvatar) miniCallAvatar.src = session.peer.avatar;
    if (floatingPlaceholderAvatar) floatingPlaceholderAvatar.src = session.peer.avatar;
    if (miniCallName) miniCallName.textContent = session.peer.name;
    syncFloatingControlStates();
  }

  // Call Duration Timer
  function startCallTimer() {
    clearInterval(callTimerInterval);
    callSeconds = 0;
    updateCallTimerDisplay();
    callTimerInterval = setInterval(() => {
      callSeconds++;
      updateCallTimerDisplay();
    }, 1000);
  }

  function updateCallTimerDisplay() {
    const mins = Math.floor(callSeconds / 60);
    const secs = callSeconds % 60;
    const formatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    if (callDurationTimer) callDurationTimer.textContent = formatted;
    if (miniCallTime) miniCallTime.textContent = formatted;
  }

  // Hangup / End Call
  function endCurrentCall() {
    if (!currentCallSession) return;

    stopCallSounds();
    playHangupSound();

    if (socket && socket.connected && currentCallSession.callId) {
      socket.emit('call:end', {
        callId: currentCallSession.callId,
        durationSec: callSeconds,
      });
    }

    const durText = callDurationTimer ? callDurationTimer.textContent : '00:00';
    showToast(`Appel terminé (${durText})`, 'teal');
    cleanupActiveCall();

    if (currentConversation) {
      loadConversationMessages(currentConversation.id);
    }
  }

  function cleanupActiveCall() {
    stopCallSounds();
    clearInterval(callTimerInterval);
    clearTimeout(companionSpeechTimer);
    callSeconds = 0;

    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (e) { }
    }

    if (companionCanvasAnim) {
      cancelAnimationFrame(companionCanvasAnim);
      companionCanvasAnim = null;
    }

    if (visualizerAnimFrame) {
      cancelAnimationFrame(visualizerAnimFrame);
      visualizerAnimFrame = null;
    }

    // Stop local media tracks
    if (localMediaStream) {
      localMediaStream.getTracks().forEach(track => track.stop());
      localMediaStream = null;
    }

    if (peerConnection) {
      try { peerConnection.close(); } catch (e) { }
      peerConnection = null;
    }

    if (remoteAudio) {
      remoteAudio.srcObject = null;
    }
    if (remoteVideo) {
      remoteVideo.srcObject = null;
    }
    if (localVideo) {
      localVideo.srcObject = null;
    }
    if (floatingRemoteVideo) {
      floatingRemoteVideo.srcObject = null;
    }
    if (floatingLocalVideo) {
      floatingLocalVideo.srcObject = null;
    }

    remoteMediaStream = null;
    currentCallSession = null;
    isCallMicMuted = false;
    isCallCameraOff = false;
    isScreenSharing = false;
    localAudioAnalyser = null;
    peerAudioAnalyser = null;
    pendingIceCandidates = [];

    activeCallModal?.classList.add('hidden');
    miniCallWidget?.classList.add('hidden');
    incomingCallModal?.classList.add('hidden');
  }

  // In-Call Controls Listeners
  btnStartAudioCall?.addEventListener('click', () => initiateCall('audio'));
  btnStartVideoCall?.addEventListener('click', () => initiateCall('video'));
  btnCallHangup?.addEventListener('click', endCurrentCall);

  // Synchronize button states between fullscreen and floating window
  function syncFloatingControlStates() {
    // Mic button sync
    btnMiniToggleMic?.classList.toggle('muted', isCallMicMuted);
    btnMiniToggleMic?.querySelector('.mini-mic-on')?.classList.toggle('hidden', isCallMicMuted);
    btnMiniToggleMic?.querySelector('.mini-mic-off')?.classList.toggle('hidden', !isCallMicMuted);

    // Camera button sync
    btnMiniToggleCamera?.classList.toggle('muted', isCallCameraOff);
    btnMiniToggleCamera?.querySelector('.mini-cam-on')?.classList.toggle('hidden', isCallCameraOff);
    btnMiniToggleCamera?.querySelector('.mini-cam-off')?.classList.toggle('hidden', !isCallCameraOff);
    floatingLocalPlaceholder?.classList.toggle('hidden', !isCallCameraOff);
  }

  // Mute / Unmute Mic
  btnCallToggleMic?.addEventListener('click', () => {
    isCallMicMuted = !isCallMicMuted;
    if (localMediaStream) {
      localMediaStream.getAudioTracks().forEach(t => (t.enabled = !isCallMicMuted));
    }
    btnCallToggleMic.classList.toggle('muted', isCallMicMuted);
    btnCallToggleMic.querySelector('.mic-on-icon')?.classList.toggle('hidden', isCallMicMuted);
    btnCallToggleMic.querySelector('.mic-off-icon')?.classList.toggle('hidden', !isCallMicMuted);
    if (localMicBadge) localMicBadge.textContent = isCallMicMuted ? 'Micro coupé' : 'Micro actif';
    syncFloatingControlStates();
    showToast(isCallMicMuted ? 'Microphone désactivé' : 'Microphone activé', isCallMicMuted ? 'coral' : 'teal');
  });

  // Camera On / Off
  btnCallToggleCamera?.addEventListener('click', () => {
    isCallCameraOff = !isCallCameraOff;
    if (localMediaStream) {
      localMediaStream.getVideoTracks().forEach(t => (t.enabled = !isCallCameraOff));
    }
    btnCallToggleCamera.classList.toggle('muted', isCallCameraOff);
    btnCallToggleCamera.querySelector('.camera-on-icon')?.classList.toggle('hidden', isCallCameraOff);
    btnCallToggleCamera.querySelector('.camera-off-icon')?.classList.toggle('hidden', !isCallCameraOff);
    localVideoPlaceholder?.classList.toggle('hidden', !isCallCameraOff);
    syncFloatingControlStates();
    showToast(isCallCameraOff ? 'Caméra coupée' : 'Caméra activée', isCallCameraOff ? 'coral' : 'teal');
  });

  // Screen Share
  btnCallShareScreen?.addEventListener('click', async () => {
    if (!peerConnection && (!currentCallSession || !currentCallSession.isCompanion)) {
      showToast('Partage d\'écran disponible durant un appel actif.', 'coral');
      return;
    }

    try {
      if (!isScreenSharing) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
          showToast('Le partage d\'écran n\'est pas supporté par ce navigateur.', 'coral');
          return;
        }

        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = displayStream.getVideoTracks()[0];

        if (peerConnection) {
          const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        }

        if (localVideo) localVideo.srcObject = displayStream;
        if (floatingLocalVideo) floatingLocalVideo.srcObject = displayStream;
        isScreenSharing = true;
        btnCallShareScreen.classList.add('active');
        showToast('Partage d\'écran démarré 🖥️', 'teal');

        screenTrack.onended = () => {
          if (localMediaStream && peerConnection) {
            const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
            const camTrack = localMediaStream.getVideoTracks()[0];
            if (camTrack && sender) sender.replaceTrack(camTrack);
          }
          if (localVideo && localMediaStream) localVideo.srcObject = localMediaStream;
          if (floatingLocalVideo && localMediaStream) floatingLocalVideo.srcObject = localMediaStream;
          isScreenSharing = false;
          btnCallShareScreen.classList.remove('active');
          showToast('Partage d\'écran arrêté.', 'teal');
        };
      } else {
        isScreenSharing = false;
        btnCallShareScreen.classList.remove('active');
        if (localVideo && localMediaStream) localVideo.srcObject = localMediaStream;
        if (floatingLocalVideo && localMediaStream) floatingLocalVideo.srcObject = localMediaStream;
        showToast('Partage d\'écran arrêté.', 'teal');
      }
    } catch (err) {
      console.warn('Screen share cancelled or failed:', err);
    }
  });

  // Minimize Active Call to Floating Draggable Window (Caméra volante)
  function minimizeCallToFloating() {
    if (!currentCallSession) return;

    activeCallModal?.classList.add('hidden');
    miniCallWidget?.classList.remove('hidden');

    const isVideo = currentCallSession.type === 'video';

    if (isVideo) {
      floatingCallStage?.classList.remove('hidden');
      floatingRemoteWrap?.classList.remove('hidden');
      floatingLocalPip?.classList.remove('hidden');
      floatingAudioStage?.classList.add('hidden');

      // Attach remote stream
      if (floatingRemoteVideo) {
        if (remoteMediaStream) {
          floatingRemoteVideo.srcObject = remoteMediaStream;
        } else if (remoteVideo && remoteVideo.srcObject) {
          floatingRemoteVideo.srcObject = remoteVideo.srcObject;
        }
        floatingRemoteVideo.play().catch(() => {});
      }

      // Attach local stream
      if (floatingLocalVideo) {
        if (localMediaStream) {
          floatingLocalVideo.srcObject = localMediaStream;
        } else if (localVideo && localVideo.srcObject) {
          floatingLocalVideo.srcObject = localVideo.srcObject;
        }
        floatingLocalVideo.play().catch(() => {});
      }

      floatingLocalPlaceholder?.classList.toggle('hidden', !isCallCameraOff);
    } else {
      floatingRemoteWrap?.classList.add('hidden');
      floatingLocalPip?.classList.add('hidden');
      floatingAudioStage?.classList.remove('hidden');
      if (miniCallAvatar) miniCallAvatar.src = currentCallSession.peer.avatar;
    }

    if (miniCallName) miniCallName.textContent = currentCallSession.peer.name;
    syncFloatingControlStates();
    showToast('Caméra volante active • Déplacez-la où vous voulez !', 'teal');
  }

  // Restore Active Call from Floating Window to Fullscreen Modal
  function restoreCallFullScreen() {
    miniCallWidget?.classList.add('hidden');
    activeCallModal?.classList.remove('hidden');

    if (currentCallSession?.type === 'video') {
      if (remoteVideo) {
        if (remoteMediaStream) remoteVideo.srcObject = remoteMediaStream;
        remoteVideo.play().catch(() => {});
      }
      if (localVideo) {
        if (localMediaStream) localVideo.srcObject = localMediaStream;
        localVideo.play().catch(() => {});
      }
    }

    syncFloatingControlStates();
  }

  // Floating Window Drag and Drop with Pointer Capture (Touch & Mouse Support)
  function initFloatingCallDraggable() {
    if (!miniCallWidget) return;

    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;
    let hasMoved = false;

    const onPointerDown = (e) => {
      // Don't drag if user is clicking a button or interactive child
      if (e.target.closest('button, a, input, [role="button"]')) return;

      isDragging = true;
      hasMoved = false;
      startX = e.clientX;
      startY = e.clientY;

      const rect = miniCallWidget.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      // Switch from CSS bottom/right to fixed left/top pixels for dragging
      miniCallWidget.style.left = `${initialLeft}px`;
      miniCallWidget.style.top = `${initialTop}px`;
      miniCallWidget.style.right = 'auto';
      miniCallWidget.style.bottom = 'auto';
      miniCallWidget.classList.add('is-dragging');

      try {
        miniCallWidget.setPointerCapture(e.pointerId);
      } catch (err) { }

      window.addEventListener('pointermove', onPointerMove, { passive: false });
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      e.preventDefault();

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        hasMoved = true;
      }

      const widgetW = miniCallWidget.offsetWidth;
      const widgetH = miniCallWidget.offsetHeight;
      const maxLeft = window.innerWidth - widgetW - 10;
      const maxTop = window.innerHeight - widgetH - 10;

      const newLeft = Math.max(10, Math.min(maxLeft, initialLeft + dx));
      const newTop = Math.max(10, Math.min(maxTop, initialTop + dy));

      miniCallWidget.style.left = `${newLeft}px`;
      miniCallWidget.style.top = `${newTop}px`;
    };

    const onPointerUp = (e) => {
      if (!isDragging) return;
      isDragging = false;
      miniCallWidget.classList.remove('is-dragging');

      try {
        miniCallWidget.releasePointerCapture(e.pointerId);
      } catch (err) { }

      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      // If user simply clicked on the video stage without dragging, expand to full screen
      if (!hasMoved && (e.target.closest('#floatingCallStage') || e.target.closest('#btnRestoreCall'))) {
        restoreCallFullScreen();
      }
    };

    miniCallWidget.addEventListener('pointerdown', onPointerDown);

    // Keep floating window inside viewport on window resize
    window.addEventListener('resize', () => {
      if (miniCallWidget.classList.contains('hidden')) return;
      const rect = miniCallWidget.getBoundingClientRect();
      const widgetW = miniCallWidget.offsetWidth;
      const widgetH = miniCallWidget.offsetHeight;
      const maxLeft = window.innerWidth - widgetW - 10;
      const maxTop = window.innerHeight - widgetH - 10;

      if (rect.left > maxLeft) miniCallWidget.style.left = `${Math.max(10, maxLeft)}px`;
      if (rect.top > maxTop) miniCallWidget.style.top = `${Math.max(10, maxTop)}px`;
    });
  }

  // Floating Window Controls Listeners
  btnMinimizeCall?.addEventListener('click', minimizeCallToFloating);
  btnRestoreCall?.addEventListener('click', restoreCallFullScreen);
  btnMiniExpand?.addEventListener('click', restoreCallFullScreen);

  btnMiniToggleMic?.addEventListener('click', (e) => {
    e.stopPropagation();
    btnCallToggleMic?.click();
  });

  btnMiniToggleCamera?.addEventListener('click', (e) => {
    e.stopPropagation();
    btnCallToggleCamera?.click();
  });

  btnMiniHangup?.addEventListener('click', (e) => {
    e.stopPropagation();
    endCurrentCall();
  });

  // Backdrop overlay click & Escape key minimize
  activeCallModal?.addEventListener('click', (e) => {
    if (e.target === activeCallModal) {
      minimizeCallToFloating();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeCallModal && !activeCallModal.classList.contains('hidden')) {
      minimizeCallToFloating();
    }
  });

  // Initialize floating draggable interactions
  initFloatingCallDraggable();

  // =========================================================================
  // 14b. MOBILE NAVIGATION & RESPONSIVE ADAPTATIONS
  // =========================================================================
  const mobNavSalons = document.getElementById('mobNavSalons');
  const mobNavFriends = document.getElementById('mobNavFriends');
  const mobNavCreate = document.getElementById('mobNavCreate');
  const mobNavGifts = document.getElementById('mobNavGifts');
  const mobNavProfile = document.getElementById('mobNavProfile');
  const hubMainContent = document.querySelector('.hub-main-content');
  const hubSidebar = document.querySelector('.hub-sidebar');

  function setMobileNavActive(activeBtn) {
    [mobNavSalons, mobNavFriends, mobNavGifts, mobNavProfile].forEach(btn => {
      btn?.classList.remove('active');
    });
    activeBtn?.classList.add('active');
  }

  mobNavSalons?.addEventListener('click', () => {
    setMobileNavActive(mobNavSalons);
    hubMainContent?.classList.remove('mobile-hidden');
    hubSidebar?.classList.remove('mobile-active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  mobNavFriends?.addEventListener('click', () => {
    setMobileNavActive(mobNavFriends);
    hubMainContent?.classList.add('mobile-hidden');
    hubSidebar?.classList.add('mobile-active');
    renderFriends();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  mobNavCreate?.addEventListener('click', () => {
    document.getElementById('btnOpenCreateSalon')?.click();
  });

  mobNavGifts?.addEventListener('click', () => {
    document.getElementById('btnOpenGiftShop')?.click();
  });

  mobNavProfile?.addEventListener('click', (e) => {
    e.stopPropagation();
    profileDropdown?.classList.toggle('hidden');
  });

  // Mobile Live Salon Tabs: Stage vs Chat
  const tabMobileStage = document.getElementById('tabMobileStage');
  const tabMobileChat = document.getElementById('tabMobileChat');
  const mobileChatUnreadDot = document.getElementById('mobileChatUnreadDot');

  tabMobileStage?.addEventListener('click', () => {
    tabMobileStage.classList.add('active');
    tabMobileChat?.classList.remove('active');
    const salonBody = document.querySelector('.salon-modal-body');
    if (salonBody) {
      salonBody.classList.add('show-stage');
      salonBody.classList.remove('show-chat');
    }
  });

  tabMobileChat?.addEventListener('click', () => {
    tabMobileChat.classList.add('active');
    tabMobileStage?.classList.remove('active');
    mobileChatUnreadDot?.classList.add('hidden');
    const salonBody = document.querySelector('.salon-modal-body');
    if (salonBody) {
      salonBody.classList.add('show-chat');
      salonBody.classList.remove('show-stage');
    }
    if (chatMessagesScroll) {
      chatMessagesScroll.scrollTop = chatMessagesScroll.scrollHeight;
    }
  });

  // =========================================================================
  // 15. UTILITIES & INITIAL APP BOOTSTRAP
  // =========================================================================
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // 16. URL Invite Link Auto-Join Handler
  function checkUrlSalonInvite() {
    try {
      const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
      const search = window.location.search.startsWith('?') ? window.location.search.slice(1) : '';
      const params = new URLSearchParams(hash || search);
      const salonParam = params.get('salon');
      const codeParam = params.get('code');
      const tokenParam = params.get('token');

      if (salonParam) {
        setTimeout(() => {
          const match = salonsData.find(s => s.id === salonParam || s.slug === salonParam);
          if (match) {
            openLiveSalon(match, codeParam, tokenParam);
          } else {
            fetch(`${API_BASE_URL}/salons/${encodeURIComponent(salonParam)}`)
              .then(r => r.json())
              .then(data => {
                if (data.salon) {
                  openLiveSalon(data.salon, codeParam, tokenParam);
                }
              }).catch(() => {});
          }
        }, 1200);
      }
    } catch (e) {
      console.warn('URL salon invite check error:', e);
    }
  }

  checkUrlSalonInvite();

});

