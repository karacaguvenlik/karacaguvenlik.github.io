# Çıtır Pizza ordering backend

Node.js 24+ / Express API with a persistent built-in `node:sqlite` database. The server listens on `0.0.0.0:3000` by default. Run `npm install`, then `npm start`; `npm test` runs the backend integration suite.

## First run and menu data

The process creates `data/orders.sqlite`. If `data/menu.json` exists, an empty catalog is seeded once from its `categories`, `products`, `regions`, and optional `settings` arrays. It is safe to start before that file exists; the catalog is empty until an administrator adds data or the menu file is provided before the first seed. The database is persistent and is not overwritten on subsequent starts.

On a new database only, the server creates username `owner`, generates a random password and prints that credential once to its startup output. Save it securely and change it after signing in by creating a replacement owner then disabling/deleting the bootstrap account. The generated password is never stored in plaintext or committed. There is no default password.

## API overview

- `GET /api/catalog` returns active products, categories, delivery regions, public settings, and `payment.onlineEnabled: false`.
- `POST /api/orders` accepts customer details, product IDs and quantities, an active region, locale (`tr`, `en`, `de`, `ru`), consent, and `cash` or `card_on_delivery`. Prices, minimum region subtotal, delivery fee, and order totals are calculated from the database. `online` is intentionally rejected; no payment is represented as successful.
- `GET /api/orders/:id?token=...` uses the unguessable tracking secret returned when ordering and reveals only order items, totals, timestamp, and status—not customer details.
- `/api/auth/login`, `/api/auth/logout`, and `/api/auth/me` manage authenticated staff/owner sessions.
- `/api/admin/orders` is available to staff and owners; only owners can manage users, products, categories, regions, and settings under `/api/admin`.
- `GET /admin` serves `public/admin.html` when supplied by the frontend.

Writes require a same-origin `Origin` header. Sessions use random opaque tokens in `HttpOnly`, `SameSite=Lax` cookies, expire after 12 hours, and use `Secure` in production. Passwords are scrypt-hashed. Login is rate-limited per IP. At least one active owner must remain.

## Production operation

- Serve only over HTTPS and set `NODE_ENV=production`; if TLS terminates at a trusted reverse proxy, set `TRUST_PROXY=1` and ensure the proxy overwrites forwarded headers.
- Set `PUBLIC_URL` to the canonical public HTTPS URL. Without it, no production canonical URL is emitted and the sitemap route is unavailable; `robots.txt` remains usable.
- Set `DATABASE_PATH` to durable storage, restrict filesystem access, and take tested, encrypted backups of the SQLite database. Include WAL sidecar files when copying a live database; prefer SQLite's online backup facilities or stop the server for a consistent file-level backup.
- Keep startup output containing the first-run credential private. Use a process supervisor, restrict logs, and rotate the bootstrap owner's access after creating named owner accounts.
- Online card checkout requires onboarding a real payment provider before enabling it: configure provider secrets outside source control; create server-side payment intents for validated order totals; redirect/confirm through the provider's hosted or tokenized flow; verify signed webhooks server-side; make webhook handling idempotent; and mark an order paid only after verified provider confirmation. Add provider-specific tests and operational reconciliation before changing `onlineEnabled`. This backend does not collect card data or claim online payments are ready.

Copy `.env.example` as a starting point for local configuration. The server currently reads environment variables directly and does not load `.env` files automatically.
