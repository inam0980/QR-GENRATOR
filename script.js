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
    for (let i = 0; i < 200; i++) {
      const t = String(Math.floor(1000 + Math.random() * 9000));
      if (!users[t]) return t;
    }
    // Extremely unlikely: 9000 slots exhausted
    return String(Date.now()).slice(-4);
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
      const token = String(Math.floor(1000 + Math.random() * 9000));
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
    const wToken = document.getElementById('wToken');
    const loginError = document.getElementById('loginError');

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.toggle('active', t === tab); });
        const which = tab.dataset.tab;
        signupPane.classList.toggle('hidden', which !== 'signup');
        loginPane.classList.toggle('hidden', which !== 'login');
        loginError.classList.add('hidden');
        setTimeout(function () {
          (which === 'signup' ? wName : wToken).focus();
        }, 50);
      });
    });

    setTimeout(function () { wName.focus(); }, 100);

    // Token input — digits only
    wToken.addEventListener('input', function () {
      wToken.value = wToken.value.replace(/\D/g, '').slice(0, 4);
      loginError.classList.add('hidden');
    });

    // ---- Sign up ----
    signupPane.addEventListener('submit', function (e) {
      e.preventDefault();
      const name = wName.value.trim();
      if (!name) { wName.focus(); return; }

      const token = generateToken();
      const users = loadUsers();
      users[token] = {
        name: name,
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
        dismissWelcome();
        showToast('Welcome, ' + name.split(' ')[0] + '!');
      });
    });

    // ---- Log in ----
    loginPane.addEventListener('submit', function (e) {
      e.preventDefault();
      const token = wToken.value.trim();
      if (!/^\d{4}$/.test(token)) { wToken.focus(); return; }

      const users = loadUsers();
      if (!users[token]) {
        loginError.classList.remove('hidden');
        wToken.focus();
        wToken.select();
        return;
      }
      setCurrentToken(token);
      dismissWelcome();
      const u = users[token];
      showToast('Welcome back, ' + (u.name || 'friend').split(' ')[0] + '!');
    });

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
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(token).then(function () { showToast('Token copied!'); });
      } else {
        const ta = document.createElement('textarea');
        ta.value = token; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); showToast('Token copied!'); } catch (e) {}
        document.body.removeChild(ta);
      }
    });

    const newEnter = enterBtn.cloneNode(true);
    enterBtn.parentNode.replaceChild(newEnter, enterBtn);
    newEnter.addEventListener('click', function () {
      modal.classList.add('hidden');
      onContinue();
    });
  }

  /* ---------- User pill + logout ---------- */
  function refreshUserPill() {
    const pill = document.getElementById('userPill');
    if (!pill) return;
    const p = loadProfile();
    const token = getCurrentToken();
    pill.classList.remove('hidden');
    document.getElementById('upName').textContent = p.name;
    document.getElementById('upAvatar').textContent = p.avatar;
    pill.title = token ? ('Token: ' + token) : '';
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

    /* ---- Profile fields ---- */
    const pageName = document.getElementById('pageName');
    const pageBio = document.getElementById('pageBio');
    const pageAvatar = document.getElementById('pageAvatar');
    const namePreview = document.getElementById('namePreview');
    const bioPreview = document.getElementById('bioPreview');
    const avatarPreview = document.getElementById('avatarPreview');

    if (pageName) {
      pageName.value = profile.name === DEFAULT_PROFILE.name ? '' : profile.name;
      pageBio.value = profile.bio === DEFAULT_PROFILE.bio ? '' : profile.bio;
      pageAvatar.value = profile.avatar === DEFAULT_PROFILE.avatar ? '' : profile.avatar;
      refreshProfilePreview();

      [pageName, pageBio, pageAvatar].forEach(function (el) {
        el.addEventListener('input', function () {
          profile = {
            name: pageName.value.trim() || DEFAULT_PROFILE.name,
            bio: pageBio.value.trim() || DEFAULT_PROFILE.bio,
            avatar: pageAvatar.value.trim() || DEFAULT_PROFILE.avatar
          };
          saveProfile(profile);
          refreshProfilePreview();
          updateQr();
        });
      });
    }

    function refreshProfilePreview() {
      namePreview.textContent = profile.name;
      bioPreview.textContent = profile.bio;
      avatarPreview.textContent = profile.avatar;
      // Keep header pill in sync
      const upName = document.getElementById('upName');
      const upAvatar = document.getElementById('upAvatar');
      if (upName) upName.textContent = profile.name;
      if (upAvatar) upAvatar.textContent = profile.avatar;
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
      if (links.length === 0) {
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
