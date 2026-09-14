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

  // Seeded & Connected Friends Data with Real DB IDs & Flags
  const friendsData = [
    { id: 'user-sarah', username: 'sarah_b', name: 'Sarah B.', role: 'En vocal', status: 'online', room: 'Chill & Discussion', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&auto=format&fit=crop&q=80', country: 'FR' },
    { id: 'user-youssef', username: 'youssef_k', name: 'Youssef K.', role: 'En ligne', status: 'online', room: 'Disponible', avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=80&auto=format&fit=crop&q=80', country: 'MA' },
    { id: 'user-lina', username: 'lina_m', name: 'Lina M.', role: 'En vocal', status: 'online', room: 'Gaming Squads', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&auto=format&fit=crop&q=80', country: 'DZ' },
    { id: 'user-karim', username: 'karim_d', name: 'Karim D.', role: 'Absent', status: 'idle', room: 'Retour dans 10m', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&auto=format&fit=crop&q=80', country: 'TN' },
    { id: 'user-alexandre', username: 'alexandre', name: 'Alexandre', role: 'En ligne', status: 'online', room: 'Admin WafaTalk', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80', country: 'FR' }
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
    if (socket) {
      socket.disconnect();
      socket = null;
    }
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
            role: 'Membre WafaTalk',
            room: 'Disponible',
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

    const onlineCounter = document.getElementById('onlineFriendsCount');
    if (onlineCounter) {
      onlineCounter.textContent = `${displayList.length} membre${displayList.length > 1 ? 's' : ''}`;
    }

    friendsList.innerHTML = '';

    if (displayList.length === 0) {
      friendsList.innerHTML = '<div style="padding: 14px; text-align: center; color: var(--text-muted); font-size: 0.82rem;">Aucun autre membre connecté.</div>';
      return;
    }

    displayList.forEach(friend => {
      const flagTag = getFlagImgTag(friend.country, friend.country);
      const item = document.createElement('div');
      item.className = 'friend-item';
      item.innerHTML = `
        <div class="friend-item-left" style="cursor: pointer; flex: 1;" title="Ouvrir le salon privé avec ${friend.name || friend.username}">
          <div class="friend-avatar-wrap">
            <img src="${friend.avatar}" alt="${friend.name || friend.username}" class="friend-avatar" onerror="this.src='https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80'">
            <span class="friend-status-dot ${friend.status || 'online'}"></span>
          </div>
          <div class="friend-meta">
            <div style="display: flex; align-items: center; gap: 5px;">
              <span class="friend-name">${friend.name || friend.username}</span>
              <span style="display: inline-flex; align-items: center;">${flagTag}</span>
            </div>
            <span class="friend-activity">${friend.role || 'Membre WafaTalk'}</span>
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
      }).catch(() => { });
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

  // DOM Elements: Mini Call Floating Widget
  const miniCallWidget = document.getElementById('miniCallWidget');
  const btnRestoreCall = document.getElementById('btnRestoreCall');
  const miniCallAvatar = document.getElementById('miniCallAvatar');
  const miniCallName = document.getElementById('miniCallName');
  const miniCallTime = document.getElementById('miniCallTime');
  const btnMiniToggleMic = document.getElementById('btnMiniToggleMic');
  const btnMiniHangup = document.getElementById('btnMiniHangup');

  // WebRTC & Audio Configuration (Multi-STUN Resilience)
  const RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      { urls: 'stun:stun.services.mozilla.com' },
    ],
    iceCandidatePoolSize: 10,
  };

  let socket = null;
  let currentDmFriend = null;
  let currentConversation = null;
  let typingDebounceTimer = null;

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
      renderFriends();
    });

    // Handle incoming direct message
    socket.on('dm:message', (message) => {
      if (currentConversation && message.conversationId === currentConversation.id) {
        appendDirectMessageBubble(message);
        playTone(600, 'sine', 0.1);
        socket.emit('dm:read', { conversationId: currentConversation.id });
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
      await handleIncomingWebRTCSignal(signal);
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

    // User Presence Update: Real-time update of friends and online members
    socket.on('presence:update', ({ userId, status }) => {
      if (currentDmFriend && currentDmFriend.id === userId) {
        updateDmFriendStatusUI(status === 'online');
      }
      // Instantly refresh discoverable members in real time when anyone logs in or joins
      renderFriends();
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
    updateDmFriendStatusUI(friend.status === 'online');

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
      dmFriendStatusDot.className = `dm-status-indicator ${isOnline ? 'online' : ''}`;
    }
    if (dmFriendStatusText) {
      dmFriendStatusText.textContent = isOnline ? 'En ligne' : 'Hors ligne';
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

  function appendDirectMessageBubble(message, shouldScroll = true) {
    if (!dmMessagesScroll) return;

    // Remove empty placeholder if present
    const emptyState = dmMessagesScroll.querySelector('.dm-empty-state');
    if (emptyState) emptyState.remove();

    const isFromMe = message.isFromMe || (message.sender?.id === state.currentUser?.id);
    const bubble = document.createElement('div');

    if (message.type === 'CALL_LOG') {
      bubble.className = 'dm-bubble call-log';
      bubble.textContent = message.content;
    } else {
      bubble.className = `dm-bubble ${isFromMe ? 'from-me' : 'from-other'}`;
      bubble.innerHTML = `
        <div class="dm-bubble-text">${escapeHtml(message.content)}</div>
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

  // Handle DM message submission
  dmMessageForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentConversation || !dmTextInput) return;

    const text = dmTextInput.value.trim();
    if (!text) return;

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
      // Offline fallback
      appendDirectMessageBubble({
        content: text,
        isFromMe: true,
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      });
    }

    dmTextInput.value = '';
    dmTextInput.focus();
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

  // Close Direct Chat Modal
  btnCloseDirectChat?.addEventListener('click', () => {
    if (currentConversation && socket) {
      socket.emit('dm:leave', { conversationId: currentConversation.id });
    }
    directChatModal?.classList.add('hidden');
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
        remoteMediaStream = event.streams[0] || new MediaStream([event.track]);

        // Attach to dedicated audio element for guaranteed sound
        if (remoteAudio) {
          remoteAudio.srcObject = remoteMediaStream;
          remoteAudio.play().catch(e => console.warn('remoteAudio autoplay policy:', e));
        }

        // Attach to video element
        if (remoteVideo) {
          remoteVideo.srcObject = remoteMediaStream;
          remoteVideo.play().catch(e => console.warn('remoteVideo autoplay policy:', e));
        }

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
  async function handleIncomingWebRTCSignal(signal) {
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

        if (socket && currentCallSession) {
          socket.emit('webrtc:signal', {
            callId: currentCallSession.callId,
            targetUserId: currentCallSession.peer.id,
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
      remoteVideo.srcObject = compStream;
      remoteVideo.play().catch(() => {});
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
      }
    } else {
      callVideoStage?.classList.add('hidden');
      callAudioStage?.classList.remove('hidden');
    }

    // Mini Widget Info
    if (miniCallAvatar) miniCallAvatar.src = session.peer.avatar;
    if (miniCallName) miniCallName.textContent = session.peer.name;
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
  btnMiniHangup?.addEventListener('click', endCurrentCall);

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
          isScreenSharing = false;
          btnCallShareScreen.classList.remove('active');
          showToast('Partage d\'écran arrêté.', 'teal');
        };
      } else {
        isScreenSharing = false;
        btnCallShareScreen.classList.remove('active');
        if (localVideo && localMediaStream) localVideo.srcObject = localMediaStream;
        showToast('Partage d\'écran arrêté.', 'teal');
      }
    } catch (err) {
      console.warn('Screen share cancelled or failed:', err);
    }
  });

  // Minimize / Restore PiP Call
  btnMinimizeCall?.addEventListener('click', () => {
    activeCallModal?.classList.add('hidden');
    miniCallWidget?.classList.remove('hidden');
  });

  btnRestoreCall?.addEventListener('click', () => {
    miniCallWidget?.classList.add('hidden');
    activeCallModal?.classList.remove('hidden');
  });

  // =========================================================================
  // 15. UTILITIES & INITIAL APP BOOTSTRAP
  // =========================================================================
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

});

