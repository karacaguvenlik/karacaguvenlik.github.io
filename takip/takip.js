// Karaca Güvenlik araç takip paneli — Traccar REST API istemcisi.
(() => {
  'use strict';

  const DEFAULT_SERVER = ''; // örn. 'https://takip.alanadiniz.com' — doldurulursa giriş ekranında hazır gelir
  const POLL_MS = 10000;
  const KNOT_TO_KMH = 1.852;

  const $ = (id) => document.getElementById(id);
  const store = {
    get server() { return localStorage.getItem('tk.server') || DEFAULT_SERVER; },
    set server(v) { localStorage.setItem('tk.server', v); },
    get token() { return localStorage.getItem('tk.token') || sessionStorage.getItem('tk.token'); },
    setToken(t, remember) {
      (remember ? localStorage : sessionStorage).setItem('tk.token', t);
    },
    clear() { localStorage.removeItem('tk.token'); sessionStorage.removeItem('tk.token'); },
  };

  let map, devices = new Map(), positions = new Map(), markers = new Map();
  let selectedId = null, pollTimer = null, routeLayer = null, firstFit = true;

  // ---------- API ----------
  class ApiError extends Error {
    constructor(status, msg) { super(msg); this.status = status; }
  }

  async function api(path, { method = 'GET', body, auth, form } = {}) {
    const headers = { Accept: 'application/json', Authorization: auth || `Bearer ${store.token}` };
    let payload;
    if (form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(form); }
    else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    let res;
    try {
      res = await fetch(store.server.replace(/\/+$/, '') + path, { method, headers, body: payload });
    } catch {
      throw new ApiError(0, 'Sunucuya ulaşılamadı. Adresi, HTTPS sertifikasını ve sunucudaki web.origin ayarını kontrol edin.');
    }
    if (res.status === 401) throw new ApiError(401, 'Kullanıcı adı veya şifre hatalı.');
    if (!res.ok) throw new ApiError(res.status, (await res.text()).slice(0, 200) || `Hata ${res.status}`);
    const type = res.headers.get('content-type') || '';
    return type.includes('json') ? res.json() : res.text();
  }

  const basic = (user, pass) => {
    const bytes = new TextEncoder().encode(`${user}:${pass}`);
    return 'Basic ' + btoa(String.fromCharCode(...bytes));
  };

  // ---------- Giriş ----------
  async function login(e) {
    e.preventDefault();
    const btn = $('loginBtn'), err = $('loginError');
    err.hidden = true; btn.disabled = true;
    store.server = $('server').value.trim();
    try {
      const expiration = new Date(Date.now() + 30 * 864e5).toISOString();
      const token = await api('/api/session/token', {
        method: 'POST', auth: basic($('email').value.trim(), $('password').value), form: { expiration },
      });
      store.clear();
      store.setToken(String(token).trim(), $('remember').checked);
      $('password').value = '';
      await start();
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false;
    } finally { btn.disabled = false; }
  }

  function logout() {
    store.clear();
    clearInterval(pollTimer);
    location.reload();
  }

  // ---------- Harita ----------
  function initMap() {
    if (map) return;
    map = L.map('map', { zoomControl: true }).setView([36.54, 32.0], 11); // Alanya
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Esri',
    });
    L.control.layers({ 'Harita': osm, 'Uydu': sat }).addTo(map);
  }

  const arrow = '<svg viewBox="0 0 24 24"><path d="M12 2l7 19-7-4-7 4z"/></svg>';
  function markerIcon(status, course) {
    return L.divIcon({
      className: '', iconSize: [34, 34], iconAnchor: [17, 17],
      html: `<div class="tk-marker ${status}" style="transform:rotate(${course || 0}deg)">${arrow}</div>`,
    });
  }

  // ---------- Veri ----------
  async function refresh() {
    try {
      const [devs, poss] = await Promise.all([api('/api/devices'), api('/api/positions')]);
      devices = new Map(devs.map((d) => [d.id, d]));
      positions = new Map(poss.map((p) => [p.deviceId, p]));
      render();
      setLive(true);
    } catch (ex) {
      if (ex.status === 401) return logout();
      setLive(false, ex.message);
    }
  }

  function setLive(ok, msg) {
    const el = $('liveStatus');
    el.classList.toggle('is-live', ok);
    el.classList.toggle('is-error', !ok);
    el.title = ok ? `Son güncelleme: ${new Date().toLocaleTimeString('tr-TR')}` : msg;
    el.textContent = ok ? '● Canlı' : '● Bağlantı yok';
  }

  const kmh = (p) => Math.round((p?.speed || 0) * KNOT_TO_KMH);
  const ago = (iso) => {
    if (!iso) return 'veri yok';
    const s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
    if (s < 60) return 'az önce';
    if (s < 3600) return `${Math.floor(s / 60)} dk önce`;
    if (s < 86400) return `${Math.floor(s / 3600)} sa önce`;
    return new Date(iso).toLocaleString('tr-TR');
  };

  function render() {
    const q = $('search').value.trim().toLocaleLowerCase('tr');
    const list = $('deviceList');
    list.replaceChildren();
    const sorted = [...devices.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    for (const d of sorted) {
      const p = positions.get(d.id);
      updateMarker(d, p);
      if (q && !d.name.toLocaleLowerCase('tr').includes(q) && !d.uniqueId.includes(q)) continue;
      const li = document.createElement('li');
      li.className = d.id === selectedId ? 'is-active' : '';
      const dot = el('span', `dot ${d.status}`);
      const name = el('span', 'name', d.name);
      const speed = el('span', 'speed', p ? `${kmh(p)} km/s` : '');
      const ign = p?.attributes?.ignition;
      const sub = el('span', 'sub', `${ign === true ? 'Kontak açık · ' : ign === false ? 'Kontak kapalı · ' : ''}${ago(d.lastUpdate)}`);
      li.append(dot, name, speed, sub);
      li.addEventListener('click', () => select(d.id, true));
      list.append(li);
    }
    if (!list.children.length) {
      list.append(el('li', 'empty', devices.size ? 'Eşleşen araç yok.' : 'Henüz araç eklenmemiş. Araçları sunucunun yönetim arayüzünden IMEI numarasıyla ekleyin.'));
    }
    if (firstFit && markers.size) {
      firstFit = false;
      const b = L.latLngBounds([...markers.values()].map((m) => m.getLatLng()));
      map.fitBounds(b.pad(0.3), { maxZoom: 15 });
    }
    if (selectedId) renderDetail();
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function updateMarker(d, p) {
    if (!p) return;
    const ll = [p.latitude, p.longitude];
    let m = markers.get(d.id);
    if (!m) {
      m = L.marker(ll).addTo(map).bindTooltip('', { permanent: true, direction: 'top', offset: [0, -16], className: 'tk-label' });
      m.on('click', () => select(d.id, false));
      markers.set(d.id, m);
    }
    m.setLatLng(ll).setIcon(markerIcon(d.status, p.course));
    m.setTooltipContent(`${escapeHtml(d.name)} · ${kmh(p)} km/s`);
  }

  const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

  // ---------- Detay ----------
  function select(id, pan) {
    selectedId = id;
    $('detail').hidden = false;
    $('cmdResult').textContent = '';
    clearRoute();
    setRange('today');
    const p = positions.get(id);
    if (pan && p) map.setView([p.latitude, p.longitude], Math.max(map.getZoom(), 15));
    render();
  }

  function renderDetail() {
    const d = devices.get(selectedId), p = positions.get(selectedId);
    if (!d) return;
    $('dName').textContent = d.name;
    const a = p?.attributes || {};
    const rows = [
      ['Durum', { online: 'Çevrimiçi', offline: 'Çevrimdışı' }[d.status] || 'Bilinmiyor'],
      ['Son veri', ago(d.lastUpdate)],
      ['Hız', p ? `${kmh(p)} km/s` : '—'],
      ['Kontak', a.ignition === true ? 'Açık' : a.ignition === false ? 'Kapalı' : '—'],
      ['Akü / güç', a.power != null ? `${Number(a.power).toFixed(1)} V` : a.batteryLevel != null ? `%${a.batteryLevel}` : '—'],
      ['Uydu', a.sat ?? '—'],
      ['Konum zamanı', p ? new Date(p.fixTime).toLocaleString('tr-TR') : '—'],
      ['IMEI', d.uniqueId],
    ];
    if (p?.address) rows.splice(3, 0, ['Adres', p.address]);
    const dl = $('dInfo');
    dl.replaceChildren();
    for (const [k, v] of rows) dl.append(el('dt', null, k), el('dd', null, String(v)));
    if (p) {
      const link = el('a', null, 'Google Haritalar’da aç');
      link.href = `https://www.google.com/maps?q=${p.latitude},${p.longitude}`;
      link.target = '_blank'; link.rel = 'noopener';
      dl.append(el('dt', null, 'Konum'), Object.assign(el('dd'), { append: undefined }));
      dl.lastChild.append(link);
    }
  }

  // ---------- Geçmiş ----------
  const toLocalInput = (d) => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  function setRange(kind) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    let from = start, to = new Date();
    if (kind === 'yesterday') { from = new Date(start - 864e5); to = start; }
    $('hFrom').value = toLocalInput(from);
    $('hTo').value = toLocalInput(to);
  }

  function clearRoute() {
    if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
    $('hClear').hidden = true;
    $('hSummary').textContent = '';
  }

  function distanceKm(pts) {
    const R = 6371, rad = Math.PI / 180;
    let sum = 0;
    for (let i = 1; i < pts.length; i++) {
      const [la1, lo1] = pts[i - 1], [la2, lo2] = pts[i];
      const h = Math.sin((la2 - la1) * rad / 2) ** 2 + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin((lo2 - lo1) * rad / 2) ** 2;
      sum += 2 * R * Math.asin(Math.sqrt(h));
    }
    return sum;
  }

  async function showRoute() {
    if (!selectedId) return;
    const from = new Date($('hFrom').value), to = new Date($('hTo').value);
    if (!(from < to)) { $('hSummary').textContent = 'Başlangıç, bitişten önce olmalı.'; return; }
    clearRoute();
    $('hSummary').textContent = 'Yükleniyor…';
    try {
      const qs = new URLSearchParams({ deviceId: selectedId, from: from.toISOString(), to: to.toISOString() });
      const route = await api(`/api/reports/route?${qs}`);
      if (!route.length) { $('hSummary').textContent = 'Bu aralıkta kayıt yok.'; return; }
      const pts = route.map((p) => [p.latitude, p.longitude]);
      const maxSpeed = Math.max(...route.map(kmh));
      routeLayer = L.layerGroup([
        L.polyline(pts, { color: '#38bdf8', weight: 4, opacity: .9 }),
        L.circleMarker(pts[0], { radius: 7, color: '#fff', fillColor: '#22c55e', fillOpacity: 1 }).bindTooltip('Başlangıç'),
        L.circleMarker(pts.at(-1), { radius: 7, color: '#fff', fillColor: '#ef4444', fillOpacity: 1 }).bindTooltip('Bitiş'),
      ]).addTo(map);
      map.fitBounds(L.latLngBounds(pts).pad(0.15));
      $('hSummary').textContent = `${route.length} kayıt · ${distanceKm(pts).toFixed(1)} km · en yüksek hız ${maxSpeed} km/s`;
      $('hClear').hidden = false;
    } catch (ex) {
      if (ex.status === 401) return logout();
      $('hSummary').textContent = ex.message;
    }
  }

  // ---------- Komutlar ----------
  const CMD_LABEL = { engineStop: 'Motoru durdur', engineResume: 'Motoru çalıştır', custom: 'Özel komut' };
  async function sendCommand(type, btn) {
    const d = devices.get(selectedId);
    if (!d) return;
    const body = { deviceId: d.id, type };
    if (type === 'custom') {
      const data = $('customCmd').value.trim();
      if (!data) { $('cmdResult').textContent = 'Önce komutu yazın.'; return; }
      body.attributes = { data };
    }
    const warn = type === 'engineStop'
      ? `${d.name} için MOTOR DURDURULACAK.\nAraç hareket halindeyse tehlikeli olabilir. Devam edilsin mi?`
      : `${d.name}: "${CMD_LABEL[type]}" gönderilsin mi?`;
    if (!confirm(warn)) return;
    btn.disabled = true;
    $('cmdResult').textContent = 'Gönderiliyor…';
    try {
      // Traccar returns 202 when the device is offline and the command is queued.
      const res = await fetch(store.server.replace(/\/+$/, '') + '/api/commands/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${store.token}` },
        body: JSON.stringify(body),
      });
      if (res.status === 401) return logout();
      if (!res.ok) throw new Error((await res.text()).slice(0, 200) || `Hata ${res.status}`);
      $('cmdResult').textContent = res.status === 202
        ? 'Cihaz çevrimdışı; komut sıraya alındı, bağlandığında gönderilecek.'
        : 'Komut cihaza gönderildi.';
    } catch (ex) {
      $('cmdResult').textContent = `Gönderilemedi: ${ex.message}`;
    } finally { btn.disabled = false; }
  }

  // ---------- Başlat ----------
  async function start() {
    $('loginView').hidden = true;
    $('appView').hidden = false;
    initMap();
    map.invalidateSize();
    await refresh();
    clearInterval(pollTimer);
    pollTimer = setInterval(refresh, POLL_MS);
  }

  $('server').value = store.server;
  $('loginForm').addEventListener('submit', login);
  $('logoutBtn').addEventListener('click', logout);
  $('search').addEventListener('input', render);
  $('dClose').addEventListener('click', () => { selectedId = null; $('detail').hidden = true; clearRoute(); render(); });
  $('hShow').addEventListener('click', showRoute);
  $('hClear').addEventListener('click', clearRoute);
  document.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => { setRange(b.dataset.range); showRoute(); }));
  document.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () => sendCommand(b.dataset.cmd, b)));
  $('listToggle').addEventListener('click', () => {
    const side = $('sidebar');
    const collapsed = side.classList.toggle('is-collapsed');
    $('listToggle').setAttribute('aria-expanded', String(!collapsed));
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && store.token && map) refresh(); });

  if (store.token && store.server) start();
})();
