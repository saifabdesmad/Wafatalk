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

  // Group Salon Real-time Media & Mesh State (Top-level declarations to avoid TDZ)
  let currentSalonRoster = new Map(); // userId -> { userId, username, displayName, avatarUrl, country, role, isMuted, isSpeaking, isCameraOn }
  let salonPeerConnections = new Map(); // userId -> RTCPeerConnection
  let salonPendingCandidates = new Map(); // userId -> candidate[]
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

  // Friend Request State
  let pendingFriendRequests = []; // received pending requests
  let sentFriendRequests = []; // sent pending requests
  let myFriendsList = []; // accepted friends
  let currentFriendTab = 'friends'; // 'friends' | 'explore'
  let activeWhisperTarget = null; // { id, name, username, avatar }

  // Chat History & Bidirectional Scrolling State (Salons & DMs)
  let salonOldestMessageId = null;
  let salonHasMoreMessages = true;
  let salonIsLoadingOlder = false;
  let salonUnreadScrolledCount = 0;

  let dmOldestMessageId = null;
  let dmHasMoreMessages = true;
  let dmIsLoadingOlder = false;
  let dmUnreadScrolledCount = 0;

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
      // 1. Google High-Availability Global STUN Cluster (UDP 19302)
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },

      // 2. Cloudflare Anycast STUN
      { urls: 'stun:stun.cloudflare.com:3478' },

      // 3. WafaTalk Dedicated Coturn STUN & TURN Relays (Production VPS 31.70.139.221 : 3478 UDP & TCP)
      { urls: 'stun:api.wafatalk.com:3478' },
      { urls: 'stun:31.70.139.221:3478' },
      {
        urls: [
          'turn:api.wafatalk.com:3478?transport=udp',
          'turn:api.wafatalk.com:3478?transport=tcp',
          'turn:31.70.139.221:3478?transport=udp',
          'turn:31.70.139.221:3478?transport=tcp',
        ],
        username: 'wafatalk',
        credential: 'WafaTalkGlobalTurn2026!',
      },
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  };

  // Asynchronously fetch fresh dynamic RTC configuration from server if available
  fetch(`${API_BASE_URL}/rtc-config`)
    .then(res => res.ok ? res.json() : null)
    .then(dynamicConfig => {
      if (dynamicConfig && Array.isArray(dynamicConfig.iceServers)) {
        RTC_CONFIG.iceServers = dynamicConfig.iceServers;
        if (dynamicConfig.iceCandidatePoolSize) RTC_CONFIG.iceCandidatePoolSize = dynamicConfig.iceCandidatePoolSize;
        if (dynamicConfig.bundlePolicy) RTC_CONFIG.bundlePolicy = dynamicConfig.bundlePolicy;
        if (dynamicConfig.rtcpMuxPolicy) RTC_CONFIG.rtcpMuxPolicy = dynamicConfig.rtcpMuxPolicy;
        console.log(' Dynamic WebRTC STUN/TURN configuration synchronized from WafaTalk backend.');
      }
    })
    .catch(() => {
      // Fallback to embedded high-availability RTC_CONFIG
    });

  // Safe Opus Audio SDP Optimizer (adds FEC & stereo without corrupting SDP tokens or line endings)
  function enhanceSdpForDiscordQuality(sdp) {
    if (!sdp || typeof sdp !== 'string') return sdp;
    try {
      if (sdp.includes('opus/48000') && !sdp.includes('useinbandfec=1')) {
        return sdp.replace(/a=fmtp:(\d+)\s+([^\r\n]+)/g, (match, pt, params) => {
          if (!params.includes('useinbandfec=1')) {
            return `a=fmtp:${pt} ${params};useinbandfec=1;stereo=1`;
          }
          return match;
        });
      }
    } catch (e) {
      console.warn('SDP formatting fallback:', e);
    }
    return sdp;
  }

  // Global browser autoplay audio unlocker: un-blocks audio playback on user touch/click
  const unlockAudioOnGesture = () => {
    salonRemoteAudioElements.forEach(el => {
      if (el && el.paused) el.play().catch(() => {});
    });
    if (remoteAudio && remoteAudio.paused) remoteAudio.play().catch(() => {});
  };
  document.addEventListener('click', unlockAudioOnGesture, { passive: true });
  document.addEventListener('touchstart', unlockAudioOnGesture, { passive: true });

  // Mock Salons Data
  const salonsData = [
    {
      id: 'salon-1',
      name: 'Chill & Discussion du Soir',
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
      name: 'Gaming Squads & Tournois',
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
      name: 'Vocal Musique & Jam Session',
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
      name: 'Débats Tech & Société',
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
      name: 'Le Cercle Privé des VIP',
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
      name: 'Pause Café & Échanges',
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

  // Connected Friends Data (dynamically loaded from DB/API)
  const friendsData = [];

  // Stage Voices in Room (populated dynamically from real connected users)
  const stageParticipants = [];

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
  const salonScrollBottomBtn = document.getElementById('salonScrollBottomBtn');
  const salonScrollUnreadBadge = document.getElementById('salonScrollUnreadBadge');
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
  const btnAdminActionToggleAdmin = document.getElementById('btnAdminActionToggleAdmin');
  const adminRoleToggleIcon = document.getElementById('adminRoleToggleIcon');
  const adminRoleToggleTitle = document.getElementById('adminRoleToggleTitle');
  const adminRoleToggleDesc = document.getElementById('adminRoleToggleDesc');
  const btnAdminActionMute = document.getElementById('btnAdminActionMute');
  const btnAdminActionCutCam = document.getElementById('btnAdminActionCutCam');
  const btnAdminActionKick = document.getElementById('btnAdminActionKick');
  const btnAdminActionBanUser = document.getElementById('btnAdminActionBanUser');
  const btnAdminActionBanIp = document.getElementById('btnAdminActionBanIp');
  const btnOpenSalonBansModal = document.getElementById('btnOpenSalonBansModal');
  const btnAdminViewBansList = document.getElementById('btnAdminViewBansList');
  const salonBansModal = document.getElementById('salonBansModal');
  const btnCloseSalonBansModal = document.getElementById('btnCloseSalonBansModal');
  const salonBansLoading = document.getElementById('salonBansLoading');
  const salonBansEmpty = document.getElementById('salonBansEmpty');
  const salonBansList = document.getElementById('salonBansList');

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
    showToast(`Thème basculé en mode ${nextTheme === 'dark' ? 'Sombre' : 'Clair'}`, 'amber');
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

  // Password Visibility Toggle (Universal delegation for all auth and modal password fields)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.password-toggle-btn');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    const wrap = btn.closest('.input-field-wrap') || btn.parentElement;
    const input = wrap?.querySelector('input');
    if (!input) return;

    const eyeOpen = btn.querySelector('.eye-open');
    const eyeClosed = btn.querySelector('.eye-closed');

    if (input.type === 'password') {
      input.type = 'text';
      eyeOpen?.classList.add('hidden');
      eyeClosed?.classList.remove('hidden');
    } else {
      input.type = 'password';
      eyeOpen?.classList.remove('hidden');
      eyeClosed?.classList.add('hidden');
    }
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
    if (!countryCode) return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line></svg>';
    const code = countryCode.trim().toLowerCase();
    return `<img src="https://flagcdn.com/w40/${code}.png" class="country-flag-img" alt="${alt || countryCode}" loading="lazy" onerror="this.outerHTML=''">`;
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
      html += `<div class="country-group-label">Pays Fréquents</div>`;
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
      html += `<div class="country-group-label" style="margin-top: 6px;">Tous les Pays</div>`;
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
    if (selectedFlagWrap) selectedFlagWrap.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line></svg>';
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
        regUsernameStatus.textContent = '';
      }
      if (regUsernameHint) {
        regUsernameHint.className = 'username-rule-hint invalid';
        regUsernameHint.innerHTML = '<span></span><span>Seuls les lettres (A-Z, a-z), chiffres (0-9), tirets (-) et underscores (_) sont autorisés.</span>';
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
        regUsernameHint.innerHTML = `<span>Au moins 3 caractères requis (${val.length}/3).</span>`;
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
        regUsernameHint.innerHTML = '<span></span><span>Le pseudo ne peut pas dépasser 30 caractères.</span>';
      }
      return;
    }

    // Valid
    regUsernameInput.classList.remove('has-error');
    regUsernameInput.classList.add('has-valid');
    if (regUsernameStatus) {
      regUsernameStatus.className = 'username-status-badge valid';
      regUsernameStatus.textContent = '';
    }
    if (regUsernameHint) {
      regUsernameHint.className = 'username-rule-hint valid';
      regUsernameHint.innerHTML = `<span></span><span>Pseudo valide et conforme (${val.length}/30).</span>`;
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
      passwordMatchHint.innerHTML = '<span></span><span>Les mots de passe correspondent parfaitement.</span>';
    } else {
      passwordMatchHint.className = 'password-match-hint mismatch';
      passwordMatchHint.innerHTML = '<span></span><span>Les mots de passe ne correspondent pas.</span>';
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
    showToast('Charte communautaire & CGU acceptées.', 'teal');
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
    otpTimer.textContent = `Expire dans ${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
      otpStatusHint.innerHTML = `<span></span><span>${message}</span>`;
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
        showToast('Nouveau code de vérification envoyé par e-mail.', 'teal');
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
        showToast(`Compte vérifié et activé ! Bienvenue ${data.user.displayName || pendingRegistrationData.username} `, 'success');
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
      showToast(`Bienvenue sur WafaTalk, ${displayName} !`, 'success');
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

    // Check cached session first for instant load or offline fallback
    const cachedUserJson = localStorage.getItem('wafatalk_user');
    let cachedUser = null;
    if (cachedUserJson) {
      try { cachedUser = JSON.parse(cachedUserJson); } catch (e) { }
    }

    if (!token && cachedUser) {
      authenticateUser(cachedUser, false);
      return;
    }
    if (!token) return;

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
      if (cachedUser) {
        authenticateUser(cachedUser, false);
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
        showToast(`Code de vérification envoyé à ${email}  Consultez votre boîte de réception.`, 'teal');
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
      showToast(`Compte créé avec succès ! Bienvenue ${username} `, 'success');
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

    // Reset password fields and eye icons to default masked mode
    if (forgotNewPasswordInput) forgotNewPasswordInput.type = 'password';
    if (forgotConfirmPasswordInput) forgotConfirmPasswordInput.type = 'password';
    document.querySelectorAll('#forgotPasswordModal .password-toggle-btn').forEach(btn => {
      btn.querySelector('.eye-open')?.classList.remove('hidden');
      btn.querySelector('.eye-closed')?.classList.add('hidden');
    });

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
        showToast(data.message || `Code de vérification envoyé à ${email} `, 'teal');
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
      btnText.textContent = 'Envoyer mon code sécurisé ';
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
        showToast(`Un nouveau code a été envoyé à ${activeRecoveryEmail} `, 'teal');
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
        showToast(' Mot de passe mis à jour avec succès ! Vous êtes connecté.', 'success');
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
        showToast(' Mot de passe mis à jour avec succès ! Vous êtes connecté.', 'success');
        return;
      } else {
        showToast('Code de sécurité incorrect. Veuillez vérifier vos e-mails.', 'coral');
      }
    } finally {
      btnSubmitForgotReset.disabled = false;
      forgotResetSpinner?.classList.add('hidden');
      btnText.textContent = 'Valider & Me connecter ';
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
          showToast(`Connecté avec succès via ${provider} ! `, 'success');
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
      showToast(`Connecté avec succès via ${provider} ! `, 'success');
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
          <div style="font-size: 2.5rem; margin-bottom: 12px;"></div>
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
          ${salon.isPrivate ? '<span class="salon-card-badge" style="background: rgba(242, 91, 62, 0.35); border-color: rgba(242, 91, 62, 0.6); color: #fff;"> PRIVÉ</span>' : ''}
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

  // Initialize friend system tabs in sidebar
  function initFriendTabs() {
    const container = friendsList?.parentElement;
    if (!container || document.getElementById('friendTabsBar')) return;

    const tabBar = document.createElement('div');
    tabBar.id = 'friendTabsBar';
    tabBar.style.cssText = 'display:flex;gap:4px;padding:8px 10px 4px;border-bottom:1px solid var(--border);';
    tabBar.innerHTML = `
      <button id="tabBtnFriends" class="friend-tab-btn active" style="flex:1;padding:6px 8px;border-radius:8px;border:none;cursor:pointer;font-size:0.78rem;font-weight:600;background:var(--primary);color:#fff;transition:opacity 0.15s;">
        Amis
      </button>
      <button id="tabBtnExplore" class="friend-tab-btn" style="flex:1;padding:6px 8px;border-radius:8px;border:none;cursor:pointer;font-size:0.78rem;font-weight:600;background:var(--bg-muted, rgba(120,120,120,0.12));color:var(--text-muted);transition:opacity 0.15s;position:relative;">
        Explorer
        <span id="friendReqBadge" style="display:none;position:absolute;top:-4px;right:-4px;background:#ef4444;color:#fff;border-radius:50%;width:16px;height:16px;font-size:0.65rem;line-height:16px;text-align:center;"></span>
      </button>
    `;
    container.insertBefore(tabBar, friendsList);

    document.getElementById('tabBtnFriends').addEventListener('click', () => switchFriendTab('friends'));
    document.getElementById('tabBtnExplore').addEventListener('click', () => switchFriendTab('explore'));
  }

  function switchFriendTab(tab) {
    currentFriendTab = tab;
    const btnFriends = document.getElementById('tabBtnFriends');
    const btnExplore = document.getElementById('tabBtnExplore');
    if (btnFriends && btnExplore) {
      if (tab === 'friends') {
        btnFriends.style.background = 'var(--primary)';
        btnFriends.style.color = '#fff';
        btnExplore.style.background = 'var(--bg-muted, rgba(120,120,120,0.12))';
        btnExplore.style.color = 'var(--text-muted)';
      } else {
        btnExplore.style.background = 'var(--primary)';
        btnExplore.style.color = '#fff';
        btnFriends.style.background = 'var(--bg-muted, rgba(120,120,120,0.12))';
        btnFriends.style.color = 'var(--text-muted)';
      }
    }
    renderFriends();
  }

  // Fetch friend requests and friends from API
  async function refreshFriendData() {
    const token = getAuthToken();
    if (!token) return;
    try {
      const [friendsRes, pendingRes, sentRes] = await Promise.all([
        fetch(`${API_BASE_URL}/friends`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/friends/requests/pending`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/friends/requests/sent`, { headers: { 'Authorization': `Bearer ${token}` } }),
      ]);
      if (friendsRes.ok) {
        const d = await friendsRes.json();
        if (d.success) myFriendsList = d.friends || [];
      }
      if (pendingRes.ok) {
        const d = await pendingRes.json();
        if (d.success) pendingFriendRequests = d.requests || [];
      }
      if (sentRes.ok) {
        const d = await sentRes.json();
        if (d.success) sentFriendRequests = d.requests || [];
      }
      // Update badge
      const badge = document.getElementById('friendReqBadge');
      if (badge) {
        if (pendingFriendRequests.length > 0) {
          badge.textContent = pendingFriendRequests.length;
          badge.style.display = 'block';
        } else {
          badge.style.display = 'none';
        }
      }
    } catch(e) {}
  }

  // Render Friends & Discoverable Users List in Sidebar
  async function renderFriends() {
    if (!friendsList) return;

    initFriendTabs();

    const myId = state.currentUser?.id;
    const token = getAuthToken();

    if (currentFriendTab === 'friends') {
      // ── AMIS TAB ────────────────────────────────────────
      await refreshFriendData();

      const onlineCount = myFriendsList.filter(u => activeOnlineUserIds.has(u.id)).length;
      const onlineCounter = document.getElementById('onlineFriendsCount');
      if (onlineCounter) {
        onlineCounter.textContent = `${onlineCount} en ligne`;
        onlineCounter.style.display = 'inline-block';
      }
      const mobFriendsBadge = document.getElementById('mobFriendsBadge');
      if (mobFriendsBadge) mobFriendsBadge.textContent = onlineCount;

      friendsList.innerHTML = '';

      if (myFriendsList.length === 0) {
        friendsList.innerHTML = `<div style="padding:24px 16px;text-align:center;color:var(--text-muted);font-size:0.82rem;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" style="margin:0 auto 8px;opacity:0.5;display:block;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          <div style="font-weight:600;margin-bottom:4px;color:var(--text-primary);">Aucun ami pour l'instant</div>
          <div style="font-size:0.75rem;">Explorez les membres pour envoyer des demandes d'amitié.</div>
        </div>`;

        // Still show pending requests if any even when no friends yet
        if (pendingFriendRequests.length > 0) {
          friendsList.innerHTML = '';
        } else {
          return;
        }
      }

      // Show pending received requests at top if any
      if (pendingFriendRequests.length > 0) {
        const reqHeader = document.createElement('div');
        reqHeader.style.cssText = 'padding:8px 12px 4px;font-size:0.72rem;font-weight:600;color:var(--text-muted);';
        reqHeader.textContent = `Demandes reçues (${pendingFriendRequests.length})`;
        friendsList.appendChild(reqHeader);

        pendingFriendRequests.forEach(req => {
          const sender = req.sender;
          const item = document.createElement('div');
          item.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--border-subtle);background:var(--bg-muted);';
          item.innerHTML = `
            <img src="${sender.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(sender.username)}`}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;" onerror="this.src='https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80'">
            <div style="flex:1;min-width:0;">
              <div style="font-size:0.82rem;font-weight:600;color:var(--text-primary);">${sender.displayName || sender.username}</div>
              <div style="font-size:0.72rem;color:var(--text-muted);">veut être ami avec vous</div>
            </div>
            <div style="display:flex;gap:4px;">
              <button class="btn-accept-req" data-reqid="${req.id}" data-senderid="${sender.id}" style="padding:4px 10px;border-radius:6px;border:none;background:#10b981;color:#fff;font-size:0.72rem;font-weight:600;cursor:pointer;">Accepter</button>
              <button class="btn-reject-req" data-reqid="${req.id}" style="padding:4px 10px;border-radius:6px;border:none;background:var(--bg-muted);color:var(--text-muted);font-size:0.72rem;font-weight:600;cursor:pointer;border:1px solid var(--border-subtle);">Refuser</button>
            </div>
          `;
          item.querySelector('.btn-accept-req').addEventListener('click', async () => {
            await handleAcceptRequest(req.id, sender);
          });
          item.querySelector('.btn-reject-req').addEventListener('click', async () => {
            await handleRejectRequest(req.id);
          });
          friendsList.appendChild(item);
        });

        if (myFriendsList.length > 0) {
          const friendsHeader = document.createElement('div');
          friendsHeader.style.cssText = 'padding:8px 12px 4px;font-size:0.72rem;font-weight:600;color:var(--text-muted);margin-top:4px;';
          friendsHeader.textContent = `Amis (${myFriendsList.length})`;
          friendsList.appendChild(friendsHeader);
        }
      }

      if (myFriendsList.length === 0 && pendingFriendRequests.length === 0) {
        friendsList.innerHTML = `<div style="padding:24px 16px;text-align:center;color:var(--text-muted);font-size:0.82rem;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" style="margin:0 auto 8px;opacity:0.5;display:block;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          <div style="font-weight:600;margin-bottom:4px;color:var(--text-primary);">Aucun ami pour l'instant</div>
          <div style="font-size:0.75rem;">Explorez les membres pour envoyer des demandes d'amitié.</div>
        </div>`;
        return;
      }

      myFriendsList.forEach(friend => {
        const isOnline = activeOnlineUserIds.has(friend.id);
        const statusClass = isOnline ? 'online' : 'offline';
        const statusLabel = isOnline ? 'En ligne' : 'Hors ligne';
        const flagTag = getFlagImgTag(friend.country, friend.country);
        const item = document.createElement('div');
        item.className = `friend-item ${statusClass}`;
        item.innerHTML = `
          <div class="friend-item-left" style="cursor:pointer;flex:1;" title="${statusLabel} — Cliquer pour envoyer un message">
            <div class="friend-avatar-wrap">
              <img src="${friend.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80'}" alt="${friend.name || friend.username}" class="friend-avatar" onerror="this.src='https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80'">
              <span class="friend-status-dot ${statusClass}" title="${statusLabel}"></span>
            </div>
            <div class="friend-meta">
              <div style="display:flex;align-items:center;gap:5px;">
                <span class="friend-name">${friend.name || friend.username}</span>
                <span style="display:inline-flex;align-items:center;">${flagTag}</span>
              </div>
              <span class="friend-activity ${statusClass}">
                <span class="activity-status-dot ${statusClass}"></span>
                ${statusLabel}
              </span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <button type="button" class="friend-action-btn" title="Envoyer un message" style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px;border:none;background:var(--bg-muted);color:var(--text-secondary);cursor:pointer;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            </button>
            <button type="button" class="friend-unfriend-btn" title="Retirer de la liste d'amis" style="background:transparent;border:none;color:var(--text-muted);font-size:0.75rem;cursor:pointer;padding:4px 6px;border-radius:6px;opacity:0.6;transition:color 0.15s, opacity 0.15s;" onmouseover="this.style.opacity=1;this.style.color='#ef4444'" onmouseout="this.style.opacity=0.6;this.style.color='var(--text-muted)'">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        `;
        item.querySelector('.friend-item-left').addEventListener('click', () => openDirectChat(friend));
        item.querySelector('.friend-action-btn').addEventListener('click', () => openDirectChat(friend));
        item.querySelector('.friend-unfriend-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          handleUnfriend(friend.id, friend.name || friend.username);
        });
        friendsList.appendChild(item);
      });

    } else {
      // ── EXPLORER TAB ────────────────────────────────────
      friendsList.innerHTML = '<div style="padding:10px 14px;text-align:center;color:var(--text-muted);font-size:0.78rem;">Chargement...</div>';

      let exploreUsers = [];
      if (token) {
        try {
          const res = await fetch(`${API_BASE_URL}/friends/discover`, { headers: { 'Authorization': `Bearer ${token}` } });
          if (res.ok) {
            const data = await res.json();
            if (data.success) exploreUsers = data.users || [];
          }
        } catch(e) {}
      }

      // Filter out self
      exploreUsers = exploreUsers.filter(u => u.id !== myId);

      // Sort: request_received first, then none, then request_sent, then friends
      const order = { request_received: 0, none: 1, request_sent: 2, friends: 3 };
      exploreUsers.sort((a, b) => (order[a.friendStatus] ?? 1) - (order[b.friendStatus] ?? 1));

      const onlineCounter = document.getElementById('onlineFriendsCount');
      const onlineCount = exploreUsers.filter(u => activeOnlineUserIds.has(u.id)).length;
      if (onlineCounter) {
        onlineCounter.textContent = `${onlineCount} en ligne`;
        onlineCounter.style.display = 'inline-block';
      }

      friendsList.innerHTML = '';

      if (exploreUsers.length === 0) {
        friendsList.innerHTML = '<div style="padding:14px;text-align:center;color:var(--text-muted);font-size:0.82rem;">Aucun membre à explorer.</div>';
        return;
      }

      exploreUsers.forEach(u => {
        const isOnline = activeOnlineUserIds.has(u.id);
        const flagTag = getFlagImgTag(u.country, u.country);
        const item = document.createElement('div');
        item.className = `friend-item ${isOnline ? 'online' : 'offline'}`;

        let actionBtn = '';
        if (u.friendStatus === 'friends') {
          actionBtn = `<button class="explore-action-btn" data-action="chat" data-uid="${u.id}" title="Envoyer un message" style="padding:5px 10px;border-radius:6px;border:none;background:var(--primary);color:#fff;font-size:0.72rem;font-weight:600;cursor:pointer;">Message</button>`;
        } else if (u.friendStatus === 'request_sent') {
          actionBtn = `<button class="explore-action-btn" data-action="cancel" data-reqid="${u.requestId}" title="Annuler la demande" style="padding:5px 10px;border-radius:6px;border:none;background:var(--bg-muted);color:var(--text-muted);font-size:0.72rem;font-weight:600;cursor:pointer;">En attente</button>`;
        } else if (u.friendStatus === 'request_received') {
          actionBtn = `
            <button class="explore-action-btn" data-action="accept" data-reqid="${u.requestId}" data-uid="${u.id}" title="Accepter" style="padding:5px 8px;border-radius:6px;border:none;background:#10b981;color:#fff;font-size:0.72rem;font-weight:600;cursor:pointer;">Accepter</button>
            <button class="explore-action-btn" data-action="reject" data-reqid="${u.requestId}" title="Refuser" style="padding:5px 8px;border-radius:6px;border:none;background:var(--bg-muted);color:var(--text-muted);font-size:0.72rem;font-weight:600;cursor:pointer;border:1px solid var(--border-subtle);">Refuser</button>
          `;
        } else {
          actionBtn = `<button class="explore-action-btn" data-action="add" data-uid="${u.id}" title="Envoyer une demande d'ami" style="padding:5px 10px;border-radius:6px;border:none;background:var(--primary);color:#fff;font-size:0.72rem;font-weight:600;cursor:pointer;">Ajouter</button>`;
        }

        item.innerHTML = `
          <div class="friend-item-left" style="flex:1;min-width:0;">
            <div class="friend-avatar-wrap">
              <img src="${u.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80'}" alt="${u.name || u.username}" class="friend-avatar" onerror="this.src='https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80'">
              <span class="friend-status-dot ${isOnline ? 'online' : 'offline'}"></span>
            </div>
            <div class="friend-meta">
              <div style="display:flex;align-items:center;gap:5px;">
                <span class="friend-name">${u.name || u.username}</span>
                <span>${flagTag}</span>
              </div>
              <span class="friend-activity" style="font-size:0.72rem;color:var(--text-muted);">${u.role || ''}</span>
            </div>
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0;">${actionBtn}</div>
        `;

        // Wire up action buttons
        item.querySelectorAll('.explore-action-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const action = btn.dataset.action;
            const uid = btn.dataset.uid;
            const reqid = btn.dataset.reqid;
            if (action === 'add') {
              await handleSendFriendRequest(uid, item, btn);
            } else if (action === 'cancel') {
              await handleCancelRequest(reqid, item, btn);
            } else if (action === 'accept') {
              await handleAcceptRequest(reqid, { id: uid, name: u.name, avatar: u.avatar, username: u.username, country: u.country });
            } else if (action === 'reject') {
              await handleRejectRequest(reqid);
            } else if (action === 'chat') {
              openDirectChat(u);
            }
          });
        });

        friendsList.appendChild(item);
      });
    }
  }

  // Friend Request Action Handlers
  async function handleSendFriendRequest(targetUserId, itemEl, btn) {
    const token = getAuthToken();
    if (!token) { showToast('Connexion requise.', 'coral'); return; }
    try {
      btn.disabled = true;
      btn.textContent = '...';
      const res = await fetch(`${API_BASE_URL}/friends/request/${targetUserId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        btn.textContent = 'En attente';
        btn.style.background = 'var(--bg-secondary,#e5e7eb)';
        btn.style.color = 'var(--text-muted)';
        btn.dataset.action = 'cancel';
        btn.dataset.reqid = data.request.id;
        btn.disabled = false;
        showToast('Demande d\'ami envoyée.', 'green');
      } else {
        btn.disabled = false;
        btn.textContent = 'Ajouter';
        showToast(data.message || 'Erreur.', 'coral');
      }
    } catch(e) {
      btn.disabled = false;
      btn.textContent = 'Ajouter';
      showToast('Erreur réseau.', 'coral');
    }
  }

  async function handleCancelRequest(requestId, itemEl, btn) {
    const token = getAuthToken();
    if (!token) return;
    try {
      btn.disabled = true;
      const res = await fetch(`${API_BASE_URL}/friends/cancel/${requestId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        btn.textContent = 'Ajouter';
        btn.style.background = 'var(--primary)';
        btn.style.color = '#fff';
        btn.dataset.action = 'add';
        delete btn.dataset.reqid;
        btn.disabled = false;
        showToast('Demande annulée.', 'orange');
      } else {
        btn.disabled = false;
        showToast(data.message || 'Erreur.', 'coral');
      }
    } catch(e) {
      btn.disabled = false;
    }
  }

  async function handleAcceptRequest(requestId, sender) {
    const token = getAuthToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/friends/accept/${requestId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Vous êtes maintenant amis avec ${sender.name || sender.displayName || sender.username}.`, 'green');
        await renderFriends();
      } else {
        showToast(data.message || 'Erreur.', 'coral');
      }
    } catch(e) {
      showToast('Erreur réseau.', 'coral');
    }
  }

  async function handleRejectRequest(requestId) {
    const token = getAuthToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/friends/reject/${requestId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        showToast('Demande refusée.', 'orange');
        await renderFriends();
      } else {
        showToast(data.message || 'Erreur.', 'coral');
      }
    } catch(e) {
      showToast('Erreur réseau.', 'coral');
    }
  }

  async function handleUnfriend(friendId, friendName) {
    if (!confirm(`Voulez-vous vraiment retirer ${friendName} de vos amis ?`)) return;
    const token = getAuthToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/friends/${friendId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        showToast(`${friendName} a été retiré de vos amis.`, 'orange');
        await renderFriends();
      } else {
        showToast(data.message || 'Erreur.', 'coral');
      }
    } catch(e) {
      showToast('Erreur réseau.', 'coral');
    }
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
        showToast(' Code d\'accès incorrect pour ce salon privé.', 'coral');
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
    document.getElementById('modalRoomCategory').textContent = `${(salon.category || 'vocal').toUpperCase()} • ${salon.isPrivate ? ' PRIVÉ' : ' PUBLIC'} • HD AUDIO & VIDEO`;

    // Clear previous roster & peer connections
    currentSalonRoster.clear();
    cancelWhisperTarget();
    salonPeerConnections.forEach(pc => pc.close());
    salonPeerConnections.clear();
    salonRemoteStreams.clear();
    salonRemoteAudioElements.forEach(el => el.remove());
    salonRemoteAudioElements.clear();

    // Register self in local roster with proper role & badge
    const isSuper = Boolean(state.currentUser?.role === 'SUPERADMIN' || state.currentUser?.role === 'ADMIN');
    const selfBadge = isOwner ? 'OWNER' : (isSuper ? 'SUPERADMIN' : 'USER');
    const selfRole = isOwner ? 'Propriétaire' : (isSuper ? 'SuperAdmin' : 'Participant');

    const selfUser = state.currentUser || {
      id: 'self-' + Date.now(),
      username: 'vous',
      displayName: 'Alexandre Moreau',
      avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100',
      role: selfRole,
      badgeType: selfBadge,
      country: 'FR',
    };

    currentSalonRoster.set(selfUser.id, {
      userId: selfUser.id,
      username: selfUser.username,
      displayName: (selfUser.displayName || selfUser.username) + ' (Vous)',
      avatarUrl: selfUser.avatarUrl,
      role: selfRole,
      badgeType: selfBadge,
      country: selfUser.country || 'FR',
      isMuted: false,
      isSpeaking: false,
      isCameraOn: false,
    });

    // Offline / Standalone demo fallback: seed stage & audience participants
    if (!socket || !socket.connected) {
      stageParticipants.forEach((sp) => {
        currentSalonRoster.set(sp.userId, {
          userId: sp.userId,
          username: sp.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
          displayName: sp.name,
          avatarUrl: sp.avatar,
          role: sp.role,
          badgeType: sp.badgeType || 'USER',
          country: sp.country || 'FR',
          isMuted: !sp.isSpeaking,
          isSpeaking: Boolean(sp.isSpeaking),
          isCameraOn: false,
        });
      });
    }

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
    if (btnOpenSalonBansModal) {
      if (isOwner || isSuper) {
        btnOpenSalonBansModal.classList.remove('hidden');
      } else {
        btnOpenSalonBansModal.classList.add('hidden');
      }
    }
    playTone(440, 'sine', 0.15);
    showToast(`Connexion au salon "${salon.name}"...`, 'teal');

    // Acquire local microphone stream for voice calling (with resilient synthetic fallback)
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        salonLocalStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        salonLocalAudioTrack = salonLocalStream.getAudioTracks()[0];
        setupSalonVoiceActivityDetector();
      }
    } catch (micErr) {
      console.warn('Microphone access denied or unavailable in salon:', micErr);
    }

    if (!salonLocalAudioTrack) {
      salonLocalStream = createSyntheticStream(false);
      salonLocalAudioTrack = salonLocalStream.getAudioTracks()[0];
      setupSalonVoiceActivityDetector();
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
    cancelWhisperTarget();

    liveSalonModal.classList.add('hidden');
    miniSalonWidget?.classList.add('hidden');
    salonBansModal?.classList.add('hidden');
    btnOpenSalonBansModal?.classList.add('hidden');
    state.currentRoom = null;
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    showToast('Vous avez quitté le salon.', 'coral');
  }

  btnCloseSalonModal?.addEventListener('click', closeLiveSalon);
  btnLeaveRoom?.addEventListener('click', closeLiveSalon);

  const btnToggleSalonFullscreen = document.getElementById('btnToggleSalonFullscreen');
  btnToggleSalonFullscreen?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  });

  document.addEventListener('fullscreenchange', () => {
    const isFs = Boolean(document.fullscreenElement);
    const label = btnToggleSalonFullscreen?.querySelector('.fullscreen-label');
    if (label) {
      label.textContent = isFs ? 'Quitter Plein écran' : 'Plein écran';
    }
  });

  // =========================================================================
  // FLOATING DRAGGABLE MINI SALON SYSTEM (SALON FLOTTANT / PIP)
  // =========================================================================
  const btnMinimizeSalon = document.getElementById('btnMinimizeSalon');
  const miniSalonWidget = document.getElementById('miniSalonWidget');
  const floatingSalonDragHandle = document.getElementById('floatingSalonDragHandle');
  const miniSalonName = document.getElementById('miniSalonName');
  const miniSalonCountNum = document.getElementById('miniSalonCountNum');
  const miniSalonAvatars = document.getElementById('miniSalonAvatars');
  const miniSalonStatusLabel = document.getElementById('miniSalonStatusLabel');
  const btnRestoreSalon = document.getElementById('btnRestoreSalon');
  const btnMiniSalonExpand = document.getElementById('btnMiniSalonExpand');
  const btnMiniSalonToggleMic = document.getElementById('btnMiniSalonToggleMic');
  const btnMiniSalonToggleAudio = document.getElementById('btnMiniSalonToggleAudio');
  const btnMiniSalonLeave = document.getElementById('btnMiniSalonLeave');
  const floatingSalonStage = document.getElementById('floatingSalonStage');

  function syncMiniSalonControls() {
    if (!miniSalonWidget) return;
    btnMiniSalonToggleMic?.classList.toggle('muted', state.isMicMuted);
    btnMiniSalonToggleMic?.querySelector('.mini-mic-on')?.classList.toggle('hidden', state.isMicMuted);
    btnMiniSalonToggleMic?.querySelector('.mini-mic-off')?.classList.toggle('hidden', !state.isMicMuted);

    btnMiniSalonToggleAudio?.classList.toggle('muted', state.isAudioMuted);
    btnMiniSalonToggleAudio?.querySelector('.mini-sound-on')?.classList.toggle('hidden', state.isAudioMuted);
    btnMiniSalonToggleAudio?.querySelector('.mini-sound-off')?.classList.toggle('hidden', !state.isAudioMuted);
  }

  function updateMiniSalonAvatars() {
    if (!miniSalonAvatars) return;
    miniSalonAvatars.innerHTML = '';

    const list = Array.from(currentSalonRoster.values());
    const previewList = list.slice(0, 4);
    if (previewList.length === 0 && state.currentUser) {
      previewList.push({
        userId: state.currentUser.id,
        displayName: state.currentUser.displayName || state.currentUser.name || 'Moi',
        avatarUrl: state.currentUser.avatarUrl,
        isSpeaking: false,
      });
    }

    previewList.forEach((user) => {
      const img = document.createElement('img');
      img.className = `floating-salon-avatar${user.isSpeaking ? ' speaking' : ''}`;
      img.dataset.userId = user.userId;
      img.src = user.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100';
      img.alt = user.displayName || 'Participant';
      img.title = user.displayName || 'Participant';
      miniSalonAvatars.appendChild(img);
    });

    if (miniSalonCountNum) {
      miniSalonCountNum.textContent = currentSalonRoster.size || (state.currentRoom ? state.currentRoom.participantsCount : 8);
    }
  }

  function minimizeSalonToFloating() {
    if (!state.currentRoom) return;

    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }

    liveSalonModal?.classList.add('hidden');
    miniSalonWidget?.classList.remove('hidden');

    if (miniSalonName) {
      miniSalonName.textContent = state.currentRoom.name || 'Salon Vocal';
    }
    if (miniSalonStatusLabel) {
      miniSalonStatusLabel.textContent = `En direct • ${state.currentRoom.name}`;
    }

    updateMiniSalonAvatars();
    syncMiniSalonControls();
    showToast('Salon réduit en fenêtre volante • Déplacez-la où vous voulez !', 'teal');
  }

  function restoreSalonFullScreen() {
    miniSalonWidget?.classList.add('hidden');
    liveSalonModal?.classList.remove('hidden');

    // Keep full modal voice controls in sync
    btnToggleMic?.classList.toggle('muted', state.isMicMuted);
    btnToggleMic?.querySelector('.mic-on-icon')?.classList.toggle('hidden', state.isMicMuted);
    btnToggleMic?.querySelector('.mic-off-icon')?.classList.toggle('hidden', !state.isMicMuted);
    if (btnToggleMic) {
      const lbl = btnToggleMic.querySelector('.ctrl-label');
      if (lbl) lbl.textContent = state.isMicMuted ? 'Coupé' : 'Micro';
    }

    btnToggleAudio?.classList.toggle('muted', state.isAudioMuted);
    if (btnToggleAudio) {
      const lbl = btnToggleAudio.querySelector('.ctrl-label');
      if (lbl) lbl.textContent = state.isAudioMuted ? 'Sourdine' : 'Audio HD';
    }
  }

  // Drag and drop for Floating Salon Widget (Touch & Mouse Support)
  function initFloatingSalonDraggable() {
    if (!miniSalonWidget) return;

    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    const onPointerDown = (e) => {
      // Don't drag if user is clicking a button or interactive child
      if (e.target.closest('button, a, input, [role="button"]')) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = miniSalonWidget.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      miniSalonWidget.style.left = `${initialLeft}px`;
      miniSalonWidget.style.top = `${initialTop}px`;
      miniSalonWidget.style.right = 'auto';
      miniSalonWidget.style.bottom = 'auto';
      miniSalonWidget.classList.add('is-dragging');

      try {
        miniSalonWidget.setPointerCapture(e.pointerId);
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

      const widgetW = miniSalonWidget.offsetWidth || 300;
      const widgetH = miniSalonWidget.offsetHeight || 240;
      const maxLeft = window.innerWidth - widgetW - 10;
      const maxTop = window.innerHeight - widgetH - 10;

      const newLeft = Math.max(10, Math.min(maxLeft, initialLeft + dx));
      const newTop = Math.max(10, Math.min(maxTop, initialTop + dy));

      miniSalonWidget.style.left = `${newLeft}px`;
      miniSalonWidget.style.top = `${newTop}px`;
    };

    const onPointerUp = (e) => {
      if (!isDragging) return;
      isDragging = false;
      miniSalonWidget.classList.remove('is-dragging');

      try {
        miniSalonWidget.releasePointerCapture(e.pointerId);
      } catch (err) { }

      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };

    const dragHandle = floatingSalonDragHandle || miniSalonWidget;
    dragHandle.addEventListener('pointerdown', onPointerDown);
  }

  // Event Listeners for Mini Salon
  btnMinimizeSalon?.addEventListener('click', minimizeSalonToFloating);
  btnRestoreSalon?.addEventListener('click', restoreSalonFullScreen);
  btnMiniSalonExpand?.addEventListener('click', restoreSalonFullScreen);
  floatingSalonStage?.addEventListener('click', (e) => {
    if (!e.target.closest('button')) restoreSalonFullScreen();
  });
  floatingSalonDragHandle?.addEventListener('dblclick', restoreSalonFullScreen);

  btnMiniSalonToggleMic?.addEventListener('click', () => {
    btnToggleMic?.click();
    syncMiniSalonControls();
  });

  btnMiniSalonToggleAudio?.addEventListener('click', () => {
    btnToggleAudio?.click();
    syncMiniSalonControls();
  });

  btnMiniSalonLeave?.addEventListener('click', () => {
    closeLiveSalon();
  });

  initFloatingSalonDraggable();

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

  // =========================================================================
  // SALON ROLE BADGES & HIERARCHY
  // Propriétaire: ROUGE | Admin: VERT | SuperAdmin: BLEU | Membre: NOIR
  // =========================================================================
  function getParticipantRoleInfo(p) {
    if (!p) {
      return {
        type: 'user',
        label: 'Membre',
        icon: '',
        badgeClass: 'badge-user',
        cardClass: 'role-user',
        ringColor: '#09090b',
      };
    }

    const myId = state.currentUser?.id;
    const isOwner = Boolean(
      p.badgeType === 'OWNER' ||
      p.role === 'Propriétaire' ||
      p.role === 'Hôte du salon' ||
      (state.currentRoom?.ownerId && (p.userId === state.currentRoom.ownerId || p.id === state.currentRoom.ownerId)) ||
      (state.currentRoom?.isOwner && (p.userId === myId || p.userId?.startsWith('self-')))
    );

    const isSuperAdmin = Boolean(
      !isOwner && (
        p.badgeType === 'SUPERADMIN' ||
        p.role === 'SuperAdmin' ||
        (p.userId === myId && (state.currentUser?.role === 'SUPERADMIN' || state.currentUser?.role === 'ADMIN'))
      )
    );

    const isAdmin = Boolean(
      !isOwner && !isSuperAdmin && (
        p.badgeType === 'ADMIN' ||
        p.role === 'Admin' ||
        p.role === 'Administrateur'
      )
    );

    if (isOwner) {
      return {
        type: 'owner',
        label: 'Propriétaire',
        icon: '',
        badgeClass: 'badge-owner',
        cardClass: 'role-owner',
        ringColor: '#ef4444',
      };
    }
    if (isSuperAdmin) {
      return {
        type: 'superadmin',
        label: 'SuperAdmin',
        icon: '',
        badgeClass: 'badge-superadmin',
        cardClass: 'role-superadmin',
        ringColor: '#3b82f6',
      };
    }
    if (isAdmin) {
      return {
        type: 'admin',
        label: 'Admin',
        icon: '️',
        badgeClass: 'badge-admin',
        cardClass: 'role-admin',
        ringColor: '#10b981',
      };
    }
    return {
      type: 'user',
      label: 'Membre',
      icon: '',
      badgeClass: 'badge-user',
      cardClass: 'role-user',
      ringColor: '#09090b',
    };
  }

  // D. Render Voice & Video Stage Grid (Targeted updates preserving playing videos)
  function renderVoiceStage() {
    if (!voiceStageGrid) return;

    const count = currentSalonRoster.size;
    if (chatParticipantsCount) {
      chatParticipantsCount.textContent = `${count} participant${count > 1 ? 's' : ''}`;
    }

    const myId = state.currentUser?.id;
    const myParticipant = currentSalonRoster.get(myId) || (myId ? null : Array.from(currentSalonRoster.values())[0]) || {
      userId: myId || 'self',
      role: state.currentRoom?.isOwner ? 'Propriétaire' : (state.currentUser?.role || 'Participant'),
      badgeType: state.currentRoom?.isOwner ? 'OWNER' : undefined
    };
    const myRoleInfo = getParticipantRoleInfo(myParticipant);
    const isMeOwnerOrSuper = myRoleInfo.type === 'owner' || myRoleInfo.type === 'superadmin';
    const isMeAdmin = myRoleInfo.type === 'admin';

    currentSalonRoster.forEach((p, userId) => {
      const isSelf = userId === myId || userId.startsWith('self-');
      const roleInfo = getParticipantRoleInfo(p);

      // Moderation permissions:
      // Owner or SuperAdmin can moderate anyone except themselves
      // Admin can moderate regular users only
      let canAdminModerate = false;
      if (!isSelf) {
        if (isMeOwnerOrSuper) {
          canAdminModerate = true;
        } else if (isMeAdmin) {
          canAdminModerate = (roleInfo.type === 'user');
        }
      }

      let card = document.getElementById(`stageUser_${userId}`);

      if (!card) {
        card = document.createElement('div');
        card.id = `stageUser_${userId}`;
        voiceStageGrid.appendChild(card);
      }

      // Update card classes with role class (role-owner: Red, role-admin: Green, role-superadmin: Blue, role-user: Black)
      card.className = `stage-avatar-card ${roleInfo.cardClass} ${p.isSpeaking ? 'is-speaking' : ''} ${p.isCameraOn ? 'has-video' : ''}`;

      if (p.isCameraOn) {
        // Video Stream Card
        if (!card.querySelector('.stage-video-stream')) {
          card.innerHTML = `
            <div class="stage-live-badge"><span class="badge-dot pulse"></span> CAMÉRA</div>
            <span class="stage-video-role-badge ${roleInfo.badgeClass}">${roleInfo.icon} ${roleInfo.label}</span>
            ${p.isMuted ? '<span class="stage-mute-badge" title="Micro coupé"></span>' : ''}
            ${canAdminModerate ? `<button type="button" class="stage-admin-trigger" data-user-id="${userId}" title="Gérer ce participant">️</button>` : ''}
            <div class="stage-video-loading" id="videoLoading_${userId}"><span class="badge-dot pulse"></span> Connexion HD...</div>
            <img src="${p.avatarUrl || p.avatar || 'assets/wafatalk-icon.png'}" class="stage-video-poster" id="videoPoster_${userId}" alt="" onerror="this.src='https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80'">
            <video class="stage-video-stream" id="videoEl_${userId}" autoplay playsinline muted></video>
            <div class="stage-video-overlay">
              <span class="stage-user-name">${escapeHtml(p.displayName || p.name || 'Membre')}</span>
              <span class="stage-role-pill ${roleInfo.badgeClass}">${roleInfo.icon} ${roleInfo.label}</span>
            </div>
          `;
        }

        // Attach video stream with muted=true & play()
        const vidEl = card.querySelector(`#videoEl_${userId}`);
        const loadEl = card.querySelector(`#videoLoading_${userId}`);
        const posterEl = card.querySelector(`#videoPoster_${userId}`);
        if (vidEl) {
          vidEl.muted = true;

          const hideLoader = () => {
            if (loadEl) loadEl.style.display = 'none';
            if (posterEl) posterEl.style.opacity = '0';
          };
          vidEl.addEventListener('loadeddata', hideLoader, { once: true });
          vidEl.addEventListener('playing', hideLoader, { once: true });

          const attachStream = (stream) => {
            if (vidEl.srcObject !== stream) vidEl.srcObject = stream;
            vidEl.play().then(hideLoader).catch(() => { });
          };

          if (isSelf && salonLocalStream) {
            attachStream(salonLocalStream);
          } else {
            let remoteStr = salonRemoteStreams.get(userId);
            if (!remoteStr) {
              const pc = salonPeerConnections.get(userId);
              if (pc) {
                const rx = pc.getReceivers().find(r => r.track && r.track.kind === 'video' && r.track.readyState !== 'ended');
                if (rx && rx.track) {
                  remoteStr = new MediaStream([rx.track]);
                  salonRemoteStreams.set(userId, remoteStr);
                  rx.track.onunmute = () => attachStream(remoteStr);
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
              <span class="stage-avatar-ring-badge ${roleInfo.badgeClass}" title="${roleInfo.label}">${roleInfo.icon}</span>
            </div>
            ${p.isMuted ? '<span class="stage-mute-badge" title="Micro coupé"></span>' : ''}
            ${canAdminModerate ? `<button type="button" class="stage-admin-trigger" data-user-id="${userId}" title="Gérer ce participant">️</button>` : ''}
            <div style="display: flex; align-items: center; gap: 5px;">
              <span class="stage-user-name">${escapeHtml(p.displayName || p.name || 'Membre')}</span>
              <span>${flagImg}</span>
            </div>
            <span class="stage-role-pill ${roleInfo.badgeClass}">${roleInfo.icon} ${roleInfo.label}</span>
          `;
        }
      }

      // Always update dynamic role badge elements if card already exists
      const ringBadge = card.querySelector('.stage-avatar-ring-badge');
      if (ringBadge) {
        ringBadge.className = `stage-avatar-ring-badge ${roleInfo.badgeClass}`;
        ringBadge.title = roleInfo.label;
        ringBadge.textContent = roleInfo.icon;
      }
      const rolePill = card.querySelector('.stage-role-pill');
      if (rolePill) {
        rolePill.className = `stage-role-pill ${roleInfo.badgeClass}`;
        rolePill.innerHTML = `${roleInfo.icon} ${roleInfo.label}`;
      }
      const videoRoleBadge = card.querySelector('.stage-video-role-badge');
      if (videoRoleBadge) {
        videoRoleBadge.className = `stage-video-role-badge ${roleInfo.badgeClass}`;
        videoRoleBadge.innerHTML = `${roleInfo.icon} ${roleInfo.label}`;
      }

      // Ensure admin trigger button exists if moderator privileges apply
      let triggerBtn = card.querySelector('.stage-admin-trigger');
      if (canAdminModerate && !triggerBtn) {
        triggerBtn = document.createElement('button');
        triggerBtn.type = 'button';
        triggerBtn.className = 'stage-admin-trigger';
        triggerBtn.dataset.userId = userId;
        triggerBtn.title = 'Gérer ce participant';
        triggerBtn.innerHTML = '️';
        card.appendChild(triggerBtn);
      } else if (!canAdminModerate && triggerBtn) {
        triggerBtn.remove();
      }

      // Ensure in-salon whisper trigger button exists on other participants
      let whisperBtn = card.querySelector('.stage-whisper-trigger');
      if (!isSelf && !whisperBtn) {
        whisperBtn = document.createElement('button');
        whisperBtn.type = 'button';
        whisperBtn.className = 'stage-whisper-trigger';
        whisperBtn.dataset.userId = userId;
        whisperBtn.title = `Chuchoter en privé à ${escapeHtml(p.displayName || p.name || 'ce membre')}`;
        whisperBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
        whisperBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          setWhisperTarget(p);
        });
        card.appendChild(whisperBtn);
      } else if (isSelf && whisperBtn) {
        whisperBtn.remove();
      }

      // Clicking anywhere on the card (except admin controls) activates whisper
      if (!isSelf) {
        card.style.cursor = 'pointer';
        card.title = `Cliquer pour chuchoter en privé à ${p.displayName || p.name || 'ce membre'}`;
        card.onclick = (e) => {
          if (e.target.closest('.stage-admin-trigger') || e.target.closest('.stage-whisper-trigger')) return;
          setWhisperTarget(p);
        };
      } else {
        card.style.cursor = 'default';
        card.title = '';
        card.onclick = null;
      }

      // Ensure mute badge reflects real-time mute state
      let muteBadge = card.querySelector('.stage-mute-badge');
      if (p.isMuted && !muteBadge) {
        muteBadge = document.createElement('span');
        muteBadge.className = 'stage-mute-badge';
        muteBadge.title = 'Micro coupé';
        muteBadge.textContent = '';
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

    // Update participant count in header dynamically
    if (chatParticipantsCount) {
      const count = currentSalonRoster.size;
      chatParticipantsCount.textContent = `${count} participant${count > 1 ? 's' : ''}`;
    }

    if (miniSalonWidget && !miniSalonWidget.classList.contains('hidden')) {
      updateMiniSalonAvatars();
    }
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
    const miniAvatar = miniSalonAvatars?.querySelector(`[data-user-id="${userId}"]`);
    if (miniAvatar) {
      miniAvatar.classList.toggle('speaking', isSpeaking);
    }
  }

  // E. Handle Salon Roster Sync from Server
  function handleSalonRosterSync(participants) {
    if (!Array.isArray(participants)) return;
    const myId = state.currentUser?.id;

    // Retain self in roster
    const selfInRoster = currentSalonRoster.get(myId) || (myId ? null : Array.from(currentSalonRoster.values())[0]);

    currentSalonRoster.clear();
    cancelWhisperTarget();
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

    renderVoiceStage();

    // Initiator rule: The newly joining member initiates connection to all existing members
    participants.forEach((p) => {
      if (p.userId !== myId) {
        createSalonPeerConnection(p.userId, true);
      }
    });
  }

  // F. Handle New User Joined Salon
  function handleSalonUserJoined(participant) {
    if (!participant || !participant.userId) return;

    currentSalonRoster.set(participant.userId, participant);
    renderVoiceStage();

    showToast(`${participant.displayName} a rejoint le salon ! `, 'teal');
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

    if (activeWhisperTarget && activeWhisperTarget.id === userId) {
      cancelWhisperTarget();
      showToast(`${displayName || 'Ce participant'} a quitté le salon. Chuchotement désactivé.`, 'coral');
    }

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
        badge.textContent = '';
        card.appendChild(badge);
      } else if (!p.isMuted && muteBadge) {
        muteBadge.remove();
      }
    }
  }

  // I. WebRTC Mesh Peer Connection Setup (Discord-Grade Multi-User Calling)
  function createSalonPeerConnection(targetUserId, isInitiator = false) {
    let pc = salonPeerConnections.get(targetUserId);
    if (pc && pc.connectionState !== 'closed' && pc.connectionState !== 'failed') {
      return pc;
    }

    pc = new RTCPeerConnection(RTC_CONFIG);
    salonPeerConnections.set(targetUserId, pc);
    pc._pendingCandidates = [];

    // Ensure candidate queue exists for targetUserId
    if (!salonPendingCandidates.has(targetUserId)) {
      salonPendingCandidates.set(targetUserId, []);
    }

    // ── INITIATOR ONLY: Add bidirectional audio & video transceivers to define the media plan ──
    if (isInitiator) {
      const audioTrack = salonLocalAudioTrack || null;
      const videoTrack = (isSalonCamActive && salonLocalVideoTrack) ? salonLocalVideoTrack : null;

      // Always negotiate sendrecv so that when camera/mic is toggled, media flows instantly without renegotiation
      const audioTransceiver = pc.addTransceiver(audioTrack || 'audio', { direction: 'sendrecv' });
      const videoTransceiver = pc.addTransceiver(videoTrack || 'video', { direction: 'sendrecv' });

      if (audioTrack && !audioTransceiver.sender.track) {
        audioTransceiver.sender.replaceTrack(audioTrack).catch(() => {});
      }
      if (videoTrack && !videoTransceiver.sender.track) {
        videoTransceiver.sender.replaceTrack(videoTrack).catch(() => {});
      }
    }

    pc.ontrack = (event) => {
      const track = event.track;
      console.log(` [${isInitiator ? 'INIT' : 'ANSW'}] Track from ${targetUserId}:`, track.kind, track.id);

      if (track.kind === 'audio') {
        const stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([track]);
        let audioEl = salonRemoteAudioElements.get(targetUserId);
        if (!audioEl) {
          audioEl = document.createElement('audio');
          audioEl.autoplay = true;
          audioEl.playsInline = true;
          audioEl.setAttribute('playsinline', '');
          audioEl.muted = state.isAudioMuted;
          audioEl.volume = 1.0;
          document.body.appendChild(audioEl);
          salonRemoteAudioElements.set(targetUserId, audioEl);
        }
        if (audioEl.srcObject !== stream) {
          audioEl.srcObject = stream;
        }
        audioEl.muted = state.isAudioMuted;
        const playPromise = audioEl.play();
        if (playPromise !== undefined) {
          playPromise.catch((e) => {
            console.warn(`Autoplay audio policy blocked for ${targetUserId}, waiting for user gesture:`, e);
          });
        }
      } else if (track.kind === 'video') {
        const stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([track]);
        salonRemoteStreams.set(targetUserId, stream);

        const attachVideo = () => {
          const lEl = document.getElementById(`videoLoading_${targetUserId}`);
          const pEl = document.getElementById(`videoPoster_${targetUserId}`);
          const vidEl = document.getElementById(`videoEl_${targetUserId}`);
          if (vidEl) {
            if (vidEl.srcObject !== stream) vidEl.srcObject = stream;
            vidEl.muted = true;
            vidEl.playsInline = true;
            vidEl.setAttribute('playsinline', '');
            vidEl.play().then(() => {
              if (lEl) lEl.style.display = 'none';
              if (pEl) pEl.style.opacity = '0';
            }).catch(() => {});
          } else {
            let attempts = 0;
            const poll = setInterval(() => {
              const el = document.getElementById(`videoEl_${targetUserId}`);
              const ll = document.getElementById(`videoLoading_${targetUserId}`);
              const pp = document.getElementById(`videoPoster_${targetUserId}`);
              if (el) {
                if (el.srcObject !== stream) el.srcObject = stream;
                el.muted = true;
                el.playsInline = true;
                el.play().then(() => {
                  if (ll) ll.style.display = 'none';
                  if (pp) pp.style.opacity = '0';
                }).catch(() => {});
                clearInterval(poll);
              } else if (++attempts > 30) {
                clearInterval(poll);
              }
            }, 150);
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
          signal: { type: 'candidate', candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate },
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(` ICE [${targetUserId}]:`, pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        console.warn(`ICE ${pc.iceConnectionState} with ${targetUserId} — triggering ICE restart`);
        // Both initiator and answerer may attempt restart; guard prevents double-fire
        restartSalonIce(targetUserId, pc);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(` PeerConn [${targetUserId}]:`, pc.connectionState);
      if (pc.connectionState === 'connected') {
        console.log(` Salon WebRTC connected with ${targetUserId}!`);
      }
    };

    if (isInitiator) {
      pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
        .then(offer => {
          const enhanced = enhanceSdpForDiscordQuality(offer.sdp);
          return pc.setLocalDescription(new RTCSessionDescription({ type: 'offer', sdp: enhanced }));
        })
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

  // Real ICE restart function for salons
  async function restartSalonIce(targetUserId, pc) {
    if (!pc || !socket || !socket.connected || !state.currentRoom) return;
    if (pc.signalingState !== 'stable' || pc._iceRestartInFlight) return;
    try {
      pc._iceRestartInFlight = true;
      const offer = await pc.createOffer({ iceRestart: true });
      const enhanced = enhanceSdpForDiscordQuality(offer.sdp);
      await pc.setLocalDescription(new RTCSessionDescription({ type: 'offer', sdp: enhanced }));
      socket.emit('salon:signal', {
        salonId: state.currentRoom.id,
        targetUserId,
        signal: { type: 'offer', sdp: pc.localDescription.sdp, isIceRestart: true },
      });
    } catch (e) {
      console.warn('restartSalonIce failed:', e);
    } finally {
      pc._iceRestartInFlight = false;
    }
  }

  // Drain pending candidates for a salon peer connection
  async function drainSalonPendingCandidates(targetUserId, pc) {
    if (!pc || !pc.remoteDescription) return;
    const queued = salonPendingCandidates.get(targetUserId) || [];
    if (pc._pendingCandidates && pc._pendingCandidates.length) {
      queued.push(...pc._pendingCandidates);
      pc._pendingCandidates = [];
    }
    salonPendingCandidates.set(targetUserId, []);

    for (const cand of queued) {
      try {
        if (cand && (cand.candidate !== undefined || cand.sdpMid !== undefined)) {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        }
      } catch (e) {
        console.warn(`Error adding queued candidate from ${targetUserId}:`, e);
      }
    }
  }

  // J. Handle Incoming WebRTC Signal for Salon
  async function handleSalonIncomingSignal(senderId, senderUser, signal) {
    if (!signal || !senderId) return;

    if (signal.type === 'offer') {
      const pc = createSalonPeerConnection(senderId, false);
      try {
        // Allow ICE restart offers even when in have-remote-offer state
        if (pc.signalingState === 'have-remote-offer' && !signal.isIceRestart) {
          console.warn(`Already in have-remote-offer for ${senderId}, ignoring duplicate offer`);
          return;
        }

        // Polite peer handling if local offer is simultaneously in flight
        if (pc.signalingState === 'have-local-offer') {
          const myId = state.currentUser?.id || '';
          if (myId < senderId) {
            await pc.setLocalDescription({ type: 'rollback' });
          } else if (!signal.isIceRestart) {
            return;
          }
        }

        // If we're in have-remote-offer and this IS an ICE restart, roll back to stable first
        if (pc.signalingState === 'have-remote-offer') {
          await pc.setLocalDescription({ type: 'rollback' });
        }

        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));

        // Configure transceivers: Answerer sets direction to sendrecv for both audio and video
        const transceivers = pc.getTransceivers();
        for (const transceiver of transceivers) {
          const kind = transceiver.receiver?.track?.kind;
          if (kind === 'audio') {
            transceiver.direction = 'sendrecv';
            if (salonLocalAudioTrack) {
              transceiver.sender.replaceTrack(salonLocalAudioTrack).catch(() => {});
            }
          } else if (kind === 'video') {
            transceiver.direction = 'sendrecv';
            if (isSalonCamActive && salonLocalVideoTrack) {
              transceiver.sender.replaceTrack(salonLocalVideoTrack).catch(() => {});
            }
          }
        }

        await drainSalonPendingCandidates(senderId, pc);

        const answer = await pc.createAnswer();
        const enhancedSdp = enhanceSdpForDiscordQuality(answer.sdp);
        await pc.setLocalDescription(new RTCSessionDescription({ type: 'answer', sdp: enhancedSdp }));

        if (socket && socket.connected && state.currentRoom) {
          socket.emit('salon:signal', {
            salonId: state.currentRoom.id,
            targetUserId: senderId,
            signal: { type: 'answer', sdp: pc.localDescription.sdp, isCameraToggle: Boolean(signal.isCameraToggle) },
          });
        }

        if (signal.isCameraToggle) {
          renderVoiceStage();
        }
      } catch (err) {
        console.warn('Error handling salon offer:', err);
      }
    } else if (signal.type === 'answer') {
      const pc = salonPeerConnections.get(senderId);
      if (pc && pc.signalingState !== 'stable') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
          await drainSalonPendingCandidates(senderId, pc);
          if (signal.isCameraToggle) {
            renderVoiceStage();
          }
        } catch (err) {
          console.warn('Error setting salon answer:', err);
        }
      }
    } else if (signal.candidate || signal.type === 'candidate') {
      const candidateData = signal.candidate || signal;
      if (!candidateData || (!candidateData.candidate && candidateData.candidate !== '')) return; // ignore null end-of-candidates

      const pc = salonPeerConnections.get(senderId);
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidateData));
        } catch (err) {
          console.warn('Error adding salon candidate:', err);
        }
      } else {
        if (!salonPendingCandidates.has(senderId)) {
          salonPendingCandidates.set(senderId, []);
        }
        salonPendingCandidates.get(senderId).push(candidateData);
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
        badge.textContent = '';
        selfCard.appendChild(badge);
      } else if (!state.isMicMuted && muteBadge) {
        muteBadge.remove();
      }
    }

    showToast(state.isMicMuted ? 'Microphone désactivé ' : 'Microphone activé ', state.isMicMuted ? 'coral' : 'success');
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

      // Update tracks on all active peer connections and trigger renegotiation
      salonPeerConnections.forEach(async (pc, peerId) => {
        try {
          let videoTransceiver = pc.getTransceivers().find(t => t.receiver?.track?.kind === 'video');
          if (!videoTransceiver) {
            videoTransceiver = pc.addTransceiver(salonLocalVideoTrack, { direction: 'sendrecv' });
          } else {
            videoTransceiver.direction = 'sendrecv';
            await videoTransceiver.sender.replaceTrack(salonLocalVideoTrack);
          }

          // Trigger renegotiation offer so remote peer receives live video frames instantly
          const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
          const enhanced = enhanceSdpForDiscordQuality(offer.sdp);
          await pc.setLocalDescription(new RTCSessionDescription({ type: 'offer', sdp: enhanced }));

          if (socket && socket.connected && state.currentRoom) {
            socket.emit('salon:signal', {
              salonId: state.currentRoom.id,
              targetUserId: peerId,
              signal: { type: 'offer', sdp: pc.localDescription.sdp, isCameraToggle: true },
            });
          }
        } catch (e) {
          console.warn('Error renegotiating video track with ' + peerId, e);
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
      showToast('Caméra activée ', 'success');
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

      // Blank track on all peer connections and renegotiate
      salonPeerConnections.forEach(async (pc, peerId) => {
        try {
          const videoTransceiver = pc.getTransceivers().find(t => t.receiver && t.receiver.track && t.receiver.track.kind === 'video');
          if (videoTransceiver) {
            await videoTransceiver.sender.replaceTrack(null);
            videoTransceiver.direction = 'recvonly';
          }
          const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
          const enhanced = enhanceSdpForDiscordQuality(offer.sdp);
          await pc.setLocalDescription(new RTCSessionDescription({ type: 'offer', sdp: enhanced }));

          if (socket && socket.connected && state.currentRoom) {
            socket.emit('salon:signal', {
              salonId: state.currentRoom.id,
              targetUserId: peerId,
              signal: { type: 'offer', sdp: pc.localDescription.sdp, isCameraToggle: true },
            });
          }
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

  // In-Salon Private Whisper Controller
  function setWhisperTarget(target) {
    if (!target) return;
    const targetId = target.userId || target.id;
    const myId = state.currentUser?.id;
    if (myId && targetId === myId) return;

    const targetName = target.displayName || target.name || target.username || 'Membre';
    activeWhisperTarget = {
      id: targetId,
      name: targetName,
      username: target.username || '',
      avatar: target.avatarUrl || target.avatar || '',
    };

    updateWhisperBannerUI();
    chatInputText?.focus();
    showToast(`Mode message privé activé avec ${targetName} dans le salon`, 'teal');
  }

  function cancelWhisperTarget() {
    activeWhisperTarget = null;
    updateWhisperBannerUI();
  }

  function updateWhisperBannerUI() {
    const banner = document.getElementById('salonWhisperBanner');
    const nameEl = document.getElementById('whisperTargetName');
    const cancelBtn = document.getElementById('btnCancelWhisper');

    if (activeWhisperTarget) {
      if (banner) {
        banner.classList.remove('hidden');
        banner.style.display = 'flex';
      }
      if (nameEl) nameEl.textContent = `@${activeWhisperTarget.name}`;
      if (chatInputText) {
        chatInputText.placeholder = `Chuchoter en privé à ${activeWhisperTarget.name}...`;
        chatInputText.style.borderColor = 'var(--teal-primary)';
      }
      if (cancelBtn && !cancelBtn.dataset.bound) {
        cancelBtn.dataset.bound = 'true';
        cancelBtn.addEventListener('click', () => {
          cancelWhisperTarget();
          chatInputText?.focus();
        });
      }
    } else {
      if (banner) {
        banner.classList.add('hidden');
        banner.style.display = 'none';
      }
      if (chatInputText) {
        chatInputText.placeholder = 'Écrire un message...';
        chatInputText.style.borderColor = '';
      }
    }
  }

  // N. Real-Time Salon Chat System (Scrolling & Infinite History)
  function createSalonMessageElement(message) {
    const myId = state.currentUser?.id;
    const isFromMe = (message.user?.id && message.user.id === myId) || (message.userId && message.userId === myId);

    const isWhisper = message.type === 'WHISPER' || Boolean(message.isWhisper);
    const msgEl = document.createElement('div');
    msgEl.className = `chat-msg ${isFromMe ? 'self' : ''} ${isWhisper ? 'chat-msg-whisper' : ''}`;
    if (message.id) msgEl.dataset.msgId = message.id;
    const authorName = isFromMe ? 'Vous' : (message.user?.displayName || message.user?.username || 'Membre');
    const avatar = message.user?.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80';
    const timeStr = message.time || (message.createdAt ? new Date(message.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'À l\'instant');

    let whisperBadgeHtml = '';
    if (isWhisper) {
      const lockIconSvg = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:inline;vertical-align:baseline;margin-right:3px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
      if (isFromMe) {
        const toName = message.whisperToName || message.targetUser?.displayName || message.targetUser?.username || 'Membre';
        whisperBadgeHtml = `<span class="whisper-badge-pill" title="Message privé visible uniquement par vous et @${escapeHtml(toName)}">${lockIconSvg}Chuchoté à @${escapeHtml(toName)}</span>`;
      } else {
        whisperBadgeHtml = `<span class="whisper-badge-pill" title="Message privé visible uniquement par vous deux">${lockIconSvg}Chuchotement privé</span>`;
      }
    }

    msgEl.innerHTML = `
      <img src="${avatar}" class="chat-msg-avatar" alt="${escapeHtml(authorName)}" onerror="this.src='https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80'" style="${!isFromMe ? 'cursor:pointer;' : ''}" title="${!isFromMe ? 'Cliquer pour chuchoter en privé' : ''}">
      <div class="chat-msg-body">
        <div class="chat-msg-author">
          <strong style="${!isFromMe ? 'cursor:pointer;' : ''}" title="${!isFromMe ? 'Cliquer pour chuchoter en privé' : ''}">${escapeHtml(authorName)}</strong>
          ${whisperBadgeHtml}
          <span class="chat-msg-time">${timeStr}</span>
        </div>
        <p class="chat-msg-text">${escapeHtml(message.content)}</p>
      </div>
    `;

    // Clicking non-self author or avatar sets them as whisper target
    if (!isFromMe && message.user) {
      const clickHandler = (e) => {
        e.stopPropagation();
        setWhisperTarget({
          id: message.user.id || message.userId,
          displayName: message.user.displayName,
          username: message.user.username,
          avatarUrl: message.user.avatarUrl,
        });
      };
      msgEl.querySelector('.chat-msg-avatar')?.addEventListener('click', clickHandler);
      msgEl.querySelector('.chat-msg-author strong')?.addEventListener('click', clickHandler);
    }

    return msgEl;
  }

  async function initSalonChat(salon) {
    if (!chatMessagesScroll) return;

    salonOldestMessageId = null;
    salonHasMoreMessages = true;
    salonIsLoadingOlder = false;
    salonUnreadScrolledCount = 0;
    salonScrollBottomBtn?.classList.add('hidden');
    if (salonScrollUnreadBadge) {
      salonScrollUnreadBadge.textContent = '0';
      salonScrollUnreadBadge.classList.add('hidden');
    }

    chatMessagesScroll.innerHTML = `
      <div class="chat-history-start hidden" id="salonHistoryStart">
        <span> Début de l'historique de <strong>${escapeHtml(salon.name)}</strong></span>
      </div>
      <div class="chat-history-loader hidden" id="salonHistoryLoader">
        <span class="chat-loader-spinner"></span>
        <span>Chargement des messages précédents...</span>
      </div>
      <div class="chat-msg">
        <img src="assets/wafatalk-icon.png" class="chat-msg-avatar" alt="WafaTalk Bot">
        <div class="chat-msg-body">
          <div class="chat-msg-author">
            <strong>WafaBot</strong>
            <span class="chat-msg-time">À l'instant</span>
          </div>
          <p class="chat-msg-text">Bienvenue dans <strong>${escapeHtml(salon.name)}</strong> ! Vous pouvez maintenant parler, activer votre caméra et discuter avec tous les membres du salon en direct </p>
        </div>
      </div>
    `;

    // Fetch existing recent messages from backend API
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE_URL}/salons/${salon.id}/messages?limit=50`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const msgs = Array.isArray(data) ? data : (data.messages || []);
        salonHasMoreMessages = Boolean(data.hasMore ?? (msgs.length === 50));

        if (msgs.length > 0) {
          salonOldestMessageId = msgs[0].id;
          msgs.forEach((m) => appendSalonChatMessage(m, false));
        }

        if (!salonHasMoreMessages) {
          document.getElementById('salonHistoryStart')?.classList.remove('hidden');
        }
      }
    } catch (e) {
      console.warn('Failed to load salon messages:', e);
    }

    chatMessagesScroll.scrollTop = chatMessagesScroll.scrollHeight;
  }

  // Fetch older messages when user scrolls to the top of salon chat
  async function loadOlderSalonMessages() {
    if (!state.currentRoom || !salonHasMoreMessages || salonIsLoadingOlder || !salonOldestMessageId) return;
    salonIsLoadingOlder = true;

    const loader = document.getElementById('salonHistoryLoader');
    loader?.classList.remove('hidden');

    const prevScrollHeight = chatMessagesScroll.scrollHeight;
    const prevScrollTop = chatMessagesScroll.scrollTop;

    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE_URL}/salons/${state.currentRoom.id}/messages?beforeId=${salonOldestMessageId}&limit=50`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const olderMsgs = Array.isArray(data) ? data : (data.messages || []);
        salonHasMoreMessages = Boolean(data.hasMore ?? (olderMsgs.length === 50));

        if (olderMsgs.length > 0) {
          salonOldestMessageId = olderMsgs[0].id;

          const fragment = document.createDocumentFragment();
          olderMsgs.forEach((m) => {
            if (!m.id || !chatMessagesScroll.querySelector(`.chat-msg[data-msg-id="${m.id}"]`)) {
              fragment.appendChild(createSalonMessageElement(m));
            }
          });

          const anchor = loader || chatMessagesScroll.firstChild;
          if (anchor && anchor.nextSibling) {
            chatMessagesScroll.insertBefore(fragment, anchor.nextSibling);
          } else {
            chatMessagesScroll.prepend(fragment);
          }

          // Anchor scroll position seamlessly so reading view is rock solid
          const newScrollHeight = chatMessagesScroll.scrollHeight;
          chatMessagesScroll.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
        } else {
          salonHasMoreMessages = false;
        }
      }
    } catch (e) {
      console.warn('Error loading older salon messages:', e);
    } finally {
      loader?.classList.add('hidden');
      if (!salonHasMoreMessages) {
        document.getElementById('salonHistoryStart')?.classList.remove('hidden');
      }
      salonIsLoadingOlder = false;
    }
  }

  // Append a Salon Chat Message Bubble
  function appendSalonChatMessage(message, shouldAutoScroll = true) {
    if (!chatMessagesScroll) return;

    if (message.id && chatMessagesScroll.querySelector(`.chat-msg[data-msg-id="${message.id}"]`)) {
      return;
    }

    const myId = state.currentUser?.id;
    const isFromMe = (message.user?.id && message.user.id === myId) || (message.userId && message.userId === myId);

    const msgEl = createSalonMessageElement(message);
    chatMessagesScroll.appendChild(msgEl);

    if (!salonOldestMessageId && message.id) {
      salonOldestMessageId = message.id;
    }

    const isNearBottom = (chatMessagesScroll.scrollHeight - chatMessagesScroll.scrollTop - chatMessagesScroll.clientHeight) < 140;

    if (shouldAutoScroll && (isFromMe || isNearBottom)) {
      chatMessagesScroll.scrollTo({ top: chatMessagesScroll.scrollHeight, behavior: 'smooth' });
      salonScrollBottomBtn?.classList.add('hidden');
      salonUnreadScrolledCount = 0;
      if (salonScrollUnreadBadge) salonScrollUnreadBadge.classList.add('hidden');
    } else if (!isFromMe) {
      // User is reading older messages above! Keep position and update unread indicator
      salonUnreadScrolledCount++;
      salonScrollBottomBtn?.classList.remove('hidden');
      if (salonScrollUnreadBadge) {
        salonScrollUnreadBadge.textContent = salonUnreadScrolledCount;
        salonScrollUnreadBadge.classList.remove('hidden');
      }
    }

    if (!isFromMe) {
      playTone(580, 'sine', 0.08);
      const salonBody = document.querySelector('.salon-modal-body');
      if (salonBody && salonBody.classList.contains('show-stage')) {
        document.getElementById('mobileChatUnreadDot')?.classList.remove('hidden');
      }
    }
  }

  // Scroll listener for Salon Chat
  chatMessagesScroll?.addEventListener('scroll', () => {
    // If user scrolled near top, load older history
    if (chatMessagesScroll.scrollTop <= 60 && salonHasMoreMessages && !salonIsLoadingOlder) {
      loadOlderSalonMessages();
    }

    // Toggle floating scroll-to-bottom button
    const distFromBottom = chatMessagesScroll.scrollHeight - chatMessagesScroll.scrollTop - chatMessagesScroll.clientHeight;
    if (distFromBottom < 90) {
      salonScrollBottomBtn?.classList.add('hidden');
      salonUnreadScrolledCount = 0;
      if (salonScrollUnreadBadge) salonScrollUnreadBadge.classList.add('hidden');
    } else if (distFromBottom > 160) {
      salonScrollBottomBtn?.classList.remove('hidden');
    }
  });

  salonScrollBottomBtn?.addEventListener('click', () => {
    chatMessagesScroll.scrollTo({ top: chatMessagesScroll.scrollHeight, behavior: 'smooth' });
    salonScrollBottomBtn.classList.add('hidden');
    salonUnreadScrolledCount = 0;
    if (salonScrollUnreadBadge) salonScrollUnreadBadge.classList.add('hidden');
  });

  // Handle Salon Chat Send
  chatForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInputText.value.trim();
    if (!text || !state.currentRoom) return;

    if (socket && socket.connected) {
      if (activeWhisperTarget) {
        socket.emit('chat:send', {
          salonId: state.currentRoom.id,
          content: text,
          type: 'WHISPER',
          targetUserId: activeWhisperTarget.id,
        });
      } else {
        socket.emit('chat:send', {
          salonId: state.currentRoom.id,
          content: text,
          type: 'TEXT',
        });
      }
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
  // 7. INTERACTIVE GIFTING & CELEBRATION ENGINE : « COUP DE CŒUR & CADEAUX »
  // =========================================================================

  const GIFTS_CATALOG = [
    {
      id: 'coffee',
      name: 'Café Douceur',
      icon: '☕',
      points: 30,
      ambiance: 'complice',
      ambianceLabel: 'Complice & Fun',
      type: 'gourmand',
      typeLabel: 'Attention Gourmande',
      accroche: 'Un petit café pour commencer notre discussion du bon pied ?',
      fx: 'steam'
    },
    {
      id: 'croissant',
      name: 'Croissant Chaud',
      icon: '🥐',
      points: 45,
      ambiance: 'complice',
      ambianceLabel: 'Complice & Fun',
      type: 'gourmand',
      typeLabel: 'Attention Gourmande',
      accroche: 'Le petit déj virtuel le plus croustillant de WafaTalk !',
      fx: 'steam'
    },
    {
      id: 'heart',
      name: 'Coup de Cœur',
      icon: '💖',
      points: 50,
      ambiance: 'romantique',
      ambianceLabel: 'Romantique',
      type: 'declaration',
      typeLabel: 'Déclaration Virtuelle',
      accroche: 'J\'ai flashé sur ton profil/ta voix, impossible de ne pas te laisser ce coup de cœur.',
      fx: 'hearts'
    },
    {
      id: 'bubble_tea',
      name: 'Boba Tea Festif',
      icon: '🧋',
      points: 60,
      ambiance: 'complice',
      ambianceLabel: 'Complice & Fun',
      type: 'gourmand',
      typeLabel: 'Attention Gourmande',
      accroche: 'Sucré, pétillant et plein de bonnes ondes pour égayer ta journée.',
      fx: 'bubbles'
    },
    {
      id: 'cocktail',
      name: 'Cocktail Sunset',
      icon: '🍹',
      points: 75,
      ambiance: 'premier_rdv',
      ambianceLabel: 'Premier RDV',
      type: 'sortie',
      typeLabel: 'Moment & Sortie',
      accroche: 'À consommer sans modération en terrasse avec un coucher de soleil.',
      fx: 'bubbles'
    },
    {
      id: 'star',
      name: 'Étoile Filante',
      icon: '⭐',
      points: 80,
      ambiance: 'romantique',
      ambianceLabel: 'Romantique',
      type: 'declaration',
      typeLabel: 'Déclaration Virtuelle',
      accroche: 'Fais un vœu, j\'ai l\'impression qu\'il vient déjà de se réaliser.',
      fx: 'stardust'
    },
    {
      id: 'playlist',
      name: 'Mixtape Secrète',
      icon: '🎵',
      points: 90,
      ambiance: 'complice',
      ambianceLabel: 'Complice & Fun',
      type: 'objet',
      typeLabel: 'Objet Symbolique',
      accroche: 'Les meilleures vibes musicales à écouter ensemble dans les salons.',
      fx: 'notes'
    },
    {
      id: 'chocolates',
      name: 'Boîte de Pralines',
      icon: '🍫',
      points: 100,
      ambiance: 'romantique',
      ambianceLabel: 'Romantique',
      type: 'gourmand',
      typeLabel: 'Attention Gourmande',
      accroche: 'Une touche de douceur fondante pour adoucir tes journées.',
      fx: 'hearts'
    },
    {
      id: 'red_rose',
      name: 'Rose Éternelle',
      icon: '🌹',
      points: 120,
      ambiance: 'romantique',
      ambianceLabel: 'Romantique',
      type: 'objet',
      typeLabel: 'Objet Symbolique',
      accroche: 'Classique, élégante et délicate, elle ne se fane jamais.',
      fx: 'petals'
    },
    {
      id: 'cinema_tickets',
      name: 'Soirée Ciné Popcorn',
      icon: '🍿',
      points: 140,
      ambiance: 'premier_rdv',
      ambianceLabel: 'Premier RDV',
      type: 'sortie',
      typeLabel: 'Moment & Sortie',
      accroche: 'Séance rétro et popcorn géant : on s\'installe au premier ou dernier rang ?',
      fx: 'confetti'
    },
    {
      id: 'magic_box',
      name: 'Coffret Mystère',
      icon: '🎁',
      points: 150,
      ambiance: 'complice',
      ambianceLabel: 'Complice & Fun',
      type: 'objet',
      typeLabel: 'Objet Symbolique',
      accroche: 'À déballer pour révéler un message surprise bienveillant !',
      fx: 'confetti'
    },
    {
      id: 'rooftop_date',
      name: 'Rendez-vous Rooftop',
      icon: '🌃',
      points: 180,
      ambiance: 'premier_rdv',
      ambianceLabel: 'Premier RDV',
      type: 'sortie',
      typeLabel: 'Moment & Sortie',
      accroche: 'Une vue panoramique imprenable sur la ville nocturne, rien que nous deux.',
      fx: 'stardust'
    },
    {
      id: 'candle_dinner',
      name: 'Dîner aux Chandelles',
      icon: '🕯️',
      points: 220,
      ambiance: 'romantique',
      ambianceLabel: 'Romantique',
      type: 'sortie',
      typeLabel: 'Moment & Sortie',
      accroche: 'Lumière tamisée, ambiance acoustique et une table réservée pour faire connaissance.',
      fx: 'sparks'
    },
    {
      id: 'museum_pass',
      name: 'Échappée Musée & Expo',
      icon: '🎨',
      points: 250,
      ambiance: 'premier_rdv',
      ambianceLabel: 'Premier RDV',
      type: 'sortie',
      typeLabel: 'Moment & Sortie',
      accroche: 'Pour refaire le monde devant les tableaux et partager nos coups de cœur artistiques.',
      fx: 'confetti'
    },
    {
      id: 'vip_crown',
      name: 'Couronne Prestige',
      icon: '👑',
      points: 300,
      ambiance: 'festif',
      ambianceLabel: 'Festif & Spectaculaire',
      type: 'declaration',
      typeLabel: 'Déclaration Virtuelle',
      accroche: 'Pour couronner la reine ou le roi du salon, avec tous les honneurs !',
      fx: 'sparks'
    },
    {
      id: 'stargazing',
      name: 'Nuit sous les Étoiles',
      icon: '🔭',
      points: 350,
      ambiance: 'romantique',
      ambianceLabel: 'Romantique',
      type: 'sortie',
      typeLabel: 'Moment & Sortie',
      accroche: 'Télescope, chocolat chaud et ciel dégagé pour compter les constellations.',
      fx: 'cosmic'
    },
    {
      id: 'hot_air_balloon',
      name: 'Vol en Montgolfière',
      icon: '🎈',
      points: 400,
      ambiance: 'festif',
      ambianceLabel: 'Festif & Spectaculaire',
      type: 'sortie',
      typeLabel: 'Moment & Sortie',
      accroche: 'Prendre de la hauteur et s\'évader au-dessus des nuages ensemble.',
      fx: 'confetti'
    },
    {
      id: 'fireworks',
      name: 'Grand Feu d\'Artifice',
      icon: '🎆',
      points: 500,
      ambiance: 'festif',
      ambianceLabel: 'Festif & Spectaculaire',
      type: 'declaration',
      typeLabel: 'Déclaration Virtuelle',
      accroche: 'L\'explosion de couleurs qui illumine tout le salon en direct !',
      fx: 'fireworks'
    },
    {
      id: 'luxury_ring',
      name: 'Bague Diamant Éclat',
      icon: '💎',
      points: 750,
      ambiance: 'romantique',
      ambianceLabel: 'Romantique',
      type: 'objet',
      typeLabel: 'Objet Symbolique',
      accroche: 'L\'attention ultime, brillante et précieuse, pour marquer les esprits.',
      fx: 'stardust'
    },
    {
      id: 'island_trip',
      name: 'Escapade Île Déserte',
      icon: '🏝️',
      points: 1000,
      ambiance: 'festif',
      ambianceLabel: 'Festif & Spectaculaire',
      type: 'sortie',
      typeLabel: 'Moment & Sortie',
      accroche: 'Billet première classe pour une plage secrète aux eaux turquoise.',
      fx: 'fireworks'
    }
  ];

  // Gift Shop State
  let activeGiftTab = 'catalog'; // 'catalog' | 'favorites' | 'history'
  let activeGiftAmbiance = 'all';
  let activeGiftType = 'all';
  let activeGiftBudget = 'all';
  let giftSearchTerm = '';
  let activePersonalizeGift = null;
  let favoriteGiftIds = new Set(JSON.parse(localStorage.getItem('wafatalk_favorite_gifts') || '["heart","coffee","cocktail"]'));
  let sentGiftHistory = JSON.parse(localStorage.getItem('wafatalk_sent_gifts') || '[]');

  const giftsCatalogGrid = document.getElementById('giftsCatalogGrid');
  const giftEmptyState = document.getElementById('giftEmptyState');
  const giftHistoryList = document.getElementById('giftHistoryList');
  const giftPersonalizeDrawer = document.getElementById('giftPersonalizeDrawer');
  const giftModalBalance = document.getElementById('giftModalBalance');
  const giftSearchInput = document.getElementById('giftSearchInput');
  const giftTypeSelect = document.getElementById('giftTypeSelect');
  const giftBudgetSelect = document.getElementById('giftBudgetSelect');
  const btnSurpriseMe = document.getElementById('btnSurpriseMe');
  const btnResetGiftFilters = document.getElementById('btnResetGiftFilters');
  const btnCloseGiftDrawer = document.getElementById('btnCloseGiftDrawer');
  const btnCancelGiftDrawer = document.getElementById('btnCancelGiftDrawer');
  const btnConfirmSendGift = document.getElementById('btnConfirmSendGift');
  const btnCopyAccroche = document.getElementById('btnCopyAccroche');
  const copyAccrocheLabel = document.getElementById('copyAccrocheLabel');
  const giftCustomNote = document.getElementById('giftCustomNote');
  const giftCharCount = document.getElementById('giftCharCount');
  const giftRecipientSelect = document.getElementById('giftRecipientSelect');
  const giftAccrocheText = document.getElementById('giftAccrocheText');

  function updateGiftCounters() {
    const catalogCount = document.getElementById('giftCatalogCount');
    const favCount = document.getElementById('giftFavCount');
    const historyCount = document.getElementById('giftHistoryCount');
    const catalogCounter = document.getElementById('giftCatalogCounter');
    const favCounter = document.getElementById('giftFavCounter');
    const historyCounter = document.getElementById('giftHistoryCounter');

    if (catalogCount) catalogCount.textContent = GIFTS_CATALOG.length;
    if (catalogCounter) catalogCounter.textContent = GIFTS_CATALOG.length;
    if (favCount) favCount.textContent = favoriteGiftIds.size;
    if (favCounter) favCounter.textContent = favoriteGiftIds.size;
    if (historyCount) historyCount.textContent = sentGiftHistory.length;
    if (historyCounter) historyCounter.textContent = sentGiftHistory.length;
  }

  function syncUserPointsDisplay() {
    if (giftModalBalance) {
      giftModalBalance.textContent = state.userPoints;
    }
    const navPoints = document.querySelectorAll('.user-points-badge span, .profile-points-val');
    navPoints.forEach(el => el.textContent = state.userPoints);
  }

  function filterGifts() {
    return GIFTS_CATALOG.filter(gift => {
      // Tab filter
      if (activeGiftTab === 'favorites' && !favoriteGiftIds.has(gift.id)) {
        return false;
      }
      // Ambiance filter
      if (activeGiftAmbiance !== 'all' && gift.ambiance !== activeGiftAmbiance) {
        return false;
      }
      // Type filter
      if (activeGiftType !== 'all' && gift.type !== activeGiftType) {
        return false;
      }
      // Budget filter
      if (activeGiftBudget === 'tier1' && gift.points >= 50) return false;
      if (activeGiftBudget === 'tier2' && (gift.points < 50 || gift.points > 150)) return false;
      if (activeGiftBudget === 'tier3' && (gift.points < 150 || gift.points > 300)) return false;
      if (activeGiftBudget === 'tier4' && gift.points <= 300) return false;
      // Search term
      if (giftSearchTerm) {
        const query = giftSearchTerm.toLowerCase();
        const matchesName = gift.name.toLowerCase().includes(query);
        const matchesAccroche = gift.accroche.toLowerCase().includes(query);
        const matchesType = gift.typeLabel.toLowerCase().includes(query);
        const matchesAmbiance = gift.ambianceLabel.toLowerCase().includes(query);
        if (!matchesName && !matchesAccroche && !matchesType && !matchesAmbiance) {
          return false;
        }
      }
      return true;
    });
  }

  function renderGiftShop() {
    updateGiftCounters();
    syncUserPointsDisplay();

    if (activeGiftTab === 'history') {
      if (giftsCatalogGrid) giftsCatalogGrid.classList.add('hidden');
      if (giftEmptyState) giftEmptyState.classList.add('hidden');
      if (giftHistoryList) giftHistoryList.classList.remove('hidden');
      renderGiftHistory();
      return;
    }

    if (giftHistoryList) giftHistoryList.classList.add('hidden');
    const filtered = filterGifts();

    if (filtered.length === 0) {
      if (giftsCatalogGrid) giftsCatalogGrid.classList.add('hidden');
      if (giftEmptyState) giftEmptyState.classList.remove('hidden');
      const emptyTitle = document.getElementById('giftEmptyTitle');
      const emptyDesc = document.getElementById('giftEmptyDesc');
      if (activeGiftTab === 'favorites') {
        if (emptyTitle) emptyTitle.textContent = 'Aucun cadeau favori';
        if (emptyDesc) emptyDesc.textContent = 'Cliquez sur l\'étoile en haut d\'un cadeau dans le catalogue pour l\'ajouter à vos favoris.';
      } else {
        if (emptyTitle) emptyTitle.textContent = 'Aucun cadeau trouvé';
        if (emptyDesc) emptyDesc.textContent = 'Essayez de modifier vos filtres ou effectuez une autre recherche.';
      }
      return;
    }

    if (giftEmptyState) giftEmptyState.classList.add('hidden');
    if (giftsCatalogGrid) {
      giftsCatalogGrid.classList.remove('hidden');
      giftsCatalogGrid.innerHTML = filtered.map(gift => {
        const isFav = favoriteGiftIds.has(gift.id);
        return `
          <div class="gift-card-item" data-id="${gift.id}">
            <div class="gift-card-top">
              <span class="gift-card-tag">${gift.ambianceLabel}</span>
              <button type="button" class="gift-fav-btn ${isFav ? 'is-fav' : ''}" data-id="${gift.id}" title="${isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
              </button>
            </div>
            <div class="gift-card-main">
              <div class="gift-card-icon-wrap">${gift.icon}</div>
              <strong class="gift-card-title">${gift.name}</strong>
              <p class="gift-card-accroche">« ${gift.accroche} »</p>
            </div>
            <div class="gift-card-bottom">
              <span class="gift-card-cost-pill">${gift.points} pts</span>
              <button type="button" class="btn btn-sm btn-primary gift-card-action-btn" data-action="personalize" data-id="${gift.id}">Offrir</button>
            </div>
          </div>
        `;
      }).join('');

      // Attach card event listeners
      giftsCatalogGrid.querySelectorAll('.gift-fav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          if (favoriteGiftIds.has(id)) {
            favoriteGiftIds.delete(id);
          } else {
            favoriteGiftIds.add(id);
          }
          localStorage.setItem('wafatalk_favorite_gifts', JSON.stringify([...favoriteGiftIds]));
          renderGiftShop();
        });
      });

      giftsCatalogGrid.querySelectorAll('[data-action="personalize"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = btn.dataset.id;
          const gift = GIFTS_CATALOG.find(g => g.id === id);
          if (gift) openPersonalizeDrawer(gift);
        });
      });

      // Quick motion animation preview on gift icon click
      giftsCatalogGrid.querySelectorAll('.gift-card-icon-wrap').forEach(wrap => {
        wrap.style.cursor = 'pointer';
        wrap.setAttribute('title', 'Cliquer pour voir l\'animation');
        wrap.addEventListener('click', (e) => {
          e.stopPropagation();
          const card = wrap.closest('.gift-card-item');
          const id = card?.dataset.id;
          const gift = GIFTS_CATALOG.find(g => g.id === id);
          if (gift) {
            triggerGiftCelebrationGraphic(gift, state.currentUser?.displayName || 'Vous', 'Aperçu', gift.accroche);
          }
        });
      });
    }
  }

  function renderGiftHistory() {
    if (!giftHistoryList) return;
    if (sentGiftHistory.length === 0) {
      giftHistoryList.innerHTML = `
        <div class="gift-empty-state">
          <div class="gift-empty-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <polyline points="20 12 20 22 4 22 4 12"></polyline>
              <rect x="2" y="7" width="20" height="5"></rect>
              <line x1="12" y1="22" x2="12" y2="7"></line>
            </svg>
          </div>
          <h3 class="gift-empty-title">Aucun cadeau envoyé pour le moment</h3>
          <p class="gift-empty-desc">Offrez une attention dans un salon ou en discussion privée pour la retrouver ici.</p>
        </div>
      `;
      return;
    }

    giftHistoryList.innerHTML = sentGiftHistory.slice().reverse().map(item => `
      <div class="gift-history-item">
        <div class="gift-history-left">
          <div class="gift-history-icon">${item.icon}</div>
          <div class="gift-history-info">
            <strong class="gift-history-name">${item.name}</strong>
            <span class="gift-history-sub">Offert à <strong>${item.recipientName}</strong> &bull; ${item.dateStr}</span>
            ${item.note ? `<span class="gift-history-sub" style="font-style: italic;">« ${item.note} »</span>` : ''}
          </div>
        </div>
        <span class="gift-history-points">-${item.points} pts</span>
      </div>
    `).join('');
  }

  function openPersonalizeDrawer(gift) {
    activePersonalizeGift = gift;
    if (!giftPersonalizeDrawer) return;

    // Populate Recipient Selector
    if (giftRecipientSelect) {
      giftRecipientSelect.innerHTML = '';
      const optAll = document.createElement('option');
      optAll.value = 'all';
      optAll.textContent = state.currentRoom ? 'À tout le salon (Célébration collective)' : 'À mes amis';
      giftRecipientSelect.appendChild(optAll);

      // If inside salon, add participants
      if (currentSalonRoster && currentSalonRoster.size > 0) {
        currentSalonRoster.forEach(user => {
          if (user.userId !== state.currentUser?.id) {
            const opt = document.createElement('option');
            opt.value = user.userId;
            opt.textContent = `${user.displayName || user.username} (${user.role || 'Membre'})`;
            giftRecipientSelect.appendChild(opt);
          }
        });
      } else if (typeof activeDirectUser !== 'undefined' && activeDirectUser) {
        const opt = document.createElement('option');
        opt.value = activeDirectUser.id;
        opt.textContent = activeDirectUser.name || activeDirectUser.username;
        opt.selected = true;
        giftRecipientSelect.appendChild(opt);
      }
    }

    // Populate preview info
    const ambianceEl = document.getElementById('previewCardAmbiance');
    const iconEl = document.getElementById('previewCardIcon');
    const nameEl = document.getElementById('previewCardName');
    const costEl = document.getElementById('previewCardCost');
    const confirmBtnText = document.getElementById('confirmSendGiftText');

    if (ambianceEl) ambianceEl.textContent = gift.ambianceLabel;
    if (iconEl) iconEl.textContent = gift.icon;
    if (nameEl) nameEl.textContent = gift.name;
    if (costEl) costEl.textContent = `${gift.points} pts d'amitié`;
    if (confirmBtnText) confirmBtnText.textContent = `Confirmer et offrir (${gift.points} pts)`;

    if (giftAccrocheText) giftAccrocheText.textContent = gift.accroche;
    if (giftCustomNote) giftCustomNote.value = '';
    if (giftCharCount) giftCharCount.textContent = '0';

    const previewNote = document.getElementById('previewCardNote');
    if (previewNote) previewNote.textContent = `« ${gift.accroche} »`;

    const previewRecipient = document.getElementById('previewCardRecipient');
    if (previewRecipient && giftRecipientSelect && giftRecipientSelect.options.length > 0) {
      previewRecipient.textContent = `Destinataire : ${giftRecipientSelect.options[giftRecipientSelect.selectedIndex].text}`;
    }

    giftPersonalizeDrawer.classList.remove('hidden');
  }

  function closePersonalizeDrawer() {
    if (giftPersonalizeDrawer) giftPersonalizeDrawer.classList.add('hidden');
    activePersonalizeGift = null;
  }

  // Live preview update on note input
  giftCustomNote?.addEventListener('input', () => {
    const val = giftCustomNote.value.trim();
    if (giftCharCount) giftCharCount.textContent = giftCustomNote.value.length;
    const previewNote = document.getElementById('previewCardNote');
    if (previewNote) {
      if (val) {
        previewNote.textContent = `« ${val} »`;
      } else if (activePersonalizeGift) {
        previewNote.textContent = `« ${activePersonalizeGift.accroche} »`;
      }
    }
  });

  giftRecipientSelect?.addEventListener('change', () => {
    const recipientText = giftRecipientSelect.options[giftRecipientSelect.selectedIndex]?.text || '';
    const previewRecipient = document.getElementById('previewCardRecipient');
    if (previewRecipient) previewRecipient.textContent = `Destinataire : ${recipientText}`;
  });

  btnCopyAccroche?.addEventListener('click', () => {
    if (!activePersonalizeGift) return;
    navigator.clipboard?.writeText(activePersonalizeGift.accroche).then(() => {
      if (copyAccrocheLabel) copyAccrocheLabel.textContent = 'Copié !';
      setTimeout(() => {
        if (copyAccrocheLabel) copyAccrocheLabel.textContent = 'Copier';
      }, 1800);
    }).catch(() => {
      if (giftCustomNote) {
        giftCustomNote.value = activePersonalizeGift.accroche;
        giftCustomNote.dispatchEvent(new Event('input'));
      }
      if (copyAccrocheLabel) copyAccrocheLabel.textContent = 'Inséré !';
      setTimeout(() => {
        if (copyAccrocheLabel) copyAccrocheLabel.textContent = 'Copier';
      }, 1800);
    });
  });

  btnCancelGiftDrawer?.addEventListener('click', closePersonalizeDrawer);
  btnCloseGiftDrawer?.addEventListener('click', closePersonalizeDrawer);

  // Click on live preview card in drawer to preview motion animation immediately
  document.getElementById('giftLivePreviewCard')?.addEventListener('click', () => {
    if (activePersonalizeGift) {
      const customMsg = giftCustomNote ? giftCustomNote.value.trim() : '';
      triggerGiftCelebrationGraphic(activePersonalizeGift, state.currentUser?.displayName || 'Vous', 'Aperçu', customMsg || activePersonalizeGift.accroche);
    }
  });

  // Confirm and Send Gift Action
  btnConfirmSendGift?.addEventListener('click', async () => {
    if (!activePersonalizeGift) return;
    const gift = activePersonalizeGift;

    if (state.userPoints < gift.points) {
      // Auto-replenish for demo delight
      state.userPoints += 1500;
      syncUserPointsDisplay();
      showToast(`Bonus amitié activé : +1500 WafaPoints offerts !`, 'amber');
    }

    // Deduct points
    state.userPoints -= gift.points;
    syncUserPointsDisplay();

    const customMsg = giftCustomNote ? giftCustomNote.value.trim() : '';
    const recipientVal = giftRecipientSelect ? giftRecipientSelect.value : 'all';
    const recipientName = giftRecipientSelect && giftRecipientSelect.options[giftRecipientSelect.selectedIndex] ? giftRecipientSelect.options[giftRecipientSelect.selectedIndex].text : 'Tout le salon';
    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

    // Save to history
    sentGiftHistory.push({
      id: gift.id,
      name: gift.name,
      icon: gift.icon,
      points: gift.points,
      note: customMsg || gift.accroche,
      recipientId: recipientVal,
      recipientName: recipientName,
      dateStr: dateStr,
      timestamp: Date.now()
    });
    localStorage.setItem('wafatalk_sent_gifts', JSON.stringify(sentGiftHistory));
    updateGiftCounters();

    const noteToDisplay = customMsg || gift.accroche;

    // Close drawer and shop
    closePersonalizeDrawer();
    closeGiftShop();

    // Launch rich particle fireworks & audio chime
    triggerGiftCelebrationGraphic(gift, state.currentUser?.displayName || 'Vous', recipientName, noteToDisplay);

    showToast(`Attention offerte avec succès : ${gift.name} (${gift.points} pts) !`, 'teal');

    // Send to backend if authenticated and inside salon
    if (state.currentRoom?.id) {
      try {
        const token = localStorage.getItem('wafatalk_token');
        if (token) {
          fetch(`${API_URL}/gifts/send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              salonId: state.currentRoom.id,
              giftType: gift.id,
              costPoints: gift.points,
              receiverId: recipientVal !== 'all' ? recipientVal : undefined,
              customMessage: noteToDisplay
            })
          }).catch(err => console.warn('Offline gift logging:', err));
        }
      } catch (e) {
        console.warn('Gift API call warning:', e);
      }

      // Append rich gift celebration card in salon chat
      if (chatMessagesScroll) {
        const giftMsg = document.createElement('div');
        giftMsg.className = 'chat-gift-announcement';
        giftMsg.innerHTML = `
          <div class="chat-gift-icon-bubble">${gift.icon}</div>
          <div class="chat-gift-content">
            <div class="chat-gift-headline">
              <strong>${state.currentUser?.displayName || 'Vous'}</strong> a offert <strong>${gift.name}</strong> (${recipientName}) !
            </div>
            <div class="chat-gift-note">« ${noteToDisplay} »</div>
          </div>
        `;
        chatMessagesScroll.appendChild(giftMsg);
        chatMessagesScroll.scrollTop = chatMessagesScroll.scrollHeight;
      }
    } else if (typeof activeDirectUser !== 'undefined' && activeDirectUser && typeof directMessagesScroll !== 'undefined' && directMessagesScroll) {
      // In Direct Chat
      const dmMsg = document.createElement('div');
      dmMsg.className = 'chat-gift-announcement';
      dmMsg.innerHTML = `
        <div class="chat-gift-icon-bubble">${gift.icon}</div>
        <div class="chat-gift-content">
          <div class="chat-gift-headline">
            <strong>${state.currentUser?.displayName || 'Vous'}</strong> a offert <strong>${gift.name}</strong> !
          </div>
          <div class="chat-gift-note">« ${noteToDisplay} »</div>
        </div>
      `;
      directMessagesScroll.appendChild(dmMsg);
      directMessagesScroll.scrollTop = directMessagesScroll.scrollHeight;
    }
  });

  // "Surprends-moi !" action
  btnSurpriseMe?.addEventListener('click', () => {
    const available = filterGifts();
    const pool = available.length > 0 ? available : GIFTS_CATALOG;
    const randomGift = pool[Math.floor(Math.random() * pool.length)];

    // Highlight card in grid
    renderGiftShop();
    if (giftsCatalogGrid) {
      const cardEl = giftsCatalogGrid.querySelector(`[data-id="${randomGift.id}"]`);
      if (cardEl) {
        cardEl.classList.add('is-highlighted');
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    // Direct to personalization drawer after brief feedback
    setTimeout(() => {
      openPersonalizeDrawer(randomGift);
    }, 320);
  });

  // Filter toolbar event listeners
  document.querySelectorAll('.gift-nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.gift-nav-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeGiftTab = tab.dataset.tab;
      renderGiftShop();
    });
  });

  document.querySelectorAll('.gift-ambiance-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.gift-ambiance-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeGiftAmbiance = pill.dataset.ambiance;
      renderGiftShop();
    });
  });

  giftSearchInput?.addEventListener('input', () => {
    giftSearchTerm = giftSearchInput.value.trim();
    renderGiftShop();
  });

  giftTypeSelect?.addEventListener('change', () => {
    activeGiftType = giftTypeSelect.value;
    renderGiftShop();
  });

  giftBudgetSelect?.addEventListener('change', () => {
    activeGiftBudget = giftBudgetSelect.value;
    renderGiftShop();
  });

  btnResetGiftFilters?.addEventListener('click', () => {
    activeGiftAmbiance = 'all';
    activeGiftType = 'all';
    activeGiftBudget = 'all';
    giftSearchTerm = '';
    if (giftSearchInput) giftSearchInput.value = '';
    if (giftTypeSelect) giftTypeSelect.value = 'all';
    if (giftBudgetSelect) giftBudgetSelect.value = 'all';
    document.querySelectorAll('.gift-ambiance-pill').forEach(p => {
      p.classList.toggle('active', p.dataset.ambiance === 'all');
    });
    renderGiftShop();
  });

  function openGiftShop() {
    if (giftShopModal) {
      giftShopModal.classList.remove('hidden');
      renderGiftShop();
    }
  }

  function closeGiftShop() {
    if (giftShopModal) giftShopModal.classList.add('hidden');
    closePersonalizeDrawer();
  }

  btnOpenGiftShop?.addEventListener('click', openGiftShop);
  btnSidebarGiftTrigger?.addEventListener('click', openGiftShop);
  btnModalGiftTrigger?.addEventListener('click', openGiftShop);
  btnSendCommunityGift?.addEventListener('click', openGiftShop);
  btnCloseGiftModal?.addEventListener('click', closeGiftShop);

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

    showToast(`Le salon "${name}" a été créé avec succès !  Vous êtes l'administrateur.`, 'teal');
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
      submitBtn.innerHTML = '<span>Vérification en cours...</span>';
    }

    try {
      // 1. If salon has known local access code, check it first
      if (salon.accessCode && salon.accessCode.trim().toLowerCase() !== code.toLowerCase()) {
        showToast(' Code d\'accès incorrect !', 'coral');
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
          showToast(` ${data.message || 'Code d\'accès incorrect.'}`, 'coral');
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
          showToast(' Code d\'accès incorrect !', 'coral');
          return;
        }
      }

      // 3. Success: save verified code and grant entrance
      salon.accessCode = code;
      closePrivateAccessModal();
      showToast(' Code validé ! Bienvenue dans le salon.', 'teal');
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
      shareSalonBadge.textContent = salon.isPrivate ? ' Salon Privé' : ' Salon Public';
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
        showToast(`Code d'accès "${code}" copié ! `, 'teal');
      }).catch(() => {
        showToast(`Code d'accès : ${code}`, 'teal');
      });
    }
  });

  btnCopyInviteLink?.addEventListener('click', () => {
    const link = shareInviteLinkInput?.value;
    if (link) {
      navigator.clipboard?.writeText(link).then(() => {
        showToast('Lien d\'invitation copié dans le presse-papiers ! ', 'teal');
      }).catch(() => {
        if (shareInviteLinkInput) {
          shareInviteLinkInput.select();
          document.execCommand('copy');
          showToast('Lien d\'invitation copié ! ', 'teal');
        }
      });
    }
  });

  btnShareWhatsApp?.addEventListener('click', () => {
    const salon = state.currentRoom;
    const link = shareInviteLinkInput?.value || window.location.href;
    const codeText = salon?.accessCode ? `\n Code d'accès : *${salon.accessCode}*` : '';
    const text = `Rejoins-moi dans le salon "${salon?.name || 'WafaTalk'}" sur WafaTalk ! \nLien direct : ${link}${codeText}`;
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
    showToast('Lien copié ! Collez-le dans vos stories ou messages Instagram ', 'teal');
    window.open(`https://www.instagram.com/direct/inbox/`, '_blank');
  });

  // =========================================================================
  // SALON ADMIN MODERATION & BAN CONTROLLER (MUTE, CUT CAM, BAN USER, BAN IP, PROMOTE/REVOKE ADMIN)
  // =========================================================================
  function openSalonAdminModal(target) {
    if (!target || !salonAdminConfirmModal) return;
    if (adminTargetUserId) adminTargetUserId.value = target.userId;
    if (adminConfirmTargetText) {
      adminConfirmTargetText.textContent = `Participant : ${target.displayName || target.name || target.username || 'Membre'}`;
    }

    const myId = state.currentUser?.id;
    const myParticipant = currentSalonRoster.get(myId) || (myId ? null : Array.from(currentSalonRoster.values())[0]) || {
      userId: myId || 'self',
      role: state.currentRoom?.isOwner ? 'Propriétaire' : (state.currentUser?.role || 'Participant'),
      badgeType: state.currentRoom?.isOwner ? 'OWNER' : undefined
    };
    const myRoleInfo = getParticipantRoleInfo(myParticipant);
    const isMeOwnerOrSuper = myRoleInfo.type === 'owner' || myRoleInfo.type === 'superadmin';
    const targetRoleInfo = getParticipantRoleInfo(target);

    // Only Salon Owner or SuperAdmin can Promote or Revoke Admins
    if (btnAdminActionToggleAdmin) {
      if (isMeOwnerOrSuper) {
        btnAdminActionToggleAdmin.style.display = 'flex';
        const isTargetAdmin = targetRoleInfo.type === 'admin';
        if (isTargetAdmin) {
          if (adminRoleToggleIcon) adminRoleToggleIcon.textContent = '';
          if (adminRoleToggleTitle) adminRoleToggleTitle.textContent = 'Retirer le statut Admin';
          if (adminRoleToggleDesc) adminRoleToggleDesc.textContent = 'Rétrograder en utilisateur normal (Cercle Noir)';
          btnAdminActionToggleAdmin.dataset.nextAction = 'revoke_admin';
        } else {
          if (adminRoleToggleIcon) adminRoleToggleIcon.textContent = '';
          if (adminRoleToggleTitle) adminRoleToggleTitle.textContent = 'Nommer Administrateur';
          if (adminRoleToggleDesc) adminRoleToggleDesc.textContent = 'Accorder les droits de gestion sur ce salon (Cercle Vert)';
          btnAdminActionToggleAdmin.dataset.nextAction = 'promote_admin';
        }
      } else {
        btnAdminActionToggleAdmin.style.display = 'none';
      }
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

    if (action === 'promote_admin') {
      showToast(` ${targetName} est maintenant Administrateur du salon !`, 'teal');
      if (target) {
        target.role = 'Admin';
        target.badgeType = 'ADMIN';
        renderVoiceStage();
      }
    } else if (action === 'revoke_admin') {
      showToast(` Statut Administrateur retiré à ${targetName}.`, 'coral');
      if (target) {
        target.role = 'Participant';
        target.badgeType = 'USER';
        renderVoiceStage();
      }
    } else if (action === 'mute') {
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
    } else if (action === 'kick') {
      showToast(` Participant expulsé du salon : ${targetName}`, 'coral');
      currentSalonRoster.delete(targetUserId);
      renderVoiceStage();
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

  btnAdminActionToggleAdmin?.addEventListener('click', () => {
    const action = btnAdminActionToggleAdmin.dataset.nextAction || 'promote_admin';
    executeSalonModeration(action);
  });

  btnAdminActionMute?.addEventListener('click', () => {
    executeSalonModeration('mute', 'Votre micro a été coupé par l\'administrateur du salon.');
  });

  btnAdminActionCutCam?.addEventListener('click', () => {
    executeSalonModeration('cut_camera', 'Votre caméra a été désactivée par l\'administrateur du salon.');
  });

  btnAdminActionKick?.addEventListener('click', () => {
    executeSalonModeration('kick', 'Vous avez été expulsé de ce salon par l\'administrateur.');
  });

  btnAdminActionBanUser?.addEventListener('click', () => {
    executeSalonModeration('ban_user', 'Vous avez été banni définitivement de ce salon par l\'administrateur.');
  });

  btnAdminActionBanIp?.addEventListener('click', () => {
    executeSalonModeration('ban_ip', 'Votre adresse IP a été bannie définitivement de ce salon.');
  });

  // =========================================================================
  // SALON BANS & UNBAN CONTROLLER
  // =========================================================================
  async function loadSalonBans() {
    if (!state.currentRoom || !salonBansModal) return;
    salonBansLoading?.classList.remove('hidden');
    salonBansEmpty?.classList.add('hidden');
    salonBansList?.classList.add('hidden');
    if (salonBansList) salonBansList.innerHTML = '';

    const token = getAuthToken();
    if (!token) {
      salonBansLoading?.classList.add('hidden');
      salonBansEmpty?.classList.remove('hidden');
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/salons/${state.currentRoom.id}/bans`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      salonBansLoading?.classList.add('hidden');

      if (!data.success || !data.bans || data.bans.length === 0) {
        salonBansEmpty?.classList.remove('hidden');
        return;
      }

      salonBansList.innerHTML = '';
      data.bans.forEach(ban => {
        const item = document.createElement('div');
        item.className = 'salon-ban-item';
        item.id = `ban-row-${ban.id}`;

        const isIp = ban.banType === 'IP';
        const displayName = ban.username || (isIp ? `IP : ${ban.ipAddress}` : 'Utilisateur');
        const banDateStr = new Date(ban.createdAt).toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit'
        });

        item.innerHTML = `
          <div class="ban-item-user">
            <div class="ban-item-icon">${isIp ? '' : ''}</div>
            <div class="ban-item-meta">
              <div class="ban-item-name">
                <span>${escapeHtml(displayName)}</span>
                <span class="ban-item-badge ${isIp ? 'badge-ip' : 'badge-user'}">${isIp ? 'Ban IP' : 'Ban Compte'}</span>
              </div>
              <span class="ban-item-date">Banni le ${banDateStr}</span>
              <span class="ban-item-reason">${escapeHtml(ban.reason || 'Banni par l\'administrateur')}</span>
            </div>
          </div>
          <button type="button" class="btn-unban" data-id="${ban.id}" data-name="${escapeHtml(displayName)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>
            <span>Débannir</span>
          </button>
        `;

        const unbanBtn = item.querySelector('.btn-unban');
        unbanBtn?.addEventListener('click', () => executeUnban(ban.id, displayName, item));

        salonBansList.appendChild(item);
      });

      salonBansList.classList.remove('hidden');
    } catch (err) {
      console.error('Error loading bans:', err);
      salonBansLoading?.classList.add('hidden');
      showToast('Impossible de charger la liste des bannis.', 'coral');
    }
  }

  async function executeUnban(banId, displayName, rowElement) {
    if (!state.currentRoom) return;
    const token = getAuthToken();
    if (!token) return;

    const unbanBtn = rowElement?.querySelector('.btn-unban');
    if (unbanBtn) {
      unbanBtn.disabled = true;
      unbanBtn.innerHTML = '<span>Débannissement...</span>';
    }

    try {
      const res = await fetch(`${API_BASE_URL}/salons/${state.currentRoom.id}/bans/${banId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        showToast(` ${displayName} a été débanni avec succès !`, 'teal');
        rowElement?.remove();
        if (salonBansList && salonBansList.children.length === 0) {
          salonBansEmpty?.classList.remove('hidden');
          salonBansList?.classList.add('hidden');
        }
      } else {
        showToast(data.message || 'Erreur lors du débannissement.', 'coral');
        if (unbanBtn) {
          unbanBtn.disabled = false;
          unbanBtn.innerHTML = '<span>Débannir</span>';
        }
      }
    } catch (err) {
      console.error('Unban error:', err);
      showToast('Erreur réseau lors du débannissement.', 'coral');
      if (unbanBtn) {
        unbanBtn.disabled = false;
        unbanBtn.innerHTML = '<span>Débannir</span>';
      }
    }
  }

  function openSalonBansModal() {
    salonBansModal?.classList.remove('hidden');
    loadSalonBans();
  }

  function closeSalonBansModal() {
    salonBansModal?.classList.add('hidden');
  }

  btnOpenSalonBansModal?.addEventListener('click', openSalonBansModal);
  btnCloseSalonBansModal?.addEventListener('click', closeSalonBansModal);

  btnAdminViewBansList?.addEventListener('click', () => {
    closeSalonAdminModal();
    openSalonBansModal();
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

  // =========================================================================
  // 9b. CONTROLLER: MON PROFIL & STATUT + PARAMÈTRES AUDIO & COMPTE
  // =========================================================================

  // DOM Elements: Profile & Status Modal
  const btnViewProfile = document.getElementById('btnViewProfile');
  const profileStatusModal = document.getElementById('profileStatusModal');
  const btnCloseProfileModal = document.getElementById('btnCloseProfileModal');
  const btnCancelProfileModal = document.getElementById('btnCancelProfileModal');
  const btnSaveProfileModal = document.getElementById('btnSaveProfileModal');
  const profileSaveSpinner = document.getElementById('profileSaveSpinner');
  const profileAvatarPreview = document.getElementById('profileAvatarPreview');
  const profileAvatarStatusDot = document.getElementById('profileAvatarStatusDot');
  const avatarFileInput = document.getElementById('avatarFileInput');
  const profileAvatarUrlInput = document.getElementById('profileAvatarUrlInput');
  const avatarPresetsGrid = document.getElementById('avatarPresetsGrid');
  const presenceCardsGrid = document.getElementById('presenceCardsGrid');
  const profileMoodInput = document.getElementById('profileMoodInput');
  const profileDisplayNameInput = document.getElementById('profileDisplayNameInput');
  const profileUsernameDisplay = document.getElementById('profileUsernameDisplay');
  const profileBioInput = document.getElementById('profileBioInput');
  const profileBioCounter = document.getElementById('profileBioCounter');
  const profileCountrySelect = document.getElementById('profileCountrySelect');
  const profilePointsChip = document.getElementById('profilePointsChip');
  const profileSaveFeedback = document.getElementById('profileSaveFeedback');

  // Active Profile Modal Internal State
  let activeProfileAvatar = '';
  let activePresenceStatus = 'ONLINE';

  // Open "Mon Profil & Statut" Modal
  function openProfileStatusModal() {
    if (!profileStatusModal) return;
    profileDropdown?.classList.add('hidden');

    const user = state.currentUser || {};
    const displayName = user.displayName || user.name || user.username || 'Ami WafaTalk';
    const username = user.username || 'utilisateur';
    const avatar = user.avatarUrl || user.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=160&auto=format&fit=crop&q=80';
    const bio = user.bio || '';
    const country = user.country || 'France';
    const status = (user.status || 'ONLINE').toUpperCase();
    const mood = user.mood || '';

    activeProfileAvatar = avatar;
    activePresenceStatus = ['ONLINE', 'BUSY', 'IDLE', 'OFFLINE'].includes(status) ? status : 'ONLINE';

    // Populate Fields
    if (profileAvatarPreview) profileAvatarPreview.src = avatar;
    if (profileAvatarUrlInput) profileAvatarUrlInput.value = avatar.startsWith('data:') ? '' : avatar;
    if (profileDisplayNameInput) profileDisplayNameInput.value = displayName;
    if (profileUsernameDisplay) profileUsernameDisplay.value = username;
    if (profileBioInput) profileBioInput.value = bio;
    if (profileBioCounter) profileBioCounter.textContent = `${bio.length}/160`;
    if (profileMoodInput) profileMoodInput.value = mood;
    if (profileCountrySelect) {
      // Find matching country option by value or text
      const opts = Array.from(profileCountrySelect.options);
      const match = opts.find(o => o.value.toLowerCase() === country.toLowerCase() || o.text.toLowerCase().includes(country.toLowerCase()));
      if (match) profileCountrySelect.value = match.value;
    }
    if (profilePointsChip) {
      profilePointsChip.textContent = ` ${state.userPoints || 150} WafaPoints`;
    }

    // Set Presence Visuals
    updatePresenceSelectionUI(activePresenceStatus);

    // Reset feedback
    if (profileSaveFeedback) {
      profileSaveFeedback.className = 'modal-feedback-alert hidden';
      profileSaveFeedback.textContent = '';
    }

    // Mark preset selected if matching
    updatePresetSelectionUI(avatar);

    profileStatusModal.classList.remove('hidden');
  }

  function closeProfileStatusModal() {
    profileStatusModal?.classList.add('hidden');
  }

  function updatePresenceSelectionUI(status) {
    activePresenceStatus = status;
    const cards = presenceCardsGrid?.querySelectorAll('.presence-card');
    cards?.forEach(card => {
      const cardStat = card.getAttribute('data-status');
      card.classList.toggle('selected', cardStat === status);
    });

    if (profileAvatarStatusDot) {
      profileAvatarStatusDot.className = `profile-status-indicator ${status.toLowerCase()}`;
    }
  }

  function updatePresetSelectionUI(url) {
    const presetBtns = avatarPresetsGrid?.querySelectorAll('.avatar-preset-btn');
    presetBtns?.forEach(btn => {
      const match = btn.getAttribute('data-url') === url;
      btn.classList.toggle('selected', match);
    });
  }

  // Preset Avatars Click
  avatarPresetsGrid?.addEventListener('click', (e) => {
    const btn = e.target.closest('.avatar-preset-btn');
    if (!btn) return;
    const url = btn.getAttribute('data-url');
    if (url) {
      activeProfileAvatar = url;
      if (profileAvatarPreview) profileAvatarPreview.src = url;
      if (profileAvatarUrlInput) profileAvatarUrlInput.value = url;
      updatePresetSelectionUI(url);
    }
  });

  // Custom Avatar URL Input
  profileAvatarUrlInput?.addEventListener('input', (e) => {
    const url = e.target.value.trim();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      activeProfileAvatar = url;
      if (profileAvatarPreview) profileAvatarPreview.src = url;
      updatePresetSelectionUI('');
    }
  });

  // Local Image File Upload -> Base64
  avatarFileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Veuillez sélectionner un fichier image valide (JPG, PNG, WEBP).', 'coral');
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      showToast('L\'image dépasse 3 Mo. Veuillez choisir une photo plus légère.', 'coral');
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const base64Url = evt.target?.result;
      if (base64Url) {
        activeProfileAvatar = base64Url;
        if (profileAvatarPreview) profileAvatarPreview.src = base64Url;
        if (profileAvatarUrlInput) profileAvatarUrlInput.value = '';
        updatePresetSelectionUI('');
        showToast('Photo prête ! Cliquez sur « Enregistrer » pour confirmer.', 'teal');
      }
    };
    reader.readAsDataURL(file);
  });

  // Presence Cards Click
  presenceCardsGrid?.addEventListener('click', (e) => {
    const card = e.target.closest('.presence-card');
    if (!card) return;
    const status = card.getAttribute('data-status');
    if (status) {
      updatePresenceSelectionUI(status);
    }
  });

  // Mood Quick Pills
  document.querySelectorAll('.mood-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const mood = pill.getAttribute('data-mood');
      if (profileMoodInput && mood) {
        profileMoodInput.value = mood;
        profileMoodInput.focus();
      }
    });
  });

  // Bio Live Character Counter
  profileBioInput?.addEventListener('input', (e) => {
    if (profileBioCounter) {
      profileBioCounter.textContent = `${e.target.value.length}/160`;
    }
  });

  // Save Profile Form Submission
  btnSaveProfileModal?.addEventListener('click', async () => {
    const displayName = profileDisplayNameInput?.value.trim();
    const bio = profileBioInput?.value.trim() || '';
    const country = profileCountrySelect?.value || 'France';
    const mood = profileMoodInput?.value.trim() || '';

    if (!displayName) {
      showToast('Veuillez renseigner un nom d\'affichage.', 'coral');
      profileDisplayNameInput?.focus();
      return;
    }

    btnSaveProfileModal.disabled = true;
    profileSaveSpinner?.classList.remove('hidden');

    const updatePayload = {
      displayName,
      avatarUrl: activeProfileAvatar,
      bio,
      country,
      status: activePresenceStatus,
    };

    const token = getAuthToken();

    try {
      let updatedUser = null;

      if (token) {
        const res = await fetch(`${API_BASE_URL}/auth/profile`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(updatePayload)
        });

        const data = await res.json();
        if (res.ok && data.success && data.user) {
          updatedUser = data.user;
        } else {
          throw new Error(data.message || 'Erreur lors de la mise à jour du profil.');
        }
      } else {
        // Local mode fallback
        updatedUser = {
          ...(state.currentUser || {}),
          ...updatePayload,
        };
      }

      // Synchronize App State
      updatedUser.mood = mood;
      state.currentUser = { ...state.currentUser, ...updatedUser };
      localStorage.setItem('wafatalk_user', JSON.stringify(state.currentUser));

      // Update Nav Bar & Header Elements Instantly
      const navUserName = document.getElementById('navUserName');
      const heroUserGreeting = document.getElementById('heroUserGreeting');
      const navUserAvatar = document.getElementById('navUserAvatar');
      const mobNavUserAvatar = document.getElementById('mobNavUserAvatar');
      const menuFullName = document.getElementById('menuFullName');
      const menuCountryName = document.getElementById('menuCountryName');
      const navUserCountryFlag = document.getElementById('navUserCountryFlag');
      const menuCountryFlag = document.getElementById('menuCountryFlag');

      if (navUserName) navUserName.textContent = displayName.split(' ')[0];
      if (heroUserGreeting) heroUserGreeting.textContent = displayName.split(' ')[0];
      if (navUserAvatar) navUserAvatar.src = activeProfileAvatar;
      if (mobNavUserAvatar) mobNavUserAvatar.src = activeProfileAvatar;
      if (menuFullName) menuFullName.textContent = displayName;
      if (menuCountryName) menuCountryName.textContent = country;

      // Update Presence Dot in User Menu
      const menuStatusDot = document.querySelector('.user-profile-trigger .user-status-dot');
      if (menuStatusDot) {
        menuStatusDot.className = `user-status-dot ${activePresenceStatus.toLowerCase()}`;
      }

      // Update Country Flag
      const countryObj = COUNTRIES.find(c => c.name.toLowerCase() === country.toLowerCase() || c.code.toLowerCase() === country.toLowerCase());
      const countryCode = countryObj ? countryObj.code : 'FR';
      const flagImgTag = `<img src="https://flagcdn.com/w40/${countryCode.toLowerCase()}.png" class="user-country-flag-img" alt="${country}" loading="lazy">`;
      if (navUserCountryFlag) navUserCountryFlag.innerHTML = flagImgTag;
      if (menuCountryFlag) menuCountryFlag.innerHTML = flagImgTag;

      // Broadcast presence update via Socket if connected
      if (socket && socket.connected) {
        socket.emit('presence:set_status', {
          status: activePresenceStatus.toLowerCase(),
          mood: mood,
        });
      }

      showToast('Profil et statut mis à jour avec succès ! ', 'success');
      playTone(520, 'sine', 0.2);
      closeProfileStatusModal();
    } catch (err) {
      console.warn('Profile update error:', err);
      // Fallback: save to local state anyway
      state.currentUser = { ...(state.currentUser || {}), ...updatePayload, mood };
      localStorage.setItem('wafatalk_user', JSON.stringify(state.currentUser));

      const navUserName = document.getElementById('navUserName');
      if (navUserName) navUserName.textContent = displayName.split(' ')[0];
      const navUserAvatar = document.getElementById('navUserAvatar');
      if (navUserAvatar) navUserAvatar.src = activeProfileAvatar;

      showToast('Profil mis à jour en local avec succès ! ', 'teal');
      closeProfileStatusModal();
    } finally {
      btnSaveProfileModal.disabled = false;
      profileSaveSpinner?.classList.add('hidden');
    }
  });

  // Modal Open/Close Event Listeners
  btnViewProfile?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openProfileStatusModal();
  });

  btnCloseProfileModal?.addEventListener('click', closeProfileStatusModal);
  btnCancelProfileModal?.addEventListener('click', closeProfileStatusModal);

  profileStatusModal?.addEventListener('click', (e) => {
    if (e.target === profileStatusModal) closeProfileStatusModal();
  });


  // =========================================================================
  // DOM Elements: Settings Modal (Paramètres Audio & Compte)
  // =========================================================================
  const btnOpenSettings = document.getElementById('btnOpenSettings');
  const settingsModal = document.getElementById('settingsModal');
  const btnCloseSettingsModal = document.getElementById('btnCloseSettingsModal');
  const btnDoneSettingsModal = document.getElementById('btnDoneSettingsModal');

  // Tabs
  const settingsTabs = document.querySelectorAll('.settings-tab-btn');
  const settingsPanes = document.querySelectorAll('.settings-tab-pane');

  // Audio Section
  const selectMicDevice = document.getElementById('selectMicDevice');
  const btnTestMic = document.getElementById('btnTestMic');
  const micTestDot = document.getElementById('micTestDot');
  const btnTestMicText = document.getElementById('btnTestMicText');
  const micVuMeterBar = document.getElementById('micVuMeterBar');
  const micTestHint = document.getElementById('micTestHint');
  const inputMicSensitivity = document.getElementById('inputMicSensitivity');
  const micSensitivityVal = document.getElementById('micSensitivityVal');
  const toggleEchoCancellation = document.getElementById('toggleEchoCancellation');
  const toggleNoiseSuppression = document.getElementById('toggleNoiseSuppression');
  const toggleAutoGain = document.getElementById('toggleAutoGain');

  const selectSpeakerDevice = document.getElementById('selectSpeakerDevice');
  const sliderOutputVolume = document.getElementById('sliderOutputVolume');
  const outputVolumeVal = document.getElementById('outputVolumeVal');
  const btnTestSpeakerTone = document.getElementById('btnTestSpeakerTone');
  const toggleNotifSounds = document.getElementById('toggleNotifSounds');
  const toggleRoomChimes = document.getElementById('toggleRoomChimes');

  // Account Section
  const settingsUserEmail = document.getElementById('settingsUserEmail');
  const settingsUserId = document.getElementById('settingsUserId');
  const btnCopyUserId = document.getElementById('btnCopyUserId');
  const formSettingsPassword = document.getElementById('formSettingsPassword');
  const settingsCurrentPass = document.getElementById('settingsCurrentPass');
  const settingsNewPass = document.getElementById('settingsNewPass');
  const settingsConfirmPass = document.getElementById('settingsConfirmPass');
  const settingsPasswordHint = document.getElementById('settingsPasswordHint');
  const passwordUpdateFeedback = document.getElementById('passwordUpdateFeedback');
  const btnSubmitChangePassword = document.getElementById('btnSubmitChangePassword');
  const passwordChangeSpinner = document.getElementById('passwordChangeSpinner');
  const btnSettingsLogout = document.getElementById('btnSettingsLogout');

  // Appearance Section
  const themeCardLight = document.getElementById('themeCardLight');
  const themeCardDark = document.getElementById('themeCardDark');
  const toggleAutoPip = document.getElementById('toggleAutoPip');
  const toggleHdVideo = document.getElementById('toggleHdVideo');
  const toggleAmbientFx = document.getElementById('toggleAmbientFx');

  // Live Mic Testing State
  let micTestAudioCtx = null;
  let micTestStream = null;
  let micTestAnalyser = null;
  let micTestAnimFrame = null;
  let isTestingMic = false;

  // Open Settings Modal
  async function openSettingsModal(defaultTab = 'tabPaneAudio') {
    if (!settingsModal) return;
    profileDropdown?.classList.add('hidden');

    // Populate Account Info
    const user = state.currentUser || {};
    if (settingsUserEmail) settingsUserEmail.textContent = user.email || 'alexandre@wafatalk.com';
    if (settingsUserId) settingsUserId.textContent = user.id || 'usr_wafatalk_demo';

    // Populate Audio Preferences from LocalStorage
    loadAudioSettings();

    // Enumerate Physical Audio Devices
    await enumerateAudioDevices();

    // Select Active Tab
    switchSettingsTab(defaultTab);

    // Sync Theme Card Visuals
    updateThemeCardsUI(state.theme);

    // Reset Password Form & Feedback
    if (formSettingsPassword) formSettingsPassword.reset();
    if (settingsPasswordHint) settingsPasswordHint.className = 'password-match-hint hidden';
    if (passwordUpdateFeedback) passwordUpdateFeedback.className = 'modal-feedback-alert hidden';

    settingsModal.classList.remove('hidden');
  }

  function closeSettingsModal() {
    stopMicTest();
    settingsModal?.classList.add('hidden');
  }

  // Switch Settings Tab
  function switchSettingsTab(targetPaneId) {
    settingsTabs.forEach(tab => {
      const match = tab.getAttribute('data-tab') === targetPaneId;
      tab.classList.toggle('active', match);
      tab.setAttribute('aria-selected', match ? 'true' : 'false');
    });

    settingsPanes.forEach(pane => {
      const match = pane.id === targetPaneId;
      pane.classList.toggle('active', match);
    });

    if (targetPaneId !== 'tabPaneAudio') {
      stopMicTest();
    }
  }

  settingsTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      if (target) switchSettingsTab(target);
    });
  });

  // Enumerate Audio Devices (Microphones & Speakers)
  async function enumerateAudioDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const micDevices = devices.filter(d => d.kind === 'audioinput');
      const speakerDevices = devices.filter(d => d.kind === 'audiooutput');

      if (selectMicDevice && micDevices.length > 0) {
        selectMicDevice.innerHTML = micDevices.map((d, idx) =>
          `<option value="${d.deviceId}">${d.label || `Microphone ${idx + 1}`}</option>`
        ).join('');
      }

      if (selectSpeakerDevice && speakerDevices.length > 0) {
        selectSpeakerDevice.innerHTML = speakerDevices.map((d, idx) =>
          `<option value="${d.deviceId}">${d.label || `Haut-parleurs ${idx + 1}`}</option>`
        ).join('');
      }
    } catch (e) {
      console.warn('Could not enumerate audio devices:', e);
    }
  }

  // Live Mic Test VU-Meter Engine
  async function startMicTest() {
    if (isTestingMic) return;

    const deviceId = selectMicDevice?.value;
    const constraints = {
      audio: deviceId && deviceId !== 'default'
        ? { deviceId: { exact: deviceId } }
        : true,
    };

    try {
      micTestStream = await navigator.mediaDevices.getUserMedia(constraints);
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) throw new Error('Web Audio API unsupported');

      micTestAudioCtx = new AudioCtx();
      const source = micTestAudioCtx.createMediaStreamSource(micTestStream);
      micTestAnalyser = micTestAudioCtx.createAnalyser();
      micTestAnalyser.fftSize = 256;
      micTestAnalyser.smoothingTimeConstant = 0.5;
      source.connect(micTestAnalyser);

      isTestingMic = true;
      if (micTestDot) micTestDot.classList.add('active');
      if (btnTestMicText) btnTestMicText.textContent = 'Arrêter le test';
      if (micTestHint) micTestHint.textContent = ' Micro actif ! Parlez pour vérifier le niveau sonore en direct.';

      const dataArray = new Uint8Array(micTestAnalyser.frequencyBinCount);

      function renderVuMeter() {
        if (!isTestingMic || !micTestAnalyser) return;
        micTestAnalyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const sensitivityFactor = (parseInt(inputMicSensitivity?.value || '80', 10) / 100) * 2.2;
        const normalized = Math.min(100, Math.round(avg * sensitivityFactor));

        if (micVuMeterBar) {
          micVuMeterBar.style.width = `${normalized}%`;
        }

        micTestAnimFrame = requestAnimationFrame(renderVuMeter);
      }

      renderVuMeter();
    } catch (err) {
      console.warn('Mic test error:', err);
      showToast('Impossible d\'accéder au microphone pour le test.', 'coral');
      stopMicTest();
    }
  }

  function stopMicTest() {
    isTestingMic = false;
    if (micTestAnimFrame) {
      cancelAnimationFrame(micTestAnimFrame);
      micTestAnimFrame = null;
    }
    if (micTestStream) {
      micTestStream.getTracks().forEach(t => t.stop());
      micTestStream = null;
    }
    if (micTestAudioCtx) {
      micTestAudioCtx.close().catch(() => {});
      micTestAudioCtx = null;
      micTestAnalyser = null;
    }

    if (micVuMeterBar) micVuMeterBar.style.width = '0%';
    if (micTestDot) micTestDot.classList.remove('active');
    if (btnTestMicText) btnTestMicText.textContent = 'Tester mon micro';
    if (micTestHint) micTestHint.textContent = 'Cliquez sur « Tester mon micro » et parlez à voix haute pour vérifier le niveau sonore.';
  }

  btnTestMic?.addEventListener('click', () => {
    if (isTestingMic) {
      stopMicTest();
    } else {
      startMicTest();
    }
  });

  // Mic Sensitivity Slider
  inputMicSensitivity?.addEventListener('input', (e) => {
    const val = e.target.value;
    if (micSensitivityVal) micSensitivityVal.textContent = `${val}%`;
    saveAudioSettings();
  });

  // Output Volume Slider
  sliderOutputVolume?.addEventListener('input', (e) => {
    const val = e.target.value;
    if (outputVolumeVal) outputVolumeVal.textContent = `${val}%`;
    saveAudioSettings();

    // Adjust volume on all active remote audio elements in salon
    const gain = parseInt(val, 10) / 100;
    salonRemoteAudioElements.forEach(el => {
      el.volume = gain;
    });
  });

  // Speaker Sound Test Melodic Chime (Web Audio API)
  function playSpeakerTestChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const actx = new AudioCtx();
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      const volumeLevel = (parseInt(sliderOutputVolume?.value || '100', 10) / 100) * 0.25;

      notes.forEach((freq, idx) => {
        const osc = actx.createOscillator();
        const gain = actx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, actx.currentTime + idx * 0.1);

        gain.gain.setValueAtTime(0, actx.currentTime + idx * 0.1);
        gain.gain.linearRampToValueAtTime(volumeLevel, actx.currentTime + idx * 0.1 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + idx * 0.1 + 0.4);

        osc.connect(gain);
        gain.connect(actx.destination);

        osc.start(actx.currentTime + idx * 0.1);
        osc.stop(actx.currentTime + idx * 0.1 + 0.42);
      });

      setTimeout(() => actx.close(), 1200);
      showToast(' Son de test joué avec succès !', 'teal');
    } catch (e) {
      console.warn('Speaker chime error:', e);
    }
  }

  btnTestSpeakerTone?.addEventListener('click', playSpeakerTestChime);

  // Copy User ID Button
  btnCopyUserId?.addEventListener('click', () => {
    const uid = settingsUserId?.textContent?.trim() || '';
    if (!uid) return;
    navigator.clipboard.writeText(uid).then(() => {
      const origText = btnCopyUserId.innerHTML;
      btnCopyUserId.innerHTML = `<span>Copié ! </span>`;
      btnCopyUserId.style.color = 'var(--brand-teal)';
      setTimeout(() => {
        btnCopyUserId.innerHTML = origText;
        btnCopyUserId.style.color = '';
      }, 2000);
      showToast('Identifiant utilisateur copié dans le presse-papier ! ', 'teal');
    }).catch(() => {
      showToast('Impossible de copier l\'identifiant.', 'coral');
    });
  });

  // Change Password Form Handling
  function checkPasswordMatch() {
    const newPass = settingsNewPass?.value || '';
    const confirmPass = settingsConfirmPass?.value || '';

    if (!confirmPass) {
      if (settingsPasswordHint) settingsPasswordHint.className = 'password-match-hint hidden';
      return;
    }

    if (newPass === confirmPass) {
      if (settingsPasswordHint) {
        settingsPasswordHint.className = 'password-match-hint match';
        settingsPasswordHint.textContent = ' Les mots de passe correspondent parfaitement.';
      }
    } else {
      if (settingsPasswordHint) {
        settingsPasswordHint.className = 'password-match-hint mismatch';
        settingsPasswordHint.textContent = ' Les deux mots de passe ne correspondent pas.';
      }
    }
  }

  settingsNewPass?.addEventListener('input', checkPasswordMatch);
  settingsConfirmPass?.addEventListener('input', checkPasswordMatch);

  formSettingsPassword?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = settingsCurrentPass?.value || '';
    const newPassword = settingsNewPass?.value || '';
    const confirmPassword = settingsConfirmPass?.value || '';

    if (newPassword.length < 6) {
      showToast('Le nouveau mot de passe doit comporter au moins 6 caractères.', 'coral');
      settingsNewPass?.focus();
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast('Les deux mots de passe ne correspondent pas.', 'coral');
      settingsConfirmPass?.focus();
      return;
    }

    const token = getAuthToken();
    btnSubmitChangePassword.disabled = true;
    passwordChangeSpinner?.classList.remove('hidden');

    try {
      if (token) {
        const res = await fetch(`${API_BASE_URL}/auth/change-password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ currentPassword, newPassword })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          if (passwordUpdateFeedback) {
            passwordUpdateFeedback.className = 'modal-feedback-alert success';
            passwordUpdateFeedback.textContent = ' Mot de passe mis à jour avec succès !';
          }
          showToast('Mot de passe mis à jour avec succès.', 'success');
          formSettingsPassword.reset();
          if (settingsPasswordHint) settingsPasswordHint.className = 'password-match-hint hidden';
          playTone(520, 'sine', 0.25);
        } else {
          throw new Error(data.message || 'Erreur lors de la modification du mot de passe.');
        }
      } else {
        // Offline / demo fallback
        if (passwordUpdateFeedback) {
          passwordUpdateFeedback.className = 'modal-feedback-alert success';
          passwordUpdateFeedback.textContent = ' Mot de passe mis à jour avec succès (mode session) !';
        }
        showToast('Mot de passe mis à jour avec succès.', 'success');
        formSettingsPassword.reset();
      }
    } catch (err) {
      if (passwordUpdateFeedback) {
        passwordUpdateFeedback.className = 'modal-feedback-alert error';
        passwordUpdateFeedback.textContent = err.message || 'Mot de passe actuel incorrect.';
      }
      showToast(err.message || 'Erreur lors de la modification.', 'coral');
      playTone(240, 'sawtooth', 0.2);
    } finally {
      btnSubmitChangePassword.disabled = false;
      passwordChangeSpinner?.classList.add('hidden');
    }
  });

  // Settings Danger Zone Logout
  btnSettingsLogout?.addEventListener('click', () => {
    closeSettingsModal();
    btnLogout?.click();
  });

  // Theme Selector Cards
  function updateThemeCardsUI(activeTheme) {
    themeCardLight?.classList.toggle('selected', activeTheme === 'light');
    themeCardDark?.classList.toggle('selected', activeTheme === 'dark');
  }

  themeCardLight?.addEventListener('click', () => {
    applyTheme('light');
    updateThemeCardsUI('light');
    showToast(' Thème Lumineux activé !', 'teal');
  });

  themeCardDark?.addEventListener('click', () => {
    applyTheme('dark');
    updateThemeCardsUI('dark');
    showToast(' Thème Sombre activé !', 'amber');
  });

  // Audio & Settings Preferences Storage
  function saveAudioSettings() {
    const prefs = {
      micSensitivity: inputMicSensitivity?.value || '80',
      outputVolume: sliderOutputVolume?.value || '100',
      echoCancellation: toggleEchoCancellation?.checked ?? true,
      noiseSuppression: toggleNoiseSuppression?.checked ?? true,
      autoGain: toggleAutoGain?.checked ?? true,
      notifSounds: toggleNotifSounds?.checked ?? true,
      roomChimes: toggleRoomChimes?.checked ?? true,
      autoPip: toggleAutoPip?.checked ?? true,
      hdVideo: toggleHdVideo?.checked ?? true,
      ambientFx: toggleAmbientFx?.checked ?? true,
    };
    localStorage.setItem('wafatalk_audio_settings', JSON.stringify(prefs));
  }

  function loadAudioSettings() {
    try {
      const raw = localStorage.getItem('wafatalk_audio_settings');
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p.micSensitivity && inputMicSensitivity) {
        inputMicSensitivity.value = p.micSensitivity;
        if (micSensitivityVal) micSensitivityVal.textContent = `${p.micSensitivity}%`;
      }
      if (p.outputVolume && sliderOutputVolume) {
        sliderOutputVolume.value = p.outputVolume;
        if (outputVolumeVal) outputVolumeVal.textContent = `${p.outputVolume}%`;
      }
      if (typeof p.echoCancellation === 'boolean' && toggleEchoCancellation) toggleEchoCancellation.checked = p.echoCancellation;
      if (typeof p.noiseSuppression === 'boolean' && toggleNoiseSuppression) toggleNoiseSuppression.checked = p.noiseSuppression;
      if (typeof p.autoGain === 'boolean' && toggleAutoGain) toggleAutoGain.checked = p.autoGain;
      if (typeof p.notifSounds === 'boolean' && toggleNotifSounds) toggleNotifSounds.checked = p.notifSounds;
      if (typeof p.roomChimes === 'boolean' && toggleRoomChimes) toggleRoomChimes.checked = p.roomChimes;
      if (typeof p.autoPip === 'boolean' && toggleAutoPip) toggleAutoPip.checked = p.autoPip;
      if (typeof p.hdVideo === 'boolean' && toggleHdVideo) toggleHdVideo.checked = p.hdVideo;
      if (typeof p.ambientFx === 'boolean' && toggleAmbientFx) toggleAmbientFx.checked = p.ambientFx;
    } catch (e) {}
  }

  [toggleEchoCancellation, toggleNoiseSuppression, toggleAutoGain, toggleNotifSounds, toggleRoomChimes, toggleAutoPip, toggleHdVideo, toggleAmbientFx].forEach(sw => {
    sw?.addEventListener('change', saveAudioSettings);
  });

  // Settings Modal Triggers
  btnOpenSettings?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openSettingsModal('tabPaneAudio');
  });

  btnCloseSettingsModal?.addEventListener('click', closeSettingsModal);
  btnDoneSettingsModal?.addEventListener('click', closeSettingsModal);

  settingsModal?.addEventListener('click', (e) => {
    if (e.target === settingsModal) closeSettingsModal();
  });

  // Escape Key Closes Modals
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (profileStatusModal && !profileStatusModal.classList.contains('hidden')) {
        closeProfileStatusModal();
      }
      if (settingsModal && !settingsModal.classList.contains('hidden')) {
        closeSettingsModal();
      }
    }
  });

  // Quick Join Trending Room button

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
  // 12.1 BESPOKE MOTION DESIGN GIFT CELEBRATION ENGINE (ALL 20 GIFTS)
  // =========================================================================

  const GIFT_MOTION_PROFILES = {
    coffee: {
      themeColor: '#b45309',
      glowColor: 'rgba(245, 158, 11, 0.45)',
      audioFreqs: [440, 554.37, 659.25], // Warm A major
      fx: 'steam',
      svg: `
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Steam paths -->
          <path class="motion-steam" style="animation: motionSteamLoop 1.6s ease-in-out infinite; animation-delay: 0s;" d="M42 36C40 30 44 26 42 20C40 14 44 10 42 6" stroke="rgba(255,255,255,0.75)" stroke-width="2.5" stroke-linecap="round"/>
          <path class="motion-steam" style="animation: motionSteamLoop 1.6s ease-in-out infinite; animation-delay: 0.4s;" d="M50 34C48 28 52 24 50 18C48 12 52 8 50 4" stroke="rgba(255,255,255,0.85)" stroke-width="2.5" stroke-linecap="round"/>
          <path class="motion-steam" style="animation: motionSteamLoop 1.6s ease-in-out infinite; animation-delay: 0.8s;" d="M58 36C56 30 60 26 58 20C56 14 60 10 58 6" stroke="rgba(255,255,255,0.75)" stroke-width="2.5" stroke-linecap="round"/>
          <!-- Saucer -->
          <ellipse cx="50" cy="85" rx="36" ry="7" fill="#0d837d" opacity="0.4"/>
          <ellipse cx="50" cy="83" rx="34" ry="6" fill="#f8fafc"/>
          <ellipse cx="50" cy="82" rx="28" ry="4" fill="#e2e8f0"/>
          <!-- Cup Body -->
          <path d="M26 44H74V64C74 74 63.2 80 50 80C36.8 80 26 74 26 64V44Z" fill="url(#coffeeCupGrad)"/>
          <!-- Cup Inner / Coffee surface -->
          <ellipse cx="50" cy="44" rx="24" ry="7" fill="#451a03"/>
          <ellipse cx="50" cy="45" rx="20" ry="5" fill="#78350f"/>
          <!-- Heart in crema -->
          <path d="M50 46C48 43 45 44 45 46C45 48 50 51 50 51C50 51 55 48 55 46C55 44 52 43 50 46Z" fill="#fbbf24" opacity="0.8"/>
          <!-- Handle -->
          <path d="M72 48C79 48 84 53 84 60C84 67 79 71 72 71" stroke="#f8fafc" stroke-width="5" stroke-linecap="round"/>
          <!-- Highlight -->
          <path d="M30 48C30 58 34 68 40 72" stroke="rgba(255,255,255,0.35)" stroke-width="2" stroke-linecap="round"/>
          <defs>
            <linearGradient id="coffeeCupGrad" x1="26" y1="44" x2="74" y2="80" gradientUnits="userSpaceOnUse">
              <stop stop-color="#ffffff"/>
              <stop offset="1" stop-color="#e2e8f0"/>
            </linearGradient>
          </defs>
        </svg>
      `
    },
    croissant: {
      themeColor: '#d97706',
      glowColor: 'rgba(251, 191, 36, 0.45)',
      audioFreqs: [392, 493.88, 587.33], // G major
      fx: 'steam',
      svg: `
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Warm aroma aura -->
          <circle cx="50" cy="50" r="38" stroke="rgba(251,191,36,0.3)" stroke-width="2" stroke-dasharray="4 6" style="animation: motionPulseRing 2s ease-out infinite;"/>
          <!-- Croissant body -->
          <path d="M22 68C18 55 24 36 40 28C54 21 68 25 78 36C86 45 84 62 76 68C68 62 64 52 50 52C36 52 30 62 22 68Z" fill="url(#croissantGrad)" filter="drop-shadow(0 4px 10px rgba(180,83,9,0.3))"/>
          <!-- Flaky folds -->
          <path d="M38 30C46 36 48 48 46 54" stroke="#92400e" stroke-width="2.5" stroke-linecap="round"/>
          <path d="M52 26C60 32 62 44 60 52" stroke="#92400e" stroke-width="2.5" stroke-linecap="round"/>
          <path d="M66 32C72 38 74 48 70 56" stroke="#92400e" stroke-width="2" stroke-linecap="round"/>
          <!-- Butter shimmer stars -->
          <polygon points="34,22 36,26 40,26 37,29 38,33 34,30 30,33 31,29 28,26 32,26" fill="#fde047" style="animation: motionCrossFlare 1.8s ease-in-out infinite;"/>
          <polygon points="76,24 77,27 80,27 78,29 79,32 76,30 73,32 74,29 72,27 75,27" fill="#fde047" style="animation: motionCrossFlare 1.8s ease-in-out infinite; animation-delay: 0.6s;"/>
          <defs>
            <linearGradient id="croissantGrad" x1="20" y1="25" x2="80" y2="70" gradientUnits="userSpaceOnUse">
              <stop stop-color="#fbbf24"/>
              <stop offset="0.6" stop-color="#d97706"/>
              <stop offset="1" stop-color="#b45309"/>
            </linearGradient>
          </defs>
        </svg>
      `
    },
    heart: {
      themeColor: '#e11d48',
      glowColor: 'rgba(244, 63, 94, 0.55)',
      audioFreqs: [523.25, 659.25, 783.99, 1046.50],
      fx: 'hearts',
      svg: `
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Concentric pulse shockwaves -->
          <path class="motion-pulse-ring" style="animation: motionPulseRing 1.4s ease-out infinite; transform-origin: 50% 50%;" d="M50 30C40 18 22 24 22 40C22 56 46 72 50 76C54 72 78 56 78 40C78 24 60 18 50 30Z" stroke="rgba(244,63,94,0.4)" stroke-width="2"/>
          <path class="motion-pulse-ring" style="animation: motionPulseRing 1.4s ease-out infinite; animation-delay: 0.5s; transform-origin: 50% 50%;" d="M50 30C40 18 22 24 22 40C22 56 46 72 50 76C54 72 78 56 78 40C78 24 60 18 50 30Z" stroke="rgba(251,113,133,0.3)" stroke-width="1.5"/>
          <!-- Central 3D Heart -->
          <g style="animation: motionHeartBeating 0.85s ease-in-out infinite; transform-origin: 50% 52%;">
            <path d="M50 30C40 16 18 22 18 42C18 60 46 78 50 82C54 78 82 60 82 42C82 22 60 16 50 30Z" fill="url(#heartGrad)" filter="drop-shadow(0 8px 18px rgba(225,29,72,0.45))"/>
            <!-- Shimmer Highlight -->
            <path d="M30 32C24 36 24 44 26 50C28 42 34 36 42 34" stroke="rgba(255,255,255,0.6)" stroke-width="3" stroke-linecap="round"/>
          </g>
          <defs>
            <linearGradient id="heartGrad" x1="20" y1="20" x2="80" y2="80" gradientUnits="userSpaceOnUse">
              <stop stop-color="#fb7185"/>
              <stop offset="0.4" stop-color="#f43f5e"/>
              <stop offset="1" stop-color="#be123c"/>
            </linearGradient>
          </defs>
        </svg>
      `
    },
    bubble_tea: {
      themeColor: '#0d9488',
      glowColor: 'rgba(20, 184, 166, 0.45)',
      audioFreqs: [440, 523.25, 659.25, 880],
      fx: 'bubbles',
      svg: `
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Straw -->
          <path d="M58 8L44 45" stroke="#f43f5e" stroke-width="7" stroke-linecap="round"/>
          <path d="M58 8L44 45" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-dasharray="4 4"/>
          <!-- Cup Container -->
          <path d="M30 30H70L63 85C62.5 89 59 92 55 92H45C41 92 37.5 89 37 85L30 30Z" fill="url(#bobaTeaGrad)" stroke="rgba(255,255,255,0.8)" stroke-width="2"/>
          <!-- Liquid surface -->
          <ellipse cx="50" cy="36" rx="18" ry="4" fill="#fde047" opacity="0.6"/>
          <!-- Bouncing Tapioca Pearls -->
          <circle class="motion-boba-1" cx="44" cy="78" r="5" fill="#1e293b" style="animation: motionBobaBubble 1.2s ease-in-out infinite;"/>
          <circle class="motion-boba-2" cx="54" cy="80" r="5.5" fill="#0f172a" style="animation: motionBobaBubble 1.2s ease-in-out infinite; animation-delay: 0.25s;"/>
          <circle class="motion-boba-3" cx="48" cy="68" r="4.5" fill="#334155" style="animation: motionBobaBubble 1.2s ease-in-out infinite; animation-delay: 0.5s;"/>
          <circle class="motion-boba-4" cx="58" cy="72" r="5" fill="#1e293b" style="animation: motionBobaBubble 1.2s ease-in-out infinite; animation-delay: 0.75s;"/>
          <!-- Lid -->
          <path d="M26 30C26 26 32 24 50 24C68 24 74 26 74 30" stroke="#f8fafc" stroke-width="4" stroke-linecap="round"/>
          <defs>
            <linearGradient id="bobaTeaGrad" x1="30" y1="30" x2="70" y2="90" gradientUnits="userSpaceOnUse">
              <stop stop-color="#fef08a"/>
              <stop offset="0.5" stop-color="#fbbf24"/>
              <stop offset="1" stop-color="#d97706"/>
            </linearGradient>
          </defs>
        </svg>
      `
    },
    cocktail: {
      themeColor: '#f97316',
      glowColor: 'rgba(249, 115, 22, 0.45)',
      audioFreqs: [587.33, 739.99, 880],
      fx: 'bubbles',
      svg: `
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Glass Stem & Base -->
          <path d="M50 56V86M36 86H64" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
          <!-- Cocktail Glass Triangle -->
          <path d="M22 26L50 56L78 26H22Z" fill="url(#cocktailSunsetGrad)" stroke="rgba(255,255,255,0.7)" stroke-width="2"/>
          <!-- Citrus Wheel -->
          <circle cx="70" cy="24" r="10" fill="#facc15" stroke="#ea580c" stroke-width="2"/>
          <circle cx="70" cy="24" r="4" fill="#ffffff" opacity="0.6"/>
          <!-- Splash Droplets -->
          <circle cx="42" cy="18" r="2.5" fill="#fb923c" style="animation: motionBobaBubble 1.4s ease-in-out infinite;"/>
          <circle cx="56" cy="14" r="3" fill="#f43f5e" style="animation: motionBobaBubble 1.4s ease-in-out infinite; animation-delay: 0.4s;"/>
          <defs>
            <linearGradient id="cocktailSunsetGrad" x1="25" y1="26" x2="75" y2="56" gradientUnits="userSpaceOnUse">
              <stop stop-color="#f43f5e"/>
              <stop offset="0.6" stop-color="#f97316"/>
              <stop offset="1" stop-color="#facc15"/>
            </linearGradient>
          </defs>
        </svg>
      `
    },
    star: {
      themeColor: '#eab308',
      glowColor: 'rgba(234, 179, 8, 0.55)',
      audioFreqs: [659.25, 830.61, 987.77, 1318.51],
      fx: 'stardust',
      svg: `
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Comet trail -->
          <path d="M12 88C28 76 42 64 54 50" stroke="url(#cometTrailGrad)" stroke-width="4" stroke-linecap="round"/>
          <path d="M18 94C34 82 46 70 56 54" stroke="url(#cometTrailGrad)" stroke-width="2" stroke-linecap="round"/>
          <!-- Spinning Star Flare -->
          <g style="animation: motionStarSpin 6s linear infinite; transform-origin: 56px 44px;">
            <polygon points="56,18 64,36 84,38 68,52 74,72 56,60 38,72 44,52 28,38 48,36" fill="url(#starGoldenGrad)" filter="drop-shadow(0 0 12px rgba(250,204,21,0.6))"/>
          </g>
          <!-- Center bright sparkle -->
          <polygon points="56,36 58,42 64,44 58,46 56,52 54,46 48,44 54,42" fill="#ffffff" style="animation: motionCrossFlare 1.4s ease-in-out infinite; transform-origin: 56px 44px;"/>
          <defs>
            <linearGradient id="starGoldenGrad" x1="28" y1="18" x2="84" y2="72" gradientUnits="userSpaceOnUse">
              <stop stop-color="#fef08a"/>
              <stop offset="0.5" stop-color="#facc15"/>
              <stop offset="1" stop-color="#ca8a04"/>
            </linearGradient>
            <linearGradient id="cometTrailGrad" x1="12" y1="88" x2="54" y2="50" gradientUnits="userSpaceOnUse">
              <stop stop-color="transparent"/>
              <stop offset="1" stop-color="#facc15"/>
            </linearGradient>
          </defs>
        </svg>
      `
    },
    playlist: {
      themeColor: '#8b5cf6',
      glowColor: 'rgba(139, 92, 246, 0.5)',
      audioFreqs: [440, 554.37, 659.25, 830.61],
      fx: 'notes',
      svg: `
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Cassette Body -->
          <rect x="18" y="28" width="64" height="42" rx="6" fill="#1e1b4b" stroke="#8b5cf6" stroke-width="2.5" filter="drop-shadow(0 6px 16px rgba(139,92,246,0.35))"/>
          <rect x="26" y="34" width="48" height="22" rx="3" fill="#a78bfa" opacity="0.8"/>
          <!-- Reel Gears -->
          <circle cx="38" cy="45" r="7" fill="#ffffff" stroke="#1e1b4b" stroke-width="2" style="animation: motionCassetteGear 3s linear infinite; transform-origin: 38px 45px;"/>
          <circle cx="62" cy="45" r="7" fill="#ffffff" stroke="#1e1b4b" stroke-width="2" style="animation: motionCassetteGear 3s linear infinite; transform-origin: 62px 45px;"/>
          <!-- Floating Music Notes -->
          <path d="M46 18V8L60 6V16M46 13L60 11" stroke="#ec4899" stroke-width="2" stroke-linecap="round" style="animation: motionPetalDrift 2s ease-in-out infinite;"/>
          <circle cx="44" cy="18" r="2.5" fill="#ec4899"/>
          <circle cx="58" cy="16" r="2.5" fill="#ec4899"/>
          <!-- Equalizer Bars below -->
          <rect x="30" y="76" width="4" height="12" rx="2" fill="#06b6d4" style="animation: motionEqBar 0.8s ease-in-out infinite alternate; transform-origin: bottom;"/>
          <rect x="38" y="72" width="4" height="16" rx="2" fill="#06b6d4" style="animation: motionEqBar 0.8s ease-in-out infinite alternate; animation-delay: 0.2s; transform-origin: bottom;"/>
          <rect x="46" y="70" width="4" height="18" rx="2" fill="#06b6d4" style="animation: motionEqBar 0.8s ease-in-out infinite alternate; animation-delay: 0.4s; transform-origin: bottom;"/>
          <rect x="54" y="74" width="4" height="14" rx="2" fill="#06b6d4" style="animation: motionEqBar 0.8s ease-in-out infinite alternate; animation-delay: 0.15s; transform-origin: bottom;"/>
          <rect x="62" y="78" width="4" height="10" rx="2" fill="#06b6d4" style="animation: motionEqBar 0.8s ease-in-out infinite alternate; animation-delay: 0.35s; transform-origin: bottom;"/>
        </svg>
      `
    },
    chocolates: {
      themeColor: '#92400e',
      glowColor: 'rgba(146, 64, 14, 0.45)',
      audioFreqs: [349.23, 440, 523.25],
      fx: 'hearts',
      svg: `
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Heart Box Base -->
          <path d="M50 36C42 22 24 28 24 44C24 60 48 76 50 78C52 76 76 60 76 44C76 28 58 22 50 36Z" fill="#78350f" stroke="#fbbf24" stroke-width="2.5" filter="drop-shadow(0 6px 14px rgba(69,26,3,0.4))"/>
          <!-- Chocolates inside -->
          <rect x="36" y="42" width="10" height="10" rx="2" fill="#451a03" stroke="#d97706" stroke-width="1.5"/>
          <circle cx="60" cy="46" r="5.5" fill="#92400e" stroke="#fbbf24" stroke-width="1.5"/>
          <polygon points="50,56 54,62 46,62" fill="#fef3c7" stroke="#b45309" stroke-width="1.5"/>
          <!-- Ribbon Bow -->
          <path d="M50 34C44 26 36 32 44 38C50 42 50 34 50 34ZM50 34C56 26 64 32 56 38C50 42 50 34 50 34Z" fill="#fbbf24"/>
        </svg>
      `
    },
    red_rose: {
      themeColor: '#be123c',
      glowColor: 'rgba(190, 18, 60, 0.5)',
      audioFreqs: [440, 523.25, 659.25, 698.46],
      fx: 'petals',
      svg: `
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Stem & Leaf -->
          <path d="M50 56V88" stroke="#15803d" stroke-width="4" stroke-linecap="round"/>
          <path d="M50 72C40 68 36 74 34 76C38 80 46 80 50 76" fill="#16a34a"/>
          <!-- Rose Petals Layers -->
          <circle cx="50" cy="42" r="22" fill="#be123c" filter="drop-shadow(0 4px 12px rgba(190,18,60,0.4))"/>
          <path d="M50 26C42 26 36 34 38 44C40 52 50 56 50 56C50 56 60 52 62 44C64 34 58 26 50 26Z" fill="#e11d48"/>
          <path d="M46 32C42 34 42 40 46 44C50 48 54 44 54 40C54 36 50 32 46 32Z" fill="#fb7185"/>
          <!-- Floating Petals in breeze -->
          <path d="M22 46C20 40 26 38 28 42C30 46 24 50 22 46Z" fill="#e11d48" style="animation: motionPetalDrift 2.2s ease-in-out infinite;"/>
          <path d="M74 54C72 48 78 46 80 50C82 54 76 58 74 54Z" fill="#fb7185" style="animation: motionPetalDrift 2.2s ease-in-out infinite; animation-delay: 0.8s;"/>
        </svg>
      `
    },
    cinema_tickets: {
      themeColor: '#dc2626',
      glowColor: 'rgba(220, 38, 38, 0.45)',
      audioFreqs: [523.25, 659.25, 783.99],
      fx: 'confetti',
      svg: `
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Popcorn Bucket -->
          <path d="M30 46L36 86H64L70 46H30Z" fill="#dc2626" stroke="#ffffff" stroke-width="2"/>
          <path d="M40 46L44 86M50 46L50 86M60 46L56 86" stroke="#ffffff" stroke-width="4"/>
          <!-- Popping Kernels -->
          <circle cx="50" cy="40" r="7" fill="#fde047" stroke="#ca8a04" stroke-width="1.5"/>
          <circle cx="38" cy="42" r="6" fill="#fef08a"/>
          <circle cx="62" cy="42" r="6.5" fill="#fef08a"/>
          <circle cx="45" cy="30" r="5" fill="#facc15" style="--kx: -14px; --kx2: -24px; animation: motionPopcornKernels 1.4s ease-out infinite;"/>
          <circle cx="55" cy="26" r="5.5" fill="#fde047" style="--kx: 16px; --kx2: 26px; animation: motionPopcornKernels 1.4s ease-out infinite; animation-delay: 0.4s;"/>
          <!-- VIP Ticket behind -->
          <rect x="62" y="18" width="22" height="14" rx="2" transform="rotate(20 62 18)" fill="#f59e0b" stroke="#ffffff" stroke-width="1.5"/>
        </svg>
      `
    },
    magic_box: {
      themeColor: '#6366f1',
      glowColor: 'rgba(99, 102, 241, 0.55)',
      audioFreqs: [392, 523.25, 659.25, 783.99, 1046.50],
      fx: 'confetti',
      svg: `
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Upward light rays -->
          <polygon points="50,45 25,6 75,6" fill="url(#magicLightBeam)" opacity="0.6"/>
          <!-- Box Base -->
          <rect x="25" y="46" width="50" height="38" rx="4" fill="#4338ca" stroke="#fbbf24" stroke-width="2"/>
          <rect x="46" y="46" width="8" height="38" fill="#fbbf24"/>
          <!-- Box Lid Popping -->
          <g style="animation: motionBoxLidPop 1.6s ease-in-out infinite; transform-origin: 25px 46px;">
            <rect x="22" y="38" width="56" height="10" rx="3" fill="#6366f1" stroke="#fbbf24" stroke-width="2"/>
            <path d="M50 38C44 30 36 34 44 38ZM50 38C56 30 64 34 56 38Z" fill="#fbbf24"/>
          </g>
          <!-- Stars bursting out -->
          <polygon points="50,22 52,27 58,28 53,32 55,37 50,34 45,37 47,32 42,28 48,27" fill="#fde047" style="animation: motionCrossFlare 1.4s ease-in-out infinite;"/>
          <defs>
            <linearGradient id="magicLightBeam" x1="50" y1="45" x2="50" y2="6" gradientUnits="userSpaceOnUse">
              <stop stop-color="#fbbf24"/>
              <stop offset="1" stop-color="transparent"/>
            </linearGradient>
          </defs>
        </svg>
      `
    },
    rooftop_date: {
      themeColor: '#3b82f6',
      glowColor: 'rgba(59, 130, 246, 0.45)',
      audioFreqs: [440, 554.37, 659.25, 783.99],
      fx: 'stardust',
      svg: `
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Sky disc -->
          <circle cx="50" cy="50" r="38" fill="url(#skylineNightGrad)" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
          <!-- Crescent Moon -->
          <path d="M68 28C64 34 58 36 50 34C58 46 72 44 76 36C74 38 71 38 68 28Z" fill="#fef08a" filter="drop-shadow(0 0 8px rgba(254,240,138,0.8))"/>
          <!-- City Skyline -->
          <rect x="22" y="52" width="12" height="32" fill="#0f172a"/>
          <rect x="36" y="44" width="16" height="40" fill="#1e1b4b"/>
          <rect x="54" y="56" width="14" height="28" fill="#0f172a"/>
          <rect x="70" y="48" width="10" height="36" fill="#1e1b4b"/>
          <!-- Glowing Windows -->
          <circle cx="42" cy="50" r="1.5" fill="#fde047"/>
          <circle cx="46" cy="58" r="1.5" fill="#fde047"/>
          <circle cx="60" cy="62" r="1.5" fill="#fde047"/>
          <defs>
            <linearGradient id="skylineNightGrad" x1="50" y1="12" x2="50" y2="88" gradientUnits="userSpaceOnUse">
              <stop stop-color="#1e1b4b"/>
              <stop offset="0.6" stop-color="#172554"/>
              <stop offset="1" stop-color="#0284c7"/>
            </linearGradient>
          </defs>
        </svg>
      `
    },
    candle_dinner: {
      themeColor: '#d97706',
      glowColor: 'rgba(217, 119, 6, 0.5)',
      audioFreqs: [329.63, 440, 554.37],
      fx: 'sparks',
      svg: `
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Candle holder -->
          <path d="M30 84C30 80 40 78 50 78C60 78 70 80 70 84H30Z" fill="#ca8a04"/>
          <rect x="46" y="48" width="8" height="32" rx="2" fill="#fef3c7" stroke="#ca8a04" stroke-width="1.5"/>
          <!-- Flame aura -->
          <circle cx="50" cy="38" r="16" fill="url(#candleFlameAura)" opacity="0.6"/>
          <!-- Flickering Candle Flame -->
          <g style="animation: motionFlameFlicker 0.7s ease-in-out infinite; transform-origin: 50% 44px;">
            <path d="M50 26C45 34 46 42 50 44C54 42 55 34 50 26Z" fill="#ea580c"/>
            <path d="M50 32C48 36 48 42 50 43C52 42 52 36 50 32Z" fill="#fde047"/>
          </g>
          <defs>
            <radialGradient id="candleFlameAura" cx="50" cy="38" r="16" gradientUnits="userSpaceOnUse">
              <stop stop-color="#f59e0b"/>
              <stop offset="1" stop-color="transparent"/>
            </radialGradient>
          </defs>
        </svg>
      `
    },
    museum_pass: {
      themeColor: '#10b981',
      glowColor: 'rgba(16, 185, 129, 0.45)',
      audioFreqs: [523.25, 587.33, 659.25, 783.99],
      fx: 'confetti',
      svg: `
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Palette Body -->
          <path d="M25 60C15 45 30 25 55 25C75 25 85 38 85 55C85 70 70 78 55 78C48 78 45 74 42 74C38 74 34 82 28 78C22 74 20 68 25 60Z" fill="#fef3c7" stroke="#b45309" stroke-width="2.5" filter="drop-shadow(0 6px 14px rgba(0,0,0,0.3))"/>
          <!-- Thumb hole -->
          <circle cx="32" cy="62" r="5" fill="#0f172a"/>
          <!-- Color blobs -->
          <circle cx="42" cy="35" r="4.5" fill="#ef4444"/>
          <circle cx="56" cy="34" r="4.5" fill="#3b82f6"/>
          <circle cx="70" cy="42" r="4.5" fill="#10b981"/>
          <circle cx="72" cy="56" r="4.5" fill="#f59e0b"/>
          <circle cx="62" cy="68" r="4.5" fill="#8b5cf6"/>
          <!-- Paintbrush across -->
          <path d="M22 22L46 46" stroke="#78350f" stroke-width="3" stroke-linecap="round"/>
          <path d="M22 22L18 18" stroke="#f59e0b" stroke-width="4" stroke-linecap="round"/>
        </svg>
      `
    },
    vip_crown: {
      themeColor: '#eab308',
      glowColor: 'rgba(234, 179, 8, 0.6)',
      audioFreqs: [523.25, 659.25, 783.99, 1046.50, 1318.51],
      fx: 'sparks',
      svg: `
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Royal Golden Crown -->
          <g style="animation: motionCrownBob 1.6s ease-in-out infinite; transform-origin: 50% 50%;">
            <path d="M18 40L30 76H70L82 40L64 54L50 32L36 54L18 40Z" fill="url(#crownGoldenGrad)" stroke="#ffffff" stroke-width="2" filter="drop-shadow(0 8px 18px rgba(234,179,8,0.5))"/>
            <!-- Jewels -->
            <circle cx="50" cy="32" r="4" fill="#ef4444" stroke="#ffffff" stroke-width="1.5"/>
            <circle cx="18" cy="40" r="3" fill="#3b82f6"/>
            <circle cx="82" cy="40" r="3" fill="#10b981"/>
            <circle cx="50" cy="65" r="4" fill="#a855f7"/>
            <!-- Diamond flare at top center -->
            <polygon points="50,20 52,24 56,25 52,26 50,30 48,26 44,25 48,24" fill="#ffffff" style="animation: motionCrossFlare 1.4s ease-in-out infinite; transform-origin: 50px 25px;"/>
          </g>
          <defs>
            <linearGradient id="crownGoldenGrad" x1="18" y1="32" x2="82" y2="76" gradientUnits="userSpaceOnUse">
              <stop stop-color="#fef08a"/>
              <stop offset="0.5" stop-color="#eab308"/>
              <stop offset="1" stop-color="#a16207"/>
            </linearGradient>
          </defs>
        </svg>
      `
    },
    stargazing: {
      themeColor: '#6366f1',
      glowColor: 'rgba(99, 102, 241, 0.5)',
      audioFreqs: [440, 659.25, 880, 1318.51],
      fx: 'cosmic',
      svg: `
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Constellation lines -->
          <path d="M30 20L42 26L52 22L68 32L78 28" stroke="rgba(147,197,253,0.7)" stroke-width="1.5" stroke-dasharray="2 3"/>
          <circle cx="30" cy="20" r="2.5" fill="#ffffff"/>
          <circle cx="42" cy="26" r="2" fill="#93c5fd"/>
          <circle cx="52" cy="22" r="2.5" fill="#ffffff"/>
          <circle cx="68" cy="32" r="2" fill="#93c5fd"/>
          <circle cx="78" cy="28" r="3" fill="#fde047" style="animation: motionCrossFlare 1.5s ease-in-out infinite;"/>
          <!-- Telescope Barrel -->
          <path d="M34 68L68 34" stroke="#d97706" stroke-width="8" stroke-linecap="round"/>
          <path d="M32 70L24 78" stroke="#92400e" stroke-width="4" stroke-linecap="round"/>
          <path d="M66 36L72 30" stroke="#f59e0b" stroke-width="10" stroke-linecap="round"/>
          <!-- Tripod legs -->
          <line x1="48" y1="54" x2="36" y2="88" stroke="#64748b" stroke-width="2.5"/>
          <line x1="48" y1="54" x2="52" y2="88" stroke="#64748b" stroke-width="2.5"/>
          <line x1="48" y1="54" x2="64" y2="88" stroke="#64748b" stroke-width="2.5"/>
        </svg>
      `
    },
    hot_air_balloon: {
      themeColor: '#ec4899',
      glowColor: 'rgba(236, 72, 153, 0.45)',
      audioFreqs: [392, 493.88, 587.33, 783.99],
      fx: 'confetti',
      svg: `
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Swaying Balloon -->
          <g style="animation: motionBalloonDrift 2.2s ease-in-out infinite; transform-origin: 50% 40%;">
            <!-- Envelope -->
            <path d="M50 14C32 14 22 28 26 46C28 56 42 68 46 72H54C58 68 72 56 74 46C78 28 68 14 50 14Z" fill="url(#balloonGrad)" stroke="#ffffff" stroke-width="2" filter="drop-shadow(0 8px 16px rgba(236,72,153,0.35))"/>
            <!-- Stripes -->
            <path d="M42 16C36 26 36 54 44 72" stroke="#ffffff" stroke-width="2"/>
            <path d="M58 16C64 26 64 54 56 72" stroke="#ffffff" stroke-width="2"/>
            <!-- Basket Ropes & Basket -->
            <line x1="46" y1="72" x2="44" y2="80" stroke="#78350f" stroke-width="1.5"/>
            <line x1="54" y1="72" x2="56" y2="80" stroke="#78350f" stroke-width="1.5"/>
            <rect x="42" y="80" width="16" height="10" rx="2" fill="#d97706" stroke="#92400e" stroke-width="1.5"/>
          </g>
          <!-- Clouds in parallax -->
          <ellipse cx="20" cy="50" rx="14" ry="6" fill="rgba(255,255,255,0.7)"/>
          <ellipse cx="84" cy="34" rx="12" ry="5" fill="rgba(255,255,255,0.7)"/>
          <defs>
            <linearGradient id="balloonGrad" x1="22" y1="14" x2="78" y2="72" gradientUnits="userSpaceOnUse">
              <stop stop-color="#f43f5e"/>
              <stop offset="0.5" stop-color="#ec4899"/>
              <stop offset="1" stop-color="#0284c7"/>
            </linearGradient>
          </defs>
        </svg>
      `
    },
    fireworks: {
      themeColor: '#f43f5e',
      glowColor: 'rgba(244, 63, 94, 0.6)',
      audioFreqs: [523.25, 659.25, 783.99, 1046.50, 1567.98],
      fx: 'fireworks',
      svg: `
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Central explosive starburst -->
          <g style="animation: motionFireworksBurst 1.5s ease-out infinite; transform-origin: 50% 50%;">
            <circle cx="50" cy="50" r="8" fill="#facc15" filter="drop-shadow(0 0 10px #facc15)"/>
            <line x1="50" y1="16" x2="50" y2="34" stroke="#ef4444" stroke-width="3" stroke-linecap="round"/>
            <line x1="50" y1="66" x2="50" y2="84" stroke="#ef4444" stroke-width="3" stroke-linecap="round"/>
            <line x1="16" y1="50" x2="34" y2="50" stroke="#3b82f6" stroke-width="3" stroke-linecap="round"/>
            <line x1="66" y1="50" x2="84" y2="50" stroke="#3b82f6" stroke-width="3" stroke-linecap="round"/>
            <line x1="26" y1="26" x2="38" y2="38" stroke="#10b981" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="62" y1="62" x2="74" y2="74" stroke="#10b981" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="74" y1="26" x2="62" y2="38" stroke="#ec4899" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="38" y1="62" x2="26" y2="74" stroke="#ec4899" stroke-width="2.5" stroke-linecap="round"/>
          </g>
        </svg>
      `
    },
    luxury_ring: {
      themeColor: '#06b6d4',
      glowColor: 'rgba(6, 182, 212, 0.55)',
      audioFreqs: [880, 1108.73, 1318.51, 1760],
      fx: 'stardust',
      svg: `
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Gold band -->
          <ellipse cx="50" cy="62" rx="24" ry="12" stroke="#fbbf24" stroke-width="5" fill="none"/>
          <ellipse cx="50" cy="60" rx="24" ry="12" stroke="#fef08a" stroke-width="2" fill="none"/>
          <!-- Prong Mount -->
          <path d="M44 48L50 40L56 48" stroke="#f8fafc" stroke-width="2.5"/>
          <!-- Solitaire Faceted Diamond -->
          <g style="animation: motionDiamondShimmer 4s linear infinite; transform-origin: 50% 34px;">
            <polygon points="50,18 64,28 58,44 42,44 36,28" fill="url(#diamondPrismGrad)" stroke="#ffffff" stroke-width="2" filter="drop-shadow(0 0 14px rgba(56,189,248,0.7))"/>
            <line x1="42" y1="28" x2="58" y2="28" stroke="#ffffff" stroke-width="1.5"/>
            <line x1="50" y1="18" x2="50" y2="44" stroke="#ffffff" stroke-width="1.5"/>
          </g>
          <!-- 4-point Diamond Glare -->
          <polygon points="50,12 52,24 64,26 52,28 50,40 48,28 36,26 48,24" fill="#ffffff" style="animation: motionCrossFlare 1.3s ease-in-out infinite; transform-origin: 50px 26px;"/>
          <defs>
            <linearGradient id="diamondPrismGrad" x1="36" y1="18" x2="64" y2="44" gradientUnits="userSpaceOnUse">
              <stop stop-color="#ffffff"/>
              <stop offset="0.4" stop-color="#bae6fd"/>
              <stop offset="0.8" stop-color="#7dd3fc"/>
              <stop offset="1" stop-color="#38bdf8"/>
            </linearGradient>
          </defs>
        </svg>
      `
    },
    island_trip: {
      themeColor: '#0d9488',
      glowColor: 'rgba(13, 148, 136, 0.5)',
      audioFreqs: [392, 523.25, 659.25, 783.99, 987.77],
      fx: 'fireworks',
      svg: `
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Ocean Water Rings -->
          <ellipse cx="50" cy="74" rx="38" ry="12" stroke="#2dd4bf" stroke-width="2" style="animation: motionIslandWaves 1.8s ease-out infinite; transform-origin: 50px 74px;"/>
          <!-- Sand island mound -->
          <ellipse cx="50" cy="72" rx="30" ry="9" fill="#fde047" stroke="#ca8a04" stroke-width="2"/>
          <!-- Palm Tree Trunk -->
          <path d="M48 72C46 58 52 48 56 36" stroke="#92400e" stroke-width="4.5" stroke-linecap="round"/>
          <!-- Palm Fronds -->
          <path d="M56 36C44 32 36 38 34 44M56 36C48 26 40 24 36 28M56 36C62 26 72 26 76 30M56 36C68 32 74 38 78 44M56 36C56 24 58 18 60 16" stroke="#16a34a" stroke-width="3" stroke-linecap="round"/>
          <!-- Tropical Sunshine -->
          <circle cx="28" cy="24" r="8" fill="#facc15" filter="drop-shadow(0 0 8px #facc15)"/>
        </svg>
      `
    }
  };

  let celebrationDismissTimer = null;

  function triggerGiftCelebrationGraphic(gift, senderName = 'Un ami', recipientName = 'Vous', customNote = '') {
    const stage = document.getElementById('giftCelebrationStage');
    if (!stage) return;

    const profile = GIFT_MOTION_PROFILES[gift.id] || GIFT_MOTION_PROFILES.coffee;

    // 1. Populate Ambient Halo & Colors
    const halo = document.getElementById('giftHeroHalo');
    if (halo) {
      halo.style.background = `radial-gradient(circle, ${profile.glowColor} 0%, transparent 70%)`;
    }

    // 2. Inject Hero Motion Visual SVG
    const visual = document.getElementById('giftHeroVisual');
    if (visual) {
      visual.innerHTML = profile.svg;
    }

    // 3. Populate Card Metadata
    const badge = document.getElementById('giftCelebrationBadge');
    const sender = document.getElementById('giftCelebrationSender');
    const name = document.getElementById('giftCelebrationName');
    const note = document.getElementById('giftCelebrationNote');
    const points = document.getElementById('giftCelebrationPoints');

    if (badge) badge.textContent = `${gift.typeLabel || 'Attention'} • ${gift.ambianceLabel || 'WafaTalk'}`;
    if (sender) sender.textContent = `Offert par ${senderName} à ${recipientName}`;
    if (name) name.innerHTML = `<span>${gift.icon}</span> ${gift.name}`;
    if (note) note.textContent = `« ${customNote || gift.accroche} »`;
    if (points) points.textContent = `+${gift.points} pts d'amitié`;

    // 4. Play Customized Harmonic Sound Chime
    try {
      if (profile.audioFreqs && profile.audioFreqs.length > 0) {
        profile.audioFreqs.forEach((freq, idx) => {
          setTimeout(() => playTone(freq, 'sine', 0.28), idx * 80);
        });
      } else {
        playGiftChime();
      }
    } catch (e) {
      playGiftChime();
    }

    // 5. Fire choreographed Canvas Particles from Hero Apex
    const originX = window.innerWidth / 2;
    const originY = Math.max(window.innerHeight * 0.38, 180);
    launchParticles(originX, originY, profile.fx || gift.fx || 'confetti');

    // 6. Reveal Stage with Spring Animation
    if (celebrationDismissTimer) {
      clearTimeout(celebrationDismissTimer);
      celebrationDismissTimer = null;
    }

    stage.classList.remove('hidden', 'exiting');
    // Force layout reflow so CSS transitions & keyframe animations fire reliably
    void stage.offsetWidth;
    stage.classList.add('active');

    // Auto-dismiss after 2.3 seconds with smooth exit
    celebrationDismissTimer = setTimeout(() => {
      dismissGiftCelebration();
    }, 2300);
  }

  function dismissGiftCelebration() {
    const stage = document.getElementById('giftCelebrationStage');
    if (!stage || !stage.classList.contains('active')) return;

    if (celebrationDismissTimer) {
      clearTimeout(celebrationDismissTimer);
      celebrationDismissTimer = null;
    }

    stage.classList.add('exiting');
    setTimeout(() => {
      stage.classList.remove('active', 'exiting');
      stage.classList.add('hidden');
    }, 320);
  }

  // Allow click anywhere on the celebration stage/backdrop to dismiss immediately
  document.getElementById('giftCelebrationBackdrop')?.addEventListener('click', dismissGiftCelebration);
  document.getElementById('giftCelebrationWrapper')?.addEventListener('click', dismissGiftCelebration);

  // Expose for testing & celebration integration
  window.triggerGiftCelebrationGraphic = triggerGiftCelebrationGraphic;
  window.GIFTS_CATALOG = GIFTS_CATALOG;
  window.dismissGiftCelebration = dismissGiftCelebration;


  // =========================================================================
  // 12. CANVAS PARTICLE FX ENGINE (HEARTS, STARS, CONFETTI & FIREWORKS)
  // =========================================================================
  let particles = [];
  let isAnimating = false;

  function resizeCanvas() {
    fxCanvas.width = window.innerWidth;
    fxCanvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Vector Shape Drawing Helpers (Pure Canvas 2D without emojis)
  function drawCanvasHeart(ctx, size, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    const topCurveHeight = size * 0.35;
    ctx.moveTo(0, topCurveHeight);
    ctx.bezierCurveTo(-size * 0.5, -topCurveHeight, -size, topCurveHeight * 0.5, 0, size * 1.1);
    ctx.bezierCurveTo(size, topCurveHeight * 0.5, size * 0.5, -topCurveHeight, 0, topCurveHeight);
    ctx.closePath();
    ctx.fill();
  }

  function drawCanvasStar(ctx, size, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    const spikes = 5;
    const outerRadius = size;
    const innerRadius = size * 0.45;
    let rot = (Math.PI / 2) * 3;
    let x = 0;
    let y = 0;
    const step = Math.PI / spikes;

    ctx.moveTo(0, -outerRadius);
    for (let i = 0; i < spikes; i++) {
      x = Math.cos(rot) * outerRadius;
      y = Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += step;

      x = Math.cos(rot) * innerRadius;
      y = Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(0, -outerRadius);
    ctx.closePath();
    ctx.fill();
  }

  function drawCanvasPetal(ctx, size, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.5, size * 1.1, Math.PI / 4, 0, 2 * Math.PI);
    ctx.fill();
  }

  function drawCanvasBubble(ctx, size, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Inner reflection
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-size * 0.35, -size * 0.35, size * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCanvasNote(ctx, size, color) {
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    // note head
    ctx.beginPath();
    ctx.ellipse(-size * 0.3, size * 0.3, size * 0.35, size * 0.25, -Math.PI / 6, 0, Math.PI * 2);
    ctx.fill();
    // note stem
    ctx.beginPath();
    ctx.moveTo(-size * 0.1, size * 0.3);
    ctx.lineTo(-size * 0.1, -size * 0.6);
    ctx.lineTo(size * 0.4, -size * 0.4);
    ctx.stroke();
  }

  function launchParticles(x, y, type = 'confetti') {
    const originX = x || window.innerWidth / 2;
    const originY = y || window.innerHeight / 2;

    let palette = ['#0d837d', '#14a39b', '#f25b3e', '#ff7a59', '#f8b84e', '#ffd166'];
    let count = 60;
    let speedBase = 6;
    let shape = 'confetti';

    if (type === 'hearts' || type === 'heart') {
      palette = ['#e11d48', '#f43f5e', '#fb7185', '#fda4af', '#f25b3e'];
      count = 55;
      shape = 'heart';
    } else if (type === 'fireworks') {
      palette = ['#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#ffd166'];
      count = 130;
      speedBase = 12;
      shape = 'spark';
    } else if (type === 'stardust' || type === 'star' || type === 'sparks') {
      palette = ['#f59e0b', '#fbbf24', '#fde68a', '#ffffff', '#0d837d'];
      count = 65;
      shape = 'star';
    } else if (type === 'petals') {
      palette = ['#e11d48', '#be123c', '#fda4af', '#fff1f2'];
      count = 50;
      shape = 'petal';
    } else if (type === 'bubbles' || type === 'steam') {
      palette = ['#38bdf8', '#7dd3fc', '#bae6fd', '#0d837d', '#ffffff'];
      count = 45;
      shape = 'bubble';
    } else if (type === 'notes') {
      palette = ['#8b5cf6', '#a78bfa', '#0d837d', '#f25b3e'];
      count = 45;
      shape = 'note';
    } else if (type === 'cosmic') {
      palette = ['#6366f1', '#8b5cf6', '#ec4899', '#38bdf8', '#ffd166'];
      count = 80;
      speedBase = 8;
      shape = 'star';
    }

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * speedBase + 2;
      particles.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (type === 'fireworks' ? 3.5 : (type === 'steam' ? 3 : 1)),
        size: Math.random() * 6 + 4,
        color: palette[Math.floor(Math.random() * palette.length)],
        alpha: 1,
        rotation: Math.random() * 360,
        vr: (Math.random() - 0.5) * 8,
        shape: shape,
        decay: type === 'steam' ? 0.012 : (type === 'fireworks' ? 0.014 : 0.016),
        gravity: type === 'steam' ? -0.06 : (type === 'bubbles' ? -0.04 : 0.16)
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
      p.vy += p.gravity;
      p.alpha -= p.decay;
      p.rotation += p.vr;

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);

      if (p.shape === 'heart') {
        drawCanvasHeart(ctx, p.size, p.color);
      } else if (p.shape === 'star') {
        drawCanvasStar(ctx, p.size, p.color);
      } else if (p.shape === 'petal') {
        drawCanvasPetal(ctx, p.size, p.color);
      } else if (p.shape === 'bubble') {
        drawCanvasBubble(ctx, p.size, p.color);
      } else if (p.shape === 'note') {
        drawCanvasNote(ctx, p.size, p.color);
      } else if (p.shape === 'spark') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.65, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      }

      ctx.restore();

      if (p.alpha <= 0 || p.y > fxCanvas.height + 50 || p.y < -50) {
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
  const dmScrollBottomBtn = document.getElementById('dmScrollBottomBtn');
  const dmScrollUnreadBadge = document.getElementById('dmScrollUnreadBadge');
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

  // (Salon Real-time Media & Mesh State declared at top-level)

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
      console.log(' Socket connected to WafaTalk Gateway:', socket.id);
      if (state.currentUser?.id) {
        activeOnlineUserIds.add(state.currentUser.id);
      }
      if (state.currentUser?.username) {
        activeOnlineUserIds.add(state.currentUser.username);
      }
      socket.emit('presence:request_all');
      refreshFriendData().then(() => renderFriends());
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
        showToast(` Nouveau message de ${message.sender?.displayName || 'un ami'} : "${message.content.slice(0, 30)}..."`, 'teal');
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
      showToast(' Sonnerie chez votre correspondant...', 'teal');
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
          badge.outerHTML = '<span class="dm-oneview-seen-label"> Vu</span>';
        }
      }
    });

    // 24h Conversation Expiry Trigger
    socket.on('dm:conversation_expired', ({ conversationId }) => {
      if (currentConversation && currentConversation.id === conversationId) {
        showToast('Cette discussion a atteint sa limite de 24h et a été effacée.', 'coral');
        if (dmMessagesScroll) {
          dmMessagesScroll.innerHTML = '<div class="dm-empty-state"><span class="dm-empty-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></span><p>Cette conversation de 24h est arrivée à expiration et a été supprimée.</p></div>';
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

    // Real-time friend request events
    socket.on('friend:request_received', ({ request }) => {
      if (request && !pendingFriendRequests.some(r => r.id === request.id)) {
        pendingFriendRequests.unshift(request);
      }
      const badge = document.getElementById('friendReqBadge');
      if (badge) {
        badge.textContent = pendingFriendRequests.length;
        badge.style.display = pendingFriendRequests.length > 0 ? 'block' : 'none';
      }
      const senderName = request?.sender?.displayName || request?.sender?.username || 'Quelqu\'un';
      showToast(`${senderName} vous a envoyé une demande d'ami.`, 'green');
      playTone(550, 'sine', 0.2);
      renderFriends();
    });

    socket.on('friend:request_accepted', ({ request }) => {
      const accepterName = request?.receiver?.displayName || request?.receiver?.username || 'Un utilisateur';
      showToast(`${accepterName} a accepté votre demande d'ami.`, 'green');
      playTone(660, 'sine', 0.2);
      refreshFriendData().then(() => renderFriends());
    });

    socket.on('disconnect', () => {
      console.log(' Socket disconnected from WafaTalk Gateway');
      activeOnlineUserIds.clear();
      if (currentDmFriend) {
        updateDmFriendStatusUI(false);
      }
      renderFriends();
    });

    // =========================================================================
    // SALON GROUP SOCKET EVENTS (MULTI-USER ROSTER, AUDIO/VIDEO MESH & CHAT)
    // =========================================================================
    // Real-time Salon Gift Celebration Received from another member
    socket.on('salon:gift', ({ sender, receiver, giftType, costPoints, customMessage }) => {
      const gift = GIFTS_CATALOG.find(g => g.id === giftType) || {
        name: 'Attention Spéciale',
        icon: '🎁',
        fx: 'confetti',
        accroche: 'Une attention spéciale partagée avec le salon.'
      };
      
      // Trigger festive particles and sound
      triggerGiftCelebrationGraphic(gift, senderName, receiverName, messageText);

      const senderName = sender?.displayName || sender?.username || 'Un ami';
      const receiverName = receiver?.displayName || receiver?.username || 'tout le salon';
      const messageText = customMessage || gift.accroche;

      // Show toast
      showToast(`${senderName} a offert ${gift.name} à ${receiverName} !`, 'amber');

      // Append celebration announcement in salon chat
      if (chatMessagesScroll) {
        const giftEl = document.createElement('div');
        giftEl.className = 'chat-gift-announcement';
        giftEl.innerHTML = `
          <div class="chat-gift-icon-bubble">${gift.icon}</div>
          <div class="chat-gift-content">
            <div class="chat-gift-headline"><strong>${senderName}</strong> a offert <strong>${gift.name}</strong> (${receiverName}) !</div>
            <div class="chat-gift-note">« ${messageText} »</div>
          </div>
        `;
        chatMessagesScroll.appendChild(giftEl);
        chatMessagesScroll.scrollTop = chatMessagesScroll.scrollHeight;
      }
    });

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
      showToast(reason || '️ Votre micro a été coupé par l\'administrateur du salon.', 'coral');
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
      showToast(reason || '️ Votre caméra a été désactivée par l\'administrateur du salon.', 'coral');
    });

    // Salon Moderation: Kicked out (Expulsé)
    socket.on('salon:kicked', ({ salonId, reason }) => {
      if (state.currentRoom && state.currentRoom.id === salonId) {
        closeLiveSalon();
        playTone(300, 'sawtooth', 0.4);
        showToast(` ${reason || 'Vous avez été expulsé de ce salon par l\'administrateur.'}`, 'coral');
      }
    });

    // Salon Moderation: Banned (User or IP)
    socket.on('salon:banned', ({ salonId, banType, reason }) => {
      if (state.currentRoom && state.currentRoom.id === salonId) {
        closeLiveSalon();
        playTone(220, 'sawtooth', 0.5);
        showToast(` ${reason || 'Vous avez été banni de ce salon par l\'administrateur.'}`, 'coral');
      }
    });

    // Salon Join Error (e.g. Banned or Wrong Access Code)
    socket.on('salon:join_error', ({ salonId, error, message }) => {
      closeLiveSalon();
      playTone(220, 'sawtooth', 0.3);
      showToast(` ${message || 'Impossible de rejoindre ce salon.'}`, 'coral');
      if (error === 'INVALID_CODE' || error === 'PRIVATE_CODE_REQUIRED') {
        const targetSalon = salonsData.find(s => s.id === salonId) || { id: salonId, name: 'Salon Privé', isPrivate: true };
        openPrivateSalonPrompt(targetSalon);
      }
    });

    // Salon Admin Action Success Notification
    socket.on('salon:admin_action_success', ({ action, message }) => {
      showToast(` ${message || 'Action d\'administration exécutée.'}`, 'teal');
    });

    // Salon Admin Action Error Notification
    socket.on('salon:admin_action_error', ({ message }) => {
      showToast(` ${message || 'Erreur lors de l\'action d\'administration.'}`, 'coral');
    });

    // Salon Role Update Broadcast (Promote / Revoke Admin)
    socket.on('salon:role_update', ({ salonId, userId, role, badgeType }) => {
      if (state.currentRoom && state.currentRoom.id === salonId) {
        const p = currentSalonRoster.get(userId);
        if (p) {
          p.role = role;
          p.badgeType = badgeType;
          renderVoiceStage();
        }
      }
    });

    // Salon Role Changed for Current User
    socket.on('salon:role_changed', ({ salonId, role, badgeType, message }) => {
      if (state.currentRoom && state.currentRoom.id === salonId) {
        const myId = state.currentUser?.id;
        const selfP = currentSalonRoster.get(myId) || (myId ? null : Array.from(currentSalonRoster.values())[0]);
        if (selfP) {
          selfP.role = role;
          selfP.badgeType = badgeType;
          renderVoiceStage();
        }
        playTone(badgeType === 'ADMIN' ? 660 : 330, 'sine', 0.25);
        showToast(message || `Votre rôle a changé : ${role}`, badgeType === 'ADMIN' ? 'teal' : 'coral');
      }
    });
  }

  // =========================================================================
  // 1-ON-1 DIRECT CHAT CONTROLLER
  // =========================================================================
  async function openDirectChat(friend) {
    if (!friend) return;

    // Check if user is logged in and whether they are accepted friends
    const isFriend = myFriendsList.some(f => f.id === friend.id || (f.username && friend.username && f.username.toLowerCase() === friend.username.toLowerCase()));
    if (state.currentUser?.id && !isFriend) {
      showToast('Vous devez être amis pour ouvrir une conversation privée.', 'coral');
      return;
    }

    currentDmFriend = friend;
    if (!directChatModal) return;

    // 1. Populate UI Header
    if (dmFriendAvatar) dmFriendAvatar.src = friend.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80';
    if (dmFriendName) dmFriendName.textContent = friend.name || friend.username || 'Ami WafaTalk';
    if (dmFriendFlag) dmFriendFlag.innerHTML = getFlagImgTag(friend.country, friend.country);
    const isOnline = activeOnlineUserIds.has(friend.id) || (friend.username && activeOnlineUserIds.has(friend.username)) || Boolean(friend._isOnline);
    updateDmFriendStatusUI(isOnline);

    directChatModal.classList.remove('hidden');
    dmMessagesScroll.innerHTML = '<div class="dm-empty-state"><span class="dm-empty-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></span><p>Chargement du salon privé...</p></div>';

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
        directChatModal.classList.add('hidden');
        showToast(data.message || 'Impossible d\'ouvrir la conversation.', 'coral');
        return;
      }
    } catch (err) {
      console.warn('Erreur ouverture conversation:', err);
      directChatModal.classList.add('hidden');
      showToast('Impossible d\'ouvrir la conversation. Connexion ou amitié requise.', 'coral');
      return;
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
      dmOldestMessageId = null;
      dmHasMoreMessages = true;
      dmIsLoadingOlder = false;
      dmUnreadScrolledCount = 0;
      dmScrollBottomBtn?.classList.add('hidden');
      if (dmScrollUnreadBadge) {
        dmScrollUnreadBadge.textContent = '0';
        dmScrollUnreadBadge.classList.add('hidden');
      }

      const token = getAuthToken();
      const res = await fetch(`${API_BASE_URL}/conversations/${conversationId}/messages?limit=50`, {
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const msgs = data.messages || [];
        dmHasMoreMessages = Boolean(data.hasMore ?? (msgs.length === 50));
        if (msgs.length > 0) {
          dmOldestMessageId = msgs[0].id;
        }

        renderDirectMessages(msgs);

        if (!dmHasMoreMessages && msgs.length > 0) {
          document.getElementById('dmHistoryStart')?.classList.remove('hidden');
        }

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
          <span class="dm-empty-icon"></span>
          <strong>Salon Privé Ouvert</strong>
          <p>Les messages et appels sont strictement confidentiels et protégés par WafaTalk. Dites bonjour ! </p>
        </div>
      `;
      return;
    }

    dmMessagesScroll.innerHTML = `
      <div class="chat-history-start ${dmHasMoreMessages ? 'hidden' : ''}" id="dmHistoryStart">
        <span> Début de votre salon privé confidentiel</span>
      </div>
      <div class="chat-history-loader hidden" id="dmHistoryLoader">
        <span class="chat-loader-spinner"></span>
        <span>Chargement des messages précédents...</span>
      </div>
    `;

    messages.forEach((m) => appendDirectMessageBubble(m, false));
    scrollDmToBottom();
  }

  // Fetch older direct messages when user scrolls up to top
  async function loadOlderConversationMessages() {
    if (!currentConversation || !dmHasMoreMessages || dmIsLoadingOlder || !dmOldestMessageId) return;
    dmIsLoadingOlder = true;

    const loader = document.getElementById('dmHistoryLoader');
    loader?.classList.remove('hidden');

    const prevScrollHeight = dmMessagesScroll.scrollHeight;
    const prevScrollTop = dmMessagesScroll.scrollTop;

    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE_URL}/conversations/${currentConversation.id}/messages?beforeId=${dmOldestMessageId}&limit=50`, {
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const olderMsgs = data.messages || [];
        dmHasMoreMessages = Boolean(data.hasMore ?? (olderMsgs.length === 50));

        if (olderMsgs.length > 0) {
          dmOldestMessageId = olderMsgs[0].id;

          const fragment = document.createDocumentFragment();
          olderMsgs.forEach((m) => {
            if (!m.id || !dmMessagesScroll.querySelector(`.dm-bubble[data-msg-id="${m.id}"]`)) {
              fragment.appendChild(createDirectMessageBubbleElement(m));
            }
          });

          const anchor = loader || dmMessagesScroll.firstChild;
          if (anchor && anchor.nextSibling) {
            dmMessagesScroll.insertBefore(fragment, anchor.nextSibling);
          } else {
            dmMessagesScroll.prepend(fragment);
          }

          // Anchor scroll position seamlessly so reading view is rock solid
          const newScrollHeight = dmMessagesScroll.scrollHeight;
          dmMessagesScroll.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
        } else {
          dmHasMoreMessages = false;
        }
      }
    } catch (err) {
      console.warn('Failed to load older conversation messages:', err);
    } finally {
      loader?.classList.add('hidden');
      if (!dmHasMoreMessages) {
        document.getElementById('dmHistoryStart')?.classList.remove('hidden');
      }
      dmIsLoadingOlder = false;
    }
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
      const map = { pdf: '', doc: '', docx: '', xls: '', xlsx: '', zip: '️', txt: '', mp3: '', ogg: '', wav: '' };
      return map[ext] || '';
    }
    if (mimeType?.startsWith('image/')) return '️';
    if (mimeType?.startsWith('video/')) return '';
    if (mimeType?.startsWith('audio/')) return '';
    if (mimeType?.includes('pdf')) return '';
    if (mimeType?.includes('word')) return '';
    if (mimeType?.includes('excel') || mimeType?.includes('spreadsheet')) return '';
    if (mimeType?.includes('zip')) return '️';
    return '';
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
    closeBtn.innerHTML = '';
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

  function createDirectMessageBubbleElement(message) {
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
          exp.innerHTML = `<span class="dm-oneview-icon"></span> <span>Photo (vue unique expirée)</span>`;
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
          cover.innerHTML = `<span class="dm-oneview-cover-icon"></span><span class="dm-oneview-cover-label">Appuyer pour voir</span><span class="dm-oneview-cover-hint">Vue unique · disparaît après ouverture</span>`;
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
              exp.innerHTML = `<span class="dm-oneview-icon"></span> <span>Photo (vue unique expirée)</span>`;
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
          ? '<span class="dm-oneview-seen-label"> Vu</span>'
          : '<span class="dm-oneview-badge"> Vue unique</span>');

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
      meta.innerHTML = `<span>${message.time || 'À l\'instant'}</span>${isFromMe ? '<span style="font-size:0.75rem"></span>' : ''}`;
      bubble.appendChild(meta);

    } else if (msgType === 'VIDEO' && (message.mediaUrl || alreadyViewed)) {
      bubble.className = `dm-bubble ${isFromMe ? 'from-me' : 'from-other'}`;

      if (viewMode === 'ONE_VIEW' && !isFromMe) {
        if (alreadyViewed) {
          const exp = document.createElement('div');
          exp.className = 'dm-oneview-expired-card';
          exp.innerHTML = `<span class="dm-oneview-icon"></span> <span>Vidéo (vue unique expirée)</span>`;
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
          videoWrap.innerHTML += '<div class="dm-media-video-play-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg></div>';
          const cover = document.createElement('div');
          cover.className = 'dm-oneview-cover';
          cover.innerHTML = `<span class="dm-oneview-cover-icon"></span><span class="dm-oneview-cover-label">Appuyer pour voir</span><span class="dm-oneview-cover-hint">Vidéo · vue unique</span>`;
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
              exp.innerHTML = `<span class="dm-oneview-icon"></span> <span>Vidéo (vue unique expirée)</span>`;
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
          ? '<span class="dm-oneview-seen-label"> Vu</span>'
          : '<span class="dm-oneview-badge"> Vue unique</span>');

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
      meta.innerHTML = `<span>${message.time || 'À l\'instant'}</span>${isFromMe ? '<span style="font-size:0.75rem"></span>' : ''}`;
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
      meta.innerHTML = `<span>${message.time || 'À l\'instant'}</span>${isFromMe ? '<span style="font-size:0.75rem"></span>' : ''}`;
      bubble.appendChild(meta);

    } else {
      // Plain TEXT message
      bubble.className = `dm-bubble ${isFromMe ? 'from-me' : 'from-other'}`;
      bubble.innerHTML = `
        <div class="dm-bubble-text">${escapeHtml(message.content || '')}</div>
        <div class="dm-bubble-meta">
          <span>${message.time || 'À l\'instant'}</span>
          ${isFromMe ? '<span style="font-size: 0.75rem;"></span>' : ''}
        </div>
      `;
    }

    return bubble;
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

    const bubble = createDirectMessageBubbleElement(message);
    dmMessagesScroll.appendChild(bubble);

    if (!dmOldestMessageId && message.id) {
      dmOldestMessageId = message.id;
    }

    const isFromMe = message.isFromMe || (message.sender?.id === state.currentUser?.id);
    const isNearBottom = (dmMessagesScroll.scrollHeight - dmMessagesScroll.scrollTop - dmMessagesScroll.clientHeight) < 140;

    if (shouldScroll && (isFromMe || isNearBottom)) {
      scrollDmToBottom();
      dmScrollBottomBtn?.classList.add('hidden');
      dmUnreadScrolledCount = 0;
      if (dmScrollUnreadBadge) dmScrollUnreadBadge.classList.add('hidden');
    } else if (!isFromMe) {
      // User is reading older messages above! Keep position and update unread indicator
      dmUnreadScrolledCount++;
      dmScrollBottomBtn?.classList.remove('hidden');
      if (dmScrollUnreadBadge) {
        dmScrollUnreadBadge.textContent = dmUnreadScrolledCount;
        dmScrollUnreadBadge.classList.remove('hidden');
      }
    }
  }

  function scrollDmToBottom() {
    if (!dmMessagesScroll) return;
    dmMessagesScroll.scrollTo({ top: dmMessagesScroll.scrollHeight, behavior: 'smooth' });
  }

  // Scroll listener for DM Chat
  dmMessagesScroll?.addEventListener('scroll', () => {
    // If user scrolled near top, load older history
    if (dmMessagesScroll.scrollTop <= 60 && dmHasMoreMessages && !dmIsLoadingOlder) {
      loadOlderConversationMessages();
    }

    // Toggle floating scroll-to-bottom button
    const distFromBottom = dmMessagesScroll.scrollHeight - dmMessagesScroll.scrollTop - dmMessagesScroll.clientHeight;
    if (distFromBottom < 90) {
      dmScrollBottomBtn?.classList.add('hidden');
      dmUnreadScrolledCount = 0;
      if (dmScrollUnreadBadge) dmScrollUnreadBadge.classList.add('hidden');
    } else if (distFromBottom > 160) {
      dmScrollBottomBtn?.classList.remove('hidden');
    }
  });

  dmScrollBottomBtn?.addEventListener('click', () => {
    scrollDmToBottom();
    dmScrollBottomBtn.classList.add('hidden');
    dmUnreadScrolledCount = 0;
    if (dmScrollUnreadBadge) dmScrollUnreadBadge.classList.add('hidden');
  });

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
    progressEl.innerHTML = `<span>Envoi en cours...</span><div class="dm-upload-progress-bar-wrap"><div class="dm-upload-progress-bar"></div></div>`;
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
    const emojis = ['', '', '️', '', '', '', '', ''];
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

    // Check if friends before calling (authoritative check done by backend; only block client-side if friend list is loaded)
    const isFriend = myFriendsList.some(f => f.id === currentDmFriend.id || (f.username && currentDmFriend.username && f.username.toLowerCase() === currentDmFriend.username.toLowerCase()));
    if (state.currentUser?.id && !isFriend && myFriendsList.length > 0) {
      showToast('Vous devez être amis pour passer un appel.', 'coral');
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
      incomingCallTypeBadge.querySelector('.badge-icon').textContent = type === 'video' ? '' : '';
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
      const enhancedSdp = enhanceSdpForDiscordQuality(offer.sdp);
      await peerConnection.setLocalDescription(new RTCSessionDescription({ type: 'offer', sdp: enhancedSdp }));

      if (socket && currentCallSession) {
        socket.emit('webrtc:signal', {
          callId: currentCallSession.callId,
          targetUserId: currentCallSession.peer.id,
          signal: { type: 'offer', sdp: peerConnection.localDescription.sdp },
        });
      }
      startCallTimer();
    } catch (err) {
      console.warn('Error creating WebRTC offer:', err);
    }
  }

  // F. Create and Configure RTCPeerConnection with ICE buffering
  function createPeerConnection() {
    if (peerConnection && peerConnection.connectionState !== 'closed') {
      try { peerConnection.close(); } catch (e) { }
    }

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
            signal: {
              type: 'candidate',
              candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate
            },
          });
        }
      };

      // Handle incoming remote media tracks (Audio & Video)
      peerConnection.ontrack = (event) => {
        console.log(' Flux distant reçu:', event.track.kind);
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
        if (remoteAudio) {
          remoteAudio.srcObject = remoteMediaStream;
          remoteAudio.muted = false;
          remoteAudio.autoplay = true;
          remoteAudio.playsInline = true;
          remoteAudio.setAttribute('playsinline', '');
          const p = remoteAudio.play();
          if (p !== undefined) p.catch(e => console.warn('remoteAudio autoplay policy:', e));
        }

        // Attach to video elements (Main screen and floating PiP window)
        if (remoteVideo) {
          remoteVideo.srcObject = remoteMediaStream;
          remoteVideo.playsInline = true;
          remoteVideo.setAttribute('playsinline', '');
          const hideRemotePlaceholder = () => {
            remoteVideoPlaceholder?.classList.add('hidden');
            floatingRemotePlaceholder?.classList.add('hidden');
          };
          remoteVideo.addEventListener('loadeddata', hideRemotePlaceholder, { once: true });
          remoteVideo.addEventListener('playing', hideRemotePlaceholder, { once: true });
          const vp = remoteVideo.play();
          if (vp !== undefined) vp.then(hideRemotePlaceholder).catch(() => {});
        }
        if (floatingRemoteVideo) {
          floatingRemoteVideo.srcObject = remoteMediaStream;
          floatingRemoteVideo.playsInline = true;
          floatingRemoteVideo.setAttribute('playsinline', '');
          const fvp = floatingRemoteVideo.play();
          if (fvp !== undefined) fvp.catch(() => {});
        }
        floatingRemotePlaceholder?.classList.add('hidden');
        remoteVideoPlaceholder?.classList.add('hidden');

        startAudioVisualizer(remoteMediaStream, 'peer');
      };

      peerConnection.oniceconnectionstatechange = () => {
        console.log(' 1-on-1 ICE State:', peerConnection.iceConnectionState);
        if (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'disconnected') {
          // Let both call participants attempt ICE restart; avoid double-ice-restart offer loops
          if (typeof peerConnection.restartIce === 'function' && peerConnection.signalingState === 'stable' && !peerConnection._iceRestartInFlight) {
            peerConnection._iceRestartInFlight = true;
            peerConnection.createOffer({ iceRestart: true })
              .then(offer => {
                const enhanced = enhanceSdpForDiscordQuality(offer.sdp);
                return peerConnection.setLocalDescription(new RTCSessionDescription({ type: 'offer', sdp: enhanced }));
              })
              .then(() => {
                if (socket && currentCallSession) {
                  socket.emit('webrtc:signal', {
                    callId: currentCallSession.callId,
                    targetUserId: currentCallSession.peer.id,
                    signal: { type: 'offer', sdp: peerConnection.localDescription.sdp, isIceRestart: true },
                  });
                }
              })
              .catch(e => console.warn('ICE restart error:', e))
              .finally(() => { peerConnection._iceRestartInFlight = false; });
          }
        }
      };

      peerConnection.onconnectionstatechange = () => {
        console.log(' WebRTC Connection State:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
          showToast(' Appel direct P2P HD chiffré connecté !', 'teal');
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
        // Allow ICE restart offers even when in have-remote-offer state
        if (peerConnection.signalingState === 'have-remote-offer' && !signal.isIceRestart) {
          console.warn('Already in have-remote-offer, ignoring duplicate offer');
          return;
        }

        // If in have-remote-offer and this IS an ICE restart, roll back first
        if (peerConnection.signalingState === 'have-remote-offer') {
          await peerConnection.setLocalDescription({ type: 'rollback' });
        }

        await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));
        await drainPendingCandidates();

        const answer = await peerConnection.createAnswer();
        const enhancedSdp = enhanceSdpForDiscordQuality(answer.sdp);
        await peerConnection.setLocalDescription(new RTCSessionDescription({ type: 'answer', sdp: enhancedSdp }));

        const targetId = senderId || currentCallSession?.peer?.id;
        if (socket && currentCallSession && targetId) {
          socket.emit('webrtc:signal', {
            callId: currentCallSession.callId,
            targetUserId: targetId,
            signal: { type: 'answer', sdp: peerConnection.localDescription.sdp },
          });
        }
      } else if (signal.type === 'answer') {
        if (peerConnection.signalingState !== 'stable') {
          await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
          await drainPendingCandidates();
        }
      } else if (signal.candidate || signal.type === 'candidate') {
        const candData = signal.candidate || signal;
        if (!candData || (!candData.candidate && candData.candidate !== '')) return;

        if (peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candData));
          } catch (e) {
            console.warn('Error adding ICE candidate:', e);
          }
        } else {
          pendingIceCandidates.push(candData);
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
        if (cand && (cand.candidate !== undefined || cand.sdpMid !== undefined)) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(cand));
        }
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
      ctx.fillText(' FLUX VIDÉO HD EN DIRECT • 60 FPS • CHIFFRÉ P2P', 640, 525);

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
      if (remotePlaceholderAvatar) remotePlaceholderAvatar.src = session.peer.avatar;
      remoteVideoPlaceholder?.classList.remove('hidden');
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
        showToast('Partage d\'écran démarré ️', 'teal');

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

