(() => {
  'use strict';

  const STORAGE_KEY = 'citir-presentation-v1';
  const DEMO_USER = { id: 'demo-owner', username: 'demo', role: 'owner', active: true };
  const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
  let state;
  let menuData;

  async function readMenu() {
    const response = await fetch('./menu.json', { credentials: 'omit', cache: 'no-store' });
    if (!response.ok) throw new Error(`Demo menüsü yüklenemedi (${response.status}).`);
    const menu = await response.json();
    if (!Array.isArray(menu.products) || !Array.isArray(menu.categories) || !Array.isArray(menu.regions)) {
      throw new Error('menu.json beklenen katalog biçiminde değil.');
    }
    return menu;
  }

  function sampleOrders(catalog) {
    const product = catalog.products.find(item => item.active !== false) || catalog.products[0];
    const region = catalog.regions.find(item => item.active !== false) || catalog.regions[0];
    const now = Date.now();
    const make = (id, status, createdAt, quantity) => {
      const price = Number(product?.price) || 0;
      const deliveryFee = Number(region?.deliveryFee) || 0;
      return {
        id, orderNumber: id, status, createdAt: new Date(createdAt).toISOString(), updatedAt: new Date(createdAt).toISOString(),
        customer: { name: 'Demo Müşteri', phone: 'Örnek numara', address: 'Temsili adres — gerçek teslimat yok', note: 'Gösterim siparişi; hazırlamayın.' },
        regionId: region?.id, region: { name: region?.name || 'Örnek bölge' },
        items: product ? [{ productId: product.id, name: copy(product.name), quantity, price, lineTotal: price * quantity }] : [],
        subtotal: price * quantity, deliveryFee, total: price * quantity + deliveryFee,
        paymentMethod: 'cash', locale: 'tr', synthetic: true
      };
    };
    return [make('DEMO-1002', 'preparing', now - 45 * 60_000, 2), make('DEMO-1001', 'new', now - 12 * 60_000, 1)];
  }

  function freshState(menu) {
    const catalog = {
      products: copy(menu.products), categories: copy(menu.categories), regions: copy(menu.regions),
      settings: { ...(copy(menu.settings) || {}) }, payment: { onlineEnabled: false }
    };
    catalog.products.forEach(product => {
      if (typeof product.image === 'string' && product.image.startsWith('/') && !product.image.startsWith('//')) product.image = `.${product.image}`;
    });
    if (!catalog.settings.defaultLanguage) catalog.settings.defaultLanguage = 'tr';
    return { catalog, orders: sampleOrders(catalog), users: [copy(DEMO_USER)] };
  }

  function normalize(value, menu) {
    if (!value || typeof value !== 'object' || !value.catalog || !Array.isArray(value.orders)) return freshState(menu);
    const base = freshState(menu);
    const catalog = value.catalog;
    for (const field of ['products', 'categories', 'regions']) {
      if (Array.isArray(catalog[field])) base.catalog[field] = copy(catalog[field]);
    }
    if (catalog.settings && typeof catalog.settings === 'object') base.catalog.settings = { ...base.catalog.settings, ...copy(catalog.settings) };
    base.catalog.payment = { onlineEnabled: false };
    base.orders = copy(value.orders);
    base.users = [copy(DEMO_USER)];
    return base;
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function changed() {
    persist();
    window.dispatchEvent(new CustomEvent('citir-demo-change', { detail: { key: STORAGE_KEY } }));
  }

  function error(message, status = 400) {
    const result = new Error(message);
    result.status = status;
    return result;
  }

  function readBody(options) {
    if (!options.body) return {};
    if (typeof options.body === 'string') {
      try { return JSON.parse(options.body); } catch { throw error('İstek verisi geçersiz.'); }
    }
    return options.body;
  }

  function routePath(path) {
    const clean = String(path).split('?')[0].replace(/^\/api(?=\/)/, '');
    return clean.startsWith('/') ? clean : `/${clean}`;
  }

  function localName(product, locale) {
    const name = product?.name;
    return typeof name === 'object' ? name[locale] || name.tr || Object.values(name)[0] || 'Ürün' : name || 'Ürün';
  }

  async function request(path, options = {}) {
    await ready;
    const method = String(options.method || 'GET').toUpperCase();
    const route = routePath(path);
    const body = readBody(options);
    if (route === '/auth/me' && method === 'GET') return { user: copy(DEMO_USER) };
    if (route === '/catalog' && method === 'GET') return copy({ ...state.catalog, users: state.users });
    if (route === '/admin/orders' && method === 'GET') return copy(state.orders);

    const orderMatch = route.match(/^\/admin\/orders\/([^/]+)$/);
    if (orderMatch && method === 'PATCH') {
      const order = state.orders.find(item => String(item.id) === decodeURIComponent(orderMatch[1]));
      if (!order) throw error('Örnek sipariş bulunamadı.', 404);
      if (!['new', 'accepted', 'preparing', 'on_way', 'completed', 'cancelled'].includes(body.status)) throw error('Sipariş durumu geçersiz.');
      order.status = body.status; order.updatedAt = new Date().toISOString(); changed(); return copy(order);
    }

    if (route === '/admin/users' && method === 'GET') return copy(state.users);
    if (route.startsWith('/admin/users')) throw error('Kullanıcı yönetimi bu statik gösterimde kapalıdır.', 403);

    if (route === '/admin/settings' && method === 'PATCH') {
      const safe = { ...body };
      delete safe.googleAdsId; delete safe.googleAdsLabel;
      state.catalog.settings = { ...state.catalog.settings, ...safe };
      state.catalog.payment = { onlineEnabled: false };
      changed(); return copy(state.catalog.settings);
    }

    const collection = route.match(/^\/admin\/(products|categories|regions)(?:\/([^/]+))?$/);
    if (collection) {
      const key = collection[1];
      const list = state.catalog[key];
      const id = collection[2] == null ? null : decodeURIComponent(collection[2]);
      if (method === 'GET' && !id) return copy(list);
      if (method === 'POST' && !id) {
        const item = { ...copy(body), id: body.id || `${key.slice(0, -1)}-${Date.now().toString(36)}` };
        if (key === 'products' && (!Number.isFinite(Number(item.price)) || Number(item.price) < 0)) throw error('Ürün fiyatı geçersiz.');
        list.push(item); changed(); return copy(item);
      }
      const index = list.findIndex(item => String(item.id) === id);
      if (index < 0) throw error('Gösterim kaydı bulunamadı.', 404);
      if (method === 'PATCH') {
        const updated = { ...list[index], ...copy(body), id: list[index].id };
        if (key === 'products' && (!Number.isFinite(Number(updated.price)) || Number(updated.price) < 0)) throw error('Ürün fiyatı geçersiz.');
        list[index] = updated; changed(); return copy(updated);
      }
      if (method === 'DELETE') {
        list.splice(index, 1); changed(); return null;
      }
    }
    throw error(`Demo isteği desteklenmiyor: ${method} ${route}`, 404);
  }

  async function addOrder(items, regionId, locale = 'tr') {
    await ready;
    const catalog = state.catalog;
    if (catalog.settings.open === false) throw error('Gösterim mağazası şu anda kapalı.', 409);
    const region = catalog.regions.find(item => String(item.id) === String(regionId) && item.active !== false);
    if (!region) throw error('Geçerli bir gösterim teslimat bölgesi seçin.');
    if (!Array.isArray(items) || !items.length) throw error('Siparişe en az bir ürün ekleyin.');
    const grouped = new Map();
    for (const entry of items) {
      const id = entry.productId ?? entry.id ?? entry.product?.id;
      const quantity = Number(entry.quantity ?? entry.qty ?? 1);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw error('Ürün adedi 1–20 arasında olmalıdır.');
      const product = catalog.products.find(item => String(item.id) === String(id) && item.active !== false);
      if (!product) throw error('Gösterim menüsünde ürün bulunamadı.');
      const current = grouped.get(String(product.id));
      if (current && current.quantity + quantity > 20) throw error('Bir üründen en fazla 20 adet seçilebilir.');
      grouped.set(String(product.id), { product, quantity: (current?.quantity || 0) + quantity });
    }
    const orderItems = [...grouped.values()].map(({ product, quantity }) => {
      const price = Number(product.price);
      if (!Number.isFinite(price) || price < 0) throw error('Ürün fiyatı geçersiz.');
      return { productId: product.id, name: localName(product, locale), quantity, price, lineTotal: price * quantity };
    });
    const subtotal = orderItems.reduce((sum, item) => sum + item.lineTotal, 0);
    if (subtotal < Number(region.minSubtotal || 0)) throw error('Bölgenin minimum sepet tutarına ulaşılmadı.', 409);
    const now = new Date().toISOString();
    const id = `DEMO-${Date.now().toString(36).toUpperCase()}`;
    const order = {
      id, orderNumber: id, trackingId: id, status: 'new', createdAt: now, updatedAt: now,
      customer: { name: 'Demo Müşteri', phone: 'Örnek numara', address: 'Temsili adres — gerçek teslimat yok', note: 'Gösterim siparişi; hazırlamayın.' },
      regionId: region.id, region: { name: region.name }, items: orderItems, subtotal,
      deliveryFee: Number(region.deliveryFee) || 0, total: subtotal + (Number(region.deliveryFee) || 0),
      paymentMethod: 'cash', locale: String(locale || 'tr'), synthetic: true
    };
    state.orders.unshift(order); changed();
    return { order: copy(order), trackingId: id, id };
  }

  const ready = (async () => {
    menuData = await readMenu();
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { saved = null; }
    state = normalize(saved, menuData);
    if (!saved || !state.catalog.products.length) persist();
    return true;
  })();

  async function reset() {
    await ready;
    localStorage.removeItem(STORAGE_KEY);
    state = freshState(menuData);
    window.dispatchEvent(new CustomEvent('citir-demo-change', { detail: { key: STORAGE_KEY, reset: true } }));
  }

  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY) return;
    if (event.newValue) {
      try { state = normalize(JSON.parse(event.newValue), menuData); } catch { return; }
      window.dispatchEvent(new CustomEvent('citir-demo-change', { detail: { key: STORAGE_KEY, external: true } }));
    } else {
      ready.then(() => {
        state = freshState(menuData);
        window.dispatchEvent(new CustomEvent('citir-demo-change', { detail: { key: STORAGE_KEY, external: true, reset: true } }));
      }).catch(() => {});
    }
  });

  window.CitirDemo = { key: STORAGE_KEY, ready, request, addOrder, reset };
})();
