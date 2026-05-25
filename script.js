/* ============================================
   LinkDrop — Vanilla JS
   - Admin page (index.html): manage links, generate QR
   - Public page (links.html): render shared links
   - Data lives in localStorage AND is embedded in the
     QR URL hash so the public page works on any device
   ============================================ */

(function () {
  'use strict';

  const STORAGE_KEY = 'linkdrop.links';
  const THEME_KEY = 'linkdrop.theme';

  /* ---------- Theme toggle (both pages) ---------- */
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

  /* ---------- Storage helpers ---------- */
  function loadLinks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }
  function saveLinks(links) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  }

  /* ---------- URL helpers ----------
     We encode the link list as base64 JSON in the URL hash
     so a scanned QR can render the page anywhere without
     a backend. */
  function encodeLinks(links) {
    const json = JSON.stringify(links);
    // Use encodeURIComponent so unicode survives btoa
    return btoa(unescape(encodeURIComponent(json)));
  }
  function decodeLinks(encoded) {
    try {
      const json = decodeURIComponent(escape(atob(encoded)));
      const arr = JSON.parse(json);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }
  function buildPublicUrl(links) {
    // Build absolute URL to links.html with data in hash
    const base = location.href.replace(/[^/]*$/, '') + 'links.html';
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

  /* ============================================
     ADMIN PAGE (index.html)
     ============================================ */
  function initAdmin() {
    const form = document.getElementById('linkForm');
    if (!form) return; // not on admin page

    const titleInput = document.getElementById('title');
    const urlInput = document.getElementById('url');
    const editIndex = document.getElementById('editIndex');
    const submitBtn = document.getElementById('submitBtn');
    const cancelEdit = document.getElementById('cancelEdit');
    const list = document.getElementById('linkList');
    const emptyState = document.getElementById('emptyState');
    const countBadge = document.getElementById('countBadge');
    const qrEl = document.getElementById('qrcode');
    const qrPlaceholder = document.getElementById('qrPlaceholder');
    const downloadBtn = document.getElementById('downloadBtn');
    const copyBtn = document.getElementById('copyBtn');
    const openPreview = document.getElementById('openPreview');

    let links = loadLinks();
    let qr = null;

    function render() {
      // List
      list.innerHTML = '';
      links.forEach(function (link, idx) {
        const li = document.createElement('li');
        li.className = 'link-item';
        const initial = (link.title || '?').charAt(0).toUpperCase();
        li.innerHTML =
          '<div class="link-icon">' + escapeHtml(initial) + '</div>' +
          '<div class="link-meta">' +
            '<div class="t">' + escapeHtml(link.title) + '</div>' +
            '<div class="u">' + escapeHtml(link.url) + '</div>' +
          '</div>' +
          '<button class="icon-btn" data-action="edit" data-idx="' + idx + '" title="Edit">✎</button>' +
          '<button class="icon-btn danger" data-action="delete" data-idx="' + idx + '" title="Delete">✕</button>';
        list.appendChild(li);
      });

      countBadge.textContent = String(links.length);
      emptyState.classList.toggle('hidden', links.length > 0);

      // QR
      updateQr();
    }

    function updateQr() {
      if (links.length === 0) {
        qrEl.innerHTML = '';
        qrEl.classList.remove('show');
        qrPlaceholder.classList.remove('hidden');
        downloadBtn.disabled = true;
        copyBtn.disabled = true;
        openPreview.setAttribute('aria-disabled', 'true');
        openPreview.removeAttribute('href');
        qr = null;
        return;
      }

      const url = buildPublicUrl(links);
      qrEl.innerHTML = '';
      qr = new QRCode(qrEl, {
        text: url,
        width: 220,
        height: 220,
        colorDark: '#1f1d1b',
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

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    function resetForm() {
      form.reset();
      editIndex.value = '-1';
      submitBtn.querySelector('span').textContent = 'Add link';
      cancelEdit.classList.add('hidden');
    }

    /* ---- Form submit (add or update) ---- */
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const title = titleInput.value.trim();
      const url = normalizeUrl(urlInput.value);

      if (!title) { showToast('Please enter a title'); return; }
      if (!isValidUrl(url)) { showToast('Please enter a valid URL'); return; }

      const idx = parseInt(editIndex.value, 10);
      if (idx >= 0 && links[idx]) {
        links[idx] = { title: title, url: url };
        showToast('Link updated');
      } else {
        links.push({ title: title, url: url });
        showToast('Link added');
      }
      saveLinks(links);
      resetForm();
      render();
    });

    cancelEdit.addEventListener('click', resetForm);

    /* ---- List click (edit / delete) ---- */
    list.addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const idx = parseInt(btn.dataset.idx, 10);
      const action = btn.dataset.action;

      if (action === 'delete') {
        if (!confirm('Delete this link?')) return;
        links.splice(idx, 1);
        saveLinks(links);
        render();
        showToast('Link deleted');
      } else if (action === 'edit') {
        const item = links[idx];
        if (!item) return;
        titleInput.value = item.title;
        urlInput.value = item.url;
        editIndex.value = String(idx);
        submitBtn.querySelector('span').textContent = 'Update link';
        cancelEdit.classList.remove('hidden');
        titleInput.focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });

    /* ---- Download QR ---- */
    downloadBtn.addEventListener('click', function () {
      const img = qrEl.querySelector('img');
      const canvas = qrEl.querySelector('canvas');
      let dataUrl = '';

      if (img && img.src) {
        dataUrl = img.src;
      } else if (canvas) {
        dataUrl = canvas.toDataURL('image/png');
      }
      if (!dataUrl) { showToast('QR not ready'); return; }

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'linkdrop-qr.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('QR downloaded');
    });

    /* ---- Copy page link ---- */
    copyBtn.addEventListener('click', function () {
      const url = buildPublicUrl(links);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url)
          .then(function () { showToast('Link copied!'); })
          .catch(function () { fallbackCopy(url); });
      } else {
        fallbackCopy(url);
      }
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

    render();
  }

  /* ============================================
     PUBLIC PAGE (links.html)
     ============================================ */
  function initPublic() {
    const wrap = document.getElementById('publicLinks');
    if (!wrap) return; // not on public page

    const noLinks = document.getElementById('noLinks');
    let links = [];

    // Prefer data from URL hash (came from QR / shared link)
    const hash = location.hash || '';
    const m = hash.match(/(?:^#|&)d=([^&]+)/);
    if (m && m[1]) {
      links = decodeLinks(m[1]);
    } else {
      // Fallback to localStorage (same browser as admin)
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

  /* ---------- Boot ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    initAdmin();
    initPublic();
  });
})();
