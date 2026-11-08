import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';

const folder = new URL('../public/citirpizza/', import.meta.url);
async function loadDemo(storage = new Map()) {
  const seed = JSON.parse(await readFile(new URL('menu.json', folder), 'utf8'));
  const context = {
    console, structuredClone, crypto: webcrypto, URL, Date, setTimeout, clearTimeout,
    location: { pathname: '/citirpizza/index.html', href: 'https://example.test/citirpizza/' },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key)
    },
    addEventListener() {}, dispatchEvent() {},
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    fetch: async url => {
      assert.equal(String(url), './menu.json');
      return { ok: true, json: async () => structuredClone(seed) };
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(await readFile(new URL('demo-store.js', folder), 'utf8'), context);
  return { demo: context.CitirDemo, storage };
}

test('presentation catalog edits, synthetic orders and persistence are browser-local', async () => {
  const { demo, storage } = await loadDemo();
  const catalog = await demo.request('/catalog');
  assert.equal(catalog.products.length, 76);
  assert.equal(catalog.regions.length, 102);
  assert.equal(catalog.payment.onlineEnabled, false);
  const product = catalog.products.find(p => p.categoryId === 'pizza');
  const region = catalog.regions.find(r => r.name === 'Oba');
  await demo.request(`/admin/products/${product.id}`, { method: 'PATCH', body: JSON.stringify({ price: 123.5 }) });
  await demo.request(`/admin/regions/${region.id}`, { method: 'PATCH', body: JSON.stringify({ minSubtotal: 200, deliveryFee: 25 }) });
  await assert.rejects(demo.addOrder([{ productId: product.id, quantity: 1 }], region.id, 'tr'));
  const order = await demo.addOrder([{ productId: product.id, quantity: 2 }], region.id, 'tr');
  const orders = await demo.request('/admin/orders');
  const stored = orders.find(o => o.id === order.id);
  assert.ok(stored);
  assert.equal(stored.total, 272);
  assert.match(stored.customer.name, /demo|örnek|temsili/i);
  await demo.request(`/admin/orders/${order.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'preparing' }) });
  const reloaded = (await loadDemo(storage)).demo;
  assert.equal((await reloaded.request('/admin/orders')).find(o => o.id === order.id).status, 'preparing');
  assert.equal((await reloaded.request('/catalog')).products.find(p => p.id === product.id).price, 123.5);
  await demo.request(`/admin/products/${product.id}`, { method: 'PATCH', body: JSON.stringify({ active: false }) });
  await assert.rejects(demo.addOrder([{ productId: product.id, quantity: 2 }], region.id, 'tr'));
  assert.ok(storage.size > 0);
  await demo.request(`/admin/products/${product.id}`, { method: 'PATCH', body: JSON.stringify({ active: true }) });
  await demo.request(`/admin/categories/${product.categoryId}`, { method: 'PATCH', body: JSON.stringify({ active: false }) });
  assert.equal((await demo.request('/catalog')).products.some(p => p.id === product.id), false);
  await assert.rejects(demo.addOrder([{ productId: product.id, quantity: 2 }], region.id, 'tr'));
  await demo.reset();
  const resetCatalog = await demo.request('/catalog');
  assert.equal(resetCatalog.products.find(p => p.id === product.id).price, product.price);
  assert.equal((await demo.request('/admin/orders')).length, 2);
});

test('presentation HTML is portable and does not request personal or payment details', async () => {
  const html = await readFile(new URL('index.html', folder), 'utf8');
  assert.match(html, /noindex/);
  assert.match(html, /\.\/demo-store\.js/);
  assert.match(html, /\.\/admin\.html/);
  assert.doesNotMatch(html, /(?:src|href)="\//);
  assert.doesNotMatch(html, /name="(?:phone|address|password|cardNumber|consent)"/);
  const script = await readFile(new URL('app.js', folder), 'utf8');
  assert.doesNotMatch(script, /googletagmanager\.com|fetch\('\/api\/|\/api\/orders/);
});

test('demo panel is explicitly non-authenticated and has no password form', async () => {
  const html = await readFile(new URL('admin.html', folder), 'utf8');
  assert.match(html, /gerçek yetkilendirme yok/);
  assert.match(html, /noindex/);
  assert.doesNotMatch(html, /type="password"/);
  assert.doesNotMatch(html, /(?:src|href)="\//);
});
