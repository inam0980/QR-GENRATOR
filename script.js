/* ============================================
   LinkDrop — Vanilla JS
   QR Tiger style UI: platform tiles + manage list
   - Admin page (index.html): pick platform, fill modal, generate QR
   - Public page (links.html): render shared links
   - Storage: localStorage + URL hash (so QR works anywhere)
   ============================================ */

(function () {
  'use strict';

  const STORAGE_KEY = 'linkdrop.links';
  const THEME_KEY = 'linkdrop.theme';

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

  /* ---------- Storage ---------- */
  function loadLinks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveLinks(links) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  }

  /* ---------- URL encoding for QR ---------- */
  function encodeLinks(links) {
    const json = JSON.stringify(links);
    return btoa(unescape(encodeURIComponent(json)));
  }
  function decodeLinks(encoded) {
    try {
      const json = decodeURIComponent(escape(atob(encoded)));
      const arr = JSON.parse(json);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function buildPublicUrl(links) {
    const base = location.href.replace(/[^/]*(?:\?.*)?(?:#.*)?$/, '') + 'links.html';
    return base + '#d=' + encodeLinks(links);
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
      const url = buildPublicUrl(links);
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
      const url = buildPublicUrl(links);
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
    let links = [];

    const hash = location.hash || '';
    const m = hash.match(/(?:^#|&)d=([^&]+)/);
    if (m && m[1]) {
      links = decodeLinks(m[1]);
    } else {
      links = loadLinks();
    }

    if (!links.length) {
      noLinks.classList.remove('hidden');
      return;
    }

    const frag = document.createDocumentFragment();
    links.forEach(function (link) {
      const a = document.createElement('a');
      a.className = 'public-link';
      a.href = link.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      const span = document.createElement('span');
      span.textContent = link.title;
      a.appendChild(span);
      frag.appendChild(a);
    });
    wrap.appendChild(frag);
  }

  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    initAdmin();
    initPublic();
  });
})();
