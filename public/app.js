/* NEXpay – Kassasystem by Andrerer */
'use strict';
(() => {
  // =============================================================== Hilfsfunktionen
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
  const EUR = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' });
  const NUM2 = new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const QTY = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 3 });
  const money = (c) => EUR.format((Number(c) || 0) / 100);
  const plain = (c) => NUM2.format((Number(c) || 0) / 100);
  const fmtQty = (q) => QTY.format(Number(q) || 0);
  // „12,50“ / „12.5“ / „1.234,50“ → Cent; ungültig → null
  const parseMoney = (v) => {
    let s = String(v ?? '').trim().replace(/\s|€/g, '');
    if (!s) return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  };
  const parseNum = (v) => {
    let s = String(v ?? '').trim().replace(/\s/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  const centsInput = (c) => (c == null ? '' : NUM2.format(c / 100).replace(/\./g, ''));
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => isoDate(new Date());
  const addDays = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return isoDate(d); };
  const fmtDate = (t) => new Date(t).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const fmtTime = (t) => new Date(t).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
  const fmtDT = (t) => `${fmtDate(t)} ${fmtTime(t)}`;
  const initials = (n) => String(n || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const sum = (arr, f) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const safeLS = {
    get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* egal */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* egal */ } },
  };
  const lineTotal = (l) => Math.round(l.qty * l.price) - (l.discount || 0);

  // =============================================================== Konstanten
  const VATS = [20, 13, 10, 0];
  const METHODS = { cash: 'Bar', card: 'Karte', other: 'Sonstige' };
  const COLORS = {
    emerald: '#10b981', teal: '#14b8a6', sky: '#0ea5e9', indigo: '#6366f1', violet: '#8b5cf6',
    rose: '#f43f5e', orange: '#f97316', amber: '#f59e0b', lime: '#84cc16', slate: '#64748b',
  };
  const DENOMS = [50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

  const I = {
    pos: '<rect x="3" y="3" width="18" height="12" rx="2"/><path d="M7 21h10M12 15v6M7 8h4"/>',
    receipt: '<path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 1 1V2l-1 1-3-2-3 2-3-2-3 2-3-2z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
    gift: '<path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    zap: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    arrowDown: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    percent: '<path d="M19 5L5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    graduation: '<path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>',
    layers: '<path d="M12 2l10 5-10 5L2 7z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
    wifiOff: '<path d="M1 1l22 22M16.7 11.1A10.9 10.9 0 0 1 19 12.5M5 12.5a10.9 10.9 0 0 1 5.2-2.4M10.7 5A16 16 0 0 1 22.6 9M1.4 9a16 16 0 0 1 4.7-2.9M8.5 16.1a5 5 0 0 1 7 0M12 20h.01"/>',
    bag: '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>',
  };
  const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[n] || ''}</svg>`;

  // =============================================================== Zustand
  const S = {
    user: null, org: null, members: [],
    registers: [], categories: [], products: [],
    registerId: null, online: navigator.onLine, rev: 0,
  };
  const UI = {
    route: 'kasse', cat: 'all', q: '', cart: [], training: false, cartOpen: false,
    lastReceipt: null, setTab: 'firma',
    belege: { from: today(), to: today(), kind: 'all', q: '' },
    report: { preset: 'today', from: today(), to: today() },
  };
  const isAdmin = () => S.user?.role === 'admin';
  const setting = (k, d = '') => (S.org?.settings && S.org.settings[k] !== undefined ? S.org.settings[k] : d);
  const register = () => S.registers.find((r) => r.id === S.registerId) || S.registers[0] || null;
  const catOf = (id) => S.categories.find((c) => c.id === id);
  const colorOf = (cat) => COLORS[cat?.color] || COLORS.emerald;

  // =============================================================== Supabase
  const CFG = window.NEXPAY_CONFIG || {};
  const sb = CFG.supabaseUrl && CFG.supabaseKey && window.supabase
    ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'nexpay-auth' },
    })
    : null;
  const appBase = () => `${location.origin}${location.pathname.replace(/[^/]*$/, '')}`;
  const isNetworkMsg = (m) => /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(String(m || ''));
  const netError = () => Object.assign(new Error('Keine Verbindung zum Server. Bitte Internetverbindung prüfen.'), { offline: true });

  function wrapError(error, status) {
    const msg = error?.message || 'Unbekannter Fehler';
    if (isNetworkMsg(msg) || status === 0) return netError();
    if (msg === 'NO_ORG') return Object.assign(new Error('Du gehörst keiner Organisation mehr an.'), { noOrg: true });
    if (error?.code === 'PGRST202' || /could not find the function|relation .* does not exist|schema cache/i.test(msg)) {
      return new Error('Die Datenbank ist noch nicht eingerichtet (GitHub-Workflow „Supabase-Datenbank“).');
    }
    return Object.assign(new Error(msg), { status: status === 401 || /jwt/i.test(msg) ? 401 : status });
  }
  async function rpc(fn, args = {}) {
    if (!navigator.onLine) throw netError();
    let res;
    try { res = await sb.rpc(fn, args); } catch { throw netError(); }
    if (res.error) throw handleAuthError(wrapError(res.error, res.status));
    return res.data;
  }
  // Alle Zeilen einer Abfrage holen (PostgREST liefert höchstens 1000 je Anfrage)
  async function fetchAll(table, build, orderCol = 'created_at', asc = false) {
    if (!navigator.onLine) throw netError();
    const out = [];
    for (let from = 0; ; from += 1000) {
      let q = sb.from(table).select('*');
      if (build) q = build(q);
      q = q.order(orderCol, { ascending: asc }).range(from, from + 999);
      let res;
      try { res = await q; } catch { throw netError(); }
      if (res.error) throw handleAuthError(wrapError(res.error, res.status));
      out.push(...res.data);
      if (res.data.length < 1000 || out.length >= 20000) return out;
    }
  }
  function handleAuthError(err) {
    if (err.noOrg) setTimeout(loadMe, 0);
    if (err.status === 401) setTimeout(sessionExpired, 0);
    return err;
  }

  // =============================================================== UI-Bausteine
  function toast(msg, type = 'ok') {
    const el = document.createElement('div');
    el.className = `toast ${type === 'err' ? 'err' : ''}`;
    el.innerHTML = `${icon(type === 'err' ? 'alert' : 'check')}<span>${esc(msg)}</span>`;
    $('#toast-root').append(el);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, type === 'err' ? 5200 : 2600);
  }
  const fail = (e) => toast(e?.message || String(e), 'err');

  // Modal: Inhalt ist immer ein <form>; onSubmit(daten, close, form)
  const modals = [];
  function modal({ title, body, foot, size = '', onSubmit, onOpen, onClose, dismissable = true }) {
    const wrap = document.createElement('div');
    wrap.className = 'backdrop';
    wrap.innerHTML = `<form class="modal ${size}" novalidate>
      ${title ? `<div class="modal-h"><h2>${title}</h2><button type="button" class="btn ghost icon sm" data-close aria-label="Schließen">${icon('x')}</button></div>` : ''}
      <div class="modal-b">${body}</div>
      ${foot ? `<div class="modal-f">${foot}</div>` : ''}
    </form>`;
    const form = $('form', wrap);
    const m = { el: wrap, form, closed: false };
    const close = (v) => {
      if (m.closed) return;
      m.closed = true;
      wrap.remove();
      modals.splice(modals.indexOf(m), 1);
      onClose?.(v);
    };
    m.close = close;
    m.dismissable = dismissable;
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap && dismissable) close(); });
    wrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!onSubmit) return close();
      const btn = e.submitter || $('button[type=submit]', form);
      const data = Object.fromEntries(new FormData(form));
      $$('input[type=checkbox][name]', form).forEach((c) => { data[c.name] = c.checked; });
      btn?.classList.add('busy');
      try { await onSubmit(data, close, form, btn); } catch (err) { showFormError(form, err); } finally { btn?.classList.remove('busy'); }
    });
    $('#modal-root').append(wrap);
    modals.push(m);
    onOpen?.(form, close);
    const first = $('[autofocus]', form) || $('input:not([type=hidden]):not([readonly]), select, textarea', form);
    if (first && matchMedia('(pointer: fine)').matches) setTimeout(() => { first.focus(); first.select?.(); }, 20);
    return m;
  }
  function showFormError(form, err) {
    let box = $('.form-error', form);
    if (!box) {
      box = document.createElement('div');
      box.className = 'form-error';
      ($('.modal-b', form) || form).prepend(box);
    }
    box.textContent = err?.message || String(err);
  }
  function confirmBox(text, { title = 'Bist du sicher?', ok = 'Bestätigen', danger = false } = {}) {
    return new Promise((resolve) => {
      let result = false;
      modal({
        title, size: 'narrow',
        body: `<p>${text}</p>`,
        foot: `<button type="button" class="btn" data-close>Abbrechen</button><button type="submit" class="btn ${danger ? 'danger solid' : 'primary'}">${esc(ok)}</button>`,
        onSubmit: (_, close) => { result = true; close(); },
        onClose: () => resolve(result),
      });
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modals.length) {
      const m = modals[modals.length - 1];
      if (m.dismissable) m.close();
    }
  });
  async function busy(btn, fn) {
    btn?.classList.add('busy');
    try { return await fn(); } catch (e) { fail(e); return undefined; } finally { btn?.classList.remove('busy'); }
  }

  // =============================================================== Darstellung
  function applyTheme() {
    const t = safeLS.get('nexpay:theme', 'system');
    const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    $('meta[name=theme-color]')?.setAttribute('content', dark ? '#03150f' : '#022c22');
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  // =============================================================== Anmeldung
  function renderAuth(mode = 'login', notice = '') {
    const modes = {
      login: { h: 'Willkommen zurück', sub: 'Melde dich mit deinem Andrerer-Konto an. Konten von NEXCOUNT funktionieren auch hier.', btn: 'Anmelden' },
      register: { h: 'Konto erstellen', sub: 'In zwei Minuten bereit zum Kassieren – kostenlos testen.', btn: 'Konto erstellen' },
      forgot: { h: 'Passwort vergessen', sub: 'Wir schicken dir einen Link, mit dem du ein neues Passwort setzen kannst.', btn: 'Link senden' },
    };
    const m = modes[mode];
    $('#app').innerHTML = `<div class="auth">
      <aside class="auth-brand">
        <div class="logo-row"><img src="icon.svg" alt=""><div class="word">NEXpay<small>by Andrerer</small></div></div>
        <h1>Die Kassa, die mit deinem <em>Geschäft</em> wächst.</h1>
        <p class="lead">Kassieren am Tablet, PC oder Handy – mit Tagesabschluss, Kassensturz und lückenloser Belegkette. Gemacht für Österreich.</p>
        <ul>
          <li><span>${icon('zap')}</span>Schnell kassieren mit Artikelkacheln und Rückgeldrechner</li>
          <li><span>${icon('lock')}</span>Tagesabschluss und Kassensturz auf Knopfdruck</li>
          <li><span>${icon('shield')}</span>Belege fortlaufend nummeriert und verkettet</li>
          <li><span>${icon('users')}</span>Team mit Rollen – Administrator und Kassier</li>
        </ul>
        <div class="foot">© ${new Date().getFullYear()} Andrerer · NEXpay</div>
      </aside>
      <main class="auth-panel"><div class="auth-card">
        <img class="mobile-logo" src="logo.svg" alt="NEXpay by Andrerer" data-logo>
        <h2>${m.h}</h2><p class="sub">${m.sub}</p>
        <form id="auth-form" novalidate>
          ${notice ? `<div class="${/ungültig|abgelaufen|fehl/i.test(notice) ? 'form-error' : 'form-ok'}">${esc(notice)}</div>` : ''}
          ${mode === 'register' ? '<label class="field"><span>Dein Name</span><input class="input" name="name" autocomplete="name" required maxlength="80"></label>' : ''}
          <label class="field"><span>E-Mail-Adresse</span><input class="input" name="email" type="email" autocomplete="email" required></label>
          ${mode !== 'forgot' ? `<label class="field"><span>Passwort</span><input class="input" name="password" type="password" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}" required minlength="${mode === 'register' ? 8 : 1}">${mode === 'register' ? '<small>Mindestens 8 Zeichen</small>' : ''}</label>` : ''}
          <button class="btn primary lg block" type="submit">${m.btn}</button>
          ${mode === 'login' ? '<div class="auth-switch"><button type="button" data-auth="forgot">Passwort vergessen?</button></div>' : ''}
        </form>
        <div class="auth-switch">${mode === 'login'
    ? 'Noch kein Konto? <button type="button" data-auth="register">Jetzt registrieren</button>'
    : 'Bereits registriert? <button type="button" data-auth="login">Zur Anmeldung</button>'}</div>
      </div></main></div>`;
    themeLogos();
    $$('[data-auth]').forEach((b) => b.addEventListener('click', () => renderAuth(b.dataset.auth)));
    const form = $('#auth-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(form));
      const email = String(fd.email || '').trim().toLowerCase();
      const btn = $('button[type=submit]', form);
      const err = (msg) => { $('.form-error, .form-ok', form)?.remove(); const d = document.createElement('div'); d.className = 'form-error'; d.textContent = msg; form.prepend(d); };
      if (!/^\S+@\S+\.\S+$/.test(email)) return err('Bitte gib eine gültige E-Mail-Adresse an.');
      if (mode === 'register' && String(fd.password).length < 8) return err('Das Passwort muss mindestens 8 Zeichen haben.');
      if (mode === 'register' && !String(fd.name || '').trim()) return err('Bitte gib deinen Namen an.');
      btn.classList.add('busy');
      try {
        if (mode === 'forgot') {
          const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: appBase() });
          if (error) throw error;
          return renderAuth('login', 'Falls ein Konto existiert, ist der Link unterwegs. Bitte prüfe dein Postfach.');
        }
        if (mode === 'register') {
          const { data, error } = await sb.auth.signUp({ email, password: fd.password, options: { data: { name: String(fd.name).trim() }, emailRedirectTo: appBase() } });
          if (error) throw error;
          if (!data.session) return renderAuth('login', 'Fast geschafft! Bitte bestätige deine E-Mail-Adresse über den Link, den wir dir geschickt haben.');
          return loadMe();
        }
        const { error } = await sb.auth.signInWithPassword({ email, password: fd.password });
        if (error) throw error;
        await loadMe();
      } catch (ex) {
        const msg = String(ex.message || ex);
        err(/invalid login/i.test(msg) ? 'E-Mail-Adresse oder Passwort ist falsch.'
          : /email not confirmed/i.test(msg) ? 'Bitte bestätige zuerst deine E-Mail-Adresse.'
            : /already registered/i.test(msg) ? 'Für diese E-Mail-Adresse gibt es bereits ein Konto – melde dich einfach an.'
              : isNetworkMsg(msg) ? 'Keine Verbindung zum Server.' : msg);
      } finally { btn.classList.remove('busy'); }
    });
  }

  function openNewPassword() {
    modal({
      title: 'Neues Passwort festlegen', size: 'narrow', dismissable: false,
      body: '<label class="field"><span>Neues Passwort</span><input class="input" type="password" name="password" minlength="8" autocomplete="new-password" required><small>Mindestens 8 Zeichen</small></label>',
      foot: '<button type="submit" class="btn primary">Passwort speichern</button>',
      onSubmit: async (fd, close) => {
        if (String(fd.password).length < 8) throw new Error('Das Passwort muss mindestens 8 Zeichen haben.');
        const { error } = await sb.auth.updateUser({ password: fd.password });
        if (error) throw error;
        close();
        toast('Passwort geändert.');
        loadMe();
      },
    });
  }

  function sessionExpired() {
    if (!S.user) return;
    resetState();
    renderAuth('login', 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.');
  }
  function resetState() {
    unsubscribe();
    Object.assign(S, { user: null, org: null, members: [], registers: [], categories: [], products: [], registerId: null });
    UI.cart = [];
    modals.slice().forEach((m) => m.close());
  }
  async function signOut() {
    resetState();
    try { await sb.auth.signOut({ scope: 'local' }); } catch { /* egal */ }
    renderAuth('login');
  }

  // =============================================================== Profil, Organisation, Stammdaten laden
  async function loadMe() {
    let me;
    try { me = await rpc('pay_me'); } catch (e) {
      if (e.status === 401) return;
      $('#app').innerHTML = `<div class="onboard"><div class="card card-b" style="max-width:460px"><div class="stack">
        <h2>NEXpay kann nicht starten</h2><p class="muted">${esc(e.message)}</p>
        <div class="row"><button class="btn primary" id="retry">${icon('refresh')} Erneut versuchen</button><button class="btn ghost" id="out">Abmelden</button></div></div></div></div>`;
      $('#retry').onclick = loadMe;
      $('#out').onclick = signOut;
      return;
    }
    S.user = me.user;
    S.members = me.members || [];
    if (!me.org) { S.org = null; unsubscribe(); return renderOnboarding(); }
    const orgChanged = S.org?.id !== me.org.id;
    S.org = me.org;
    S.rev = me.org.rev;
    if (orgChanged) {
      UI.cart = safeLS.get(`nexpay:cart:${S.org.id}`, []) || [];
      UI.training = false;
    }
    await loadMaster();
    subscribe();
    renderShell();
  }
  async function loadMaster() {
    const [regs, cats, prods] = await Promise.all([
      fetchAll('pay_registers', null, 'created_at', true),
      fetchAll('pay_categories', null, 'sort', true),
      fetchAll('pay_products', null, 'sort', true),
    ]);
    S.registers = regs;
    S.categories = cats;
    S.products = prods;
    const saved = safeLS.get(`nexpay:register:${S.org.id}`);
    S.registerId = regs.some((r) => r.id === saved) ? saved : regs[0]?.id || null;
  }

  // Live-Updates: jede Änderung erhöht pay_orgs.rev
  let channel = null;
  function subscribe() {
    if (channel || !S.org) return;
    const id = S.org.id;
    channel = sb.channel(`nexpay-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pay_orgs', filter: `id=eq.${id}` }, (p) => {
        if (p.new && p.new.rev !== S.rev) remoteChange();
      })
      .subscribe();
  }
  function unsubscribe() {
    if (channel) { sb.removeChannel(channel); channel = null; }
  }
  const remoteChange = debounce(async () => {
    if (!S.org) return;
    try {
      const me = await rpc('pay_me');
      if (!me.org || me.org.id !== S.org.id) return loadMe();
      S.user = me.user; S.members = me.members || []; S.org = me.org; S.rev = me.org.rev;
      await loadMaster();
      if (modals.length) { refreshChrome(); return; }
      renderView();
    } catch { /* nächstes Signal */ }
  }, 500);

  // =============================================================== Einrichtung (ohne Organisation)
  function renderOnboarding() {
    const name = S.user?.name || '';
    $('#app').innerHTML = `<div class="onboard"><div class="onboard-inner">
      <div class="onboard-head"><img src="icon.svg" alt=""><div><h1>Willkommen bei NEXpay${name ? `, ${esc(name.split(' ')[0])}` : ''}!</h1>
        <p class="muted">Lege dein Unternehmen an oder tritt dem Team einer bestehenden Kassa bei.</p></div>
        <span class="spacer"></span><button class="btn ghost" id="ob-out">${icon('logout')} Abmelden</button></div>
      <div class="choice">
        <form class="card" id="ob-create"><div class="card-b">
          <div class="ic">${icon('building')}</div>
          <div><h2>Neues Unternehmen</h2><p class="muted small">Du wirst Administrator und kannst später Kassiere einladen.</p></div>
          <label class="field"><span>Name des Geschäfts</span><input class="input" name="org" required maxlength="120" placeholder="z. B. Café Sonnenschein"></label>
          <label class="field"><span>Dein Name</span><input class="input" name="name" maxlength="80" value="${esc(name)}"></label>
          <label class="check"><input type="checkbox" name="demo" checked><span><b>Beispielartikel anlegen</b><span class="muted small">Getränke, Speisen und Shop-Artikel zum Ausprobieren – jederzeit löschbar.</span></span></label>
          <button class="btn primary lg block" type="submit">Unternehmen anlegen</button>
        </div></form>
        <form class="card" id="ob-join"><div class="card-b">
          <div class="ic">${icon('users')}</div>
          <div><h2>Einem Team beitreten</h2><p class="muted small">Den Einladungscode findet der Administrator unter Einstellungen → Team.</p></div>
          <label class="field"><span>Einladungscode</span><input class="input mono" name="code" required maxlength="20" placeholder="z. B. 7F3A9C21BD" style="text-transform:uppercase;letter-spacing:.1em"></label>
          <label class="field"><span>Dein Name</span><input class="input" name="name" maxlength="80" value="${esc(name)}"></label>
          <button class="btn lg block" type="submit">Beitreten</button>
        </div></form>
      </div></div></div>`;
    $('#ob-out').onclick = signOut;
    const handle = (id, fn) => {
      const f = $(id);
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(f));
        fd.demo = $('[name=demo]', f)?.checked;
        const btn = $('button[type=submit]', f);
        btn.classList.add('busy');
        try { await fn(fd); await loadMe(); } catch (ex) { showFormError(f, ex); } finally { btn.classList.remove('busy'); }
      });
    };
    handle('#ob-create', (fd) => {
      if (!String(fd.org).trim()) throw new Error('Bitte gib den Namen deines Geschäfts an.');
      return rpc('pay_create_org', { p_name: fd.org, p_user_name: fd.name, p_demo: !!fd.demo });
    });
    handle('#ob-join', (fd) => rpc('pay_join_org', { p_code: fd.code, p_user_name: fd.name }));
  }

  // =============================================================== App-Rahmen
  const VIEWS = {
    kasse: { label: 'Kasse', icon: 'pos', render: () => viewPos() },
    belege: { label: 'Belege', icon: 'receipt', render: () => viewReceipts() },
    abschluss: { label: 'Abschluss', icon: 'lock', render: () => viewClosing() },
    artikel: { label: 'Artikel', icon: 'tag', render: () => viewProducts() },
    berichte: { label: 'Berichte', icon: 'chart', render: () => viewReports() },
    einstellungen: { label: 'Einstellungen', icon: 'settings', render: () => viewSettings() },
  };
  const TABBAR = ['kasse', 'belege', 'abschluss', 'artikel', 'einstellungen'];

  function themeLogos() {
    const dark = document.documentElement.dataset.theme === 'dark';
    $$('[data-logo]').forEach((img) => { img.src = dark ? 'logo-dark.svg' : 'logo.svg'; });
  }

  function renderShell() {
    const r = (location.hash.match(/^#\/(\w+)/) || [])[1];
    if (VIEWS[r]) UI.route = r;
    $('#app').innerHTML = `<div class="shell">
      <aside class="side">
        <div class="brand"><img src="icon.svg" alt=""><div><b>NEXpay</b><small>by Andrerer</small></div></div>
        <div class="org" id="side-org"></div>
        <nav class="nav">${Object.entries(VIEWS).map(([k, v]) => `<a href="#/${k}" data-route="${k}">${icon(v.icon)}${v.label}</a>`).join('')}</nav>
        <div class="bottom">
          <button class="btn ghost sm" id="theme-btn" style="justify-content:flex-start"></button>
          <div class="me" id="side-me"></div>
        </div>
      </aside>
      <div class="main">
        <div id="bars"></div>
        <header class="top" id="top"></header>
        <main id="view"></main>
      </div>
      <nav class="tabbar">${TABBAR.map((k) => `<a href="#/${k}" data-route="${k}">${icon(VIEWS[k].icon)}${VIEWS[k].label}</a>`).join('')}</nav>
    </div>`;
    $('#theme-btn').onclick = () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      safeLS.set('nexpay:theme', next);
      applyTheme(); refreshChrome(); themeLogos();
    };
    renderView();
  }

  function refreshChrome() {
    const reg = register();
    $('#side-org') && ($('#side-org').innerHTML = `<b title="${esc(S.org.name)}">${esc(S.org.name)}</b><span>${esc(reg ? `${reg.name} · ${reg.code}` : 'Keine Kassa')}</span>`);
    $('#side-me') && ($('#side-me').innerHTML = `<div class="avatar">${esc(initials(S.user.name))}</div><div><b>${esc(S.user.name)}</b><span>${isAdmin() ? 'Administrator' : 'Kassier'}</span></div>
      <button class="btn ghost icon sm" id="logout" title="Abmelden" aria-label="Abmelden">${icon('logout')}</button>`);
    $('#logout') && ($('#logout').onclick = signOut);
    const dark = document.documentElement.dataset.theme === 'dark';
    $('#theme-btn') && ($('#theme-btn').innerHTML = `${icon(dark ? 'sun' : 'moon')} ${dark ? 'Heller Modus' : 'Dunkler Modus'}`);
    $$('[data-route]').forEach((a) => a.classList.toggle('on', a.dataset.route === UI.route));
    $('#bars').innerHTML = `${!S.online ? `<div class="offline-bar">${icon('wifiOff')} Keine Verbindung – Verkäufe sind erst wieder mit Internet möglich.</div>` : ''}
      ${UI.training && UI.route === 'kasse' ? `<div class="training-bar">${icon('graduation')} TRAININGSMODUS – Belege zählen nicht zum Umsatz</div>` : ''}`;
    const v = VIEWS[UI.route];
    const regSelect = S.registers.length > 1
      ? `<select class="input" id="reg-select" style="width:auto;height:36px" aria-label="Kassa">${S.registers.map((r) => `<option value="${r.id}" ${r.id === S.registerId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>` : '';
    $('#top').innerHTML = `<h1>${v.label}</h1><span class="spacer"></span>${regSelect}
      ${UI.route === 'kasse' ? `<button class="btn sm ${UI.training ? 'danger' : 'ghost'}" id="training-btn" title="Trainingsmodus">${icon('graduation')}<span class="hide-m">${UI.training ? 'Training beenden' : 'Training'}</span></button>
        <button class="btn sm ghost" id="last-btn" ${UI.lastReceipt ? '' : 'disabled'} title="Letzten Beleg anzeigen">${icon('receipt')}<span class="hide-m">Letzter Beleg</span></button>` : ''}
      <span class="status ${S.online ? '' : 'off'}">${S.online ? 'Online' : 'Offline'}</span>`;
    $('#reg-select') && ($('#reg-select').onchange = (e) => {
      S.registerId = e.target.value;
      safeLS.set(`nexpay:register:${S.org.id}`, S.registerId);
      renderView();
    });
    $('#training-btn') && ($('#training-btn').onclick = () => { UI.training = !UI.training; renderView(); });
    $('#last-btn') && ($('#last-btn').onclick = () => UI.lastReceipt && showReceipt(UI.lastReceipt));
  }

  function renderView() {
    if (!S.org || !$('#view')) return;
    refreshChrome();
    VIEWS[UI.route].render();
  }
  window.addEventListener('hashchange', () => {
    const r = (location.hash.match(/^#\/(\w+)/) || [])[1];
    if (!S.org || !VIEWS[r] || r === UI.route) return;
    UI.route = r;
    UI.cartOpen = false;
    renderView();
    window.scrollTo(0, 0);
  });
  window.addEventListener('online', () => { S.online = true; if (S.org) { refreshChrome(); remoteChange(); } });
  window.addEventListener('offline', () => { S.online = false; if (S.org) refreshChrome(); });

  // =============================================================== Kasse
  const saveCart = () => S.org && safeLS.set(`nexpay:cart:${S.org.id}`, UI.cart);
  const cartTotal = () => sum(UI.cart, lineTotal);
  const cartCount = () => sum(UI.cart, (l) => (Number.isInteger(l.qty) ? l.qty : 1));

  function viewPos() {
    const view = $('#view');
    view.className = 'content full';
    view.innerHTML = `<div class="pos-layout ${UI.training || !S.online ? 'has-bar' : ''} ${UI.cartOpen ? 'cart-open' : ''}" id="pos">
      <section class="catalog">
        <div class="catalog-tools">
          <label class="search">${icon('search')}<input class="input" id="pos-q" type="search" placeholder="Artikel suchen …  ( / )" value="${esc(UI.q)}" autocomplete="off"></label>
          <span class="spacer"></span>
          <button class="btn" id="free-item">${icon('plus')}<span class="hide-m">Freier Betrag</span></button>
        </div>
        <div class="chips" id="chips"></div>
        <div class="grid" id="grid"></div>
      </section>
      <aside class="cart" id="cart"></aside>
      <button class="cart-mini" id="cart-mini"></button>
    </div>`;
    $('#pos-q').addEventListener('input', (e) => { UI.q = e.target.value; renderGrid(); });
    $('#pos-q').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const list = visibleProducts();
        if (list.length === 1 || (list.length && (list[0].sku && list[0].sku.toLowerCase() === UI.q.trim().toLowerCase()))) {
          addProduct(list[0]);
          UI.q = ''; e.target.value = ''; renderGrid();
        }
      }
    });
    $('#free-item').onclick = () => openFreeItem();
    $('#cart-mini').onclick = () => { UI.cartOpen = true; $('#pos').classList.add('cart-open'); };
    renderChips();
    renderGrid();
    renderCart();
  }

  function visibleProducts() {
    const q = UI.q.trim().toLowerCase();
    return S.products.filter((p) => p.active
      && (UI.cat === 'all' || p.category_id === UI.cat || (UI.cat === 'none' && !catOf(p.category_id)))
      && (!q || p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)));
  }
  function renderChips() {
    const hasUncat = S.products.some((p) => p.active && !catOf(p.category_id));
    const chips = [['all', 'Alle', null], ...S.categories.map((c) => [c.id, c.name, colorOf(c)]), ...(hasUncat && S.categories.length ? [['none', 'Ohne Kategorie', COLORS.slate]] : [])];
    if (!chips.some(([id]) => id === UI.cat)) UI.cat = 'all';
    $('#chips').innerHTML = chips.map(([id, name, c]) => `<button class="chip ${UI.cat === id ? 'on' : ''}" data-cat="${id}" ${c ? `style="--c:${c}"` : ''}>${c ? '<i></i>' : ''}${esc(name)}</button>`).join('');
    $$('#chips .chip').forEach((b) => b.addEventListener('click', () => { UI.cat = b.dataset.cat; renderChips(); renderGrid(); }));
  }
  function renderGrid() {
    const list = visibleProducts();
    const inCart = {};
    UI.cart.forEach((l) => { if (l.productId) inCart[l.productId] = (inCart[l.productId] || 0) + l.qty; });
    $('#grid').innerHTML = list.length ? list.map((p) => `<button class="tile" data-pid="${p.id}" style="--c:${colorOf(catOf(p.category_id))}">
        ${inCart[p.id] ? `<span class="qty">${fmtQty(inCart[p.id])}</span>` : ''}
        <b>${esc(p.name)}</b><span class="p">${p.open_price ? '<span class="badge">Preis eingeben</span>' : money(p.price)}</span></button>`).join('')
      : `<div class="empty" style="grid-column:1/-1">${icon('tag')}<b>${S.products.length ? 'Keine Artikel gefunden' : 'Noch keine Artikel'}</b>
          ${S.products.length ? 'Suche oder Kategorie ändern.' : isAdmin() ? '<a href="#/artikel">Artikel anlegen</a> oder einen freien Betrag kassieren.' : 'Ein Administrator kann Artikel anlegen.'}</div>`;
    $$('#grid .tile').forEach((t) => t.addEventListener('click', () => {
      const p = S.products.find((x) => x.id === t.dataset.pid);
      if (p) addProduct(p, t);
    }));
  }
  function addProduct(p, tile) {
    if (p.open_price) return openFreeItem(p);
    const ex = UI.cart.find((l) => l.productId === p.id && l.price === p.price && !l.discount);
    if (ex) ex.qty += 1;
    else UI.cart.push({ key: crypto.getRandomValues(new Uint32Array(2)).join('-'), productId: p.id, name: p.name, price: p.price, vat: p.vat, qty: 1, discount: 0 });
    saveCart();
    renderCart();
    renderGrid();
    if (tile) { const t = $(`#grid .tile[data-pid="${p.id}"]`); t?.classList.add('flash'); }
  }
  function openFreeItem(p = null) {
    modal({
      title: p ? esc(p.name) : 'Freier Betrag', size: 'narrow',
      body: `<label class="field"><span>Preis (brutto)</span><input class="input lg num" name="price" inputmode="decimal" placeholder="0,00" autofocus></label>
        ${p ? '' : `<label class="field"><span>Bezeichnung</span><input class="input" name="name" value="Diverses" maxlength="80"></label>
        <label class="field"><span>Umsatzsteuer</span><select class="input" name="vat">${VATS.map((v) => `<option value="${v}" ${v === 20 ? 'selected' : ''}>${v} %</option>`).join('')}</select></label>`}`,
      foot: '<button type="button" class="btn" data-close>Abbrechen</button><button type="submit" class="btn primary">Hinzufügen</button>',
      onSubmit: (fd, close) => {
        const price = parseMoney(fd.price);
        if (price == null || price <= 0) throw new Error('Bitte gib einen gültigen Preis ein.');
        UI.cart.push({ key: String(Date.now()), productId: p?.id || null, name: p ? p.name : String(fd.name || 'Diverses').trim() || 'Diverses', price, vat: p ? p.vat : Number(fd.vat), qty: 1, discount: 0 });
        saveCart(); close(); renderCart(); renderGrid();
      },
    });
  }

  function renderCart() {
    const total = cartTotal();
    const gross = sum(UI.cart, (l) => Math.round(l.qty * l.price));
    const disc = gross - total;
    const cart = $('#cart');
    if (!cart) return;
    cart.innerHTML = `<div class="cart-h"><h2>Aktueller Bon</h2>${UI.cart.length ? `<span class="badge green">${fmtQty(cartCount())} Artikel</span>` : ''}<span class="spacer"></span>
        ${UI.cart.length ? `<button class="btn ghost icon sm" id="cart-disc" title="Rabatt auf den ganzen Bon" aria-label="Rabatt">${icon('percent')}</button>
        <button class="btn ghost icon sm" id="cart-clear" title="Bon leeren" aria-label="Bon leeren">${icon('trash')}</button>` : ''}
        <button class="btn ghost icon sm cart-close" id="cart-close" aria-label="Schließen" style="display:none">${icon('x')}</button></div>
      <div class="lines">${UI.cart.length ? UI.cart.map((l) => `<div class="line" data-key="${l.key}">
          <span class="n">${esc(l.name)}</span><span class="lt">${money(lineTotal(l))}</span>
          <span class="meta">${fmtQty(l.qty)} × ${money(l.price)}${l.discount ? `<span class="disc">− ${money(l.discount)}</span>` : ''}</span>
          <span class="stepper"><button data-step="-1" aria-label="Weniger">${icon('minus')}</button><span>${fmtQty(l.qty)}</span><button data-step="1" aria-label="Mehr">${icon('plus')}</button></span>
        </div>`).join('') : `<div class="cart-empty">${icon('bag')}<b>Der Bon ist leer</b><span class="small">Tippe auf einen Artikel, um ihn hinzuzufügen.</span></div>`}</div>
      <div class="cart-f">
        ${disc ? `<div class="sumrow"><span>Zwischensumme</span><span>${money(gross)}</span></div><div class="sumrow"><span>Rabatt</span><span>− ${money(disc)}</span></div>` : ''}
        <div class="total"><span>Gesamt</span><b>${money(total)}</b></div>
        <div class="paybtns">
          <button class="btn lg" id="pay-cash" ${UI.cart.length ? '' : 'disabled'} title="Passend bar bezahlt">${icon('cash')} Bar passend</button>
          <button class="btn primary lg" id="pay" ${UI.cart.length ? '' : 'disabled'}>Bezahlen</button>
        </div>
      </div>`;
    if (matchMedia('(max-width: 900px)').matches) $('#cart-close').style.display = '';
    $('#cart-close').onclick = () => { UI.cartOpen = false; $('#pos').classList.remove('cart-open'); };
    $('#cart-clear') && ($('#cart-clear').onclick = async () => {
      if (await confirmBox('Alle Positionen vom Bon entfernen?', { ok: 'Bon leeren', danger: true })) { UI.cart = []; saveCart(); renderCart(); renderGrid(); }
    });
    $('#cart-disc') && ($('#cart-disc').onclick = () => openCartDiscount());
    $$('.line', cart).forEach((row) => row.addEventListener('click', (e) => {
      const l = UI.cart.find((x) => x.key === row.dataset.key);
      if (!l) return;
      const step = e.target.closest('[data-step]');
      if (step) {
        e.stopPropagation();
        const d = Number(step.dataset.step);
        if (!Number.isInteger(l.qty)) l.qty = Math.max(0, Math.round(l.qty + d));
        else l.qty += d;
        if (l.qty <= 0) UI.cart.splice(UI.cart.indexOf(l), 1);
        else if (l.discount > Math.round(l.qty * l.price)) l.discount = 0;
        saveCart(); renderCart(); renderGrid();
        return;
      }
      openLine(l);
    }));
    $('#pay').onclick = () => openPayment();
    $('#pay-cash').onclick = (e) => checkout([{ method: 'cash', amount: cartTotal() }], e.currentTarget);
    const mini = $('#cart-mini');
    if (mini) {
      mini.style.visibility = UI.cart.length ? 'visible' : 'hidden';
      mini.innerHTML = `<div><b>${money(total)}</b><br><span>${fmtQty(cartCount())} Artikel · Bon anzeigen</span></div><span class="btn primary sm">Bezahlen</span>`;
    }
  }

  const canDiscount = () => isAdmin() || setting('cashierDiscount', true) !== false;
  function openLine(l) {
    const p = S.products.find((x) => x.id === l.productId);
    const priceEditable = isAdmin() || !p || p.open_price;
    const pct = l.discount && l.qty * l.price ? Math.round((l.discount / Math.round(l.qty * l.price)) * 1000) / 10 : '';
    modal({
      title: esc(l.name), size: 'narrow',
      body: `<div class="grid2">
          <label class="field"><span>Menge</span><input class="input num" name="qty" inputmode="decimal" value="${fmtQty(l.qty)}" autofocus></label>
          <label class="field"><span>Einzelpreis</span><input class="input num" name="price" inputmode="decimal" value="${centsInput(l.price)}" ${priceEditable ? '' : 'readonly'}></label>
        </div>
        ${canDiscount() ? `<div class="grid2">
          <label class="field"><span>Rabatt %</span><input class="input num" name="pct" inputmode="decimal" value="${pct}" placeholder="0"></label>
          <label class="field"><span>oder Rabatt €</span><input class="input num" name="eur" inputmode="decimal" value="${l.discount && !pct ? centsInput(l.discount) : ''}" placeholder="0,00"></label>
        </div>` : ''}
        <p class="muted small">USt ${l.vat} % · Rabatt in % hat Vorrang vor dem Betrag.</p>`,
      foot: '<button type="button" class="btn danger" id="line-del">Entfernen</button><span class="spacer"></span><button type="button" class="btn" data-close>Abbrechen</button><button type="submit" class="btn primary">Übernehmen</button>',
      onOpen: (form, close) => {
        $('#line-del', form).onclick = () => { UI.cart.splice(UI.cart.indexOf(l), 1); saveCart(); close(); renderCart(); renderGrid(); };
      },
      onSubmit: (fd, close) => {
        const qty = parseNum(fd.qty);
        if (qty == null || qty <= 0 || qty > 10000) throw new Error('Bitte gib eine gültige Menge ein.');
        const price = priceEditable ? parseMoney(fd.price) : l.price;
        if (price == null || price < 0) throw new Error('Bitte gib einen gültigen Preis ein.');
        const gross = Math.round(Math.round(qty * 1000) / 1000 * price);
        let discount = 0;
        if (canDiscount()) {
          const p2 = parseNum(fd.pct);
          if (p2) {
            if (p2 < 0 || p2 > 100) throw new Error('Der Rabatt muss zwischen 0 und 100 % liegen.');
            discount = Math.round(gross * p2 / 100);
          } else if (String(fd.eur || '').trim()) {
            discount = parseMoney(fd.eur);
            if (discount == null || discount < 0 || discount > gross) throw new Error('Der Rabatt ist ungültig.');
          }
        }
        Object.assign(l, { qty: Math.round(qty * 1000) / 1000, price, discount });
        saveCart(); close(); renderCart(); renderGrid();
      },
    });
  }
  function openCartDiscount() {
    if (!canDiscount()) return toast('Rabatte dürfen nur Administratoren geben.', 'err');
    modal({
      title: 'Rabatt auf den ganzen Bon', size: 'narrow',
      body: `<div class="quick">${[5, 10, 15, 20, 25, 50].map((p) => `<button type="button" data-pct="${p}">${p} %</button>`).join('')}</div>
        <label class="field"><span>Eigener Rabatt in %</span><input class="input num" name="pct" inputmode="decimal" placeholder="z. B. 12,5"></label>
        <p class="muted small">Gilt für alle Positionen und ersetzt bisherige Zeilenrabatte. 0 % entfernt alle Rabatte.</p>`,
      foot: '<button type="button" class="btn" data-close>Abbrechen</button><button type="submit" class="btn primary">Anwenden</button>',
      onOpen: (form) => $$('[data-pct]', form).forEach((b) => b.addEventListener('click', () => { $('[name=pct]', form).value = b.dataset.pct; form.requestSubmit(); })),
      onSubmit: (fd, close) => {
        const p = parseNum(fd.pct);
        if (p == null || p < 0 || p > 100) throw new Error('Bitte gib einen Rabatt zwischen 0 und 100 % ein.');
        UI.cart.forEach((l) => { l.discount = Math.round(Math.round(l.qty * l.price) * p / 100); });
        saveCart(); close(); renderCart();
      },
    });
  }

  // Bezahlen – auch geteilt (z. B. Teil bar, Rest mit Karte)
  function openPayment() {
    const total = cartTotal();
    const pays = [];
    const paid = () => sum(pays, (p) => p.amount);
    const rest = () => total - paid();
    const notes = [...new Set([500, 1000, 2000, 5000, 10000].filter((n) => n >= total).slice(0, 4).concat([Math.ceil(total / 100) * 100]))]
      .filter((n) => n > total).sort((a, b) => a - b).slice(0, 5);
    const m = modal({
      title: 'Bezahlen', size: '',
      body: `<div class="pay-total"><span>Zu bezahlen</span><b class="num">${money(total)}</b></div>
        <div id="pay-state"></div>
        <label class="field"><span>Betrag</span><input class="input lg num" name="amount" inputmode="decimal" id="pay-amount" autofocus></label>
        <div class="quick" id="pay-quick"></div>
        <div class="methods">
          <button type="button" class="btn primary" data-method="cash">${icon('cash')}Bar</button>
          <button type="button" class="btn" data-method="card">${icon('card')}Karte</button>
          <button type="button" class="btn" data-method="other">${icon('gift')}Sonstige</button>
        </div>
        <p class="muted small">Enter = bar. Bei Teilzahlung zuerst einen Teilbetrag buchen, den Rest mit einer anderen Zahlungsart.</p>`,
      foot: '<button type="button" class="btn" data-close>Abbrechen</button>',
      onSubmit: (_, __, form) => add('cash', $('[data-method=cash]', form)),
    });
    const form = m.form;
    const upd = () => {
      const r = rest();
      $('#pay-state', form).innerHTML = pays.length ? `<div class="pay-list">${pays.map((p) => `<div><span>${METHODS[p.method]}</span><b class="num">${money(p.amount)}</b></div>`).join('')}</div>
        <div class="pay-rest"><span>Offen</span><span class="num">${money(Math.max(r, 0))}</span></div>` : '';
      $('#pay-amount', form).value = centsInput(Math.max(r, 0));
      $('#pay-quick', form).innerHTML = `<button type="button" data-cash="${r}">Passend</button>${(pays.length ? [] : notes).map((n) => `<button type="button" data-cash="${n}">${money(n)}</button>`).join('')}`;
      $$('[data-cash]', form).forEach((b) => b.addEventListener('click', () => add('cash', b, Number(b.dataset.cash))));
      if (matchMedia('(pointer: fine)').matches) $('#pay-amount', form).select();
    };
    async function add(method, btn, amountArg) {
      let amount = amountArg ?? parseMoney($('#pay-amount', form).value);
      const r = rest();
      if (amount == null || amount <= 0) return showFormError(form, new Error('Bitte gib einen gültigen Betrag ein.'));
      if (method !== 'cash' && amount > r) amount = r;   // Rückgeld nur bar
      pays.push({ method, amount });
      if (paid() >= total) {
        const ok = await checkout(pays.slice(), btn, m);
        if (!ok) { pays.length = 0; upd(); }
        return;
      }
      upd();
    }
    $$('[data-method]', form).forEach((b) => b.addEventListener('click', () => add(b.dataset.method, b)));
    upd();
  }

  async function checkout(payments, btn, payModal) {
    const reg = register();
    if (!reg) { fail(new Error('Es ist keine Kassa eingerichtet.')); return false; }
    if (!UI.cart.length) return false;
    btn?.classList.add('busy');
    try {
      const items = UI.cart.map((l) => ({ productId: l.productId, name: l.name, qty: l.qty, price: l.price, vat: l.vat, discount: l.discount || 0 }));
      const r = await rpc('pay_sell', { p_register: reg.id, p_items: items, p_payments: payments, p_training: UI.training, p_note: '' });
      S.rev += 1;
      reg.receipt_nr = r.nr;
      UI.cart = [];
      UI.lastReceipt = r;
      UI.cartOpen = false;
      saveCart();
      payModal?.close();
      if (UI.route === 'kasse') { $('#pos')?.classList.remove('cart-open'); renderCart(); renderGrid(); refreshChrome(); }
      showReceipt(r, { afterSale: true });
      return true;
    } catch (e) {
      if (payModal) showFormError(payModal.form, e); else fail(e);
      return false;
    } finally { btn?.classList.remove('busy'); }
  }

  // =============================================================== Bon
  const regOf = (id) => S.registers.find((r) => r.id === id) || {};
  const receiptNo = (r) => `${regOf(r.register_id).code || 'K'}-${pad(r.nr, 6)}`;
  function orgHeader() {
    const s = S.org.settings || {};
    const addr = [s.street, [s.zip, s.city].filter(Boolean).join(' ')].filter(Boolean);
    return `<div class="c"><div class="big">${esc(s.legalName || S.org.name)}</div>
      ${addr.map((a) => `<div>${esc(a)}</div>`).join('')}
      ${s.phone ? `<div>Tel. ${esc(s.phone)}</div>` : ''}${s.uid ? `<div>UID: ${esc(s.uid)}</div>` : ''}${s.fn ? `<div>${esc(s.fn)}</div>` : ''}
      ${s.header ? `<div style="margin-top:4px">${esc(s.header)}</div>` : ''}</div>`;
  }
  function ticketHTML(r) {
    const s = S.org.settings || {};
    const storno = r.kind === 'storno';
    const orig = storno && r.storno_of ? r._origNo : null;
    return `<div class="ticket">
      ${orgHeader()}
      <hr>
      ${r.training ? '<div class="mark">TRAININGSBUCHUNG</div>' : ''}
      ${storno ? `<div class="mark">STORNO</div>${orig ? `<div class="c">zu Beleg ${esc(orig)}</div>` : ''}` : ''}
      <div class="l"><span>Beleg</span><span class="b">${esc(receiptNo(r))}</span></div>
      <div class="l"><span>Datum</span><span>${fmtDT(r.created_at)}</span></div>
      <div class="l"><span>Kassa</span><span>${esc(regOf(r.register_id).name || '')}</span></div>
      <div class="l"><span>Bedient von</span><span>${esc(r.user_name)}</span></div>
      <hr>
      ${r.items.map((it) => `<div class="l"><span>${esc(it.name)}</span><span>${plain(it.total)} ${s.smallBusiness ? '' : `<small>${vatLetter(it.vat)}</small>`}</span></div>
        ${Math.abs(it.qty) !== 1 || it.discount ? `<div class="sub">${fmtQty(it.qty)} × ${plain(it.price)}${it.discount ? ` · Rabatt ${plain(Math.abs(it.discount))}` : ''}</div>` : ''}`).join('')}
      <hr>
      <div class="l tot"><span>SUMME EUR</span><span>${plain(r.total)}</span></div>
      ${r.payments.map((p) => `<div class="l"><span>${METHODS[p.method] || p.method}</span><span>${plain(p.amount)}</span></div>`).join('')}
      ${r.change_given ? `<div class="l b"><span>Rückgeld</span><span>${plain(r.change_given)}</span></div>` : ''}
      <hr>
      ${s.smallBusiness ? '<div class="c small">Umsatzsteuerfrei aufgrund der Kleinunternehmerregelung (§ 6 Abs. 1 Z 27 UStG).</div>' : `
      <table><tr><td></td><td class="r">Netto</td><td class="r">USt</td><td class="r">Brutto</td></tr>
      ${r.vat.map((v) => `<tr><td>${vatLetter(v.rate)} ${v.rate}%</td><td class="r">${plain(v.net)}</td><td class="r">${plain(v.tax)}</td><td class="r">${plain(v.gross)}</td></tr>`).join('')}</table>`}
      ${r.note ? `<hr><div>${storno ? 'Grund' : 'Notiz'}: ${esc(r.note)}</div>` : ''}
      <hr>
      <div class="c">${esc(s.footer || 'Vielen Dank für Ihren Einkauf!')}</div>
      <div class="c tiny" style="margin-top:8px">Prüfwert ${esc(r.hash.slice(0, 16))}</div>
    </div>`;
  }
  const vatLetter = (rate) => ({ 20: 'A', 10: 'B', 13: 'C', 0: 'D' }[rate] || '');

  function printHTML(html) {
    $('#print-root').innerHTML = html;
    setTimeout(() => window.print(), 30);
  }

  async function showReceipt(r, { afterSale = false } = {}) {
    if (r.kind === 'storno' && r.storno_of && !r._origNo) {
      const { data } = await sb.from('pay_receipts').select('nr, register_id').eq('id', r.storno_of).maybeSingle();
      if (data) r._origNo = receiptNo(data);
    }
    const canStorno = r.kind === 'sale' && !r.stornoed_by && (isAdmin() || (setting('cashierStorno', true) !== false && !r.closing_id));
    modal({
      title: afterSale ? 'Verkauf abgeschlossen' : `Beleg ${esc(receiptNo(r))}`,
      body: `${afterSale && r.change_given ? `<div class="change-box"><span>Rückgeld</span><b>${money(r.change_given)}</b></div>` : ''}
        ${r.stornoed_by ? `<div class="note warn">${icon('undo')}<span>Dieser Beleg wurde storniert.</span></div>` : ''}
        ${ticketHTML(r)}`,
      foot: `${canStorno && !afterSale ? `<button type="button" class="btn danger" id="r-storno">${icon('undo')} Stornieren</button><span class="spacer"></span>` : ''}
        <button type="button" class="btn" id="r-print">${icon('print')} Drucken</button>
        <button type="submit" class="btn primary">${afterSale ? 'Neuer Verkauf' : 'Schließen'}</button>`,
      onOpen: (form, close) => {
        $('#r-print', form).onclick = () => printHTML(ticketHTML(r));
        $('#r-storno', form) && ($('#r-storno', form).onclick = () => { close(); openStorno(r); });
        if (afterSale) setTimeout(() => $('button[type=submit]', form).focus(), 30);
      },
    });
  }

  function openStorno(r) {
    modal({
      title: `Beleg ${esc(receiptNo(r))} stornieren`, size: 'narrow',
      body: `<div class="note warn">${icon('alert')}<span>Es wird ein Stornobeleg über <b>${money(-r.total)}</b> erstellt. Der ursprüngliche Beleg bleibt unverändert erhalten.</span></div>
        <label class="field"><span>Grund</span><input class="input" name="reason" maxlength="200" placeholder="z. B. Falsch getippt" autofocus></label>
        ${r.payments.some((p) => p.method === 'cash') ? `<p class="small muted">Bargeld zurückgeben: <b>${money(sum(r.payments.filter((p) => p.method === 'cash'), (p) => p.amount) - r.change_given)}</b></p>` : ''}`,
      foot: '<button type="button" class="btn" data-close>Abbrechen</button><button type="submit" class="btn danger solid">Stornobeleg erstellen</button>',
      onSubmit: async (fd, close) => {
        const s = await rpc('pay_storno', { p_receipt: r.id, p_reason: fd.reason || '' });
        S.rev += 1;
        close();
        toast('Stornobeleg erstellt.');
        if (UI.route === 'belege' || UI.route === 'abschluss') renderView();
        showReceipt(s);
      },
    });
  }

  // =============================================================== Belege
  async function viewReceipts() {
    const view = $('#view');
    view.className = 'content';
    const f = UI.belege;
    view.innerHTML = `<div class="page-actions">
        <label class="field"><span>Von</span><input class="input" type="date" id="b-from" value="${f.from}"></label>
        <label class="field"><span>Bis</span><input class="input" type="date" id="b-to" value="${f.to}"></label>
        <label class="field"><span>Art</span><select class="input" id="b-kind">
          <option value="all">Alle Belege</option><option value="sale">Verkäufe</option><option value="storno">Stornos</option><option value="training">Training</option></select></label>
        <label class="field" style="flex:1;min-width:180px"><span>Suche</span><input class="input" id="b-q" type="search" placeholder="Belegnr., Artikel, Kassier" value="${esc(f.q)}"></label>
      </div>
      <div class="card"><div class="card-b flush" id="b-list"><div class="empty">Belege werden geladen …</div></div></div>`;
    $('#b-kind').value = f.kind;
    const reload = () => { f.from = $('#b-from').value || today(); f.to = $('#b-to').value || f.from; f.kind = $('#b-kind').value; viewReceiptsLoad(); };
    $('#b-from').onchange = reload; $('#b-to').onchange = reload; $('#b-kind').onchange = reload;
    $('#b-q').addEventListener('input', debounce(() => { f.q = $('#b-q').value; viewReceiptsRender(); }, 150));
    viewReceiptsLoad();
  }
  let receiptCache = [];
  async function viewReceiptsLoad() {
    const f = UI.belege;
    try {
      receiptCache = await fetchAll('pay_receipts', (q) => q.gte('created_at', new Date(`${f.from}T00:00:00`).toISOString()).lt('created_at', new Date(`${addDays(f.to, 1)}T00:00:00`).toISOString()));
      viewReceiptsRender();
    } catch (e) { $('#b-list') && ($('#b-list').innerHTML = `<div class="empty">${esc(e.message)}</div>`); }
  }
  function viewReceiptsRender() {
    const el = $('#b-list');
    if (!el) return;
    const f = UI.belege;
    const q = f.q.trim().toLowerCase();
    const list = receiptCache.filter((r) => (f.kind === 'all' || (f.kind === 'training' ? r.training : r.kind === f.kind && !r.training))
      && (!q || receiptNo(r).toLowerCase().includes(q) || r.user_name.toLowerCase().includes(q) || r.items.some((i) => i.name.toLowerCase().includes(q))));
    const real = list.filter((r) => !r.training);
    el.innerHTML = list.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Beleg</th><th>Zeit</th><th class="hide-m">Kassier</th><th class="hide-m">Positionen</th><th>Zahlung</th><th class="r">Betrag</th></tr></thead><tbody>
      ${list.map((r) => `<tr class="click ${r.stornoed_by ? 'strike' : ''}" data-id="${r.id}">
        <td><b class="mono">${esc(receiptNo(r))}</b> ${r.kind === 'storno' ? '<span class="badge red">Storno</span>' : ''}${r.stornoed_by ? '<span class="badge">storniert</span>' : ''}${r.training ? '<span class="badge amber">Training</span>' : ''}</td>
        <td class="num">${f.from === f.to ? fmtTime(r.created_at) : fmtDT(r.created_at)}</td>
        <td class="hide-m">${esc(r.user_name)}</td>
        <td class="hide-m muted">${esc(r.items.slice(0, 3).map((i) => i.name).join(', '))}${r.items.length > 3 ? ` +${r.items.length - 3}` : ''}</td>
        <td>${r.payments.map((p) => METHODS[p.method]).join(' + ') || '–'}</td>
        <td class="r"><b class="${r.total < 0 ? 'neg' : ''}">${money(r.total)}</b></td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="2">${real.length} Belege${list.length > real.length ? ` · ${list.length - real.length} Training` : ''}</td><td class="hide-m"></td><td class="hide-m"></td><td></td><td class="r">${money(sum(real, (r) => r.total))}</td></tr></tfoot></table></div>`
      : `<div class="empty">${icon('receipt')}<b>Keine Belege</b>Im gewählten Zeitraum wurde nichts kassiert.</div>`;
    $$('tr[data-id]', el).forEach((tr) => tr.addEventListener('click', () => {
      const r = receiptCache.find((x) => x.id === tr.dataset.id);
      if (r) showReceipt(r);
    }));
  }

  // =============================================================== Tagesabschluss
  async function viewClosing() {
    const view = $('#view');
    view.className = 'content';
    const reg = register();
    if (!reg) { view.innerHTML = `<div class="card"><div class="empty">${icon('lock')}<b>Keine Kassa</b>Lege unter Einstellungen → Kassen eine Kassa an.</div></div>`; return; }
    view.innerHTML = '<div class="empty">Kassenstand wird berechnet …</div>';
    let per, closings, moves;
    try {
      [per, closings, moves] = await Promise.all([
        rpc('pay_period', { p_register: reg.id }),
        fetchAll('pay_closings', (q) => q.eq('register_id', reg.id).limit(30)),
        fetchAll('pay_cash_moves', (q) => q.eq('register_id', reg.id).is('closing_id', null)),
      ]);
    } catch (e) { view.innerHTML = `<div class="card"><div class="empty">${esc(e.message)}</div></div>`; return; }
    if (UI.route !== 'abschluss') return;
    const counts = UI.denoms || (UI.denoms = {});
    const pays = per.payments || {};
    view.innerHTML = `<div class="stack">
      <div class="kpis">
        <div class="kpi hero"><span>Umsatz seit ${fmtDT(per.periodFrom)}</span><b>${money(per.total)}</b><small>${per.count} Belege${per.stornoCount ? ` · ${per.stornoCount} Storno` : ''}</small></div>
        <div class="kpi"><span>Bar</span><b>${money(pays.cash || 0)}</b></div>
        <div class="kpi"><span>Karte</span><b>${money(pays.card || 0)}</b></div>
        <div class="kpi"><span>Sonstige</span><b>${money(pays.other || 0)}</b></div>
        <div class="kpi"><span>Soll-Kassenstand</span><b>${money(per.expected)}</b><small>Bargeld in der Lade</small></div>
      </div>
      <div class="split">
        <div class="cards">
          <div class="card"><div class="card-h"><div><h2>Kassenstand</h2><p>${esc(reg.name)} · Kassen-ID ${esc(reg.code)} · Abschluss Nr. ${per.nextClosingNr}</p></div><span class="spacer"></span>
            <button class="btn sm" id="c-in">${icon('arrowDown')} Einlage</button><button class="btn sm" id="c-out">${icon('arrowUp')} Entnahme</button></div>
            <div class="card-b"><div class="kv">
              <div><span>Anfangsbestand</span><b>${money(per.cashStart)}</b></div>
              <div><span>+ Bareinnahmen (abzüglich Rückgeld)</span><b>${money(pays.cash || 0)}</b></div>
              <div><span>+ Einlagen</span><b>${money(per.cashIn)}</b></div>
              <div><span>− Entnahmen</span><b>${money(per.cashOut)}</b></div>
              <div class="total-row"><span>= Soll-Kassenstand</span><b>${money(per.expected)}</b></div>
            </div>
            ${moves.length ? `<h3 style="margin:18px 0 8px">Bargeldbewegungen</h3><table class="t"><tbody>${moves.map((m) => `<tr><td class="num">${fmtTime(m.created_at)}</td><td>${m.kind === 'in' ? 'Einlage' : 'Entnahme'}${m.note ? ` · <span class="muted">${esc(m.note)}</span>` : ''}</td><td class="muted hide-m">${esc(m.user_name)}</td><td class="r ${m.kind === 'in' ? 'pos' : 'neg'}">${m.kind === 'in' ? '+' : '−'} ${money(m.amount)}</td></tr>`).join('')}</tbody></table>` : ''}
            </div></div>
          <div class="card"><div class="card-h"><h2>Umsatzsteuer</h2></div><div class="card-b flush">
            ${per.vat.length ? `<table class="t"><thead><tr><th>Satz</th><th class="r">Netto</th><th class="r">USt</th><th class="r">Brutto</th></tr></thead><tbody>
              ${per.vat.map((v) => `<tr><td>${v.rate} %</td><td class="r">${money(v.net)}</td><td class="r">${money(v.tax)}</td><td class="r">${money(v.gross)}</td></tr>`).join('')}</tbody>
              <tfoot><tr><td>Summe</td><td class="r">${money(sum(per.vat, (v) => v.net))}</td><td class="r">${money(sum(per.vat, (v) => v.tax))}</td><td class="r">${money(sum(per.vat, (v) => v.gross))}</td></tr></tfoot></table>`
    : '<div class="empty">Noch keine Umsätze in dieser Periode.</div>'}
          </div></div>
        </div>
        <form class="card" id="c-form"><div class="card-h"><div><h2>Kassensturz</h2><p>Bargeld zählen – oder den Gesamtbetrag direkt eingeben.</p></div></div>
          <div class="card-b">
            <div class="denoms">${DENOMS.map((d) => `<div class="denom"><label for="d${d}">${d >= 100 ? `${d / 100} €` : `${d} ct`}</label><input class="input num" id="d${d}" data-d="${d}" inputmode="numeric" value="${counts[d] || ''}" placeholder="0"><span id="ds${d}">${counts[d] ? money(counts[d] * d) : ''}</span></div>`).join('')}</div>
            <label class="field" style="margin-top:14px"><span>Gezählter Kassenstand</span><input class="input lg num" name="counted" id="c-counted" inputmode="decimal" placeholder="${centsInput(per.expected)}"></label>
            <div class="counted"><span>Differenz</span><b id="c-diff">–</b></div>
            <label class="field" style="margin-top:14px"><span>Notiz (optional)</span><input class="input" name="note" maxlength="300"></label>
            ${per.trainingCount ? `<p class="small muted" style="margin-top:10px">${per.trainingCount} Trainingsbeleg(e) werden mit abgeschlossen, zählen aber nicht zum Umsatz.</p>` : ''}
            <button class="btn primary lg block" type="submit" style="margin-top:16px">${icon('lock')} Tagesabschluss durchführen</button>
          </div></form>
      </div>
      <div class="card"><div class="card-h"><h2>Bisherige Abschlüsse</h2></div><div class="card-b flush">
        ${closings.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Nr.</th><th>Zeitraum</th><th class="hide-m">Durchgeführt von</th><th class="r">Umsatz</th><th class="r">Differenz</th><th></th></tr></thead><tbody>
          ${closings.map((c) => `<tr class="click" data-cid="${c.id}"><td><b>Z ${c.nr}</b></td><td class="num">${fmtDT(c.period_from)} – ${fmtTime(c.period_to)}</td><td class="hide-m">${esc(c.user_name)}</td>
            <td class="r">${money(c.summary.total)}</td><td class="r ${c.difference < 0 ? 'neg' : c.difference > 0 ? 'pos' : ''}">${c.difference == null ? '–' : money(c.difference)}</td><td class="r">${icon('print')}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="empty">Noch kein Tagesabschluss.</div>'}
      </div></div>
    </div>`;

    const counted = $('#c-counted');
    const updDiff = () => {
      const v = parseMoney(counted.value);
      const d = v == null ? null : v - per.expected;
      $('#c-diff').textContent = d == null ? '–' : `${d > 0 ? '+' : ''}${money(d)}`;
      $('#c-diff').className = d ? (d < 0 ? 'neg' : 'pos') : '';
    };
    $$('[data-d]').forEach((inp) => inp.addEventListener('input', () => {
      const d = Number(inp.dataset.d);
      const n = Math.max(0, parseInt(inp.value, 10) || 0);
      counts[d] = n;
      $(`#ds${d}`).textContent = n ? money(n * d) : '';
      const tot = sum(DENOMS, (x) => (counts[x] || 0) * x);
      counted.value = tot ? centsInput(tot) : '';
      updDiff();
    }));
    counted.addEventListener('input', updDiff);
    if (Object.values(counts).some(Boolean)) { counted.value = centsInput(sum(DENOMS, (x) => (counts[x] || 0) * x)); updDiff(); }
    $('#c-in').onclick = () => openCashMove('in', reg);
    $('#c-out').onclick = () => openCashMove('out', reg);
    $$('tr[data-cid]').forEach((tr) => tr.addEventListener('click', () => {
      const c = closings.find((x) => x.id === tr.dataset.cid);
      if (c) showClosing(c);
    }));
    $('#c-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = counted.value.trim() ? parseMoney(counted.value) : null;
      if (counted.value.trim() && (v == null || v < 0)) return fail(new Error('Bitte gib einen gültigen Kassenstand ein.'));
      const diff = v == null ? null : v - per.expected;
      const ok = await confirmBox(`Tagesabschluss für <b>${esc(reg.name)}</b> mit Umsatz <b>${money(per.total)}</b> durchführen?${v == null ? '<br><br>Ohne gezählten Kassenstand wird der Soll-Stand übernommen.' : diff ? `<br><br>Kassendifferenz: <b class="${diff < 0 ? 'neg' : 'pos'}">${money(diff)}</b>` : ''}`, { ok: 'Abschluss durchführen', title: 'Tagesabschluss' });
      if (!ok) return;
      const btn = $('button[type=submit]', e.target);
      const c = await busy(btn, () => rpc('pay_close', { p_register: reg.id, p_counted: v, p_note: $('[name=note]', e.target).value }));
      if (!c) return;
      S.rev += 1;
      UI.denoms = {};
      toast(`Tagesabschluss Z ${c.nr} erstellt.`);
      viewClosing();
      showClosing(c);
    });
  }
  function openCashMove(kind, reg) {
    modal({
      title: kind === 'in' ? 'Bargeld einlegen' : 'Bargeld entnehmen', size: 'narrow',
      body: `<label class="field"><span>Betrag</span><input class="input lg num" name="amount" inputmode="decimal" placeholder="0,00" autofocus></label>
        <label class="field"><span>Grund</span><input class="input" name="note" maxlength="200" placeholder="${kind === 'in' ? 'z. B. Wechselgeld' : 'z. B. Bankeinzahlung, Einkauf'}"></label>`,
      foot: `<button type="button" class="btn" data-close>Abbrechen</button><button type="submit" class="btn primary">${kind === 'in' ? 'Einlage buchen' : 'Entnahme buchen'}</button>`,
      onSubmit: async (fd, close) => {
        const amount = parseMoney(fd.amount);
        if (amount == null || amount <= 0) throw new Error('Bitte gib einen gültigen Betrag ein.');
        await rpc('pay_cash_move', { p_register: reg.id, p_kind: kind, p_amount: amount, p_note: fd.note || '' });
        S.rev += 1;
        close();
        toast(kind === 'in' ? 'Einlage gebucht.' : 'Entnahme gebucht.');
        viewClosing();
      },
    });
  }
  function closingHTML(c) {
    const s = c.summary;
    const p = s.payments || {};
    return `<div class="ticket">${orgHeader()}<hr>
      <div class="c big">TAGESABSCHLUSS Z ${c.nr}</div>
      <div class="l"><span>Kassa</span><span>${esc(s.registerName)} (${esc(s.registerCode)})</span></div>
      <div class="l"><span>Von</span><span>${fmtDT(c.period_from)}</span></div>
      <div class="l"><span>Bis</span><span>${fmtDT(c.period_to)}</span></div>
      <div class="l"><span>Durchgeführt</span><span>${esc(c.user_name)}</span></div>
      ${s.firstNr ? `<div class="l"><span>Belege</span><span>${s.firstNr} – ${s.lastNr}</span></div>` : ''}
      <hr>
      <div class="l"><span>Verkäufe (${s.count})</span><span>${plain(s.sales)}</span></div>
      <div class="l"><span>Stornos (${s.stornoCount})</span><span>${plain(s.stornoSum)}</span></div>
      <div class="l tot"><span>UMSATZ</span><span>${plain(s.total)}</span></div>
      ${s.trainingCount ? `<div class="l"><span>Trainingsbelege</span><span>${s.trainingCount}</span></div>` : ''}
      <hr><div class="b">Zahlungsarten</div>
      ${Object.keys(METHODS).filter((k) => p[k]).map((k) => `<div class="l"><span>${METHODS[k]}</span><span>${plain(p[k])}</span></div>`).join('') || '<div>–</div>'}
      <hr><div class="b">Umsatzsteuer</div>
      <table><tr><td></td><td class="r">Netto</td><td class="r">USt</td><td class="r">Brutto</td></tr>
      ${(s.vat || []).map((v) => `<tr><td>${v.rate}%</td><td class="r">${plain(v.net)}</td><td class="r">${plain(v.tax)}</td><td class="r">${plain(v.gross)}</td></tr>`).join('')}</table>
      <hr><div class="b">Bargeld</div>
      <div class="l"><span>Anfangsbestand</span><span>${plain(s.cashStart)}</span></div>
      <div class="l"><span>Bareinnahmen</span><span>${plain(p.cash || 0)}</span></div>
      <div class="l"><span>Einlagen</span><span>${plain(s.cashIn)}</span></div>
      <div class="l"><span>Entnahmen</span><span>-${plain(s.cashOut)}</span></div>
      <div class="l b"><span>Soll</span><span>${plain(c.expected)}</span></div>
      <div class="l b"><span>Gezählt</span><span>${c.counted == null ? '–' : plain(c.counted)}</span></div>
      <div class="l b"><span>Differenz</span><span>${c.difference == null ? '–' : plain(c.difference)}</span></div>
      ${c.note ? `<hr><div>Notiz: ${esc(c.note)}</div>` : ''}
      <hr><div class="l"><span>Umsatzzähler</span><span>${plain(s.turnover)}</span></div>
      <div class="tiny">Kettenwert ${esc((s.lastHash || '').slice(0, 32))}</div>
    </div>`;
  }
  function showClosing(c) {
    modal({
      title: `Tagesabschluss Z ${c.nr}`,
      body: closingHTML(c),
      foot: `<button type="button" class="btn" id="z-print">${icon('print')} Drucken</button><button type="submit" class="btn primary">Schließen</button>`,
      onOpen: (form) => { $('#z-print', form).onclick = () => printHTML(closingHTML(c)); },
    });
  }

  // =============================================================== Artikel
  function viewProducts() {
    const view = $('#view');
    view.className = 'content';
    const admin = isAdmin();
    const q = (UI.prodQ || '').toLowerCase();
    const list = S.products.filter((p) => !q || p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q));
    view.innerHTML = `<div class="stack">
      ${admin ? '' : `<div class="note">${icon('info')}<span>Artikel und Preise können nur Administratoren ändern.</span></div>`}
      <div class="card"><div class="card-h"><div><h2>Kategorien</h2><p>Gruppieren die Kacheln in der Kasse.</p></div><span class="spacer"></span>${admin ? `<button class="btn sm" id="cat-new">${icon('plus')} Kategorie</button>` : ''}</div>
        <div class="card-b"><div class="cat-list">${S.categories.length ? S.categories.map((c) => `<button class="chip" data-cid="${c.id}" style="--c:${colorOf(c)}" ${admin ? '' : 'disabled'}><i></i>${esc(c.name)} <span class="muted small">${S.products.filter((p) => p.category_id === c.id).length}</span></button>`).join('') : '<span class="muted">Noch keine Kategorien.</span>'}</div></div></div>
      <div class="card"><div class="card-h"><div><h2>Artikel</h2><p>${S.products.length} Artikel · ${S.products.filter((p) => p.active).length} aktiv</p></div><span class="spacer"></span>
        <label class="search hide-m" style="max-width:240px">${icon('search')}<input class="input" id="p-q" type="search" placeholder="Suchen" value="${esc(UI.prodQ || '')}"></label>
        ${admin ? `<button class="btn primary sm" id="prod-new">${icon('plus')} Artikel</button>` : ''}</div>
        <div class="card-b flush">${list.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Artikel</th><th class="hide-m">Kategorie</th><th class="hide-m">Art.-Nr.</th><th class="r">USt</th><th class="r">Preis</th><th>Status</th></tr></thead><tbody>
          ${list.map((p) => { const c = catOf(p.category_id); return `<tr class="${admin ? 'click' : ''}" data-pid="${p.id}"><td><b>${esc(p.name)}</b></td>
            <td class="hide-m">${c ? `<span class="dot" style="--c:${colorOf(c)}"></span>${esc(c.name)}` : '<span class="muted">–</span>'}</td>
            <td class="hide-m mono muted">${esc(p.sku || '')}</td><td class="r">${p.vat} %</td>
            <td class="r"><b>${p.open_price ? '<span class="badge">frei</span>' : money(p.price)}</b></td>
            <td>${p.active ? '<span class="badge green">Aktiv</span>' : '<span class="badge">Ausgeblendet</span>'}</td></tr>`; }).join('')}
        </tbody></table></div>` : `<div class="empty">${icon('tag')}<b>${S.products.length ? 'Nichts gefunden' : 'Noch keine Artikel'}</b>${admin && !S.products.length ? 'Lege deinen ersten Artikel an.' : ''}</div>`}</div></div>
    </div>`;
    $('#p-q')?.addEventListener('input', debounce((e) => { UI.prodQ = e.target.value; viewProducts(); $('#p-q').focus(); const v = $('#p-q').value; $('#p-q').setSelectionRange(v.length, v.length); }, 200));
    if (!admin) return;
    $('#cat-new').onclick = () => openCategory();
    $('#prod-new').onclick = () => openProduct();
    $$('[data-cid]').forEach((b) => b.addEventListener('click', () => openCategory(S.categories.find((c) => c.id === b.dataset.cid))));
    $$('tr[data-pid]').forEach((tr) => tr.addEventListener('click', () => openProduct(S.products.find((p) => p.id === tr.dataset.pid))));
  }
  function openCategory(c = null) {
    modal({
      title: c ? 'Kategorie bearbeiten' : 'Neue Kategorie', size: 'narrow',
      body: `<label class="field"><span>Name</span><input class="input" name="name" maxlength="40" value="${esc(c?.name || '')}" required></label>
        <div class="field"><span>Farbe</span><div class="swatches">${Object.entries(COLORS).map(([k, v]) => `<label title="${k}"><input type="radio" name="color" value="${k}" ${(c?.color || 'emerald') === k ? 'checked' : ''}><i style="--c:${v}"></i></label>`).join('')}</div></div>
        <label class="field"><span>Reihenfolge</span><input class="input num" name="sort" inputmode="numeric" value="${c?.sort ?? S.categories.length + 1}"></label>`,
      foot: `${c ? `<button type="button" class="btn danger" id="cat-del">${icon('trash')} Löschen</button><span class="spacer"></span>` : ''}<button type="button" class="btn" data-close>Abbrechen</button><button type="submit" class="btn primary">Speichern</button>`,
      onOpen: (form, close) => {
        $('#cat-del', form) && ($('#cat-del', form).onclick = async () => {
          if (!await confirmBox(`Kategorie „${esc(c.name)}“ löschen? Die Artikel bleiben erhalten (ohne Kategorie).`, { ok: 'Löschen', danger: true })) return;
          await busy(null, () => rpc('pay_delete_category', { p_id: c.id }));
          close(); await refreshMaster();
        });
      },
      onSubmit: async (fd, close) => {
        await rpc('pay_save_category', { p: { id: c?.id || null, name: fd.name, color: fd.color, sort: parseInt(fd.sort, 10) || 0 } });
        close(); toast('Kategorie gespeichert.'); await refreshMaster();
      },
    });
  }
  function openProduct(p = null) {
    const small = !!setting('smallBusiness', false);
    modal({
      title: p ? 'Artikel bearbeiten' : 'Neuer Artikel',
      body: `<label class="field"><span>Bezeichnung</span><input class="input" name="name" maxlength="80" value="${esc(p?.name || '')}" required></label>
        <div class="grid2">
          <label class="field"><span>Preis (brutto)</span><input class="input num" name="price" inputmode="decimal" value="${p ? centsInput(p.price) : ''}" placeholder="0,00"></label>
          <label class="field"><span>Umsatzsteuer</span><select class="input" name="vat" ${small ? 'disabled' : ''}>${VATS.map((v) => `<option value="${v}" ${(p ? p.vat : small ? 0 : 20) === v ? 'selected' : ''}>${v} %</option>`).join('')}</select>${small ? '<small>Kleinunternehmer: es wird 0 % verrechnet.</small>' : ''}</label>
          <label class="field"><span>Kategorie</span><select class="input" name="categoryId"><option value="">Ohne Kategorie</option>${S.categories.map((c) => `<option value="${c.id}" ${p?.category_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Artikelnummer / EAN</span><input class="input mono" name="sku" maxlength="40" value="${esc(p?.sku || '')}"></label>
        </div>
        <label class="check"><input type="checkbox" name="openPrice" ${p?.open_price ? 'checked' : ''}><span><b>Preis beim Verkauf eingeben</b><span class="muted small">Für Gutscheine, Waren nach Gewicht oder variable Preise.</span></span></label>
        <label class="check"><input type="checkbox" name="active" ${!p || p.active ? 'checked' : ''}><span><b>In der Kasse anzeigen</b><span class="muted small">Ausgeblendete Artikel bleiben gespeichert.</span></span></label>
        <p class="small muted">USt-Sätze in Österreich: 20 % Normalsatz, 10 % u. a. Speisen und Lebensmittel, 13 % u. a. Blumen, Tierfutter, Kunst. Bitte im Zweifel mit der Steuerberatung abklären.</p>`,
      foot: `${p ? `<button type="button" class="btn danger" id="p-del">${icon('trash')} Löschen</button><span class="spacer"></span>` : ''}<button type="button" class="btn" data-close>Abbrechen</button><button type="submit" class="btn primary">Speichern</button>`,
      onOpen: (form, close) => {
        $('#p-del', form) && ($('#p-del', form).onclick = async () => {
          if (!await confirmBox(`Artikel „${esc(p.name)}“ löschen? Bisherige Belege bleiben unverändert.`, { ok: 'Löschen', danger: true })) return;
          await busy(null, () => rpc('pay_delete_product', { p_id: p.id }));
          close(); await refreshMaster();
        });
      },
      onSubmit: async (fd, close) => {
        const price = String(fd.price || '').trim() ? parseMoney(fd.price) : 0;
        if (price == null || price < 0) throw new Error('Bitte gib einen gültigen Preis ein.');
        if (!fd.openPrice && price === 0 && !await confirmBox('Der Artikel kostet 0,00 €. Trotzdem speichern?', { ok: 'Speichern' })) return;
        await rpc('pay_save_product', { p: { id: p?.id || null, name: fd.name, price, vat: Number(fd.vat ?? 0), categoryId: fd.categoryId || null, sku: fd.sku || '', openPrice: !!fd.openPrice, active: !!fd.active } });
        close(); toast('Artikel gespeichert.'); await refreshMaster();
      },
    });
  }
  async function refreshMaster() {
    try { await loadMaster(); S.rev += 1; } catch (e) { fail(e); }
    renderView();
  }

  // =============================================================== Berichte
  const PRESETS = {
    today: ['Heute', () => [today(), today()]],
    yesterday: ['Gestern', () => [addDays(today(), -1), addDays(today(), -1)]],
    week: ['7 Tage', () => [addDays(today(), -6), today()]],
    month: ['Dieser Monat', () => [`${today().slice(0, 8)}01`, today()]],
    lastmonth: ['Letzter Monat', () => { const d = new Date(); d.setDate(0); const e = isoDate(d); return [`${e.slice(0, 8)}01`, e]; }],
    year: ['Dieses Jahr', () => [`${today().slice(0, 4)}-01-01`, today()]],
  };
  async function viewReports() {
    const view = $('#view');
    view.className = 'content';
    const f = UI.report;
    view.innerHTML = `<div class="page-actions">
        <div class="seg" id="r-presets">${Object.entries(PRESETS).map(([k, [l]]) => `<button data-p="${k}" class="${f.preset === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <input class="input" type="date" id="r-from" value="${f.from}" style="width:auto" aria-label="Von">
        <input class="input" type="date" id="r-to" value="${f.to}" style="width:auto" aria-label="Bis">
        <span class="spacer"></span>
        <button class="btn sm" id="r-csv">${icon('download')} CSV</button>
        <button class="btn sm" id="r-json" title="Alle Belege mit Kettenwerten">${icon('download')} Belegexport</button>
      </div><div id="r-body"><div class="empty">Bericht wird erstellt …</div></div>`;
    $$('#r-presets button').forEach((b) => b.addEventListener('click', () => {
      f.preset = b.dataset.p; [f.from, f.to] = PRESETS[f.preset][1](); viewReports();
    }));
    const custom = () => { f.preset = ''; f.from = $('#r-from').value || today(); f.to = $('#r-to').value || f.from; viewReports(); };
    $('#r-from').onchange = custom; $('#r-to').onchange = custom;
    let rows;
    try {
      rows = await fetchAll('pay_receipts', (q) => q.gte('created_at', new Date(`${f.from}T00:00:00`).toISOString()).lt('created_at', new Date(`${addDays(f.to, 1)}T00:00:00`).toISOString()), 'created_at', true);
    } catch (e) { $('#r-body') && ($('#r-body').innerHTML = `<div class="card"><div class="empty">${esc(e.message)}</div></div>`); return; }
    if (UI.route !== 'berichte') return;
    $('#r-csv').onclick = () => exportCSV(rows);
    $('#r-json').onclick = () => exportJSON(rows);
    const real = rows.filter((r) => !r.training);
    const sales = real.filter((r) => r.kind === 'sale');
    const total = sum(real, (r) => r.total);
    const net = sum(real, (r) => sum(r.vat, (v) => v.net));
    const stornos = real.filter((r) => r.kind === 'storno');
    // Zahlungsarten netto
    const pm = { cash: 0, card: 0, other: 0 };
    real.forEach((r) => { r.payments.forEach((p) => { pm[p.method] = (pm[p.method] || 0) + p.amount; }); pm.cash -= r.change_given; });
    // Verlauf: je Stunde (ein Tag) oder je Tag
    const oneDay = f.from === f.to;
    const buckets = [];
    if (oneDay) {
      const hours = real.map((r) => new Date(r.created_at).getHours());
      const lo = Math.min(8, ...hours), hi = Math.max(18, ...hours);
      for (let h = lo; h <= hi; h++) buckets.push({ k: h, label: `${h}`, tip: `${pad(h)}:00–${pad(h)}:59`, v: 0 });
      real.forEach((r) => { const b = buckets.find((x) => x.k === new Date(r.created_at).getHours()); if (b) b.v += r.total; });
    } else {
      const days = Math.min(400, Math.round((new Date(`${f.to}T12:00`) - new Date(`${f.from}T12:00`)) / 864e5) + 1);
      const byMonth = days > 62;
      const map = new Map();
      for (let i = 0; i < days; i++) {
        const d = addDays(f.from, i);
        const k = byMonth ? d.slice(0, 7) : d;
        if (!map.has(k)) map.set(k, { k, label: byMonth ? new Date(`${k}-01T12:00`).toLocaleDateString('de-AT', { month: 'short' }) : String(Number(d.slice(8))), tip: byMonth ? new Date(`${k}-01T12:00`).toLocaleDateString('de-AT', { month: 'long', year: 'numeric' }) : new Date(`${d}T12:00`).toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit' }), v: 0 });
      }
      real.forEach((r) => { const d = isoDate(new Date(r.created_at)); const b = map.get(byMonth ? d.slice(0, 7) : d); if (b) b.v += r.total; });
      buckets.push(...map.values());
    }
    const max = Math.max(...buckets.map((b) => b.v), 1);
    const step = niceStep(max);
    const top = Math.ceil(max / step) * step;
    const every = Math.ceil(buckets.length / 16);
    // Top-Artikel
    const items = new Map();
    real.forEach((r) => r.items.forEach((it) => {
      const k = it.productId || it.name;
      const e = items.get(k) || { name: it.name, qty: 0, total: 0 };
      e.qty += it.qty; e.total += it.total; items.set(k, e);
    }));
    const topItems = [...items.values()].filter((x) => x.total !== 0 || x.qty !== 0).sort((a, b) => b.total - a.total).slice(0, 10);
    const vat = {};
    real.forEach((r) => r.vat.forEach((v) => { const e = vat[v.rate] || (vat[v.rate] = { rate: v.rate, net: 0, tax: 0, gross: 0 }); e.net += v.net; e.tax += v.tax; e.gross += v.gross; }));
    const vatRows = Object.values(vat).sort((a, b) => b.rate - a.rate);
    const pmMax = Math.max(...Object.values(pm).map(Math.abs), 1);

    $('#r-body').innerHTML = `<div class="stack">
      <div class="kpis">
        <div class="kpi hero"><span>Umsatz brutto</span><b>${money(total)}</b><small>netto ${money(net)}</small></div>
        <div class="kpi"><span>Belege</span><b>${sales.length}</b><small>${stornos.length} Storno${stornos.length === 1 ? '' : 's'} (${money(sum(stornos, (r) => r.total))})</small></div>
        <div class="kpi"><span>Ø Bon</span><b>${money(sales.length ? Math.round(sum(sales, (r) => r.total) / sales.length) : 0)}</b></div>
        <div class="kpi"><span>Artikel verkauft</span><b>${fmtQty(sum(real, (r) => sum(r.items, (i) => i.qty)))}</b></div>
      </div>
      <div class="card"><div class="card-h"><div><h2>Umsatz ${oneDay ? 'nach Uhrzeit' : buckets.length && buckets[0].k.length === 7 ? 'je Monat' : 'je Tag'}</h2><p>Brutto in Euro, ohne Trainingsbelege</p></div></div>
        <div class="card-b">${real.length ? `<div class="chart" role="img" aria-label="Umsatzverlauf">
          ${[1, 2, 3, 4].map((i) => (step * i <= top ? `<div class="gridline" style="bottom:${(step * i / top) * 100}%"><span>${EUR.format(step * i / 100).replace(/,00/, '')}</span></div>` : '')).join('')}
          ${buckets.map((b) => `<div class="col"><i style="height:${Math.max(0, b.v / top * 100)}%"></i><span class="tip">${esc(b.tip)}: <b>${money(b.v)}</b></span></div>`).join('')}</div>
          <div class="chart-x">${buckets.map((b, i) => `<span>${i % every === 0 ? esc(b.label) : ''}</span>`).join('')}</div>`
    : '<div class="empty">Keine Umsätze im gewählten Zeitraum.</div>'}</div></div>
      <div class="split">
        <div class="card"><div class="card-h"><h2>Top-Artikel</h2></div><div class="card-b flush">${topItems.length ? `<table class="t"><thead><tr><th>Artikel</th><th class="r">Menge</th><th class="r">Umsatz</th></tr></thead><tbody>
          ${topItems.map((x) => `<tr><td>${esc(x.name)}</td><td class="r">${fmtQty(x.qty)}</td><td class="r"><b>${money(x.total)}</b></td></tr>`).join('')}</tbody></table>` : '<div class="empty">–</div>'}</div></div>
        <div class="cards">
          <div class="card"><div class="card-h"><h2>Zahlungsarten</h2></div><div class="card-b"><div class="hbar">
            ${Object.entries(METHODS).map(([k, l]) => `<div><span>${l}</span><em style="width:${Math.max(0, pm[k]) / pmMax * 100}%"></em><b>${money(pm[k])}</b></div>`).join('')}</div></div></div>
          <div class="card"><div class="card-h"><h2>Umsatzsteuer</h2></div><div class="card-b flush">${vatRows.length ? `<table class="t"><thead><tr><th>Satz</th><th class="r">Netto</th><th class="r">USt</th><th class="r">Brutto</th></tr></thead><tbody>
            ${vatRows.map((v) => `<tr><td>${v.rate} %</td><td class="r">${money(v.net)}</td><td class="r">${money(v.tax)}</td><td class="r">${money(v.gross)}</td></tr>`).join('')}</tbody>
            <tfoot><tr><td>Summe</td><td class="r">${money(sum(vatRows, (v) => v.net))}</td><td class="r">${money(sum(vatRows, (v) => v.tax))}</td><td class="r">${money(sum(vatRows, (v) => v.gross))}</td></tr></tfoot></table>` : '<div class="empty">–</div>'}</div></div>
        </div>
      </div>
    </div>`;
  }
  function niceStep(max) {
    const raw = max / 4;
    const mag = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || mag * 10;
  }
  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function exportCSV(rows) {
    const f = UI.report;
    const cell = (v) => { const s = String(v ?? ''); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [['Beleg', 'Datum', 'Uhrzeit', 'Art', 'Training', 'Kassier', 'Artikel', 'Menge', 'Einzelpreis', 'Rabatt', 'USt %', 'Betrag brutto', 'Zahlung'].join(';')];
    rows.forEach((r) => r.items.forEach((it) => lines.push([receiptNo(r), fmtDate(r.created_at), fmtTime(r.created_at), r.kind === 'storno' ? 'Storno' : 'Verkauf', r.training ? 'ja' : 'nein', r.user_name, it.name,
      String(it.qty).replace('.', ','), plain(it.price), plain(it.discount), it.vat, plain(it.total), r.payments.map((p) => METHODS[p.method]).join('+')].map(cell).join(';'))));
    download(`NEXpay-Belege_${f.from}_${f.to}.csv`, `﻿${lines.join('\r\n')}`, 'text/csv;charset=utf-8');
  }
  function exportJSON(rows) {
    const f = UI.report;
    const data = {
      format: 'NEXpay-Belegexport', version: 1, exportedAt: new Date().toISOString(),
      organisation: { name: S.org.name, ...S.org.settings }, from: f.from, to: f.to,
      registers: S.registers.map((r) => ({ id: r.id, name: r.name, code: r.code })),
      receipts: rows.map((r) => ({ number: receiptNo(r), nr: r.nr, register: regOf(r.register_id).code, kind: r.kind, training: r.training, createdAt: r.created_at, cashier: r.user_name,
        items: r.items, total: r.total, vat: r.vat, payments: r.payments, change: r.change_given, stornoOf: r.storno_of, note: r.note, turnover: r.turnover, hash: r.hash })),
    };
    download(`NEXpay-Belegexport_${f.from}_${f.to}.json`, JSON.stringify(data, null, 2), 'application/json');
  }

  // =============================================================== Einstellungen
  const SET_TABS = {
    firma: ['Unternehmen', 'building', true],
    beleg: ['Beleg & Kasse', 'receipt', true],
    kassen: ['Kassen', 'pos', true],
    team: ['Team', 'users', true],
    profil: ['Mein Profil', 'user', false],
    rksv: ['Registrierkasse', 'shield', false],
  };
  function viewSettings() {
    const view = $('#view');
    view.className = 'content';
    const tabs = Object.entries(SET_TABS).filter(([, [, , admin]]) => !admin || isAdmin());
    if (!tabs.some(([k]) => k === UI.setTab)) UI.setTab = tabs[0][0];
    view.innerHTML = `<div class="settings"><nav class="subnav">${tabs.map(([k, [l, ic]]) => `<a href="#/einstellungen" data-tab="${k}" class="${UI.setTab === k ? 'on' : ''}">${icon(ic)}${l}</a>`).join('')}</nav><div id="set-body"></div></div>`;
    $$('[data-tab]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); UI.setTab = a.dataset.tab; viewSettings(); }));
    ({ firma: setFirma, beleg: setBeleg, kassen: setKassen, team: setTeam, profil: setProfil, rksv: setRksv })[UI.setTab]();
  }
  async function saveOrg(patch, name = S.org.name) {
    const me = await rpc('pay_update_org', { p_name: name, p_settings: { ...S.org.settings, ...patch } });
    S.org = me.org; S.rev = me.org.rev;
    toast('Gespeichert.');
    refreshChrome();
  }
  function settingsForm(html, onSave) {
    $('#set-body').innerHTML = html;
    const form = $('#set-body form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(form));
      $$('input[type=checkbox][name]', form).forEach((c) => { fd[c.name] = c.checked; });
      const btn = $('button[type=submit]', form);
      $('.form-error', form)?.remove();
      btn.classList.add('busy');
      try { await onSave(fd); } catch (ex) { const d = document.createElement('div'); d.className = 'form-error'; d.textContent = ex.message; form.prepend(d); } finally { btn.classList.remove('busy'); }
    });
  }
  function setFirma() {
    const s = S.org.settings || {};
    const f = (name, label, attrs = '', span = '') => `<label class="field ${span}"><span>${label}</span><input class="input" name="${name}" value="${esc(s[name] || '')}" ${attrs}></label>`;
    settingsForm(`<form class="card"><div class="card-h"><div><h2>Unternehmen</h2><p>Erscheint im Kopf jedes Belegs (§ 132a BAO: Name des Unternehmens ist Pflicht).</p></div></div>
      <div class="card-b form-grid">
        <div class="grid2">
          <label class="field"><span>Name in NEXpay</span><input class="input" name="orgName" value="${esc(S.org.name)}" maxlength="120" required></label>
          ${f('legalName', 'Firmenwortlaut auf dem Beleg', 'maxlength="120" placeholder="falls abweichend"')}
          ${f('street', 'Straße und Hausnummer', 'maxlength="120"', 'span2')}
          ${f('zip', 'PLZ', 'maxlength="10"')}${f('city', 'Ort', 'maxlength="80"')}
          ${f('phone', 'Telefon', 'maxlength="40"')}${f('email', 'E-Mail', 'maxlength="120" type="email"')}
          ${f('uid', 'UID-Nummer', 'maxlength="20" placeholder="ATU12345678"')}${f('fn', 'Firmenbuchnummer', 'maxlength="40" placeholder="FN 123456a"')}
        </div>
        <label class="check"><input type="checkbox" name="smallBusiness" ${s.smallBusiness ? 'checked' : ''}><span><b>Kleinunternehmerregelung</b><span class="muted small">Umsatzsteuerbefreit nach § 6 Abs. 1 Z 27 UStG – alle Verkäufe werden mit 0 % gebucht und der Hinweis erscheint am Beleg.</span></span></label>
        <div class="row"><span class="spacer"></span><button class="btn primary" type="submit">Speichern</button></div>
      </div></form>`, (fd) => {
      const { orgName, ...rest } = fd;
      return saveOrg({ ...rest, smallBusiness: !!fd.smallBusiness }, orgName);
    });
  }
  function setBeleg() {
    const s = S.org.settings || {};
    settingsForm(`<form class="card"><div class="card-h"><div><h2>Beleg & Kasse</h2><p>Texte am Bon und Rechte der Kassiere.</p></div></div>
      <div class="card-b form-grid">
        <label class="field"><span>Kopfzeile</span><input class="input" name="header" maxlength="200" value="${esc(s.header || '')}" placeholder="z. B. Öffnungszeiten Mo–Fr 7–18 Uhr"></label>
        <label class="field"><span>Fußzeile</span><input class="input" name="footer" maxlength="200" value="${esc(s.footer || '')}" placeholder="Vielen Dank für Ihren Einkauf!"></label>
        <label class="check"><input type="checkbox" name="cashierDiscount" ${s.cashierDiscount !== false ? 'checked' : ''}><span><b>Kassiere dürfen Rabatte geben</b></span></label>
        <label class="check"><input type="checkbox" name="cashierStorno" ${s.cashierStorno !== false ? 'checked' : ''}><span><b>Kassiere dürfen stornieren</b><span class="muted small">Nur Belege des laufenden Tages (vor dem Tagesabschluss). Administratoren dürfen immer stornieren.</span></span></label>
        <div class="row"><span class="spacer"></span><button class="btn primary" type="submit">Speichern</button></div>
      </div></form>`, (fd) => saveOrg({ header: fd.header, footer: fd.footer, cashierDiscount: !!fd.cashierDiscount, cashierStorno: !!fd.cashierStorno }));
  }
  function setKassen() {
    $('#set-body').innerHTML = `<div class="card"><div class="card-h"><div><h2>Kassen</h2><p>Jede Kassa hat eigene Belegnummern, einen Umsatzzähler und einen eigenen Tagesabschluss.</p></div><span class="spacer"></span>
      <button class="btn primary sm" id="reg-new">${icon('plus')} Kassa</button></div>
      <div class="card-b flush"><table class="t"><thead><tr><th>Name</th><th>Kassen-ID</th><th class="r">Belege</th><th class="r">Umsatzzähler</th><th class="r hide-m">Abschlüsse</th></tr></thead><tbody>
      ${S.registers.map((r) => `<tr class="click" data-rid="${r.id}"><td><b>${esc(r.name)}</b> ${r.id === S.registerId ? '<span class="badge green">dieses Gerät</span>' : ''}</td><td class="mono">${esc(r.code)}</td><td class="r">${r.receipt_nr}</td><td class="r">${money(r.turnover)}</td><td class="r hide-m">${r.closing_nr}</td></tr>`).join('')}
      </tbody></table></div></div>`;
    $('#reg-new').onclick = () => openRegister();
    $$('tr[data-rid]').forEach((tr) => tr.addEventListener('click', () => openRegister(S.registers.find((r) => r.id === tr.dataset.rid))));
  }
  function openRegister(r = null) {
    const locked = r && r.receipt_nr > 0;
    modal({
      title: r ? 'Kassa bearbeiten' : 'Neue Kassa', size: 'narrow',
      body: `<label class="field"><span>Name</span><input class="input" name="name" maxlength="60" value="${esc(r?.name || `Kassa ${S.registers.length + 1}`)}" required></label>
        <label class="field"><span>Kassen-ID</span><input class="input mono" name="code" maxlength="32" value="${esc(r?.code || `K${S.registers.length + 1}`)}" ${locked ? 'readonly' : ''} style="text-transform:uppercase">
        <small>${locked ? 'Nach dem ersten Beleg nicht mehr änderbar (Teil der Belegkette).' : 'Buchstaben, Ziffern, - und _. Steht auf jedem Beleg.'}</small></label>
        ${r ? `<label class="check"><input type="checkbox" name="thisDevice" ${r.id === S.registerId ? 'checked' : ''}><span><b>Auf diesem Gerät verwenden</b></span></label>` : ''}`,
      foot: '<button type="button" class="btn" data-close>Abbrechen</button><button type="submit" class="btn primary">Speichern</button>',
      onSubmit: async (fd, close) => {
        const saved = await rpc('pay_save_register', { p: { id: r?.id || null, name: fd.name, code: fd.code } });
        if (!r || fd.thisDevice) { S.registerId = saved.id; safeLS.set(`nexpay:register:${S.org.id}`, saved.id); }
        close(); toast('Kassa gespeichert.');
        await refreshMaster();
      },
    });
  }
  function setTeam() {
    $('#set-body').innerHTML = `<div class="cards">
      <div class="card"><div class="card-h"><div><h2>Einladungscode</h2><p>Neue Mitarbeiter registrieren sich und geben diesen Code ein. Sie starten als Kassier.</p></div></div>
        <div class="card-b row wrap"><span class="code" id="inv">${esc(S.org.inviteCode || '–')}</span>
          <button class="btn" id="inv-copy">${icon('copy')} Kopieren</button><button class="btn ghost" id="inv-new">${icon('refresh')} Neuen Code erzeugen</button></div></div>
      <div class="card"><div class="card-h"><div><h2>Team</h2><p>${S.members.length} Mitglied${S.members.length === 1 ? '' : 'er'} · Administratoren verwalten Artikel, Kassen und Team.</p></div></div>
        <div class="card-b flush">${S.members.map((m) => `<div class="member"><div class="avatar">${esc(initials(m.name))}</div><div><b>${esc(m.name)}</b>${m.id === S.user.id ? ' <span class="badge green">Du</span>' : ''}<br><span class="muted small">${esc(m.email)}</span></div>
          ${m.id === S.user.id ? `<span class="badge">${m.role === 'admin' ? 'Administrator' : 'Kassier'}</span>` : `<select class="input" data-role="${m.id}" style="width:auto;height:34px"><option value="cashier" ${m.role === 'cashier' ? 'selected' : ''}>Kassier</option><option value="admin" ${m.role === 'admin' ? 'selected' : ''}>Administrator</option></select>
          <button class="btn ghost icon sm" data-remove="${m.id}" title="Entfernen" aria-label="Entfernen">${icon('trash')}</button>`}</div>`).join('')}</div></div>
    </div>`;
    $('#inv-copy').onclick = async () => { try { await navigator.clipboard.writeText(S.org.inviteCode); toast('Code kopiert.'); } catch { toast('Kopieren nicht möglich.', 'err'); } };
    $('#inv-new').onclick = async (e) => {
      if (!await confirmBox('Neuen Code erzeugen? Der bisherige Code funktioniert dann nicht mehr.', { ok: 'Neuer Code' })) return;
      const me = await busy(e.currentTarget, () => rpc('pay_rotate_invite'));
      if (me) { S.org = me.org; setTeam(); }
    };
    $$('[data-role]').forEach((sel) => sel.addEventListener('change', async () => {
      const me = await busy(null, () => rpc('pay_set_role', { p_user: sel.dataset.role, p_role: sel.value }));
      if (me) { S.members = me.members; toast('Rolle geändert.'); }
      setTeam();
    }));
    $$('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
      const m = S.members.find((x) => x.id === b.dataset.remove);
      if (!await confirmBox(`${esc(m.name)} aus dem Team entfernen? Der Zugriff endet sofort.`, { ok: 'Entfernen', danger: true })) return;
      const me = await busy(b, () => rpc('pay_remove_member', { p_user: m.id }));
      if (me) { S.members = me.members; setTeam(); }
    }));
  }
  function setProfil() {
    const theme = safeLS.get('nexpay:theme', 'system');
    $('#set-body').innerHTML = `<div class="cards">
      <form class="card" id="pf"><div class="card-h"><h2>Mein Profil</h2></div><div class="card-b form-grid">
        <div class="grid2"><label class="field"><span>Name</span><input class="input" name="name" value="${esc(S.user.name)}" maxlength="80" required></label>
        <label class="field"><span>E-Mail-Adresse</span><input class="input" value="${esc(S.user.email)}" readonly></label></div>
        <p class="small muted">Dein Andrerer-Konto gilt auch für NEXCOUNT. E-Mail-Adresse und Konto verwaltest du dort.</p>
        <div class="row"><span class="spacer"></span><button class="btn primary" type="submit">Speichern</button></div></div></form>
      <form class="card" id="pw"><div class="card-h"><h2>Passwort ändern</h2></div><div class="card-b form-grid">
        <div class="grid2"><label class="field"><span>Neues Passwort</span><input class="input" type="password" name="password" minlength="8" autocomplete="new-password" required></label>
        <label class="field"><span>Wiederholen</span><input class="input" type="password" name="password2" autocomplete="new-password" required></label></div>
        <div class="row"><span class="spacer"></span><button class="btn" type="submit">Passwort ändern</button></div></div></form>
      <div class="card"><div class="card-h"><h2>Darstellung</h2></div><div class="card-b"><div class="seg" id="theme-seg">
        ${[['system', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([k, l]) => `<button data-theme="${k}" class="${theme === k ? 'on' : ''}">${l}</button>`).join('')}</div></div></div>
      <div class="card"><div class="card-h"><div><h2>Organisation</h2><p>${esc(S.org.name)}</p></div></div><div class="card-b row wrap">
        <button class="btn" id="leave">${icon('logout')} Organisation verlassen</button>
        ${isAdmin() ? `<button class="btn danger" id="del-org">${icon('trash')} Organisation löschen</button>` : ''}
        <span class="spacer"></span><button class="btn ghost" id="pf-out">Abmelden</button></div></div>
    </div>`;
    const hook = (id, fn) => {
      const f = $(id);
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(f));
        const btn = $('button[type=submit]', f);
        btn.classList.add('busy');
        try { await fn(fd, f); } catch (ex) { fail(ex); } finally { btn.classList.remove('busy'); }
      });
    };
    hook('#pf', async (fd) => { const me = await rpc('pay_update_profile', { p_name: fd.name }); S.user = me.user; S.members = me.members; refreshChrome(); toast('Profil gespeichert.'); });
    hook('#pw', async (fd, f) => {
      if (fd.password.length < 8) throw new Error('Das Passwort muss mindestens 8 Zeichen haben.');
      if (fd.password !== fd.password2) throw new Error('Die Passwörter stimmen nicht überein.');
      const { error } = await sb.auth.updateUser({ password: fd.password });
      if (error) throw error;
      f.reset(); toast('Passwort geändert.');
    });
    $$('#theme-seg button').forEach((b) => b.addEventListener('click', () => { safeLS.set('nexpay:theme', b.dataset.theme); applyTheme(); themeLogos(); setProfil(); refreshChrome(); }));
    $('#pf-out').onclick = signOut;
    $('#leave').onclick = async (e) => {
      if (!await confirmBox(`<b>${esc(S.org.name)}</b> verlassen? Du verlierst sofort den Zugriff auf Kasse und Belege.`, { ok: 'Verlassen', danger: true })) return;
      const me = await busy(e.currentTarget, () => rpc('pay_leave_org'));
      if (me) { safeLS.del(`nexpay:cart:${S.org.id}`); resetOrg(); }
    };
    $('#del-org') && ($('#del-org').onclick = () => modal({
      title: 'Organisation löschen', size: 'narrow',
      body: `<div class="note warn">${icon('alert')}<span>Alle Artikel, Belege, Abschlüsse und Kassen werden <b>endgültig gelöscht</b>. Belege müssen in Österreich 7 Jahre aufbewahrt werden (§ 132 BAO) – exportiere sie vorher unter Berichte → Belegexport.</span></div>
        <label class="field"><span>Zur Bestätigung den Namen „${esc(S.org.name)}“ eingeben</span><input class="input" name="confirm" autocomplete="off"></label>`,
      foot: '<button type="button" class="btn" data-close>Abbrechen</button><button type="submit" class="btn danger solid">Endgültig löschen</button>',
      onSubmit: async (fd, close) => {
        await rpc('pay_delete_org', { p_confirm: fd.confirm });
        safeLS.del(`nexpay:cart:${S.org.id}`);
        close(); resetOrg();
      },
    }));
  }
  function resetOrg() {
    unsubscribe();
    S.org = null; UI.cart = []; UI.route = 'kasse';
    history.replaceState(null, '', location.pathname);
    loadMe();
  }
  function setRksv() {
    $('#set-body').innerHTML = `<div class="card"><div class="card-h"><div><h2>Registrierkasse (RKSV)</h2><p>Was NEXpay heute leistet – und was für den Echtbetrieb noch fehlt.</p></div></div>
      <div class="card-b stack">
        <div class="note warn">${icon('alert')}<span><b>NEXpay ist derzeit keine registrierte Registrierkasse nach RKSV.</b> Betriebe mit Registrierkassenpflicht (ab 15.000 € Jahresumsatz, davon über 7.500 € bar) brauchen eine Signaturerstellungseinheit, einen Startbeleg und die Registrierung über FinanzOnline. Bis dahin eignet sich NEXpay für Betriebe ohne Registrierkassenpflicht, zum Testen und als Trainingskasse.</span></div>
        <div class="kv">
          <div><span>Fortlaufende, lückenlose Belegnummer je Kassa</span><b class="pos">${icon('check')}</b></div>
          <div><span>Umsatzzähler (ohne Trainingsbuchungen)</span><b class="pos">${icon('check')}</b></div>
          <div><span>Verkettung jedes Belegs mit dem vorigen (SHA-256)</span><b class="pos">${icon('check')}</b></div>
          <div><span>Belege unveränderbar, Korrektur nur per Stornobeleg</span><b class="pos">${icon('check')}</b></div>
          <div><span>Trainingsbuchungen gekennzeichnet</span><b class="pos">${icon('check')}</b></div>
          <div><span>Belegexport mit Kettenwerten</span><b class="pos">${icon('check')}</b></div>
          <div><span>Signatur durch zertifizierte Signaturerstellungseinheit</span><b class="muted">geplant</b></div>
          <div><span>QR-Code nach RKSV, Start-/Monats-/Jahresbeleg</span><b class="muted">geplant</b></div>
        </div>
        <p class="small muted">Belegerteilungspflicht nach § 132a BAO: Jeder Beleg enthält Unternehmen, fortlaufende Nummer, Datum, Menge und Bezeichnung der Waren sowie den Betrag. Die Angaben ersetzen keine Steuerberatung.</p>
      </div></div>`;
  }

  // =============================================================== Tastatur
  document.addEventListener('keydown', (e) => {
    if (!S.org || modals.length || UI.route !== 'kasse') return;
    const typing = /input|select|textarea/i.test(document.activeElement?.tagName || '');
    if (e.key === '/' && !typing) { e.preventDefault(); $('#pos-q')?.focus(); }
    if (e.key === 'F9' || (e.key === 'Enter' && e.ctrlKey)) { e.preventDefault(); if (UI.cart.length) openPayment(); }
  });

  // =============================================================== Start
  async function boot() {
    applyTheme();
    if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
    if (!sb) {
      $('#app').innerHTML = '<div class="onboard"><div class="card card-b"><h2>NEXpay ist nicht konfiguriert</h2><p class="muted">Bitte Supabase-Zugang in config.js eintragen.</p></div></div>';
      return;
    }
    const hashParams = new URLSearchParams(location.hash.replace(/^#\/?/, ''));
    const linkError = hashParams.get('error_description');
    if (linkError) history.replaceState(null, '', location.pathname);

    sb.auth.onAuthStateChange((event) => {
      // keine Supabase-Aufrufe direkt im Callback (Deadlock-Gefahr) → setTimeout
      if (event === 'PASSWORD_RECOVERY') setTimeout(openNewPassword, 0);
      if (event === 'SIGNED_OUT' && S.user) setTimeout(sessionExpired, 0);
    });
    let session = null;
    try { session = (await sb.auth.getSession()).data.session; } catch { /* egal */ }
    if (!session) return renderAuth('login', linkError ? `Der Link ist ungültig oder abgelaufen (${linkError}). Bitte erneut anfordern.` : '');
    await loadMe();
  }

  // Nur lokal: Zugriff für Tests und Fehlersuche
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__nexpay = { S, UI, renderShell, renderView, renderAuth, renderOnboarding, showReceipt, showClosing };
  boot();
})();
