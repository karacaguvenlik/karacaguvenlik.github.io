import express from 'express';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cents, hashToken, money, newId, parseJson } from './db.mjs';

const scrypt = promisify(scryptCallback);
const cookieName = 'citir_session';
const statuses = new Set(['new', 'accepted', 'preparing', 'on_way', 'completed', 'cancelled']);
const paymentMethods = new Set(['cash', 'card_on_delivery', 'online']);
const locales = new Set(['tr', 'en', 'de', 'ru']);
const publicProductsSql = `SELECT p.* FROM products p
  LEFT JOIN categories c ON c.id=p.category_id
  WHERE p.active=1 AND (p.category_id IS NULL OR c.active=1)
  ORDER BY p.rowid`;
const availableProductSql = `SELECT p.* FROM products p
  LEFT JOIN categories c ON c.id=p.category_id
  WHERE p.id=? AND p.active=1 AND (p.category_id IS NULL OR c.active=1)`;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const languageNames = { tr: 'Türkçe', en: 'English', de: 'Deutsch', ru: 'Русский' };
const pageDescriptions = {
  tr: 'Çıtır Pizza & Cafe menüsünü keşfedin ve Alanya içi teslimat için sipariş verin.',
  en: 'Explore the Çıtır Pizza & Cafe menu and order delivery in Alanya.',
  de: 'Entdecken Sie die Speisekarte von Çıtır Pizza & Cafe und bestellen Sie in Alanya.',
  ru: 'Ознакомьтесь с меню Çıtır Pizza & Cafe и закажите доставку по Аланье.'
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const fail = (status, message) => { throw new HttpError(status, message); };
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
function string(value, field, { min = 1, max = 300, optional = false, multiline = false } = {}) {
  if (optional && value === undefined) return '';
  if (typeof value !== 'string' || value.trim().length < min || value.length > max || (!multiline && /[\r\n]/.test(value))) fail(400, `Invalid ${field}`);
  return value.trim();
}
function phoneNumber(value) {
  const phone = string(value, 'phone number', { max: 40 });
  const digits = phone.replace(/\D/g, '');
  if (!/^[+()\d .-]+$/.test(phone) || digits.length < 10 || digits.length > 15) fail(400, 'Invalid phone number');
  return phone;
}
function passwordInput(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 200) fail(400, 'Password must be between 12 and 200 characters');
  return value;
}
function localizedInput(value, field, optional = false) {
  if (optional && value === undefined) return {};
  if (!isObject(value)) fail(400, `Invalid ${field}`);
  for (const lang of locales) if (typeof value[lang] !== 'string' || value[lang].length > 2000) fail(400, `Invalid ${field}`);
  return Object.fromEntries([...locales].map((lang) => [lang, value[lang].trim()]));
}
function amount(value, field, { optional = false, fallback = 0 } = {}) {
  if (optional && value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1_000_000 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) fail(400, `Invalid ${field}`);
  return cents(value);
}
function bool(value, field, fallback = true) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') fail(400, `Invalid ${field}`);
  return value;
}
function id(value, field = 'id') { return string(value, field, { max: 100 }); }
function parseCookie(header = '') {
  const found = header.split(';').map((v) => v.trim()).find((v) => v.startsWith(`${cookieName}=`));
  return found ? decodeURIComponent(found.slice(cookieName.length + 1)) : null;
}
function toProduct(row) {
  return { id: row.id, categoryId: row.category_id, name: parseJson(row.name), description: parseJson(row.description), price: money(row.price_cents), image: row.image, active: Boolean(row.active) };
}
function toCategory(row) { return { id: row.id, name: parseJson(row.name), active: Boolean(row.active) }; }
function toRegion(row) { return { id: row.id, name: row.name, minSubtotal: money(row.min_subtotal_cents), deliveryFee: money(row.delivery_fee_cents), active: Boolean(row.active) }; }
function verifyStoredPassword(password, encoded) {
  const [kind, salt, expectedHex] = String(encoded).split(':');
  if (kind !== 'scrypt' || !salt || !expectedHex) return false;
  return scrypt(password, salt, 64).then((actual) => {
    const expected = Buffer.from(expectedHex, 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  });
}
async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${Buffer.from(derived).toString('hex')}`;
}
function userView(row) { return { id: row.id, username: row.username, role: row.role, active: Boolean(row.active), createdAt: row.created_at }; }
function safeEqualHash(token, storedHash) {
  const a = Buffer.from(hashToken(token), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function publicBaseUrl() {
  if (!process.env.PUBLIC_URL) return null;
  try {
    const url = new URL(process.env.PUBLIC_URL);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash) return null;
    if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return null;
    return url.href.replace(/\/$/, '');
  } catch { return null; }
}
function pageLanguage(req) {
  return locales.has(req.query.lang) ? req.query.lang : 'tr';
}
function displayText(value, lang) {
  if (typeof value === 'string') return value;
  if (!isObject(value)) return '';
  return value[lang] || value.tr || value.en || '';
}
function renderSeoPage(template, lang, settings, categories, products, baseUrl) {
  const brand = settings.name || 'Çıtır Pizza';
  const titleSuffix = { tr: 'Menü ve Alanya İçi Sipariş', en: 'Menu and Alanya Delivery', de: 'Speisekarte und Lieferung in Alanya', ru: 'Меню и доставка по Аланье' }[lang];
  const title = `${brand} | ${titleSuffix}`;
  const description = pageDescriptions[lang];
  const meta = [`<title>${escapeHtml(title)}</title>`, `<meta name="description" content="${escapeHtml(description)}">`];
  const structuredData = { '@context': 'https://schema.org', '@type': 'Restaurant', name: brand, servesCuisine: 'Pizza', inLanguage: lang };
  if (settings.phone) structuredData.telephone = settings.phone;
  if (settings.address) structuredData.address = { '@type': 'PostalAddress', streetAddress: settings.address, addressLocality: 'Alanya', addressCountry: 'TR' };
  if (baseUrl) {
    const current = `${baseUrl}/?lang=${lang}`;
    meta.push(`<link rel="canonical" href="${escapeHtml(current)}">`);
    for (const locale of locales) meta.push(`<link rel="alternate" hreflang="${locale}" href="${escapeHtml(`${baseUrl}/?lang=${locale}`)}">`);
    meta.push(`<link rel="alternate" hreflang="x-default" href="${escapeHtml(`${baseUrl}/?lang=tr`)}">`);
    structuredData.url = `${baseUrl}/`;
    structuredData.menu = `${baseUrl}/?lang=${lang}#menu`;
  }
  meta.push(`<script type="application/ld+json">${JSON.stringify(structuredData).replace(/</g, '\\u003c')}</script>`);
  const grouped = categories.map((category) => {
    const rows = products.filter((product) => product.categoryId === category.id);
    if (!rows.length) return '';
    return `<section><h3>${escapeHtml(displayText(category.name, lang))}</h3><ul>${rows.map((product) => `<li><strong>${escapeHtml(displayText(product.name, lang))}</strong>${displayText(product.description, lang) ? `<p>${escapeHtml(displayText(product.description, lang))}</p>` : ''}</li>`).join('')}</ul></section>`;
  }).join('');
  const uncategorized = products.filter((product) => !categories.some((category) => category.id === product.categoryId));
  const looseProducts = uncategorized.length ? `<ul>${uncategorized.map((product) => `<li><strong>${escapeHtml(displayText(product.name, lang))}</strong>${displayText(product.description, lang) ? `<p>${escapeHtml(displayText(product.description, lang))}</p>` : ''}</li>`).join('')}</ul>` : '';
  const summaryText = { tr: 'Menüyü görüntüle', en: 'View menu', de: 'Speisekarte anzeigen', ru: 'Показать меню' }[lang];
  const seoMenu = `<details class="seo-menu"><summary>${escapeHtml(summaryText)}</summary><div aria-label="${escapeHtml(languageNames[lang])} menu">${grouped}${looseProducts}</div></details>`;
  return template.replace('<html lang="tr">', `<html lang="${lang}">`)
    .replace('<!--SEO_META-->', meta.join('\n'))
    .replace('<!--SEO_MENU-->', seoMenu);
}

export function createApp({ db, publicDir = path.join(root, 'public'), production = process.env.NODE_ENV === 'production' } = {}) {
  if (!db) throw new TypeError('createApp requires an initialized SQLite database');
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
  app.use(express.json({ limit: '32kb', strict: true }));
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('X-Frame-Options', 'DENY');
    if (req.path.startsWith('/api/') || req.path === '/admin') res.set('Cache-Control', 'no-store');
    if (production) res.set('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self' https://www.googletagmanager.com https://www.googleadservices.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://www.googleadservices.com https://www.google.com https://google.com");
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      if (!origin) return res.status(403).json({ error: 'Origin header required' });
      try {
        const parsed = new URL(origin);
        if (parsed.origin !== `${req.protocol}://${req.get('host')}` || (production && parsed.protocol !== 'https:')) {
          return res.status(403).json({ error: 'Cross-origin request rejected' });
        }
      } catch { return res.status(403).json({ error: 'Invalid origin' }); }
    }
    next();
  });

  const loginAttempts = new Map();
  const orderAttempts = new Map();
  app.use((req, res, next) => {
    const token = parseCookie(req.get('cookie'));
    if (!token || token.length > 256) { req.user = null; return next(); }
    const session = db.prepare(`SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id
      WHERE sessions.token_hash=? AND sessions.expires_at>?`).get(hashToken(token), Date.now());
    req.user = session?.active ? session : null;
    if (!req.user) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
    next();
  });
  const requireAuth = (req, _res, next) => req.user ? next() : next(new HttpError(401, 'Authentication required'));
  const requireOwner = (req, _res, next) => !req.user ? next(new HttpError(401, 'Authentication required')) : req.user.role !== 'owner' ? next(new HttpError(403, 'Owner access required')) : next();
  const requireStaff = (req, _res, next) => !req.user ? next(new HttpError(401, 'Authentication required')) : next();
  const writeGuard = (req, _res, next) => requireAuth(req, _res, next);
  const ownerWrite = [requireOwner, writeGuard];

  app.get('/api/catalog', (_req, res) => {
    const categories = db.prepare('SELECT * FROM categories WHERE active=1 ORDER BY rowid').all().map(toCategory);
    const products = db.prepare(publicProductsSql).all().map(toProduct);
    const regions = db.prepare('SELECT * FROM regions WHERE active=1 ORDER BY rowid').all().map(toRegion);
    const settings = parseJson(db.prepare('SELECT value FROM settings WHERE id=1').get().value);
    res.json({ products, categories, regions, settings, payment: { onlineEnabled: false } });
  });

  app.get('/api/auth/me', (req, res) => res.json({ user: req.user ? { id: req.user.id, username: req.user.username, role: req.user.role } : null }));
  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const now = Date.now();
      const ip = req.ip;
      const attempts = (loginAttempts.get(ip) || []).filter((stamp) => now - stamp < 15 * 60_000);
      if (attempts.length >= 10) return res.status(429).json({ error: 'Too many login attempts; try again later' });
      const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
      const valid = user?.active && await verifyStoredPassword(password, user.password_hash);
      if (!valid) {
        if (!loginAttempts.has(ip) && loginAttempts.size >= 10_000) loginAttempts.delete(loginAttempts.keys().next().value);
        attempts.push(now); loginAttempts.set(ip, attempts);
        return res.status(401).json({ error: 'Invalid username or password' });
      }
      loginAttempts.delete(ip);
      const token = randomBytes(32).toString('base64url');
      db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(hashToken(token), user.id, now + 12 * 60 * 60_000);
      res.cookie(cookieName, token, { httpOnly: true, sameSite: 'lax', secure: production, path: '/', maxAge: 12 * 60 * 60_000 });
      res.json({ user: { id: user.id, username: user.username, role: user.role } });
    } catch (error) { next(error); }
  });
  app.post('/api/auth/logout', requireAuth, (req, res) => {
    const token = parseCookie(req.get('cookie'));
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
    res.clearCookie(cookieName, { httpOnly: true, sameSite: 'lax', secure: production, path: '/' });
    res.json({ ok: true });
  });

  app.post('/api/orders', (req, res, next) => {
    try {
      const body = req.body;
      if (!isObject(body) || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) fail(400, 'Invalid order items');
      if (body.consent !== true) fail(400, 'Customer consent is required');
      const customer = body.customer;
      if (!isObject(customer)) fail(400, 'Invalid customer details');
      const safeCustomer = {
        name: string(customer.name, 'customer name', { min: 2, max: 120 }),
        phone: phoneNumber(customer.phone),
        address: string(customer.address, 'address', { min: 10, max: 500, multiline: true }),
        note: string(customer.note, 'order note', { min: 0, max: 500, optional: true, multiline: true })
      };
      const regionId = id(body.regionId, 'region');
      const method = body.paymentMethod;
      if (!paymentMethods.has(method)) fail(400, 'Invalid payment method');
      if (method === 'online') fail(400, 'Online payment is not available yet');
      const locale = body.locale ?? 'tr';
      if (!locales.has(locale)) fail(400, 'Invalid locale');
      const quantities = new Map();
      for (const item of body.items) {
        if (!isObject(item) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) fail(400, 'Invalid item quantity');
        const productId = id(item.productId, 'product');
        const quantity = (quantities.get(productId) || 0) + item.quantity;
        if (quantity > 20) fail(400, 'Invalid item quantity');
        quantities.set(productId, quantity);
      }
      const requestedItems = [...quantities].map(([productId, quantity]) => ({ productId, quantity })).sort((a, b) => a.productId.localeCompare(b.productId));
      const requestHash = hashToken(JSON.stringify({ customer: safeCustomer, regionId, method, locale, items: requestedItems }));
      const idempotencyKey = req.get('idempotency-key') || body.clientRequestId || '';
      if (idempotencyKey && !/^[A-Za-z0-9_-]{32,128}$/.test(idempotencyKey)) fail(400, 'Invalid Idempotency-Key');
      const idempotencyHash = idempotencyKey ? hashToken(idempotencyKey) : null;
      if (idempotencyHash) {
        const previous = db.prepare('SELECT order_id,request_hash FROM order_idempotency WHERE key_hash=?').get(idempotencyHash);
        if (previous) {
          if (previous.request_hash !== requestHash) fail(409, 'Idempotency key was already used for a different order');
          const order = db.prepare('SELECT * FROM orders WHERE id=?').get(previous.order_id);
          return res.status(201).json({ id: order.id, trackingToken: idempotencyKey, subtotal: money(order.subtotal_cents), deliveryFee: money(order.delivery_fee_cents), total: money(order.total_cents), status: order.status });
        }
      }
      const now = Date.now();
      const ip = req.ip;
      const attempts = (orderAttempts.get(ip) || []).filter((stamp) => now - stamp < 15 * 60_000);
      if (attempts.length >= 20) return res.status(429).json({ error: 'Too many orders; try again later' });
      if (!orderAttempts.has(ip) && orderAttempts.size >= 10_000) orderAttempts.delete(orderAttempts.keys().next().value);
      attempts.push(now);
      orderAttempts.set(ip, attempts);
      const region = db.prepare('SELECT * FROM regions WHERE id=? AND active=1').get(regionId);
      if (!region) fail(400, 'Delivery region is unavailable');
      const items = [];
      let subtotal = 0;
      for (const { productId, quantity } of requestedItems) {
        const product = db.prepare(availableProductSql).get(productId);
        if (!product) fail(400, 'Product is unavailable');
        subtotal += product.price_cents * quantity;
        if (!Number.isSafeInteger(subtotal)) fail(400, 'Order total is too large');
        const snapshotName = parseJson(product.name);
        items.push({ productId, name: displayText(snapshotName, locale), nameByLocale: snapshotName, quantity, qty: quantity, unitPrice: money(product.price_cents), lineTotal: money(product.price_cents * quantity) });
      }
      if (subtotal < region.min_subtotal_cents) fail(400, 'Order does not meet the region minimum subtotal');
      const settings = parseJson(db.prepare('SELECT value FROM settings WHERE id=1').get().value);
      if (!settings.open) fail(400, 'Ordering is currently closed');
      const delivery = region.delivery_fee_cents;
      const idValue = newId();
      const trackingToken = idempotencyKey || randomBytes(32).toString('base64url');
      const createdAt = new Date().toISOString();
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(`INSERT INTO orders(id,tracking_hash,customer,region_id,payment_method,items,subtotal_cents,
          delivery_fee_cents,total_cents,status,locale,created_at) VALUES(?,?,?,?,?,?,?,?,?,'new',?,?)`)
          .run(idValue, hashToken(trackingToken), JSON.stringify(safeCustomer), regionId, method, JSON.stringify(items), subtotal, delivery, subtotal + delivery, locale, createdAt);
        if (idempotencyHash) db.prepare('INSERT INTO order_idempotency(key_hash,request_hash,order_id) VALUES(?,?,?)').run(idempotencyHash, requestHash, idValue);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      res.status(201).json({ id: idValue, trackingToken, subtotal: money(subtotal), deliveryFee: money(delivery), total: money(subtotal + delivery), status: 'new' });
    } catch (error) { next(error); }
  });
  app.get('/api/orders/:id', (req, res) => {
      const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!order || !token || token.length > 256 || !safeEqualHash(token, order.tracking_hash)) fail(404, 'Order not found');
    res.set('Cache-Control', 'no-store').json({ id: order.id, items: parseJson(order.items), subtotal: money(order.subtotal_cents), deliveryFee: money(order.delivery_fee_cents), total: money(order.total_cents), status: order.status, createdAt: order.created_at });
  });

  app.get('/api/admin/orders', requireStaff, (_req, res) => {
    res.json(db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all().map((order) => ({
      id: order.id, customer: parseJson(order.customer), regionId: order.region_id, paymentMethod: order.payment_method,
      items: parseJson(order.items), subtotal: money(order.subtotal_cents), deliveryFee: money(order.delivery_fee_cents),
      total: money(order.total_cents), status: order.status, locale: order.locale, createdAt: order.created_at
    })));
  });
  app.patch('/api/admin/orders/:id', requireStaff, (req, res) => {
    const status = req.body?.status;
    if (!statuses.has(status)) fail(400, 'Invalid order status');
    const result = db.prepare('UPDATE orders SET status=? WHERE id=?').run(status, req.params.id);
    if (!result.changes) fail(404, 'Order not found');
    res.json({ id: req.params.id, status });
  });

  app.get('/api/admin/users', requireOwner, (_req, res) => res.json(db.prepare('SELECT * FROM users ORDER BY created_at').all().map(userView)));
  app.post('/api/admin/users', ownerWrite, async (req, res, next) => {
    try {
      const username = string(req.body?.username, 'username', { min: 3, max: 40 });
      if (!/^[a-zA-Z0-9_.-]+$/.test(username)) fail(400, 'Username may contain only letters, numbers, dots, underscores, and hyphens');
      const password = passwordInput(req.body?.password);
      const role = req.body?.role;
      if (!['owner', 'staff'].includes(role)) fail(400, 'Invalid role');
      const user = { id: newId(), username, password_hash: await passwordHash(password), role, active: bool(req.body.active, 'active'), created_at: new Date().toISOString() };
      db.prepare('INSERT INTO users(id,username,password_hash,role,active,created_at) VALUES(?,?,?,?,?,?)').run(user.id, user.username, user.password_hash, user.role, Number(user.active), user.created_at);
      res.status(201).json(userView(user));
    } catch (error) { next(error); }
  });
  app.patch('/api/admin/users/:id', ownerWrite, async (req, res, next) => {
    try {
      const existing = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
      if (!existing) fail(404, 'User not found');
      const nextRole = req.body?.role === undefined ? existing.role : req.body.role;
      if (!['owner', 'staff'].includes(nextRole)) fail(400, 'Invalid role');
      const nextActive = bool(req.body?.active, 'active', Boolean(existing.active));
      if (existing.role === 'owner' && existing.active && (nextRole !== 'owner' || !nextActive)) {
        const count = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='owner' AND active=1").get().count;
        if (count <= 1) fail(400, 'At least one active owner must remain');
      }
      const username = req.body?.username === undefined ? existing.username : string(req.body.username, 'username', { min: 3, max: 40 });
      if (!/^[a-zA-Z0-9_.-]+$/.test(username)) fail(400, 'Invalid username');
      const passwordHashValue = req.body?.password === undefined ? existing.password_hash : await passwordHash(passwordInput(req.body.password));
      db.prepare('UPDATE users SET username=?,role=?,active=?,password_hash=? WHERE id=?').run(username, nextRole, Number(nextActive), passwordHashValue, existing.id);
      if (!nextActive || passwordHashValue !== existing.password_hash) db.prepare('DELETE FROM sessions WHERE user_id=?').run(existing.id);
      res.json(userView({ ...existing, username, role: nextRole, active: Number(nextActive) }));
    } catch (error) { next(error); }
  });
  app.delete('/api/admin/users/:id', ownerWrite, (req, res) => {
    const existing = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
    if (!existing) fail(404, 'User not found');
    if (existing.role === 'owner' && existing.active && db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='owner' AND active=1").get().count <= 1) fail(400, 'At least one active owner must remain');
    db.prepare('DELETE FROM users WHERE id=?').run(existing.id);
    res.json({ ok: true });
  });

  app.get('/api/admin/products', requireOwner, (_req, res) => res.json(db.prepare('SELECT * FROM products ORDER BY rowid').all().map(toProduct)));
  app.post('/api/admin/products', ownerWrite, (req, res) => {
    const data = productInput(req.body);
    const productId = id(req.body.id ?? newId());
    if (data.categoryId && !db.prepare('SELECT id FROM categories WHERE id=?').get(data.categoryId)) fail(400, 'Category not found');
    db.prepare('INSERT INTO products(id,category_id,name,description,price_cents,image,active) VALUES(?,?,?,?,?,?,?)').run(productId, data.categoryId, JSON.stringify(data.name), JSON.stringify(data.description), data.priceCents, data.image, Number(data.active));
    res.status(201).json(toProduct(db.prepare('SELECT * FROM products WHERE id=?').get(productId)));
  });
  app.patch('/api/admin/products/:id', ownerWrite, (req, res) => {
    const row = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
    if (!row) fail(404, 'Product not found');
    const data = productInput({ ...toProduct(row), ...req.body });
    if (data.categoryId && !db.prepare('SELECT id FROM categories WHERE id=?').get(data.categoryId)) fail(400, 'Category not found');
    db.prepare('UPDATE products SET category_id=?,name=?,description=?,price_cents=?,image=?,active=? WHERE id=?').run(data.categoryId, JSON.stringify(data.name), JSON.stringify(data.description), data.priceCents, data.image, Number(data.active), row.id);
    res.json(toProduct(db.prepare('SELECT * FROM products WHERE id=?').get(row.id)));
  });
  app.delete('/api/admin/products/:id', ownerWrite, (req, res) => {
    const result = db.prepare('UPDATE products SET active=0 WHERE id=?').run(req.params.id);
    if (!result.changes) fail(404, 'Product not found');
    res.json({ ok: true });
  });

  app.get('/api/admin/categories', requireOwner, (_req, res) => res.json(db.prepare('SELECT * FROM categories ORDER BY rowid').all().map(toCategory)));
  app.post('/api/admin/categories', ownerWrite, (req, res) => {
    const categoryId = id(req.body?.id ?? newId());
    const name = localizedInput(req.body?.name, 'category name');
    db.prepare('INSERT INTO categories(id,name,active) VALUES(?,?,?)').run(categoryId, JSON.stringify(name), Number(bool(req.body.active, 'active')));
    res.status(201).json(toCategory(db.prepare('SELECT * FROM categories WHERE id=?').get(categoryId)));
  });
  app.patch('/api/admin/categories/:id', ownerWrite, (req, res) => {
    const row = db.prepare('SELECT * FROM categories WHERE id=?').get(req.params.id);
    if (!row) fail(404, 'Category not found');
    const name = req.body?.name === undefined ? parseJson(row.name) : localizedInput(req.body.name, 'category name');
    const active = bool(req.body?.active, 'active', Boolean(row.active));
    db.prepare('UPDATE categories SET name=?,active=? WHERE id=?').run(JSON.stringify(name), Number(active), row.id);
    res.json(toCategory(db.prepare('SELECT * FROM categories WHERE id=?').get(row.id)));
  });
  app.delete('/api/admin/categories/:id', ownerWrite, (req, res) => {
    const result = db.prepare('UPDATE categories SET active=0 WHERE id=?').run(req.params.id);
    if (!result.changes) fail(404, 'Category not found');
    res.json({ ok: true });
  });

  app.get('/api/admin/regions', requireOwner, (_req, res) => res.json(db.prepare('SELECT * FROM regions ORDER BY rowid').all().map(toRegion)));
  app.post('/api/admin/regions', ownerWrite, (req, res) => {
    const regionId = id(req.body?.id ?? newId());
    const name = string(req.body?.name, 'region name', { max: 120 });
    const minSubtotal = amount(req.body?.minSubtotal, 'minimum subtotal', { optional: true });
    const deliveryFee = amount(req.body?.deliveryFee, 'delivery fee', { optional: true });
    db.prepare('INSERT INTO regions(id,name,min_subtotal_cents,delivery_fee_cents,active) VALUES(?,?,?,?,?)').run(regionId, name, minSubtotal, deliveryFee, Number(bool(req.body.active, 'active')));
    res.status(201).json(toRegion(db.prepare('SELECT * FROM regions WHERE id=?').get(regionId)));
  });
  app.patch('/api/admin/regions/:id', ownerWrite, (req, res) => {
    const row = db.prepare('SELECT * FROM regions WHERE id=?').get(req.params.id);
    if (!row) fail(404, 'Region not found');
    const name = req.body?.name === undefined ? row.name : string(req.body.name, 'region name', { max: 120 });
    const minSubtotal = amount(req.body?.minSubtotal, 'minimum subtotal', { optional: true, fallback: row.min_subtotal_cents });
    const deliveryFee = amount(req.body?.deliveryFee, 'delivery fee', { optional: true, fallback: row.delivery_fee_cents });
    const active = bool(req.body?.active, 'active', Boolean(row.active));
    db.prepare('UPDATE regions SET name=?,min_subtotal_cents=?,delivery_fee_cents=?,active=? WHERE id=?').run(name, minSubtotal, deliveryFee, Number(active), row.id);
    res.json(toRegion(db.prepare('SELECT * FROM regions WHERE id=?').get(row.id)));
  });
  app.delete('/api/admin/regions/:id', ownerWrite, (req, res) => {
    const result = db.prepare('UPDATE regions SET active=0 WHERE id=?').run(req.params.id);
    if (!result.changes) fail(404, 'Region not found');
    res.json({ ok: true });
  });

  app.patch('/api/admin/settings', ownerWrite, (req, res) => {
    if (!isObject(req.body)) fail(400, 'Invalid settings');
    const current = parseJson(db.prepare('SELECT value FROM settings WHERE id=1').get().value);
    const next = { ...current };
    for (const key of ['name', 'phone', 'address']) if (req.body[key] !== undefined) next[key] = string(req.body[key], key, { min: 0, max: 300 });
    for (const key of ['heroTitle', 'heroSubtitle', 'announcement', 'openingHours']) if (req.body[key] !== undefined) next[key] = localizedInput(req.body[key], key);
    if (req.body.open !== undefined) next.open = bool(req.body.open, 'open');
    if (req.body.demoPrices !== undefined) next.demoPrices = bool(req.body.demoPrices, 'demoPrices');
    if (req.body.googleAdsId !== undefined) {
      const value = string(req.body.googleAdsId, 'googleAdsId', { min: 0, max: 18 });
      if (value && !/^AW-\d{6,15}$/.test(value)) fail(400, 'Invalid googleAdsId');
      next.googleAdsId = value;
    }
    if (req.body.googleAdsLabel !== undefined) {
      const value = string(req.body.googleAdsLabel, 'googleAdsLabel', { min: 0, max: 100 });
      if (value && !/^[A-Za-z0-9_-]{1,100}$/.test(value)) fail(400, 'Invalid googleAdsLabel');
      next.googleAdsLabel = value;
    }
    db.prepare('UPDATE settings SET value=? WHERE id=1').run(JSON.stringify(next));
    res.json(next);
  });

  if (existsSync(publicDir)) {
    app.get('/', async (req, res, next) => {
      try {
        const template = await readFile(path.join(publicDir, 'index.html'), 'utf8');
        const lang = pageLanguage(req);
        const categories = db.prepare('SELECT * FROM categories WHERE active=1 ORDER BY rowid').all().map(toCategory);
        const products = db.prepare(publicProductsSql).all().map(toProduct);
        const settings = parseJson(db.prepare('SELECT value FROM settings WHERE id=1').get().value);
        res.type('html').send(renderSeoPage(template, lang, settings, categories, products, publicBaseUrl()));
      } catch (error) { next(error); }
    });
    app.get('/admin', (_req, res, next) => res.sendFile(path.join(publicDir, 'admin.html'), (error) => error && next(error)));
    app.use(express.static(publicDir, { index: 'index.html', fallthrough: true }));
  }
  app.get('/robots.txt', (_req, res) => {
    const publicUrl = publicBaseUrl();
    const rules = publicUrl
      ? `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\nSitemap: ${publicUrl}/sitemap.xml\n`
      : 'User-agent: *\nDisallow: /\n';
    res.type('text/plain').send(rules);
  });
  app.get('/sitemap.xml', (_req, res) => {
    const publicUrl = publicBaseUrl();
    if (!publicUrl) return res.status(404).type('text/plain').send('Sitemap is not configured');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...locales].map((lang) => `<url><loc>${publicUrl}/?lang=${lang}</loc></url>`).join('')}</urlset>`);
  });
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((error, _req, res, _next) => {
    if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ error: 'Invalid JSON body' });
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'An item with that identifier or username already exists' });
    if (error?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') return res.status(400).json({ error: 'Referenced item does not exist' });
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}

function productInput(body) {
  if (!isObject(body)) fail(400, 'Invalid product');
  const categoryId = body.categoryId === null || body.categoryId === undefined || body.categoryId === '' ? null : id(body.categoryId, 'category');
  const image = string(body.image ?? '', 'image', { min: 0, max: 1000 });
  if (image && !/^\/images\/(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^\r\n]*$/.test(image)) {
    let url;
    try { url = new URL(image); } catch { fail(400, 'Image must be a local /images path or HTTPS URL'); }
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) fail(400, 'Image must be a local /images path or HTTPS URL');
  }
  return {
    categoryId,
    name: localizedInput(body.name, 'product name'),
    description: localizedInput(body.description ?? { tr: '', en: '', de: '', ru: '' }, 'product description'),
    priceCents: amount(body.price, 'price'),
    image,
    active: bool(body.active, 'active')
  };
}
