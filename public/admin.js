(() => {
  'use strict';
  const LANGS = [['tr', 'Türkçe'], ['en', 'English'], ['de', 'Deutsch'], ['ru', 'Русский']];
  const API = '/api';
  const $ = (selector, root = document) => root.querySelector(selector);
  const state = { user: null, catalog: null, orders: [], view: 'dashboard', sound: false, knownOrderIds: new Set(), polling: false, orderFilter: 'all', search: '' };
  const labels = {
    new: 'Yeni', accepted: 'Onaylandı', preparing: 'Hazırlanıyor', on_way: 'Yola çıktı', completed: 'Tamamlandı', cancelled: 'İptal edildi'
  };
  const pageNames = { dashboard: 'Genel bakış', orders: 'Siparişler', products: 'Ürünler', categories: 'Kategoriler', regions: 'Teslimat bölgeleri', settings: 'Site ayarları', users: 'Kullanıcılar' };
  const owner = () => state.user?.role === 'owner';

  function node(tag, attrs = {}, ...children) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value == null || value === false) continue;
      if (key === 'className') element.className = value;
      else if (key === 'dataset') Object.assign(element.dataset, value);
      else if (key === 'checked' || key === 'disabled' || key === 'selected' || key === 'multiple' || key === 'required' || key === 'hidden') element[key] = Boolean(value);
      else if (key === 'text') element.textContent = String(value);
      else if (key.startsWith('on') && typeof value === 'function') element.addEventListener(key.slice(2).toLowerCase(), value);
      else element.setAttribute(key, String(value));
    }
    for (const child of children.flat(Infinity)) {
      if (child == null || child === false) continue;
      element.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return element;
  }
  function money(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(amount) : '—';
  }
  function date(value, includeTime = true) {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return new Intl.DateTimeFormat('tr-TR', includeTime ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'long', year: 'numeric' }).format(parsed);
  }
  function valueText(value) {
    if (value == null) return '—';
    if (typeof value === 'object') return value.tr || value.en || Object.values(value)[0] || '—';
    return String(value);
  }
  function orderId(order) { return order.id ?? order.orderNumber ?? '—'; }
  function customer(order) { return order.customer || order; }
  function orderName(order) { const c = customer(order); return c.name || c.fullName || 'Müşteri'; }
  function orderTotal(order) { return order.total ?? order.totalAmount ?? order.grandTotal; }
  function orderItems(order) { return Array.isArray(order.items) ? order.items : []; }
  function paymentLabel(method) { return ({ cash: 'Kapıda nakit', card_on_delivery: 'Kapıda kredi kartı', online: 'İnternetten kredi kartı' })[method] || valueText(method); }
  function statusBadge(status) { return node('span', { className: `badge status-${status || 'new'}` }, labels[status] || 'Durum bilinmiyor'); }

  async function request(path, options = {}) {
    const config = { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } };
    const response = await fetch(`${API}${path}`, config);
    let body = null;
    if (response.status !== 204) {
      const text = await response.text();
      if (text) {
        try { body = JSON.parse(text); } catch { body = { message: text }; }
      }
    }
    if (!response.ok) {
      const error = new Error(body?.message || body?.error || `İstek başarısız (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return body;
  }
  function showToast(message, isError = false) {
    const region = $('#toast-region');
    const toast = node('div', { className: `toast${isError ? ' error' : ''}`, role: 'status' }, message);
    region.append(toast);
    window.setTimeout(() => toast.remove(), 4300);
  }
  function handleError(error, context) {
    if (error?.status === 401) { showLogin(); return; }
    showToast(`${context}: ${error.message || 'Beklenmeyen bir hata oluştu.'}`, true);
  }
  function showLogin() {
    state.user = null;
    $('#app-view').hidden = true;
    $('#login-view').hidden = false;
    $('#login-error').hidden = true;
  }
  function showApp(user) {
    state.user = user;
    $('#login-view').hidden = true;
    $('#app-view').hidden = false;
    $('#user-name').textContent = user.username || 'Yönetici';
    $('#user-role').textContent = owner() ? 'İşletme sahibi' : 'Ekip üyesi';
    $('#user-avatar').textContent = (user.username || 'Ç').slice(0, 1).toLocaleUpperCase('tr-TR');
    document.querySelectorAll('.owner-only').forEach(item => item.hidden = !owner());
    if (!owner() && !['orders'].includes(state.view)) state.view = 'orders';
    $('#today-label').textContent = date(new Date(), false);
    loadCatalog();
    loadOrders(true);
    if (!state.polling) {
      state.polling = true;
      window.setInterval(() => { if (state.user) loadOrders(false); }, 8000);
    }
  }
  async function loadCatalog() {
    try {
      state.catalog = await request('/catalog');
      if (!state.catalog || typeof state.catalog !== 'object') throw new Error('Katalog yanıtı beklenen biçimde değil.');
      if (owner()) {
        const paths = [['products', '/admin/products'], ['categories', '/admin/categories'], ['regions', '/admin/regions']];
        const results = await Promise.allSettled(paths.map(([, path]) => request(path)));
        results.forEach((result, index) => { if (result.status === 'fulfilled' && Array.isArray(result.value)) state.catalog[paths[index][0]] = result.value; });
      }
      render();
    } catch (error) { handleError(error, 'Mağaza bilgileri yüklenemedi'); }
  }
  async function loadOrders(initial = false) {
    if (!state.user) return;
    try {
      const response = await request('/admin/orders');
      const orders = Array.isArray(response) ? response : response?.orders;
      if (!Array.isArray(orders)) throw new Error('Sipariş yanıtı dizi biçiminde olmalı.');
      const incoming = new Set(orders.map(order => String(orderId(order))));
      if (!initial && state.sound && state.knownOrderIds.size) {
        const fresh = orders.filter(order => !state.knownOrderIds.has(String(orderId(order))) && order.status === 'new');
        if (fresh.length) playNotification();
      }
      state.knownOrderIds = incoming;
      state.orders = orders;
      $('#last-refresh').textContent = `Son güncelleme ${new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date())} · 8 sn aralıkla`;
      const pending = orders.filter(order => !['completed', 'cancelled'].includes(order.status)).length;
      const count = $('#nav-order-count');
      count.textContent = String(pending);
      count.hidden = pending === 0;
      render();
    } catch (error) { handleError(error, 'Siparişler güncellenemedi'); }
  }
  function playNotification() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const audio = new AudioContext();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(.08, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .35);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(); oscillator.stop(audio.currentTime + .35);
      oscillator.onended = () => audio.close();
    } catch { /* Ses desteği tarayıcıya bağlıdır. */ }
  }
  function navigate(view) {
    if (!pageNames[view] || (!owner() && view !== 'orders')) return;
    state.view = view;
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    $('#page-title').textContent = pageNames[view];
    $('#sidebar').classList.remove('open'); $('#sidebar-scrim').classList.remove('visible');
    render();
    $('#page-content').focus({ preventScroll: true });
  }
  function render() {
    if (!state.user || !$('#page-content')) return;
    if (!owner() && state.view !== 'orders') state.view = 'orders';
    const root = $('#page-content');
    root.replaceChildren();
    if (state.view === 'dashboard') root.append(renderDashboard());
    else if (state.view === 'orders') root.append(renderOrders());
    else if (state.view === 'products') root.append(renderProducts());
    else if (state.view === 'categories') root.append(renderCategories());
    else if (state.view === 'regions') root.append(renderRegions());
    else if (state.view === 'settings') root.append(renderSettings());
    else if (state.view === 'users') root.append(renderUsers());
  }
  function heading(title, subtitle, action) {
    const box = node('div', { className: 'page-heading' }, node('div', {}, node('h2', {}, title), node('p', {}, subtitle)));
    if (action) box.append(action);
    return box;
  }
  function statCard(title, value, foot, icon) {
    return node('article', { className: 'stat-card' }, node('div', { className: 'stat-top' }, title, node('span', { className: 'stat-icon', 'aria-hidden': 'true' }, icon)), node('div', { className: 'stat-value' }, value), node('div', { className: 'stat-foot' }, foot));
  }
  function renderDashboard() {
    const orders = state.orders;
    const pending = orders.filter(order => ['new', 'accepted', 'preparing', 'on_way'].includes(order.status));
    const newCount = orders.filter(order => order.status === 'new').length;
    const completed = orders.filter(order => order.status === 'completed');
    const todayOrders = orders.filter(order => {
      const value = new Date(order.createdAt || order.created_at || order.date || 0);
      const now = new Date(); return !Number.isNaN(value.getTime()) && value.toDateString() === now.toDateString();
    });
    const todayRevenue = completed.filter(order => {
      const value = new Date(order.updatedAt || order.createdAt || order.created_at || 0); return value.toDateString() === new Date().toDateString();
    }).reduce((sum, order) => sum + (Number(orderTotal(order)) || 0), 0);
    const section = node('section', {}, heading('Günün özeti', 'Sipariş akışınızı ve mağaza durumunuzu buradan takip edin.'),
      node('div', { className: 'dashboard-grid' },
        statCard('Bugünkü sipariş', String(todayOrders.length), 'Bugün oluşturulan siparişler', '▤'),
        statCard('Aktif sipariş', String(pending.length), 'Teslimat sürecindeki siparişler', '◷'),
        statCard('Yeni sipariş', String(newCount), 'İşlem bekleyen siparişler', '✦'),
        statCard('Bugün tamamlanan satış', money(todayRevenue), 'Tamamlanan siparişlerden', '₺')));
    const latest = [...orders].sort((a, b) => new Date(b.createdAt || b.created_at || b.date || 0) - new Date(a.createdAt || a.created_at || a.date || 0)).slice(0, 5);
    const list = node('div', { className: 'order-list' });
    if (!latest.length) list.append(node('div', { className: 'empty-state' }, 'Henüz sipariş bulunmuyor. Yeni siparişler burada görünecek.'));
    latest.forEach(order => {
      const row = node('div', {
        className: 'order-row', role: 'button', tabindex: '0',
        onClick: () => openOrder(order),
        onKeydown: event => { if (event.key === 'Enter' || event.key === ' ') openOrder(order); }
      },
      node('div', { className: 'order-row-main' },
        node('div', {}, node('div', { className: 'order-number' }, `#${orderId(order)}`), node('div', { className: 'order-customer' }, orderName(order))),
        statusBadge(order.status)),
      node('div', { className: 'order-meta' }, node('div', { className: 'order-price' }, money(orderTotal(order))), node('div', { className: 'order-time' }, date(order.createdAt || order.created_at || order.date))));
      list.append(row);
    });
    const orderPanel = node('article', { className: 'panel-card' }, node('div', { className: 'panel-title' }, node('h3', {}, 'Son siparişler'), node('a', { href: '#orders', onClick: event => { event.preventDefault(); navigate('orders'); } }, 'Tümünü gör →')), list);
    const open = state.catalog?.settings?.open;
    const quick = node('article', { className: 'panel-card' }, node('div', { className: 'panel-title' }, node('h3', {}, 'Mağaza durumu')),
      node('div', { className: 'quick-card' }, node('span', { className: 'quick-icon' }, open === false ? '◌' : '●'), node('div', {}, node('strong', {}, 'Sipariş kabulü'), node('small', {}, state.catalog ? (open === false ? 'Mağaza şu an sipariş almıyor.' : 'Mağaza sipariş almaya açık.') : 'Mağaza bilgisi yükleniyor.'), owner() ? node('a', { href: '#settings', onClick: event => { event.preventDefault(); navigate('settings'); } }, 'Mağaza ayarları →') : null)),
      node('div', { className: 'quick-card' }, node('span', { className: 'quick-icon' }, '⌖'), node('div', {}, node('strong', {}, 'Teslimat bölgeleri'), node('small', {}, `${state.catalog?.regions?.filter(region => region.active !== false).length ?? '—'} aktif bölge`), owner() ? node('a', { href: '#regions', onClick: event => { event.preventDefault(); navigate('regions'); } }, 'Bölgeleri düzenle →') : null)));
    section.append(node('div', { className: 'dashboard-bottom' }, orderPanel, quick));
    return section;
  }
  function renderOrders() {
    const section = node('section', {}, heading('Sipariş takibi', 'Yeni siparişleri görüntüleyin ve durumlarını güncelleyin.'));
    const filters = node('div', { className: 'toolbar-group' });
    const search = node('input', { className: 'search-input', type: 'search', placeholder: 'Sipariş veya müşteri ara', 'aria-label': 'Sipariş veya müşteri ara', value: state.search, onInput: event => { state.search = event.target.value; refreshOrderRows(); } });
    const filter = node('select', { className: 'select-control', 'aria-label': 'Sipariş durumuna göre filtrele', onChange: event => { state.orderFilter = event.target.value; refreshOrderRows(); } });
    [['all', 'Tüm siparişler'], ...Object.entries(labels)].forEach(([value, label]) => filter.append(node('option', { value, selected: state.orderFilter === value }, label)));
    filters.append(search, filter);
    const toolbar = node('div', { className: 'table-toolbar' }, node('div', { className: 'toolbar-group' }, node('strong', { id: 'orders-count', className: 'cell-main' }, `${state.orders.length} sipariş`)), filters);
    const mobileNote = node('div', { className: 'mobile-note' }, 'Tabloyu yatay kaydırarak tüm bilgileri görüntüleyin.');
    const table = node('div', { className: 'table-scroll' }, node('table', {}, node('thead', {}, node('tr', {}, ...['Sipariş', 'Müşteri', 'Tarih', 'Ödeme', 'Tutar', 'Durum', ''].map(label => node('th', {}, label)))), node('tbody', { id: 'orders-tbody' })));
    section.append(node('div', { className: 'table-card' }, toolbar, mobileNote, table));
    renderOrderRows();
    return section;
  }
  function refreshOrderRows() { if (state.view === 'orders') renderOrderRows(); }
  function renderOrderRows() {
    const body = $('#orders-tbody'); if (!body) return;
    body.replaceChildren();
    const needle = state.search.trim().toLocaleLowerCase('tr-TR');
    const filtered = state.orders.filter(order => {
      const matchesStatus = state.orderFilter === 'all' || order.status === state.orderFilter;
      const c = customer(order);
      const matchesSearch = !needle || [orderId(order), orderName(order), c.phone, c.address].some(value => String(value || '').toLocaleLowerCase('tr-TR').includes(needle));
      return matchesStatus && matchesSearch;
    });
    const count = $('#orders-count'); if (count) count.textContent = `${filtered.length} sipariş`;
    if (!filtered.length) { body.append(node('tr', {}, node('td', { colspan: '7', className: 'table-empty' }, state.orders.length ? 'Bu filtreyle eşleşen sipariş yok.' : 'Henüz sipariş yok. Yeni siparişler burada görünecek.'))); return; }
    filtered.forEach(order => {
      const c = customer(order);
      const status = node('select', { className: 'inline-select', 'aria-label': `#${orderId(order)} sipariş durumunu değiştir`, onChange: event => updateOrder(order, event.target.value, event.target) });
      Object.entries(labels).forEach(([value, label]) => status.append(node('option', { value, selected: order.status === value }, label)));
      body.append(node('tr', {}, node('td', {}, node('div', { className: 'cell-main' }, `#${orderId(order)}`), node('div', { className: 'cell-sub' }, `${orderItems(order).length} ürün`)), node('td', {}, node('div', { className: 'cell-main' }, orderName(order)), node('div', { className: 'cell-sub' }, c.phone || 'Telefon yok')), node('td', {}, date(order.createdAt || order.created_at || order.date)), node('td', {}, paymentLabel(order.paymentMethod || order.payment?.method || order.paymentType)), node('td', { className: 'cell-main' }, money(orderTotal(order))), node('td', {}, status), node('td', {}, node('div', { className: 'order-actions' }, node('button', { className: 'text-button', type: 'button', onClick: () => openOrder(order) }, 'Detay')))));
    });
  }
  async function updateOrder(order, nextStatus, select) {
    if (nextStatus === order.status) return;
    select.disabled = true;
    try {
      await request(`/admin/orders/${encodeURIComponent(order.id)}`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) });
      order.status = nextStatus;
      showToast(`Sipariş #${orderId(order)}: ${labels[nextStatus] || nextStatus}`);
      render();
    } catch (error) { select.value = order.status || 'new'; handleError(error, 'Sipariş durumu kaydedilemedi'); }
    finally { select.disabled = false; }
  }
  function dialogBase(title, subtitle) {
    const close = node('button', { className: 'dialog-close', type: 'button', 'aria-label': 'Pencereyi kapat', onClick: closeDialog }, '×');
    return node('div', {}, node('div', { className: 'dialog-heading' }, node('div', {}, node('h2', { id: 'dialog-title' }, title), subtitle ? node('p', {}, subtitle) : null), close));
  }
  function showDialog(content) {
    $('#dialog-content').replaceChildren(content);
    const dialog = $('#app-dialog');
    if (!dialog.open) dialog.showModal();
  }
  function closeDialog() { $('#app-dialog').close(); $('#dialog-content').replaceChildren(); }
  function openOrder(order) {
    const c = customer(order);
    const detail = node('div', {}, dialogBase(`Sipariş #${orderId(order)}`, date(order.createdAt || order.created_at || order.date)), node('div', { className: 'detail-grid' },
      detailBox('Müşteri', orderName(order)), detailBox('Telefon', c.phone ? node('a', { href: `tel:${String(c.phone).replace(/[^+\d]/g, '')}` }, c.phone) : '—'), detailBox('Teslimat adresi', c.address || order.address || '—'), detailBox('Bölge', valueText(order.region?.name || order.regionName || state.catalog?.regions?.find(region => String(region.id) === String(order.regionId))?.name || order.deliveryRegion)), detailBox('Ödeme yöntemi', paymentLabel(order.paymentMethod || order.payment?.method || order.paymentType)), detailBox('Durum', node('span', { className: `badge status-${order.status || 'new'}` }, labels[order.status] || 'Durum bilinmiyor'))));
    const items = node('div', { className: 'order-detail-items' });
    if (!orderItems(order).length) items.append(node('p', { className: 'cell-sub' }, 'Ürün kalemi bilgisi bulunmuyor.'));
    orderItems(order).forEach(item => {
      const quantity = Number(item.quantity ?? item.qty ?? 1);
      const unit = Number(item.price ?? item.unitPrice ?? 0);
      const lineTotal = item.lineTotal ?? item.total ?? item.subtotal ?? unit * quantity;
      items.append(node('div', { className: 'detail-item' }, node('span', {}, `${valueText(item.name || item.productName || item.product?.name)} × ${quantity}`), node('strong', {}, money(lineTotal))));
    });
    const note = c.note || order.note || order.customerNote;
    detail.append(node('h3', { className: 'card-title' }, 'Sipariş içeriği'), items, node('div', { className: 'detail-total' }, node('span', {}, 'Toplam'), node('span', {}, money(orderTotal(order)))));
    if (note) detail.append(detailBox('Müşteri notu', note));
    const status = node('select', { className: 'select-control', 'aria-label': 'Sipariş durumu' });
    Object.entries(labels).forEach(([value, label]) => status.append(node('option', { value, selected: order.status === value }, label)));
    detail.append(node('div', { className: 'dialog-actions' }, node('button', { className: 'button button-light', type: 'button', onClick: closeDialog }, 'Kapat'), node('button', { className: 'button button-primary', type: 'button', onClick: () => { const next = status.value; closeDialog(); updateOrder(order, next, status); } }, 'Durumu kaydet')));
    detail.insertBefore(node('div', { className: 'form-grid', style: 'margin-top:14px' }, node('label', {}, 'Yeni durum', status)), detail.lastChild);
    showDialog(detail);
  }
  function detailBox(label, value) { return node('div', { className: 'detail-box' }, node('small', {}, label), typeof value === 'string' ? node('strong', {}, value) : value); }

  function renderProducts() {
    const products = state.catalog?.products || [];
    const section = node('section', {}, heading('Ürünler', 'Menüde yayınlanan ürünleri ve dört dildeki içeriklerini yönetin.', node('button', { type: 'button', className: 'button button-primary', onClick: () => productDialog() }, '+ Ürün ekle')));
    if (!state.catalog) section.append(node('div', { className: 'empty-state' }, 'Katalog yükleniyor…'));
    else if (!products.length) section.append(node('div', { className: 'content-card empty-state' }, 'Henüz ürün eklenmemiş. İlk ürününüzü oluşturabilirsiniz.'));
    else {
      const grid = node('div', { className: 'product-grid' });
      products.forEach(product => {
        const category = (state.catalog.categories || []).find(item => String(item.id) === String(product.categoryId));
        const photo = node('div', { className: 'product-photo' });
        const image = safeImage(product.image);
        if (image) photo.append(node('img', { src: image, alt: valueText(product.name), loading: 'lazy' })); else photo.textContent = 'Görsel eklenmemiş';
        const body = node('div', { className: 'product-body' }, node('div', { className: 'product-line' }, node('div', {}, node('h3', {}, valueText(product.name)), node('div', { className: 'product-category' }, category ? valueText(category.name) : 'Kategori seçilmemiş')), node('span', { className: 'product-price' }, money(product.price))));
        if (product.active === false) body.append(node('span', { className: 'inactive-tag' }, 'Yayında değil'));
        body.append(node('div', { className: 'product-actions' }, node('button', { type: 'button', className: 'button button-light button-small', onClick: () => productDialog(product) }, 'Düzenle'), node('button', { type: 'button', className: 'button button-light button-small', onClick: () => toggleProduct(product) }, product.active === false ? 'Yayına al' : 'Yayından kaldır')));
        grid.append(node('article', { className: 'product-card' }, photo, body));
      });
      section.append(grid);
    }
    return section;
  }
  function safeImage(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    const input = value.trim();
    if (input.startsWith('/') && !input.startsWith('//')) return input;
    try { const url = new URL(input); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
  }
  function addMultiLangFields(parent, { title, key, initial = {}, multiline = false, required = false }) {
    const fieldset = node('fieldset', { className: 'lang-fieldset' }, node('legend', {}, title));
    const fields = node('div', { className: 'language-fields' });
    LANGS.forEach(([code, language]) => {
      const control = node(multiline ? 'textarea' : 'input', { name: `${key}.${code}`, maxlength: multiline ? '700' : '180', required: required && code === 'tr', ...(multiline ? {} : { type: 'text' }) });
      control.value = initial?.[code] || '';
      fields.append(node('label', {}, `${language}${required && code === 'tr' ? ' *' : ''}`, control));
    });
    fieldset.append(fields); parent.append(fieldset); return fieldset;
  }
  function getFormObject(form, name) {
    return Object.fromEntries(LANGS.map(([code]) => [code, form.elements.namedItem(`${name}.${code}`).value.trim()]));
  }
  function productDialog(product = null) {
    const editing = Boolean(product);
    const form = node('form', { className: 'dialog-form form-stack', onSubmit: async event => {
      event.preventDefault();
      const data = new FormData(form);
      const imageInput = String(data.get('image') || '').trim();
      if (imageInput && !safeImage(imageInput)) { showToast('Görsel adresi https:// veya güvenli bir /yol biçiminde olmalı.', true); return; }
      const payload = { name: getFormObject(form, 'name'), description: getFormObject(form, 'description'), price: Number(data.get('price')), categoryId: data.get('categoryId') || null, image: imageInput, active: form.elements.active.checked };
      if (!Number.isFinite(payload.price) || payload.price < 0) { showToast('Fiyat sıfır veya daha büyük olmalı.', true); return; }
      await saveDialogForm(form, `/admin/products${editing ? `/${encodeURIComponent(product.id)}` : ''}`, editing ? 'PATCH' : 'POST', payload, 'Ürün kaydedildi.');
    } });
    const content = node('div', {}, dialogBase(editing ? 'Ürünü düzenle' : 'Yeni ürün', 'Ürün adı ve açıklamasını dört dilde düzenleyin.'), form);
    addMultiLangFields(form, { title: 'Ürün adı', key: 'name', initial: product?.name || {}, required: true });
    addMultiLangFields(form, { title: 'Açıklama', key: 'description', initial: product?.description || {}, multiline: true });
    const category = node('select', { name: 'categoryId' }, node('option', { value: '' }, 'Kategori seçin'));
    (state.catalog?.categories || []).forEach(item => category.append(node('option', { value: item.id, selected: String(item.id) === String(product?.categoryId) }, valueText(item.name))));
    const price = node('input', { name: 'price', type: 'number', min: '0', step: '0.01', required: true }); price.value = product?.price ?? '';
    const image = node('input', { name: 'image', type: 'text', inputmode: 'url', placeholder: '/images/product.jpg veya https://…', maxlength: '1000' }); image.value = product?.image || '';
    const active = node('input', { name: 'active', type: 'checkbox', checked: product ? product.active !== false : true });
    form.append(node('div', { className: 'form-grid' }, node('label', {}, 'Kategori', category), node('label', {}, 'Fiyat (₺)', price), node('label', { className: 'full-width' }, 'Ürün görseli (güvenli URL veya site içi yol)', image), node('label', { className: 'check-row full-width' }, active, 'Ürün yayında')));
    form.append(node('div', { className: 'dialog-actions' }, node('button', { type: 'button', className: 'button button-light', onClick: closeDialog }, 'Vazgeç'), node('button', { type: 'submit', className: 'button button-primary' }, editing ? 'Değişiklikleri kaydet' : 'Ürünü oluştur')));
    showDialog(content);
  }
  async function toggleProduct(product) {
    try {
      await request(`/admin/products/${encodeURIComponent(product.id)}`, { method: 'PATCH', body: JSON.stringify({ active: product.active === false }) });
      product.active = product.active === false;
      showToast(product.active ? 'Ürün yayına alındı.' : 'Ürün yayından kaldırıldı.'); render();
    } catch (error) { handleError(error, 'Ürün durumu değiştirilemedi'); }
  }
  function renderCategories() {
    const categories = state.catalog?.categories || [];
    const section = node('section', {}, heading('Kategoriler', 'Menü kategorilerini dört dilde yönetin.', node('button', { type: 'button', className: 'button button-primary', onClick: () => categoryDialog() }, '+ Kategori ekle')));
    if (!state.catalog) section.append(node('div', { className: 'empty-state' }, 'Kategoriler yükleniyor…'));
    else if (!categories.length) section.append(node('div', { className: 'content-card empty-state' }, 'Henüz kategori eklenmemiş.'));
    else {
      const grid = node('div', { className: 'category-grid' });
      categories.forEach(category => grid.append(node('article', { className: 'category-card' },
        node('div', { className: 'product-line' }, node('strong', {}, valueText(category.name)), node('span', { className: `badge ${category.active === false ? 'status-cancelled' : 'status-completed'}` }, category.active === false ? 'Kapalı' : 'Aktif')),
        node('p', {}, `${(state.catalog.products || []).filter(product => String(product.categoryId) === String(category.id)).length} ürün`),
        node('div', { className: 'product-actions' }, node('button', { type: 'button', className: 'button button-light button-small', onClick: () => categoryDialog(category) }, 'Düzenle'), node('button', { type: 'button', className: 'button button-light button-small', onClick: () => toggleCategory(category) }, category.active === false ? 'Etkinleştir' : 'Kapat')))));
      section.append(grid);
    }
    return section;
  }
  function categoryDialog(category = null) {
    const editing = Boolean(category);
    const form = node('form', { className: 'dialog-form form-stack', onSubmit: async event => {
      event.preventDefault();
      const payload = { name: getFormObject(form, 'name'), active: form.elements.active.checked };
      if (!payload.name.tr) { showToast('Türkçe kategori adı gerekli.', true); return; }
      await saveDialogForm(form, `/admin/categories${editing ? `/${encodeURIComponent(category.id)}` : ''}`, editing ? 'PATCH' : 'POST', payload, 'Kategori kaydedildi.');
    } });
    addMultiLangFields(form, { title: 'Kategori adı', key: 'name', initial: category?.name || {}, required: true });
    const active = node('input', { name: 'active', type: 'checkbox', checked: category ? category.active !== false : true });
    form.append(node('label', { className: 'check-row' }, active, 'Kategori yayında'), node('div', { className: 'dialog-actions' }, node('button', { type: 'button', className: 'button button-light', onClick: closeDialog }, 'Vazgeç'), node('button', { type: 'submit', className: 'button button-primary' }, editing ? 'Değişiklikleri kaydet' : 'Kategoriyi oluştur')));
    showDialog(node('div', {}, dialogBase(editing ? 'Kategoriyi düzenle' : 'Yeni kategori'), form));
  }
  async function toggleCategory(category) {
    try {
      await request(`/admin/categories/${encodeURIComponent(category.id)}`, { method: 'PATCH', body: JSON.stringify({ active: category.active === false }) });
      category.active = category.active === false;
      showToast(category.active ? 'Kategori etkinleştirildi.' : 'Kategori kapatıldı.'); await loadCatalog();
    } catch (error) { handleError(error, 'Kategori durumu değiştirilemedi'); }
  }

  function renderRegions() {
    const regions = state.catalog?.regions || [];
    const section = node('section', {}, heading('Teslimat bölgeleri', 'Alanya içindeki servis alanlarını ve minimum sepet tutarını yönetin.', node('button', { type: 'button', className: 'button button-primary', onClick: () => regionDialog() }, '+ Bölge ekle')));
    section.append(node('div', { className: 'notice' }, node('span', { className: 'notice-icon', 'aria-hidden': 'true' }, '⌖'), node('div', {}, node('strong', {}, 'Bölge sipariş limiti'), 'Minimum sepet tutarı, müşterinin o bölgeye sipariş verebilmesi için ulaşması gereken tutardır. Aktif olmayan bölgeler siparişe kapalıdır.')));
    if (!state.catalog) section.append(node('div', { className: 'empty-state' }, 'Bölgeler yükleniyor…'));
    else if (!regions.length) section.append(node('div', { className: 'content-card empty-state' }, 'Henüz teslimat bölgesi eklenmemiş.'));
    else {
      const grid = node('div', { className: 'region-grid' });
      regions.forEach(region => {
        const card = node('article', { className: 'region-card' }, node('div', { className: 'region-body' },
          node('div', { className: 'product-line' },
            node('h3', {}, valueText(region.name)),
            node('span', { className: `badge ${region.active === false ? 'status-cancelled' : 'status-completed'}` }, region.active === false ? 'Kapalı' : 'Aktif')),
          node('div', { className: 'region-metrics' },
            node('span', {}, 'Minimum sepet', node('strong', {}, money(region.minSubtotal))),
            node('span', {}, 'Teslimat ücreti', node('strong', {}, money(region.deliveryFee)))),
          node('div', { className: 'region-actions' },
            node('button', { type: 'button', className: 'button button-light button-small', onClick: () => regionDialog(region) }, 'Düzenle'),
            node('button', { type: 'button', className: 'button button-light button-small', onClick: () => toggleRegion(region) }, region.active === false ? 'Etkinleştir' : 'Kapat'))));
        grid.append(card);
      });
      section.append(grid);
    }
    return section;
  }
  function regionDialog(region = null) {
    const editing = Boolean(region);
    const form = node('form', { className: 'dialog-form form-stack', onSubmit: async event => {
      event.preventDefault();
      const data = new FormData(form);
      const minSubtotal = Number(data.get('minSubtotal'));
      const deliveryFee = Number(data.get('deliveryFee'));
      if (minSubtotal < 0 || deliveryFee < 0) { showToast('Tutarlar sıfır veya daha büyük olmalı.', true); return; }
      await saveDialogForm(form, `/admin/regions${editing ? `/${encodeURIComponent(region.id)}` : ''}`, editing ? 'PATCH' : 'POST', { name: String(data.get('name')).trim(), minSubtotal, deliveryFee, active: form.elements.active.checked }, 'Teslimat bölgesi kaydedildi.');
    } });
    const name = node('input', { name: 'name', required: true, maxlength: '120', placeholder: 'Örn. Alanya merkez' }); name.value = region?.name || '';
    const minimum = node('input', { name: 'minSubtotal', type: 'number', min: '0', step: '0.01', required: true }); minimum.value = region?.minSubtotal ?? 0;
    const fee = node('input', { name: 'deliveryFee', type: 'number', min: '0', step: '0.01', required: true }); fee.value = region?.deliveryFee ?? 0;
    const active = node('input', { name: 'active', type: 'checkbox', checked: region ? region.active !== false : true });
    form.append(node('label', {}, 'Bölge adı', name), node('div', { className: 'form-grid' }, node('label', {}, 'Minimum sepet tutarı (₺)', minimum), node('label', {}, 'Teslimat ücreti (₺)', fee), node('label', { className: 'check-row full-width' }, active, 'Bölge siparişe açık')),
      node('div', { className: 'dialog-actions' }, node('button', { type: 'button', className: 'button button-light', onClick: closeDialog }, 'Vazgeç'), node('button', { type: 'submit', className: 'button button-primary' }, editing ? 'Değişiklikleri kaydet' : 'Bölgeyi oluştur')));
    showDialog(node('div', {}, dialogBase(editing ? 'Bölgeyi düzenle' : 'Yeni teslimat bölgesi'), form));
  }
  async function toggleRegion(region) {
    try {
      await request(`/admin/regions/${encodeURIComponent(region.id)}`, { method: 'PATCH', body: JSON.stringify({ active: region.active === false }) });
      region.active = region.active === false;
      showToast(region.active ? 'Teslimat bölgesi etkinleştirildi.' : 'Teslimat bölgesi kapatıldı.'); render();
    } catch (error) { handleError(error, 'Bölge durumu değiştirilemedi'); }
  }
  function renderSettings() {
    const settings = state.catalog?.settings;
    const section = node('section', {}, heading('Site ayarları', 'Mağazanızın iletişim ve ana sayfa bilgilerini güncelleyin.'));
    if (!state.catalog) { section.append(node('div', { className: 'empty-state' }, 'Site ayarları yükleniyor…')); return section; }
    const form = node('form', { onSubmit: async event => {
      event.preventDefault();
      const data = new FormData(form);
      const payload = { name: String(data.get('name')).trim(), phone: String(data.get('phone')).trim(), address: String(data.get('address')).trim(), heroTitle: getFormObject(form, 'heroTitle'), heroSubtitle: getFormObject(form, 'heroSubtitle'), announcement: getFormObject(form, 'announcement'), open: form.elements.open.checked };
      payload.googleAdsId = String(data.get('googleAdsId') || '').trim();
      payload.googleAdsLabel = String(data.get('googleAdsLabel') || '').trim();
      if (payload.googleAdsId && !/^AW-\d{6,15}$/.test(payload.googleAdsId)) {
        showToast('Google Ads kimliği 6–15 basamaklı olmalı.', true);
        return;
      }
      if (payload.googleAdsLabel && !/^[A-Za-z0-9_-]{1,100}$/.test(payload.googleAdsLabel)) {
        showToast('Dönüşüm etiketi yalnızca İngilizce harf, rakam, tire ve alt çizgi içerebilir.', true);
        return;
      }
      await saveDialogForm(form, '/admin/settings', 'PATCH', payload, 'Site ayarları kaydedildi.', false);
    } });
    const identity = node('section', { className: 'content-card' }, node('h3', {}, 'İşletme bilgileri'), node('p', {}, 'Müşterilerinize gösterilen iletişim ve mağaza durumu.'));
    const fields = node('div', { className: 'form-grid' });
    const name = node('input', { name: 'name', required: true, maxlength: '140' }); name.value = settings?.name || '';
    const phone = node('input', { name: 'phone', type: 'tel', maxlength: '40' }); phone.value = settings?.phone || '';
    const address = node('textarea', { name: 'address', maxlength: '500' }); address.value = settings?.address || '';
    const open = node('input', { name: 'open', type: 'checkbox', checked: settings?.open !== false });
    fields.append(node('label', {}, 'Mağaza adı', name), node('label', {}, 'Telefon', phone), node('label', { className: 'full-width' }, 'Adres', address), node('label', { className: 'check-row full-width' }, open, 'Mağaza siparişe açık'));
    identity.append(fields);
    form.append(identity);
    const copy = node('section', { className: 'content-card' }, node('h3', {}, 'Ana sayfa metinleri'), node('p', {}, 'Başlık, açıklama ve duyuru alanlarını desteklenen tüm dillerde düzenleyin.'));
    addMultiLangFields(copy, { title: 'Karşılama başlığı', key: 'heroTitle', initial: settings?.heroTitle || {}, required: true });
    addMultiLangFields(copy, { title: 'Karşılama açıklaması', key: 'heroSubtitle', initial: settings?.heroSubtitle || {}, multiline: true });
    addMultiLangFields(copy, { title: 'Duyuru metni', key: 'announcement', initial: settings?.announcement || {}, multiline: true });
    form.append(copy);
    const payments = node('section', { className: 'content-card' }, node('h3', {}, 'Ödeme yöntemleri'), node('p', {}, 'Müşterilerinize sunulan ödeme seçenekleri.'),
      paymentRow('▣', 'Kapıda nakit', 'Teslimat sırasında nakit ödeme.'), paymentRow('▣', 'Kapıda kredi kartı', 'Teslimat sırasında kartla ödeme.'), paymentRow('⌁', 'İnternetten kredi kartı', state.catalog.payment?.onlineEnabled ? 'Online kart ödemesi sağlayıcı tarafından etkin.' : 'Online ödeme şu anda etkin değil. Güvenli ödeme kuruluşu ve işyeri onayı gerekir.', state.catalog.payment?.onlineEnabled ? 'Etkin' : 'Kurulum gerekli'));
    form.append(payments, node('div', { className: 'form-actions' }, node('button', { className: 'button button-primary', type: 'submit' }, 'Ayarları kaydet')));
    const guide = node('section', { className: 'content-card' },
      node('h3', {}, 'İnternetten kart ödemesini açma rehberi'),
      node('p', {}, 'Şu anda online ödeme kapalıdır. Bir ödeme hesabınız olmadığından bu adımı erteleyebilirsiniz; bu panel kart bilgisi toplamaz ve ödeme alındı gibi göstermez.'),
      node('ol', { className: 'setup-steps' },
        node('li', {}, node('strong', {}, 'İşyeri başvurusu yapın.'), ' iyzico veya seçtiğiniz ödeme kuruluşunda işletme hesabı açıp gerekli belgeleri iletin.'),
        node('li', {}, node('strong', {}, 'Onay bekleyin.'), ' Hesap ve canlı ödeme yetkisi onaylanmadan gerçek kart ödemesi açılmaz.'),
        node('li', {}, node('strong', {}, 'Sandbox ortamında entegrasyon yapın.'), ' iyzico Checkout Form (CF) barındırılan ödeme sayfasını kullanır; entegrasyon başlatma ve sonucu sorgulama adımlarını içerir.'),
        node('li', {}, node('strong', {}, 'Gizli anahtarları yalnızca sunucu ortamına ekleyin.'), ' API key ve secret değerleri sunucu ortam değişkenlerinde tutulmalı; tarayıcıya, bu panele veya herkese açık site ayarlarına konulmamalıdır.'),
        node('li', {}, node('strong', {}, 'Callback/webhook doğrulamasını kurun.'), ' İmzalı bildirimi sunucuda doğrulayın, sorgu sonucu ile eşleştirin ve tekrar gelen bildirimleri güvenle işleyin. Yalnızca doğrulanmış başarıdan sonra siparişi ödenmiş sayın.'),
        node('li', {}, node('strong', {}, 'Canlıya geçmeden uçtan uca test edin.'), ' Sandbox testleri, başarısız ödeme ve webhook senaryoları tamamlandıktan sonra canlı hesapla test yapın.')),
      node('a', { className: 'guide-link', href: 'https://docs.iyzico.com/odeme-metotlari/odeme-formu/cf-entegrasyonu', target: '_blank', rel: 'noopener noreferrer' }, 'iyzico resmi Checkout Form dokümantasyonu ↗'),
      node('div', { className: 'notice guide-notice' }, node('span', { className: 'notice-icon', 'aria-hidden': 'true' }, 'ⓘ'), node('div', {}, node('strong', {}, 'Online ödeme bu panelden etkinleştirilemez'), 'Backend şu anda online ödemeyi kapalı tutuyor. Sağlayıcı onayı, güvenli sunucu entegrasyonu ve doğrulanmış ödeme akışı tamamlanınca ayrıca açılmalıdır.')));
    const marketing = node('section', { className: 'content-card' },
      node('h3', {}, 'Google Ads ve arama görünürlüğü'),
      node('p', {}, 'İsteğe bağlı alanlardır; reklam hesabı kurmanız gerekmez. Google Ads dönüşüm ölçümü ayrıca çerez izni ve web sitesi tarafında etiket entegrasyonu gerektirir.'),
      node('div', { className: 'notice' }, node('span', { className: 'notice-icon', 'aria-hidden': 'true' }, 'ⓘ'), node('div', {}, node('strong', {}, 'Bu bilgiler gizli anahtar değildir'), 'AW kimliği ve dönüşüm etiketi herkese açık ölçüm tanımlayıcılarıdır. Buraya API key, secret veya erişim tokenı girmeyin. Rıza arayüzü ve dönüşüm olaylarını site tarafında ayrıca, kullanıcı izninden sonra uygulayın.')));
    const adsFields = node('div', { className: 'form-grid' });
    const adsId = node('input', { name: 'googleAdsId', type: 'text', maxlength: '18', pattern: 'AW-[0-9]{6,15}', placeholder: 'AW-123456789', autocomplete: 'off' });
    adsId.value = settings?.googleAdsId || '';
    const adsLabel = node('input', { name: 'googleAdsLabel', type: 'text', maxlength: '100', pattern: '[A-Za-z0-9_-]{1,100}', placeholder: 'Dönüşüm işleminizin etiketi', autocomplete: 'off' });
    adsLabel.value = settings?.googleAdsLabel || '';
    adsFields.append(node('label', {}, 'Google Ads kimliği (isteğe bağlı)', adsId), node('label', {}, 'Dönüşüm etiketi (isteğe bağlı)', adsLabel));
    marketing.append(adsFields,
      node('div', { className: 'guide-copy' }, node('strong', {}, 'Kurulum sırası'), 'Domaini PUBLIC_URL ile tanımlayın, sitemap.xml adresini Google Search Console’a ekleyin; bu, sıralama garantisi vermez. Reklam hesabı oluşturduğunuzda AW kimliği ve dönüşüm etiketini girin. Dönüşüm ölçümü yalnızca gerekli çerez izni alındıktan sonra çalışmalıdır; bu panel etiket veya izin davranışını etkinleştirmez.'));
    form.append(marketing);
    section.append(form, guide); return section;
  }
  function paymentRow(symbol, title, description, badge = 'Aktif') { return node('div', { className: 'payment-card' }, node('span', { className: 'payment-symbol', 'aria-hidden': 'true' }, symbol), node('div', {}, node('strong', {}, title), node('p', {}, description)), node('span', { className: `badge ${badge === 'Aktif' ? 'status-completed' : 'status-new'}` }, badge)); }
  function renderUsers() {
    const section = node('section', {}, heading('Kullanıcılar', 'Panel erişimi olan ekip üyelerini yönetin.', node('button', { type: 'button', className: 'button button-primary', onClick: () => userDialog() }, '+ Kullanıcı ekle')));
    const users = state.catalog?.users;
    if (!state.catalog) { section.append(node('div', { className: 'empty-state' }, 'Kullanıcılar yükleniyor…')); return section; }
    if (!Array.isArray(users)) {
      section.append(node('div', { className: 'notice' }, node('span', { className: 'notice-icon' }, 'ⓘ'), node('div', {}, node('strong', {}, 'Kullanıcı listesi kullanılamıyor'), 'Kullanıcı yönetimi API sözleşmesinde /api/admin/users olarak tanımlı. Backend katalog yanıtında kullanıcı listesi sağlamadığı için listeyi ayrıca güvenli biçimde yüklemeye çalışın.')));
      loadUsers(); return section;
    }
    const table = node('div', { className: 'table-card table-scroll' }, node('table', {}, node('thead', {}, node('tr', {}, node('th', {}, 'Kullanıcı'), node('th', {}, 'Yetki'), node('th', {}))), node('tbody', {}, users.map(user => node('tr', {}, node('td', {}, node('div', { className: 'cell-main' }, user.username), node('div', { className: 'cell-sub' }, user.id)), node('td', {}, node('span', { className: 'badge' }, user.role === 'owner' ? 'İşletme sahibi' : 'Sipariş ekibi')), node('td', {}, node('div', { className: 'user-table-actions' }, node('button', { className: 'button button-light button-small', type: 'button', onClick: () => userDialog(user) }, 'Düzenle'), user.id !== state.user.id ? node('button', { className: 'button button-danger button-small', type: 'button', onClick: () => deleteUser(user) }, 'Sil') : null)))))));
    section.append(table); return section;
  }
  let usersRequest = null;
  async function loadUsers() {
    if (usersRequest || !state.user || !owner()) return;
    usersRequest = request('/admin/users').then(result => {
      const list = Array.isArray(result) ? result : result?.users;
      if (!Array.isArray(list)) throw new Error('Kullanıcı yanıtı dizi biçiminde olmalı.');
      state.catalog.users = list; if (state.view === 'users') render();
    }).catch(error => handleError(error, 'Kullanıcılar yüklenemedi')).finally(() => { usersRequest = null; });
    return usersRequest;
  }
  function userDialog(user = null) {
    const editing = Boolean(user);
    const form = node('form', { className: 'dialog-form form-stack', onSubmit: async event => {
      event.preventDefault();
      const data = new FormData(form);
      const payload = { username: String(data.get('username')).trim(), role: data.get('role') };
      const password = String(data.get('password') || '');
      if (password) payload.password = password;
      if (!editing && !password) { showToast('Yeni kullanıcı için şifre gerekli.', true); return; }
      await saveDialogForm(form, `/admin/users${editing ? `/${encodeURIComponent(user.id)}` : ''}`, editing ? 'PATCH' : 'POST', payload, 'Kullanıcı kaydedildi.');
    } });
    const username = node('input', { name: 'username', autocomplete: 'username', required: true, minlength: '3', maxlength: '40', pattern: '[A-Za-z0-9_.-]+' }); username.value = user?.username || '';
    const password = node('input', { name: 'password', type: 'password', autocomplete: editing ? 'new-password' : 'new-password', minlength: '12', required: !editing });
    const role = node('select', { name: 'role' }, node('option', { value: 'staff', selected: user?.role !== 'owner' }, 'Sipariş ekibi'), node('option', { value: 'owner', selected: user?.role === 'owner' }, 'İşletme sahibi'));
    form.append(node('label', {}, 'Kullanıcı adı', username), node('label', {}, editing ? 'Yeni şifre (en az 12 karakter; değiştirmeyecekseniz boş bırakın)' : 'Şifre (en az 12 karakter)', password), node('label', {}, 'Yetki', role), node('div', { className: 'dialog-actions' }, node('button', { type: 'button', className: 'button button-light', onClick: closeDialog }, 'Vazgeç'), node('button', { type: 'submit', className: 'button button-primary' }, editing ? 'Değişiklikleri kaydet' : 'Kullanıcıyı oluştur')));
    showDialog(node('div', {}, dialogBase(editing ? 'Kullanıcıyı düzenle' : 'Yeni kullanıcı'), form));
  }
  async function deleteUser(user) {
    if (!window.confirm(`${user.username} kullanıcısını silmek istediğinize emin misiniz?`)) return;
    try {
      await request(`/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE' });
      showToast('Kullanıcı silindi.'); await loadUsers();
    } catch (error) { handleError(error, 'Kullanıcı silinemedi'); }
  }
  async function saveDialogForm(form, path, method, payload, successMessage, close = true) {
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const response = await request(path, { method, body: JSON.stringify(payload) });
      if (path === '/admin/settings' && ('googleAdsId' in payload || 'googleAdsLabel' in payload) &&
          (response?.googleAdsId !== payload.googleAdsId || response?.googleAdsLabel !== payload.googleAdsLabel)) {
        state.catalog.settings = { ...state.catalog.settings, ...response };
        render();
        throw new Error('Google Ads alanları backend tarafından henüz saklanmıyor. Diğer ayarlar kaydedilmiş olabilir; backend desteği eklenince yeniden deneyin.');
      }
      if (close) closeDialog();
      showToast(successMessage);
      if (path === '/admin/settings') {
        state.catalog.settings = { ...state.catalog.settings, ...payload }; render();
      } else if (path.includes('/admin/users')) await loadUsers();
      else await loadCatalog();
    } catch (error) { handleError(error, 'Değişiklikler kaydedilemedi'); }
    finally { if (submit?.isConnected) submit.disabled = false; }
  }

  $('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    const errorBox = $('#login-error'); errorBox.hidden = true; button.disabled = true;
    try {
      const values = new FormData(form);
      const result = await request('/auth/login', { method: 'POST', body: JSON.stringify({ username: values.get('username'), password: values.get('password') }) });
      const user = result?.user || result;
      if (!user?.id || !user?.role) throw new Error('Giriş yanıtında kullanıcı rolü bulunamadı.');
      form.reset(); state.view = user.role === 'owner' ? 'dashboard' : 'orders'; showApp(user); navigate(state.view);
    } catch (error) { errorBox.textContent = error.message || 'Giriş yapılamadı.'; errorBox.hidden = false; }
    finally { button.disabled = false; }
  });
  $('#logout-button').addEventListener('click', async () => {
    try { await request('/auth/logout', { method: 'POST' }); }
    catch (error) { if (error.status !== 401) { handleError(error, 'Çıkış yapılamadı'); return; } }
    state.orders = []; state.catalog = null; state.knownOrderIds.clear(); showLogin();
  });
  $('#main-nav').addEventListener('click', event => {
    const button = event.target.closest('[data-view]'); if (button) navigate(button.dataset.view);
  });
  $('#sound-toggle').addEventListener('click', event => {
    state.sound = !state.sound;
    const button = event.currentTarget;
    button.setAttribute('aria-pressed', String(state.sound));
    button.lastChild.textContent = state.sound ? ' Ses açık' : ' Ses kapalı';
    if (state.sound) { playNotification(); showToast('Yeni sipariş bildirimi açıldı.'); }
  });
  $('#open-sidebar').addEventListener('click', () => { $('#sidebar').classList.add('open'); $('#sidebar-scrim').classList.add('visible'); });
  $('#close-sidebar').addEventListener('click', () => { $('#sidebar').classList.remove('open'); $('#sidebar-scrim').classList.remove('visible'); });
  $('#sidebar-scrim').addEventListener('click', () => { $('#sidebar').classList.remove('open'); $('#sidebar-scrim').classList.remove('visible'); });
  $('#app-dialog').addEventListener('click', event => { if (event.target === event.currentTarget) closeDialog(); });
  $('#app-dialog').addEventListener('close', () => $('#dialog-content').replaceChildren());

  request('/auth/me').then(result => {
    const user = result?.user;
    if (!user) { showLogin(); return; }
    state.view = user.role === 'owner' ? 'dashboard' : 'orders';
    showApp(user); navigate(state.view);
  }).catch(error => {
    if (error.status === 401) showLogin();
    else { showLogin(); $('#login-error').textContent = `Oturum doğrulanamadı: ${error.message}`; $('#login-error').hidden = false; }
  });
})();
