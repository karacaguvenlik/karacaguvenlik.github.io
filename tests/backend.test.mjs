import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase, bootstrapOwner } from '../lib/db.mjs';
import { createApp } from '../lib/app.mjs';

const dictionary = { tr: 'Pizza', en: 'Pizza', de: 'Pizza', ru: 'Пицца' };
async function start(db) {
  const server = createApp({ db }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  let closed = false;
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (route, { method = 'GET', body, cookie, origin = base, headers = {} } = {}) => {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(origin ? { origin } : {}), ...(cookie ? { cookie } : {}), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const data = await response.json().catch(() => null);
    return { response, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  return { server, base, request, close: () => {
    if (closed) return Promise.resolve();
    closed = true;
    return new Promise((resolve) => server.close(resolve));
  } };
}

test('auth, roles, CRUD, order pricing, validation, private tracking, and persistent storage', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'citir-backend-'));
  const dbPath = path.join(dir, 'orders.sqlite');
  t.after(async () => rm(dir, { recursive: true, force: true }));
  let db = openDatabase(dbPath);
  let dbClosed = false;
  const initial = await bootstrapOwner(db, { warn() {} });
  const app = await start(db);
  t.after(async () => { await app.close(); if (!dbClosed) db.close(); });

  const catalogEmpty = await app.request('/api/catalog');
  assert.equal(catalogEmpty.response.status, 200);
  assert.equal(catalogEmpty.response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(catalogEmpty.data.products, []);
  assert.deepEqual(catalogEmpty.data.payment, { onlineEnabled: false });
  assert.equal(catalogEmpty.data.settings.demoPrices, true);
  assert.match((await app.request('/')).response.headers.get('content-type'), /text\/html/);
  assert.match((await app.request('/admin')).response.headers.get('content-type'), /text\/html/);
  assert.equal((await app.request('/api/auth/me')).data.user, null);
  assert.equal((await app.request('/api/admin/users')).response.status, 401);

  const blockedOrigin = await app.request('/api/auth/login', { method: 'POST', body: { username: 'owner', password: initial.password }, origin: 'https://attacker.example' });
  assert.equal(blockedOrigin.response.status, 403);
  const login = await app.request('/api/auth/login', { method: 'POST', body: { username: initial.username, password: initial.password } });
  assert.equal(login.response.status, 200);
  assert.match(login.cookie, /^citir_session=/);
  assert.equal(login.response.headers.get('set-cookie').toLowerCase().includes('httponly'), true);
  const ownerCookie = login.cookie;

  const category = await app.request('/api/admin/categories', { method: 'POST', cookie: ownerCookie, body: { id: 'pizza', name: dictionary } });
  assert.equal(category.response.status, 201);
  assert.equal((await app.request('/api/admin/categories', { cookie: ownerCookie })).data[0].id, 'pizza');
  const product = await app.request('/api/admin/products', { method: 'POST', cookie: ownerCookie, body: {
    id: 'margherita', categoryId: 'pizza', name: dictionary, description: { tr: 'Sade', en: 'Classic', de: 'Klassisch', ru: 'Классика' }, price: 12.5, image: '/images/pizza.jpg'
  } });
  assert.equal(product.response.status, 201);
  const unsafeImage = await app.request('/api/admin/products', { method: 'POST', cookie: ownerCookie, body: {
    id: 'unsafe-image', categoryId: 'pizza', name: dictionary, price: 1, image: 'https://user:pass@example.com/pizza.jpg'
  } });
  assert.equal(unsafeImage.response.status, 400);
  const inactiveProduct = await app.request('/api/admin/products/margherita', { method: 'PATCH', cookie: ownerCookie, body: { active: false } });
  assert.equal(inactiveProduct.data.active, false);
  assert.equal((await app.request('/api/admin/products', { cookie: ownerCookie })).data[0].active, false);
  await app.request('/api/admin/products/margherita', { method: 'PATCH', cookie: ownerCookie, body: { active: true } });
  const region = await app.request('/api/admin/regions', { method: 'POST', cookie: ownerCookie, body: { id: 'alanya-center', name: 'Alanya Merkez', minSubtotal: 15, deliveryFee: 3 } });
  assert.deepEqual([region.data.minSubtotal, region.data.deliveryFee], [15, 3]);
  assert.equal((await app.request('/api/admin/regions', { cookie: ownerCookie })).data[0].id, 'alanya-center');
  const catalog = await app.request('/api/catalog');
  assert.equal(catalog.data.products[0].price, 12.5);
  assert.equal(catalog.data.regions[0].id, 'alanya-center');

  const badMinimum = await app.request('/api/orders', { method: 'POST', body: {
    items: [{ productId: 'margherita', quantity: 1 }], customer: { name: 'Ada', phone: '+90 532 123 45 67', address: 'Alanya Oba Mahallesi' },
    regionId: 'alanya-center', paymentMethod: 'cash', locale: 'tr', consent: true
  } });
  assert.equal(badMinimum.response.status, 400);
  db.prepare('UPDATE categories SET active=0 WHERE id=?').run('pizza');
  const inactiveCategoryOrder = await app.request('/api/orders', { method: 'POST', body: {
    items: [{ productId: 'margherita', quantity: 2 }], customer: { name: 'Ada', phone: '+90 532 123 45 67', address: 'Alanya Oba Mahallesi' },
    regionId: 'alanya-center', paymentMethod: 'cash', consent: true
  } });
  assert.equal(inactiveCategoryOrder.response.status, 400);
  db.prepare('UPDATE categories SET active=1 WHERE id=?').run('pizza');
  const badPhone = await app.request('/api/orders', { method: 'POST', body: {
    items: [{ productId: 'margherita', quantity: 2 }], customer: { name: 'Ada', phone: '555123', address: 'Alanya Oba Mahallesi' },
    regionId: 'alanya-center', paymentMethod: 'cash', locale: 'tr', consent: true
  } });
  assert.equal(badPhone.response.status, 400);
  const excessiveDuplicates = await app.request('/api/orders', { method: 'POST', body: {
    items: [{ productId: 'margherita', quantity: 11 }, { productId: 'margherita', quantity: 10 }], customer: { name: 'Ada', phone: '+90 532 123 45 67', address: 'Alanya Oba Mahallesi' },
    regionId: 'alanya-center', paymentMethod: 'cash', locale: 'tr', consent: true
  } });
  assert.equal(excessiveDuplicates.response.status, 400);
  const online = await app.request('/api/orders', { method: 'POST', body: {
    items: [{ productId: 'margherita', quantity: 2, price: 0 }], customer: { name: 'Ada', phone: '+90 532 123 45 67', address: 'Alanya Oba Mahallesi' },
    regionId: 'alanya-center', paymentMethod: 'online', locale: 'tr', consent: true
  } });
  assert.equal(online.response.status, 400);
  assert.match(online.data.error, /not available/i);
  const orderResult = await app.request('/api/orders', { method: 'POST', body: {
    items: [{ productId: 'margherita', quantity: 2, price: 0 }], customer: { name: 'Ada', phone: '+90 532 123 45 67', address: 'Alanya Oba Mahallesi\nDaire 3', note: 'Ring bell\nPlease call' },
    regionId: 'alanya-center', paymentMethod: 'card_on_delivery', locale: 'de', consent: true, total: 0
  }, headers: { 'Idempotency-Key': 'retry-token-012345678901234567890123' } });
  assert.equal(orderResult.response.status, 201);
  assert.deepEqual([orderResult.data.subtotal, orderResult.data.deliveryFee, orderResult.data.total], [25, 3, 28]);
  const repeated = await app.request('/api/orders', { method: 'POST', body: {
    items: [{ productId: 'margherita', quantity: 2, price: 0 }], customer: { name: 'Ada', phone: '+90 532 123 45 67', address: 'Alanya Oba Mahallesi\nDaire 3', note: 'Ring bell\nPlease call' },
    regionId: 'alanya-center', paymentMethod: 'card_on_delivery', locale: 'de', consent: true, total: 0
  }, headers: { 'Idempotency-Key': 'retry-token-012345678901234567890123' } });
  assert.equal(repeated.data.id, orderResult.data.id);
  assert.equal(repeated.data.trackingToken, 'retry-token-012345678901234567890123');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM orders').get().count, 1);
  const conflict = await app.request('/api/orders', { method: 'POST', body: {
    items: [{ productId: 'margherita', quantity: 2 }], customer: { name: 'Ada', phone: '+90 532 123 45 67', address: 'Alanya Oba Mahallesi\nDaire 3', note: 'changed' },
    regionId: 'alanya-center', paymentMethod: 'card_on_delivery', locale: 'de', consent: true
  }, headers: { 'Idempotency-Key': 'retry-token-012345678901234567890123' } });
  assert.equal(conflict.response.status, 409);
  const tracking = await app.request(`/api/orders/${orderResult.data.id}?token=wrong`);
  assert.equal(tracking.response.status, 404);
  const tracked = await app.request(`/api/orders/${orderResult.data.id}?token=${orderResult.data.trackingToken}`);
  assert.equal(tracked.data.status, 'new');
  assert.equal('customer' in tracked.data, false);

  const staffCreated = await app.request('/api/admin/users', { method: 'POST', cookie: ownerCookie, body: { username: 'shift.staff', password: 'secure-password-2026', role: 'staff' } });
  assert.equal(staffCreated.response.status, 201);
  const staffLogin = await app.request('/api/auth/login', { method: 'POST', body: { username: 'shift.staff', password: 'secure-password-2026' } });
  assert.equal(staffLogin.response.status, 200);
  assert.equal((await app.request('/api/admin/users', { cookie: staffLogin.cookie })).response.status, 403);
  const staffOrders = await app.request('/api/admin/orders', { cookie: staffLogin.cookie });
  assert.equal(staffOrders.response.status, 200);
  assert.equal(staffOrders.data[0].customer.phone, '+90 532 123 45 67');
  assert.deepEqual(staffOrders.data[0].items[0], {
    productId: 'margherita', name: 'Pizza', nameByLocale: dictionary, quantity: 2, qty: 2, unitPrice: 12.5, lineTotal: 25
  });
  const status = await app.request(`/api/admin/orders/${orderResult.data.id}`, { method: 'PATCH', cookie: staffLogin.cookie, body: { status: 'preparing' } });
  assert.equal(status.data.status, 'preparing');
  assert.equal((await app.request('/api/admin/orders/not-real', { method: 'PATCH', cookie: staffLogin.cookie, body: { status: 'paid' } })).response.status, 400);

  const oneOwner = await app.request(`/api/admin/users/${initial.id}`, { method: 'DELETE', cookie: ownerCookie });
  assert.equal(oneOwner.response.status, 400);
  const closing = await app.request('/api/admin/settings', { method: 'PATCH', cookie: ownerCookie, body: { open: false } });
  assert.equal(closing.data.open, false);
  const hours = { tr: 'Her gün 10:00–22:00', en: 'Daily 10:00–22:00', de: 'Täglich 10:00–22:00', ru: 'Ежедневно 10:00–22:00' };
  const updatedHours = await app.request('/api/admin/settings', { method: 'PATCH', cookie: ownerCookie, body: { openingHours: hours } });
  assert.deepEqual(updatedHours.data.openingHours, hours);
  const closedOrder = await app.request('/api/orders', { method: 'POST', body: {
    items: [{ productId: 'margherita', quantity: 2 }], customer: { name: 'Ada', phone: '+90 532 123 45 67', address: 'Alanya Oba Mahallesi' },
    regionId: 'alanya-center', paymentMethod: 'cash', consent: true
  } });
  assert.equal(closedOrder.response.status, 400);
  const ads = await app.request('/api/admin/settings', { method: 'PATCH', cookie: ownerCookie, body: { googleAdsId: 'AW-123456789012345', googleAdsLabel: 'order_finish_1' } });
  assert.equal(ads.data.googleAdsId, 'AW-123456789012345');
  assert.equal((await app.request('/api/catalog')).data.settings.googleAdsLabel, 'order_finish_1');
  assert.equal((await app.request('/api/admin/settings', { method: 'PATCH', cookie: ownerCookie, body: { googleAdsId: 'UA-not-an-ads-id' } })).response.status, 400);

  await app.close();
  db.close();
  dbClosed = true;
  db = openDatabase(dbPath);
  assert.equal(db.prepare('SELECT status FROM orders WHERE id=?').get(orderResult.data.id).status, 'preparing');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 2);
  db.close();
  dbClosed = true;
});

test('localized SSR menu, SEO, public URL validation, and production headers', async (t) => {
  const oldPublicUrl = process.env.PUBLIC_URL;
  process.env.PUBLIC_URL = 'https://citir.example';
  t.after(() => { if (oldPublicUrl === undefined) delete process.env.PUBLIC_URL; else process.env.PUBLIC_URL = oldPublicUrl; });
  const db = openDatabase(':memory:');
  const app = createApp({ db, production: true });
  const localizedName = { tr: 'İnce hamur', en: 'Thin crust', de: 'Dünner Boden', ru: 'Тонкое тесто' };
  db.prepare('INSERT INTO categories(id,name,active) VALUES(?,?,1)').run('pizza', JSON.stringify(localizedName));
  db.prepare('INSERT INTO products(id,category_id,name,description,price_cents,image,active) VALUES(?,?,?,?,?,?,1)')
    .run('pie', 'pizza', JSON.stringify(localizedName), JSON.stringify({ tr: 'Taze hamur', en: 'Fresh dough', de: 'Frischer <Teig>', ru: 'Свежее тесто' }), 99900, '');
  db.prepare('INSERT INTO categories(id,name,active) VALUES(?,?,0)').run('hidden-category', JSON.stringify(dictionary));
  db.prepare('INSERT INTO products(id,category_id,name,description,price_cents,image,active) VALUES(?,?,?,?,?,?,1)')
    .run('hidden-pizza', 'hidden-category', JSON.stringify(dictionary), JSON.stringify(dictionary), 1200, '');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const de = await fetch(`${base}/?lang=de`);
  const html = await de.text();
  assert.match(html, /<html lang="de">/);
  assert.match(html, /<title>Çıtır Pizza \| Speisekarte und Lieferung in Alanya<\/title>/);
  assert.match(html, /rel="canonical" href="https:\/\/citir\.example\/\?lang=de"/);
  assert.match(html, /hreflang="ru" href="https:\/\/citir\.example\/\?lang=ru"/);
  assert.match(html, /Frischer &lt;Teig&gt;/);
  assert.doesNotMatch(html, /Taze hamur/);
  assert.match(html, /<li><strong>Dünner Boden<\/strong>/);
  assert.doesNotMatch(html, /<strong>Pizza<\/strong>/);
  assert.match(html, /<details class="seo-menu"><summary>Speisekarte anzeigen<\/summary>/);
  assert.doesNotMatch(html, />999(?:\.00)?</);
  assert.equal((html.match(/<title>/g) || []).length, 1);
  const jsonLd = JSON.parse(html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);
  assert.equal(jsonLd['@type'], 'Restaurant');
  assert.equal(jsonLd.menu, 'https://citir.example/?lang=de#menu');
  assert.match(de.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  assert.equal(de.headers.get('cache-control'), null);
  process.env.PUBLIC_URL = 'http://invalid.example';
  const noCanonical = await (await fetch(`${base}/?lang=ru`)).text();
  assert.doesNotMatch(noCanonical, /rel="canonical"/);
  assert.equal('menu' in JSON.parse(noCanonical.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]), false);
  process.env.PUBLIC_URL = 'https://citir.example';
  const robots = await (await fetch(`${base}/robots.txt`)).text();
  assert.match(robots, /Allow: \/\n/);
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Disallow: \/admin/);
  assert.doesNotMatch(robots, /Disallow: \/\n/);
  const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
  assert.doesNotMatch(sitemap, /\/admin/);
  process.env.PUBLIC_URL = '';
  const previewRobots = await (await fetch(`${base}/robots.txt`)).text();
  assert.match(previewRobots, /Disallow: \/\n/);
  assert.doesNotMatch(previewRobots, /Allow: \/\n/);
  assert.doesNotMatch(previewRobots, /Sitemap:/);
});

test('missing Origin is rejected for state-changing requests', async (t) => {
  const db = openDatabase(':memory:');
  await bootstrapOwner(db, { warn() {} });
  const app = await start(db);
  t.after(async () => { await app.close(); db.close(); });
  const response = await app.request('/api/auth/login', { method: 'POST', origin: null, body: { username: 'owner', password: 'x' } });
  assert.equal(response.response.status, 403);
});
