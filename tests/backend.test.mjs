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
  const request = async (route, { method = 'GET', body, cookie, origin = base } = {}) => {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(origin ? { origin } : {}), ...(cookie ? { cookie } : {}) },
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
  assert.deepEqual(catalogEmpty.data.products, []);
  assert.deepEqual(catalogEmpty.data.payment, { onlineEnabled: false });
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
  const product = await app.request('/api/admin/products', { method: 'POST', cookie: ownerCookie, body: {
    id: 'margherita', categoryId: 'pizza', name: dictionary, description: { tr: 'Sade', en: 'Classic', de: 'Klassisch', ru: 'Классика' }, price: 12.5, image: '/pizza.jpg'
  } });
  assert.equal(product.response.status, 201);
  const region = await app.request('/api/admin/regions', { method: 'POST', cookie: ownerCookie, body: { id: 'alanya-center', name: 'Alanya Merkez', minSubtotal: 15, deliveryFee: 3 } });
  assert.deepEqual([region.data.minSubtotal, region.data.deliveryFee], [15, 3]);
  const catalog = await app.request('/api/catalog');
  assert.equal(catalog.data.products[0].price, 12.5);
  assert.equal(catalog.data.regions[0].id, 'alanya-center');

  const badMinimum = await app.request('/api/orders', { method: 'POST', body: {
    items: [{ productId: 'margherita', quantity: 1 }], customer: { name: 'Ada', phone: '555123', address: 'Alanya' },
    regionId: 'alanya-center', paymentMethod: 'cash', locale: 'tr', consent: true
  } });
  assert.equal(badMinimum.response.status, 400);
  const online = await app.request('/api/orders', { method: 'POST', body: {
    items: [{ productId: 'margherita', quantity: 2, price: 0 }], customer: { name: 'Ada', phone: '555123', address: 'Alanya' },
    regionId: 'alanya-center', paymentMethod: 'online', locale: 'tr', consent: true
  } });
  assert.equal(online.response.status, 400);
  assert.match(online.data.error, /not available/i);
  const orderResult = await app.request('/api/orders', { method: 'POST', body: {
    items: [{ productId: 'margherita', quantity: 2, price: 0 }], customer: { name: 'Ada', phone: '555123', address: 'Alanya', note: 'Ring bell' },
    regionId: 'alanya-center', paymentMethod: 'card_on_delivery', locale: 'de', consent: true, total: 0
  } });
  assert.equal(orderResult.response.status, 201);
  assert.deepEqual([orderResult.data.subtotal, orderResult.data.deliveryFee, orderResult.data.total], [25, 3, 28]);
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
  assert.equal(staffOrders.data[0].customer.phone, '555123');
  const status = await app.request(`/api/admin/orders/${orderResult.data.id}`, { method: 'PATCH', cookie: staffLogin.cookie, body: { status: 'preparing' } });
  assert.equal(status.data.status, 'preparing');
  assert.equal((await app.request('/api/admin/orders/not-real', { method: 'PATCH', cookie: staffLogin.cookie, body: { status: 'paid' } })).response.status, 400);

  const oneOwner = await app.request(`/api/admin/users/${initial.id}`, { method: 'DELETE', cookie: ownerCookie });
  assert.equal(oneOwner.response.status, 400);
  const closing = await app.request('/api/admin/settings', { method: 'PATCH', cookie: ownerCookie, body: { open: false } });
  assert.equal(closing.data.open, false);
  const closedOrder = await app.request('/api/orders', { method: 'POST', body: {
    items: [{ productId: 'margherita', quantity: 2 }], customer: { name: 'Ada', phone: '555123', address: 'Alanya' },
    regionId: 'alanya-center', paymentMethod: 'cash', consent: true
  } });
  assert.equal(closedOrder.response.status, 400);

  await app.close();
  db.close();
  dbClosed = true;
  db = openDatabase(dbPath);
  assert.equal(db.prepare('SELECT status FROM orders WHERE id=?').get(orderResult.data.id).status, 'preparing');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 2);
  db.close();
  dbClosed = true;
});

test('missing Origin is rejected for state-changing requests', async (t) => {
  const db = openDatabase(':memory:');
  await bootstrapOwner(db, { warn() {} });
  const app = await start(db);
  t.after(async () => { await app.close(); db.close(); });
  const response = await app.request('/api/auth/login', { method: 'POST', origin: null, body: { username: 'owner', password: 'x' } });
  assert.equal(response.response.status, 403);
});
