/* ============================================
   LinkDrop — Vanilla JS
   QR Tiger style UI: platform tiles + manage list
   - Admin page (index.html): pick platform, fill modal, generate QR
   - Public page (links.html): render shared links
   - Storage: localStorage + URL hash (so QR works anywhere)
   ============================================ */

(function () {
  'use strict';

  // Legacy single-user keys (kept for back-compat migration)
  const LEGACY_LINKS_KEY = 'linkdrop.links';
  const LEGACY_PROFILE_KEY = 'linkdrop.profile';
  const LEGACY_ONBOARDED_KEY = 'linkdrop.onboarded';

  // Multi-user storage
  const USERS_KEY = 'linkdrop.users';        // { "1234": { name, profile, links, createdAt } }
  const CURRENT_KEY = 'linkdrop.current';    // "1234"
  const THEME_KEY = 'linkdrop.theme';

  const DEFAULT_PROFILE = { name: 'My Links', bio: 'Tap a button to visit', avatar: '★' };

  function initialsOf(name) {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '★';
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /* ---------- Users (token-keyed accounts) ---------- */
  function loadUsers() {
    try {
      const raw = localStorage.getItem(USERS_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) { return {}; }
  }
  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }
  function getCurrentToken() {
    return localStorage.getItem(CURRENT_KEY) || '';
  }
  function setCurrentToken(token) {
    if (token) localStorage.setItem(CURRENT_KEY, token);
    else localStorage.removeItem(CURRENT_KEY);
  }
  function getCurrentUser() {
    const token = getCurrentToken();
    if (!token) return null;
    const users = loadUsers();
    return users[token] || null;
  }
  function updateCurrentUser(patch) {
    const token = getCurrentToken();
    if (!token) return;
    const users = loadUsers();
    users[token] = Object.assign(
      { profile: Object.assign({}, DEFAULT_PROFILE), links: [], createdAt: Date.now() },
      users[token] || {},
      patch
    );
    saveUsers(users);
  }
  function generateToken() {
    const users = loadUsers();
    // 2-digit token: 00–99 (zero-padded), 100 possible slots
    for (let i = 0; i < 300; i++) {
      const n = Math.floor(Math.random() * 100);
      const t = (n < 10 ? '0' : '') + n;
      if (!users[t]) return t;
    }
    return String(Date.now()).slice(-2);
  }

  /* ---------- Username helpers ---------- */
  function isValidUsername(u) {
    if (!u) return false;
    // 3–20 chars, alphanumeric, must contain at least one letter AND one digit
    if (!/^[a-zA-Z0-9]{3,20}$/.test(u)) return false;
    if (!/[a-zA-Z]/.test(u)) return false;
    if (!/[0-9]/.test(u)) return false;
    return true;
  }
  function findTokenByUsername(uname) {
    const target = (uname || '').toLowerCase();
    const users = loadUsers();
    for (const tk in users) {
      if (users[tk] && (users[tk].username || '').toLowerCase() === target) return tk;
    }
    return '';
  }
  function isUsernameTaken(uname) {
    return !!findTokenByUsername(uname);
  }

  /* ---------- One-time migration from legacy single-user ---------- */
  (function migrateLegacy() {
    if (localStorage.getItem(USERS_KEY)) return; // already migrated or new install
    const onboarded = localStorage.getItem(LEGACY_ONBOARDED_KEY) === '1';
    if (!onboarded) return;
    try {
      const profile = JSON.parse(localStorage.getItem(LEGACY_PROFILE_KEY) || 'null');
      const links = JSON.parse(localStorage.getItem(LEGACY_LINKS_KEY) || '[]');
      if (!profile) return;
      const n = Math.floor(Math.random() * 100);
      const token = (n < 10 ? '0' : '') + n;
      const users = {};
      users[token] = {
        name: profile.name || 'User',
        profile: Object.assign({}, DEFAULT_PROFILE, profile),
        links: Array.isArray(links) ? links : [],
        createdAt: Date.now()
      };
      saveUsers(users);
      setCurrentToken(token);
      // Clean up legacy keys
      localStorage.removeItem(LEGACY_ONBOARDED_KEY);
      localStorage.removeItem(LEGACY_PROFILE_KEY);
      localStorage.removeItem(LEGACY_LINKS_KEY);
    } catch (e) { /* ignore */ }
  })();

  /* ---------- Platform catalog ---------- */
  const PLATFORMS = [
    { key: 'fb',     name: 'Facebook',  glyph: 'f',  placeholder: 'https://facebook.com/yourpage' },
    { key: 'x',      name: 'X',         glyph: '𝕏', placeholder: 'https://x.com/yourhandle' },
    { key: 'ig',     name: 'Instagram', glyph: 'Ig', placeholder: 'https://instagram.com/you' },
    { key: 'wa',     name: 'WhatsApp',  glyph: 'W',  placeholder: 'https://wa.me/15551234567' },
    { key: 'yt',     name: 'YouTube',   glyph: '▶',  placeholder: 'https://youtube.com/@channel' },
    { key: 'in',     name: 'LinkedIn',  glyph: 'in', placeholder: 'https://linkedin.com/in/you' },
    { key: 'tg',     name: 'Telegram',  glyph: '✈',  placeholder: 'https://t.me/yourhandle' },
    { key: 'pin',    name: 'Pinterest', glyph: 'P',  placeholder: 'https://pinterest.com/you' },
    { key: 'sn',     name: 'Snapchat',  glyph: '👻', emoji: true, placeholder: 'https://snapchat.com/add/you' },
    { key: 'msg',    name: 'Messenger', glyph: '💬', emoji: true, placeholder: 'https://m.me/yourpage' },
    { key: 'reddit', name: 'Reddit',    glyph: 'R',  placeholder: 'https://reddit.com/r/sub' },
    { key: 'line',   name: 'Line',      glyph: 'L',  placeholder: 'https://line.me/ti/p/' },
    { key: 'tt',     name: 'TikTok',    glyph: '♪',  placeholder: 'https://tiktok.com/@you' },
    { key: 'md',     name: 'Medium',    glyph: 'M',  placeholder: 'https://medium.com/@you' },
    { key: 'custom', name: 'Custom link', glyph: '+', emoji: true, placeholder: 'https://example.com' }
  ];

  function getPlatform(key) {
    return PLATFORMS.find(function (p) { return p.key === key; }) || null;
  }

  /* ---------- Theme toggle ---------- */
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem(THEME_KEY, 'light');
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem(THEME_KEY, 'dark');
      }
    });
  }

  /* ---------- Per-user storage (proxied through current account) ---------- */
  function loadLinks() {
    const u = getCurrentUser();
    return (u && Array.isArray(u.links)) ? u.links : [];
  }
  function saveLinks(links) {
    updateCurrentUser({ links: links });
  }
  function loadProfile() {
    const u = getCurrentUser();
    return Object.assign({}, DEFAULT_PROFILE, (u && u.profile) || {});
  }
  function saveProfile(p) {
    updateCurrentUser({ profile: p, name: p.name });
  }
  function loadSnapshots() {
    const u = getCurrentUser();
    return (u && Array.isArray(u.snapshots)) ? u.snapshots : [];
  }
  function saveSnapshots(snaps) {
    updateCurrentUser({ snapshots: snaps });
  }
  function generateSnapshotId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // unambiguous
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return 'QR-' + s;
  }
  function formatDate(ts) {
    try {
      const d = new Date(ts);
      const pad = function (n) { return n < 10 ? '0' + n : '' + n; };
      return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() +
             ' · ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    } catch (e) { return ''; }
  }

  /* ---------- URL encoding for QR ----------
     Payload shape: { p: profile, l: links } */
  function encodePayload(payload) {
    const json = JSON.stringify(payload);
    return btoa(unescape(encodeURIComponent(json)));
  }
  function decodePayload(encoded) {
    try {
      const json = decodeURIComponent(escape(atob(encoded)));
      const obj = JSON.parse(json);
      // Back-compat: older QRs encoded the array directly
      if (Array.isArray(obj)) return { p: Object.assign({}, DEFAULT_PROFILE), l: obj };
      return {
        p: Object.assign({}, DEFAULT_PROFILE, obj.p || {}),
        l: Array.isArray(obj.l) ? obj.l : []
      };
    } catch (e) { return { p: Object.assign({}, DEFAULT_PROFILE), l: [] }; }
  }
  function buildPublicUrl(links, profile) {
    const base = location.href.replace(/[^/]*(?:\?.*)?(?:#.*)?$/, '') + 'links.html';
    return base + '#d=' + encodePayload({ p: profile, l: links });
  }

  /* ---------- Domain helper ---------- */
  function prettyDomain(u) {
    try {
      const host = new URL(u).hostname.replace(/^www\./, '');
      return host;
    } catch (e) { return u; }
  }

  /* ---------- Toast ---------- */
  function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  /* ---------- URL validation ---------- */
  function normalizeUrl(u) {
    const trimmed = (u || '').trim();
    if (!trimmed) return '';
    if (!/^https?:\/\//i.test(trimmed)) return 'https://' + trimmed;
    return trimmed;
  }
  function isValidUrl(u) {
    try { new URL(u); return true; } catch (e) { return false; }
  }

  /* ---------- HTML escape ---------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ============================================
     WELCOME / LOGIN gate (admin only)
     Sign up → 4-digit token. Log in with token to restore history.
     ============================================ */
  function initWelcome(onDone) {
    const screen = document.getElementById('welcomeScreen');
    if (!screen) { onDone(); return; }

    bindLogout();

    // Already logged in? Skip welcome.
    if (getCurrentToken() && getCurrentUser()) {
      screen.classList.add('hidden');
      refreshUserPill();
      onDone();
      return;
    }

    screen.classList.remove('hidden');

    // ---- Tabs ----
    const tabs = screen.querySelectorAll('.auth-tab');
    const signupPane = document.getElementById('signupForm');
    const loginPane = document.getElementById('loginForm');
    const wName = document.getElementById('wName');
    const wUsername = document.getElementById('wUsername');
    const wLoginId = document.getElementById('wLoginId');
    const loginError = document.getElementById('loginError');

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.toggle('active', t === tab); });
        const which = tab.dataset.tab;
        signupPane.classList.toggle('hidden', which !== 'signup');
        loginPane.classList.toggle('hidden', which !== 'login');
        loginError.classList.add('hidden');
        setTimeout(function () {
          (which === 'signup' ? wName : wLoginId).focus();
        }, 50);
      });
    });

    setTimeout(function () { wName.focus(); }, 100);

    // Strip spaces and special chars as user types username
    wUsername.addEventListener('input', function () {
      wUsername.value = wUsername.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
      wUsername.classList.remove('input-error');
    });
    wLoginId.addEventListener('input', function () {
      wLoginId.value = wLoginId.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
      wLoginId.classList.remove('input-error');
      loginError.classList.add('hidden');
    });

    // ---- Sign up ----
    let signingUp = false;
    function handleSignup() {
      if (signingUp) return;
      const name = (wName.value || '').trim();
      const username = (wUsername.value || '').trim();

      if (!name) {
        wName.focus();
        wName.classList.add('input-error');
        showToast('Please enter your name');
        return;
      }
      if (!isValidUsername(username)) {
        wUsername.focus();
        wUsername.classList.add('input-error');
        showToast('Username needs 3–20 chars with both letters & digits');
        return;
      }
      if (isUsernameTaken(username)) {
        wUsername.focus();
        wUsername.classList.add('input-error');
        showToast('Username already taken — try another');
        return;
      }
      signingUp = true;
      wName.classList.remove('input-error');
      wUsername.classList.remove('input-error');

      const token = generateToken();
      const users = loadUsers();
      users[token] = {
        name: name,
        username: username,
        profile: {
          name: name,
          bio: 'Tap a button to visit',
          avatar: initialsOf(name)
        },
        links: [],
        createdAt: Date.now()
      };
      saveUsers(users);
      setCurrentToken(token);

      showTokenModal(token, function () {
        signingUp = false;
        dismissWelcome();
        showToast('Welcome, ' + name.split(' ')[0] + '!');
      });
    }
    signupPane.addEventListener('submit', function (e) { e.preventDefault(); handleSignup(); });
    const signupBtn = signupPane.querySelector('button[type="submit"]');
    if (signupBtn) {
      signupBtn.addEventListener('click', function (e) { e.preventDefault(); handleSignup(); });
    }
    wName.addEventListener('input', function () { wName.classList.remove('input-error'); });

    // ---- Log in (username OR 2-digit token) ----
    function handleLogin() {
      const raw = (wLoginId.value || '').trim();
      if (!raw) {
        wLoginId.focus();
        wLoginId.classList.add('input-error');
        showToast('Enter your username or token');
        return;
      }
      const users = loadUsers();
      let token = '';

      // 2-digit numeric input → treat as token
      if (/^\d{2}$/.test(raw) && users[raw]) {
        token = raw;
      } else {
        // Otherwise try username lookup (case-insensitive)
        token = findTokenByUsername(raw);
      }

      if (!token || !users[token]) {
        loginError.classList.remove('hidden');
        wLoginId.classList.add('input-error');
        wLoginId.focus();
        wLoginId.select();
        return;
      }
      setCurrentToken(token);
      dismissWelcome();
      const u = users[token];
      showToast('Welcome back, ' + (u.name || 'friend').split(' ')[0] + '!');
    }
    loginPane.addEventListener('submit', function (e) { e.preventDefault(); handleLogin(); });
    const loginBtn = loginPane.querySelector('button[type="submit"]');
    if (loginBtn) {
      loginBtn.addEventListener('click', function (e) { e.preventDefault(); handleLogin(); });
    }

    function dismissWelcome() {
      screen.style.opacity = '0';
      screen.style.transition = 'opacity 0.3s';
      setTimeout(function () {
        screen.classList.add('hidden');
        screen.style.opacity = '';
        screen.style.transition = '';
        refreshUserPill();
        onDone();
      }, 280);
    }
  }

  /* ---------- Token reveal modal ---------- */
  function showTokenModal(token, onContinue) {
    const modal = document.getElementById('tokenModal');
    const display = document.getElementById('tokenDisplay');
    const copyBtn = document.getElementById('copyTokenBtn');
    const enterBtn = document.getElementById('enterAppBtn');
    if (!modal) { onContinue(); return; }

    display.textContent = token;
    modal.classList.remove('hidden');

    // Replace listeners by cloning, so re-opens don't stack
    const newCopy = copyBtn.cloneNode(true);
    copyBtn.parentNode.replaceChild(newCopy, copyBtn);
    newCopy.addEventListener('click', function () {
      copyText(token, 'Token copied!');
    });

    const newEnter = enterBtn.cloneNode(true);
    enterBtn.parentNode.replaceChild(newEnter, enterBtn);

    // 10-second countdown — user majboor ho token yaad karne ko
    let remaining = 10;
    newEnter.disabled = true;
    newEnter.textContent = 'Enter app (' + remaining + 's)';
    const timer = setInterval(function () {
      remaining -= 1;
      if (remaining > 0) {
        newEnter.textContent = 'Enter app (' + remaining + 's)';
      } else {
        clearInterval(timer);
        newEnter.disabled = false;
        newEnter.textContent = 'I have saved my token →';
      }
    }, 1000);

    newEnter.addEventListener('click', function () {
      if (newEnter.disabled) return;
      clearInterval(timer);
      modal.classList.add('hidden');
      onContinue();
    });
  }

  /* ---------- Clipboard helper ---------- */
  function copyText(text, successMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { showToast(successMsg || 'Copied!'); })
        .catch(function () { legacyCopyHelper(text, successMsg); });
    } else {
      legacyCopyHelper(text, successMsg);
    }
  }
  function legacyCopyHelper(text, successMsg) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast(successMsg || 'Copied!'); }
    catch (e) { showToast('Could not copy'); }
    document.body.removeChild(ta);
  }

  /* ---------- User pill + dropdown + logout ---------- */
  function refreshUserPill() {
    const pill = document.getElementById('userPill');
    if (!pill) return;
    const p = loadProfile();
    const token = getCurrentToken();
    pill.classList.remove('hidden');
    document.getElementById('upName').textContent = p.name;
    document.getElementById('upAvatar').textContent = p.avatar;

    const pmName = document.getElementById('pmName');
    const pmBio = document.getElementById('pmBio');
    const pmAvatar = document.getElementById('pmAvatar');
    const pmToken = document.getElementById('pmToken');
    const pmUsername = document.getElementById('pmUsername');
    const u = getCurrentUser();
    if (pmName) pmName.textContent = p.name;
    if (pmBio) pmBio.textContent = p.bio;
    if (pmAvatar) pmAvatar.textContent = p.avatar;
    if (pmToken) pmToken.textContent = token || '--';
    if (pmUsername) pmUsername.textContent = (u && u.username) ? u.username : '—';

    bindProfileMenu();
  }

  function bindProfileMenu() {
    const pill = document.getElementById('userPill');
    const menu = document.getElementById('profileMenu');
    if (!pill || !menu || pill.dataset.bound) return;
    pill.dataset.bound = '1';

    pill.addEventListener('click', function (e) {
      e.stopPropagation();
      const open = !menu.classList.contains('hidden');
      if (open) closeMenu(); else openMenu();
    });

    menu.addEventListener('click', function (e) { e.stopPropagation(); });

    document.addEventListener('click', function () { closeMenu(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });

    function openMenu() {
      menu.classList.remove('hidden');
      pill.setAttribute('aria-expanded', 'true');
    }
    function closeMenu() {
      menu.classList.add('hidden');
      pill.setAttribute('aria-expanded', 'false');
    }

    // Copy token from inside the menu
    const copyTokenBtn = document.getElementById('pmCopyToken');
    if (copyTokenBtn && !copyTokenBtn.dataset.bound) {
      copyTokenBtn.dataset.bound = '1';
      copyTokenBtn.addEventListener('click', function () {
        const t = getCurrentToken();
        if (t) copyText(t, 'Token ' + t + ' copied!');
      });
    }
  }

  function bindLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (!logoutBtn || logoutBtn.dataset.bound) return;
    logoutBtn.dataset.bound = '1';
    logoutBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      const token = getCurrentToken();
      const msg = token
        ? 'Log out? Your data stays saved — log back in with token ' + token + '.'
        : 'Log out?';
      if (!confirm(msg)) return;
      setCurrentToken('');
      location.reload();
    });
  }

  /* ============================================
     ADMIN PAGE
     ============================================ */
  function initAdmin() {
    const grid = document.getElementById('platformGrid');
    if (!grid) return;

    const search = document.getElementById('platformSearch');
    const list = document.getElementById('linkList');
    const emptyState = document.getElementById('emptyState');
    const countBadge = document.getElementById('countBadge');
    const qrEl = document.getElementById('qrcode');
    const qrPlaceholder = document.getElementById('qrPlaceholder');
    const downloadBtn = document.getElementById('downloadBtn');
    const copyBtn = document.getElementById('copyBtn');
    const openPreview = document.getElementById('openPreview');
    const saveSnapBtn = document.getElementById('saveSnapshotBtn');
    const snapList = document.getElementById('snapshotList');
    const snapEmpty = document.getElementById('snapEmpty');
    const snapCount = document.getElementById('snapCount');

    // Modal
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const form = document.getElementById('linkForm');
    const titleInput = document.getElementById('title');
    const urlInput = document.getElementById('url');
    const editIndex = document.getElementById('editIndex');
    const platformKey = document.getElementById('platformKey');
    const submitBtn = document.getElementById('submitBtn');

    let links = loadLinks();
    let profile = loadProfile();

    /* ---- Profile fields (live in the dropdown menu now) ---- */
    const pageName = document.getElementById('pageName');
    const pageBio = document.getElementById('pageBio');
    const pageAvatar = document.getElementById('pageAvatar');

    if (pageName) {
      pageName.value = profile.name || '';
      pageBio.value = (profile.bio && profile.bio !== DEFAULT_PROFILE.bio) ? profile.bio : '';
      pageAvatar.value = profile.avatar || '';
      refreshProfileUi();

      [pageName, pageBio, pageAvatar].forEach(function (el) {
        el.addEventListener('input', function () {
          profile = {
            name: pageName.value.trim() || DEFAULT_PROFILE.name,
            bio: pageBio.value.trim() || DEFAULT_PROFILE.bio,
            avatar: pageAvatar.value.trim() || DEFAULT_PROFILE.avatar
          };
          saveProfile(profile);
          refreshProfileUi();
          updateQr();
        });
      });
    }

    function refreshProfileUi() {
      const upName = document.getElementById('upName');
      const upAvatar = document.getElementById('upAvatar');
      const pmName = document.getElementById('pmName');
      const pmBio = document.getElementById('pmBio');
      const pmAvatar = document.getElementById('pmAvatar');
      if (upName) upName.textContent = profile.name;
      if (upAvatar) upAvatar.textContent = profile.avatar;
      if (pmName) pmName.textContent = profile.name;
      if (pmBio) pmBio.textContent = profile.bio;
      if (pmAvatar) pmAvatar.textContent = profile.avatar;
    }

    /* ---- Render platform grid ---- */
    function renderGrid(filter) {
      filter = (filter || '').toLowerCase().trim();
      grid.innerHTML = '';
      PLATFORMS.forEach(function (p) {
        if (filter && p.name.toLowerCase().indexOf(filter) === -1) return;
        const tile = document.createElement('button');
        tile.className = 'platform-tile brand-' + p.key;
        tile.dataset.key = p.key;
        tile.title = p.name;
        const glyphClass = p.emoji ? 'plat-emoji' : 'plat-glyph';
        tile.innerHTML =
          '<span class="' + glyphClass + '">' + escapeHtml(p.glyph) + '</span>' +
          '<span class="plat-label">' + escapeHtml(p.name) + '</span>';
        grid.appendChild(tile);
      });
    }

    /* ---- Render manage list ---- */
    function renderList() {
      list.innerHTML = '';
      links.forEach(function (link, idx) {
        const p = getPlatform(link.platform) || getPlatform('custom');
        const li = document.createElement('li');
        li.className = 'manage-item';
        const glyphClass = p.emoji ? 'plat-emoji' : '';
        li.innerHTML =
          '<div class="manage-icon brand-' + p.key + '">' +
            '<span class="' + glyphClass + '">' + escapeHtml(p.glyph) + '</span>' +
          '</div>' +
          '<div class="manage-meta">' +
            '<div class="t">' + escapeHtml(link.title) + '</div>' +
            '<div class="u">' + escapeHtml(link.url) + '</div>' +
          '</div>' +
          '<div class="row-actions">' +
            '<button class="icon-btn" data-action="edit" data-idx="' + idx + '" title="Edit">✎</button>' +
            '<button class="icon-btn danger" data-action="delete" data-idx="' + idx + '" title="Delete">✕</button>' +
          '</div>';
        list.appendChild(li);
      });
      countBadge.textContent = String(links.length);
      emptyState.classList.toggle('hidden', links.length > 0);
      updateQr();
    }

    /* ---- QR ---- */
    function updateQr() {
      const hasLinks = links.length > 0;
      if (saveSnapBtn) saveSnapBtn.disabled = !hasLinks;

      if (!hasLinks) {
        qrEl.innerHTML = '';
        qrEl.classList.remove('show');
        qrPlaceholder.classList.remove('hidden');
        downloadBtn.disabled = true;
        copyBtn.disabled = true;
        openPreview.setAttribute('aria-disabled', 'true');
        openPreview.removeAttribute('href');
        return;
      }
      const url = buildPublicUrl(links, profile);
      qrEl.innerHTML = '';
      new QRCode(qrEl, {
        text: url,
        width: 220,
        height: 220,
        colorDark: '#1b1f2a',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
      qrEl.classList.add('show');
      qrPlaceholder.classList.add('hidden');
      downloadBtn.disabled = false;
      copyBtn.disabled = false;
      openPreview.setAttribute('aria-disabled', 'false');
      openPreview.href = url;
    }

    /* ---- Snapshots (saved QR history) ---- */
    function renderSnapshots() {
      const snaps = loadSnapshots();
      snapList.innerHTML = '';
      snaps.slice().reverse().forEach(function (snap) {
        const li = document.createElement('li');
        li.className = 'snapshot-item';
        li.innerHTML =
          '<div class="snap-thumb">🔳</div>' +
          '<div class="snap-info">' +
            '<div class="snap-id">' + escapeHtml(snap.id) + '</div>' +
            '<div class="snap-sub">' +
              '<span class="chip">' + escapeHtml(formatDate(snap.createdAt)) + '</span>' +
              '<span class="chip">' + (snap.links ? snap.links.length : 0) + ' links</span>' +
            '</div>' +
          '</div>' +
          '<div class="snap-actions">' +
            '<button class="icon-btn" data-snap-action="view" data-id="' + escapeHtml(snap.id) + '" title="View QR">👁</button>' +
            '<button class="icon-btn" data-snap-action="copy" data-id="' + escapeHtml(snap.id) + '" title="Copy link">📋</button>' +
            '<button class="icon-btn danger" data-snap-action="delete" data-id="' + escapeHtml(snap.id) + '" title="Delete">✕</button>' +
          '</div>';
        snapList.appendChild(li);
      });
      snapCount.textContent = String(snaps.length);
      snapEmpty.classList.toggle('hidden', snaps.length > 0);
    }

    if (saveSnapBtn) {
      saveSnapBtn.addEventListener('click', function () {
        if (!links.length) return;
        if (!confirm('Save this QR to history and clear your current links to start a new one?')) return;

        const snaps = loadSnapshots();
        const snap = {
          id: generateSnapshotId(),
          createdAt: Date.now(),
          links: links.slice(),
          profile: Object.assign({}, profile)
        };
        snaps.push(snap);
        saveSnapshots(snaps);

        // Clear current links so user can build a fresh one
        links = [];
        saveLinks(links);
        renderList();
        renderSnapshots();
        showToast('Saved as ' + snap.id);
      });
    }

    snapList.addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-snap-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      const action = btn.dataset.snapAction;
      const snaps = loadSnapshots();
      const snap = snaps.find(function (s) { return s.id === id; });
      if (!snap) return;

      if (action === 'delete') {
        if (!confirm('Delete saved QR ' + id + '?')) return;
        saveSnapshots(snaps.filter(function (s) { return s.id !== id; }));
        renderSnapshots();
        showToast('Deleted ' + id);
      } else if (action === 'copy') {
        const url = buildPublicUrl(snap.links, snap.profile);
        copyText(url, 'Link for ' + id + ' copied!');
      } else if (action === 'view') {
        openSnapshotModal(snap);
      }
    });

    /* ---- View snapshot modal ---- */
    function openSnapshotModal(snap) {
      const m = document.getElementById('viewSnapModal');
      if (!m) return;
      const url = buildPublicUrl(snap.links, snap.profile);
      document.getElementById('snapModalTitle').textContent = snap.id;
      document.getElementById('snapModalDate').textContent = formatDate(snap.createdAt);
      document.getElementById('snapModalCount').textContent = String(snap.links.length);

      const qrBox = document.getElementById('snapQrcode');
      qrBox.innerHTML = '';
      new QRCode(qrBox, {
        text: url,
        width: 220,
        height: 220,
        colorDark: '#1b1f2a',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });

      const openBtn = document.getElementById('snapOpenBtn');
      openBtn.href = url;

      // Re-bind download / copy
      const dl = document.getElementById('snapDownloadBtn');
      const cp = document.getElementById('snapCopyBtn');
      const newDl = dl.cloneNode(true); dl.parentNode.replaceChild(newDl, dl);
      const newCp = cp.cloneNode(true); cp.parentNode.replaceChild(newCp, cp);
      newDl.addEventListener('click', function () {
        const img = qrBox.querySelector('img');
        const canvas = qrBox.querySelector('canvas');
        const dataUrl = (img && img.src) || (canvas && canvas.toDataURL('image/png')) || '';
        if (!dataUrl) { showToast('QR not ready'); return; }
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = snap.id + '.png';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        showToast('Downloaded ' + snap.id);
      });
      newCp.addEventListener('click', function () { copyText(url, 'Link copied!'); });

      m.classList.remove('hidden');
    }

    // Close handlers for snapshot modal
    document.addEventListener('click', function (e) {
      if (e.target && e.target.dataset && e.target.dataset.closeSnap === '1') {
        document.getElementById('viewSnapModal').classList.add('hidden');
      }
    });

    /* ---- Modal ---- */
    function openModal(opts) {
      opts = opts || {};
      modalTitle.textContent = opts.editing ? 'Edit link' : 'Add link';
      submitBtn.textContent = opts.editing ? 'Update' : 'Save';
      editIndex.value = (opts.idx != null) ? String(opts.idx) : '-1';
      platformKey.value = opts.platform || 'custom';

      const p = getPlatform(platformKey.value) || getPlatform('custom');
      titleInput.value = opts.title || (opts.editing ? '' : p.name);
      urlInput.value = opts.url || '';
      urlInput.placeholder = p.placeholder;

      modal.classList.remove('hidden');
      modal.setAttribute('aria-hidden', 'false');
      setTimeout(function () { titleInput.focus(); titleInput.select(); }, 50);
    }
    function closeModal() {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
      form.reset();
      editIndex.value = '-1';
      platformKey.value = '';
    }

    /* ---- Events ---- */
    grid.addEventListener('click', function (e) {
      const tile = e.target.closest('.platform-tile');
      if (!tile) return;
      openModal({ platform: tile.dataset.key });
    });

    search.addEventListener('input', function () { renderGrid(search.value); });

    list.addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const idx = parseInt(btn.dataset.idx, 10);
      const action = btn.dataset.action;
      if (action === 'delete') {
        if (!confirm('Delete this link?')) return;
        links.splice(idx, 1);
        saveLinks(links);
        renderList();
        showToast('Link deleted');
      } else if (action === 'edit') {
        const item = links[idx];
        if (!item) return;
        openModal({
          editing: true,
          idx: idx,
          platform: item.platform || 'custom',
          title: item.title,
          url: item.url
        });
      }
    });

    modal.addEventListener('click', function (e) {
      if (e.target.dataset.close === '1') closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const title = titleInput.value.trim();
      const url = normalizeUrl(urlInput.value);
      if (!title) { showToast('Please enter a title'); return; }
      if (!isValidUrl(url)) { showToast('Please enter a valid URL'); return; }

      const idx = parseInt(editIndex.value, 10);
      const entry = { title: title, url: url, platform: platformKey.value || 'custom' };
      if (idx >= 0 && links[idx]) {
        links[idx] = entry;
        showToast('Link updated');
      } else {
        links.push(entry);
        showToast('Link added');
      }
      saveLinks(links);
      closeModal();
      renderList();
    });

    downloadBtn.addEventListener('click', function () {
      const img = qrEl.querySelector('img');
      const canvas = qrEl.querySelector('canvas');
      let dataUrl = '';
      if (img && img.src) dataUrl = img.src;
      else if (canvas) dataUrl = canvas.toDataURL('image/png');
      if (!dataUrl) { showToast('QR not ready'); return; }
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'linkdrop-qr.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('QR downloaded');
    });

    copyBtn.addEventListener('click', function () {
      const url = buildPublicUrl(links, profile);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url)
          .then(function () { showToast('Link copied!'); })
          .catch(function () { fallbackCopy(url); });
      } else { fallbackCopy(url); }
    });
    function fallbackCopy(text) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); showToast('Link copied!'); }
      catch (e) { showToast('Could not copy'); }
      document.body.removeChild(ta);
    }

    renderGrid('');
    renderList();
    renderSnapshots();
  }

  /* ============================================
     PUBLIC PAGE
     ============================================ */
  function initPublic() {
    const wrap = document.getElementById('publicLinks');
    if (!wrap) return;

    const noLinks = document.getElementById('noLinks');
    const titleEl = document.getElementById('pageTitle');
    const bioEl = document.getElementById('pageBio');
    const avatarEl = document.getElementById('avatar');
    const statCount = document.getElementById('statCount');
    const shareBtn = document.getElementById('shareBtn');
    const copyBtn = document.getElementById('copyBtn');
    const statRow = document.getElementById('statRow');
    const shareRow = document.getElementById('shareRow');

    let links = [];
    let profile = Object.assign({}, DEFAULT_PROFILE);

    const hash = location.hash || '';
    const m = hash.match(/(?:^#|&)d=([^&]+)/);
    if (m && m[1]) {
      const payload = decodePayload(m[1]);
      links = payload.l;
      profile = payload.p;
    } else {
      links = loadLinks();
      profile = loadProfile();
    }

    // Render profile
    titleEl.textContent = profile.name;
    bioEl.textContent = profile.bio;
    avatarEl.innerHTML = '<span>' + escapeHtml(profile.avatar) + '</span>';
    document.title = profile.name;
    statCount.textContent = String(links.length);

    if (!links.length) {
      noLinks.classList.remove('hidden');
      if (statRow) statRow.classList.add('hidden');
      if (shareRow) shareRow.classList.add('hidden');
      return;
    }

    // Render link cards
    const frag = document.createDocumentFragment();
    links.forEach(function (link) {
      const p = getPlatform(link.platform) || getPlatform('custom');
      const a = document.createElement('a');
      a.className = 'public-link';
      a.href = link.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.innerHTML =
        '<div class="pl-icon">' + escapeHtml(p.glyph) + '</div>' +
        '<div class="pl-text">' +
          '<div class="pl-title">' + escapeHtml(link.title) + '</div>' +
          '<div class="pl-domain">' + escapeHtml(prettyDomain(link.url)) + '</div>' +
        '</div>' +
        '<div class="pl-arrow">›</div>';
      frag.appendChild(a);
    });
    wrap.appendChild(frag);

    // Share + copy
    const pageUrl = location.href;
    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        if (navigator.share) {
          navigator.share({ title: profile.name, text: profile.bio, url: pageUrl })
            .catch(function () {});
        } else {
          copyToClipboard(pageUrl, 'Link copied!');
        }
      });
    }
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        copyToClipboard(pageUrl, 'Link copied!');
      });
    }
  }

  function copyToClipboard(text, successMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { showToast(successMsg); })
        .catch(function () { legacyCopy(text, successMsg); });
    } else {
      legacyCopy(text, successMsg);
    }
  }
  function legacyCopy(text, successMsg) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast(successMsg); }
    catch (e) { showToast('Could not copy'); }
    document.body.removeChild(ta);
  }

  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    initPublic();
    initWelcome(function () { initAdmin(); });
  });
})();
