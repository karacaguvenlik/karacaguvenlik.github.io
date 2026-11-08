import { createHash, randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const scrypt = promisify(scryptCallback);
const locales = ['tr', 'en', 'de', 'ru'];
const defaultSettings = {
  name: 'Çıtır Pizza', phone: '', address: '',
  heroTitle: { tr: 'Çıtır Pizza', en: 'Çıtır Pizza', de: 'Çıtır Pizza', ru: 'Çıtır Pizza' },
  heroSubtitle: { tr: '', en: '', de: '', ru: '' },
  announcement: { tr: '', en: '', de: '', ru: '' }, open: true
};

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
export const cents = (amount) => Math.round(Number(amount) * 100);
export const money = (amount) => Number(amount) / 100;
export const newId = () => randomBytes(16).toString('hex');

export function openDatabase(filename = process.env.DATABASE_PATH || 'data/orders.sqlite') {
  if (filename !== ':memory:') {
    const dir = path.dirname(path.resolve(filename));
    // DatabaseSync is synchronous; creating the directory here avoids startup races.
    ensureDirectory(dir);
  }
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner','staff')), active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, category_id TEXT REFERENCES categories(id), name TEXT NOT NULL,
      description TEXT NOT NULL, price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
      image TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS regions (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, min_subtotal_cents INTEGER NOT NULL DEFAULT 0,
      delivery_fee_cents INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, tracking_hash TEXT NOT NULL, customer TEXT NOT NULL, region_id TEXT NOT NULL,
      payment_method TEXT NOT NULL CHECK(payment_method IN ('cash','card_on_delivery','online')),
      items TEXT NOT NULL, subtotal_cents INTEGER NOT NULL, delivery_fee_cents INTEGER NOT NULL,
      total_cents INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'new', locale TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at DESC);
  `);
  if (!db.prepare('SELECT id FROM settings WHERE id=1').get()) {
    db.prepare('INSERT INTO settings(id,value) VALUES(1,?)').run(JSON.stringify(defaultSettings));
  }
  return db;
}

function ensureDirectory(dir) {
  mkdirSync(dir, { recursive: true });
}

export async function seedMenu(db, menuPath = 'data/menu.json') {
  if (db.prepare('SELECT COUNT(*) AS count FROM products').get().count > 0 ||
      db.prepare('SELECT COUNT(*) AS count FROM categories').get().count > 0 ||
      db.prepare('SELECT COUNT(*) AS count FROM regions').get().count > 0) return false;
  let menu;
  try { menu = JSON.parse(await readFile(menuPath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  if (!menu || !Array.isArray(menu.categories) || !Array.isArray(menu.products) || !Array.isArray(menu.regions)) {
    throw new Error('data/menu.json must contain categories, products, and regions arrays');
  }
  try {
    db.exec('BEGIN');
    const category = db.prepare('INSERT INTO categories(id,name,active) VALUES(?,?,?)');
    const product = db.prepare('INSERT INTO products(id,category_id,name,description,price_cents,image,active) VALUES(?,?,?,?,?,?,?)');
    const region = db.prepare('INSERT INTO regions(id,name,min_subtotal_cents,delivery_fee_cents,active) VALUES(?,?,?,?,?)');
    for (const item of menu.categories) category.run(String(item.id), JSON.stringify(item.name), item.active === false ? 0 : 1);
    for (const item of menu.products) product.run(String(item.id), item.categoryId ?? null, JSON.stringify(item.name), JSON.stringify(item.description ?? {}), cents(item.price), String(item.image ?? ''), item.active === false ? 0 : 1);
    for (const item of menu.regions) region.run(String(item.id), String(item.name), cents(item.minSubtotal ?? 0), cents(item.deliveryFee ?? 0), item.active === false ? 0 : 1);
    if (menu.settings && typeof menu.settings === 'object') db.prepare('UPDATE settings SET value=? WHERE id=1').run(JSON.stringify({ ...defaultSettings, ...menu.settings }));
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return true;
}

export async function bootstrapOwner(db, logger = console) {
  if (db.prepare("SELECT id FROM users WHERE role='owner' AND active=1").get()) return null;
  const username = 'owner';
  if (db.prepare('SELECT id FROM users').get()) {
    throw new Error('No active owner remains; restore or activate an owner account before startup.');
  }
  const password = randomBytes(18).toString('base64url');
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  const id = newId();
  db.prepare('INSERT INTO users(id,username,password_hash,role,active,created_at) VALUES(?,?,?,\'owner\',1,?)')
    .run(id, username, `scrypt:${salt}:${Buffer.from(derived).toString('hex')}`, new Date().toISOString());
  logger.warn(`\nInitial owner account (shown once): username=${username} password=${password}\nChange this password after signing in.\n`);
  return { id, username, password };
}

export const parseJson = (value) => JSON.parse(value);
export const localized = (value) => typeof value === 'string' ? JSON.parse(value) : value;
export const localesSupported = locales;
export { defaultSettings };
