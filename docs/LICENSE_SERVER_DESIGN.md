# License / Entitlements Server – Design and Implementation

This document describes the design and implementation of a **separate** license (entitlements) server, to be built in its **own repository**. The server is the single place where you manage which deployment (school) has which premium features enabled (e.g. Notensammler, Student Photos). Each Wechselplan instance calls this server with a license key and receives the list of enabled features.

---

## 1. Purpose and scope

- **Purpose:** Store and serve per-license feature flags so that the Wechselplan app can gate premium features (e.g. Notensammler, student photos) per deployment.
- **Consumers:** Wechselplan app instances (one per school), each identified by a unique `LICENSE_KEY`.
- **Out of scope (for v1):** Billing, payment, or usage analytics. The server only answers "what features does this license have?". Billing can be added later (e.g. webhooks, plans).

---

## 2. Data model

### 2.1 Core entities

**License**

- `id` – Primary key (e.g. UUID or auto-increment).
- `license_key` – Unique secret string (e.g. UUID or random 32+ chars). This is what each school deployment stores as `LICENSE_KEY` and sends to the server. Treat as a secret; store hashed if you want (optional for v1).
- `customer_name` – Human-readable name (e.g. school name) for your admin only.
- `created_at`, `updated_at` – Timestamps.
- Optional: `expires_at` – If set, the server can return 403 or empty features when the license is expired. For v1 you can skip and add later.

**Feature**

- Represents a premium feature that can be toggled per license.
- Options:
  - **Option A (simplest):** No separate table. Feature keys are a fixed list in code (e.g. `notensammler`, `student_photos`). You only store which license has which key.
- **Option B:** Table `features` with `id`, `key` (e.g. `notensammler`), `name`, `description`. Then a junction table links licenses to features. Easier to add new features via admin UI without code change.

**LicenseFeature (junction)**

- Only needed if you use Option B for features.
- `license_id`, `feature_key` (or `feature_id`) – which features are enabled for that license.
- Unique on `(license_id, feature_key)`.

If you use **Option A**, you can store the list of enabled features as:

- A JSON array on the license, e.g. `enabled_features: ["notensammler", "student_photos"]`, or
- A simple key-value or tag table: `license_id` + `feature_key`.

### 2.2 Suggested schema (Option A, minimal)

```text
licenses
  id              PK
  license_key     UNIQUE, NOT NULL
  customer_name   TEXT
  enabled_features  JSONB or TEXT[]   -- e.g. ["notensammler", "student_photos"]
  created_at      TIMESTAMP
  updated_at      TIMESTAMP
```

No separate Feature or LicenseFeature table; feature keys are validated against a list in code. When the app sends a key you don't recognize, you can ignore it or return 401.

---

## 3. API design

### 3.1 Entitlements endpoint (for the app)

**GET /api/entitlements**

- **Authentication:** License key must be sent by the client (Wechselplan server). Two common options:
  - **Header:** `Authorization: Bearer <LICENSE_KEY>` or `X-License-Key: <LICENSE_KEY>`.
  - **Query (less preferred):** `?key=<LICENSE_KEY>` (can leak in logs; avoid if possible).
- **Behaviour:**
  - Look up the license by `license_key`.
  - If not found or invalid: return **401 Unauthorized** with a JSON body, e.g. `{ "error": "Invalid or missing license key" }`.
  - If found: return **200 OK** with JSON, e.g. `{ "features": ["notensammler", "student_photos"] }`. Only include keys that your server knows about; the app will ignore others.
- **Optional:** If you add `expires_at`, return 403 or empty `features` when the license has expired, with a clear error message.

**CORS:** If the Wechselplan app ever called this from the browser (e.g. from Edge middleware), you'd need CORS. If the app only calls from its Node server, CORS is not required. Recommend calling from server-only and then CORS can be ignored for v1.

### 3.2 Admin API (for you)

Optional but recommended so you can manage licenses without touching the DB by hand.

- **GET /api/admin/licenses** – List all licenses (id, customer_name, created_at, enabled_features; do **not** expose full `license_key` in list, maybe last 4 chars only).
- **GET /api/admin/licenses/:id** – Get one license (full key only for create response or single view).
- **POST /api/admin/licenses** – Create license: body `{ "customer_name": "...", "enabled_features": ["notensammler"] }`. Server generates `license_key`, returns it once (e.g. in response). Store it securely and give it to the school.
- **PATCH /api/admin/licenses/:id** – Update `customer_name` and/or `enabled_features`.
- **DELETE /api/admin/licenses/:id** – Deactivate or delete (soft-delete preferred so old keys keep returning 401).

Protect admin routes with a secret (e.g. `Authorization: Bearer <ADMIN_SECRET>` or API key in header). Only you (or your deployment) know this secret.

---

## 4. Technology and implementation

### 4.1 Stack suggestions

- **Runtime:** Node.js (or any language you're comfortable with; below is Node-oriented).
- **Framework:** Express, Fastify, or a minimal Next.js API-only app. Keep it small.
- **Database:** SQLite (single file, no extra server) or PostgreSQL. SQLite is enough for dozens/hundreds of licenses; Postgres if you want one DB for many services later.
- **Migrations:** Use simple SQL migrations or an ORM (e.g. Prisma, Drizzle) for schema and seeds.

### 4.2 Project layout (example)

```text
license-server/
  package.json
  src/
    index.ts          # App entry, attach routes
    db.ts             # DB connection (e.g. Prisma or raw SQL)
    routes/
      entitlements.ts # GET /api/entitlements (license key auth)
      admin/
        licenses.ts   # CRUD for licenses (admin auth)
    middleware/
      auth.ts         # Validate license key or admin key
    lib/
      feature-keys.ts # List of valid feature keys
  prisma/             # If using Prisma
    schema.prisma
    migrations/
  .env.example        # DATABASE_URL, ADMIN_SECRET, etc.
```

### 4.3 Security

- **License key:** Long, random, unguessable (e.g. 32-byte hex). Generate on license creation; show once in admin response; store in DB. Wechselplan stores it in env only.
- **HTTPS:** Serve the API over HTTPS only in production.
- **Admin routes:** Require a strong secret (env var); no admin endpoints without it.
- **Rate limiting:** Optional but recommended on `/api/entitlements` to avoid abuse (e.g. 100 req/min per IP or per key).

### 4.4 Feature key contract

- Maintain a single list of valid feature keys (e.g. in code or DB). Suggested v1 keys: `notensammler`, `student_photos`.
- When saving `enabled_features`, validate each key against this list; reject or strip unknown keys. When returning the list, only return known keys. This keeps the app and server in sync.

---

## 5. Deployment and operations

- **Hosting:** Deploy as a single service (e.g. on a small VPS, Railway, Render, or Fly.io). One instance is enough for many schools.
- **Env:** `DATABASE_URL`, `ADMIN_SECRET`, `PORT`. Optional: `NODE_ENV`.
- **Database:** Run migrations on deploy. For SQLite, ensure the file path is persistent (volume or host path).
- **Monitoring:** Log 401s and 5xx; optional health check `GET /health` returning 200. No need for complex metrics in v1.

---

## 6. Wechselplan app integration (reference)

The Wechselplan app will:

1. Read `LICENSE_SERVER_URL` and `LICENSE_KEY` from env.
2. Call `GET {LICENSE_SERVER_URL}/api/entitlements` with the license key in a header.
3. Cache the response in memory (e.g. 1 hour TTL) and use it for `isFeatureEnabled('notensammler')` etc.
4. On 401: treat as no premium features (or log and alert). On 5xx/timeout: use stale cache if available; otherwise no premium features.

See [ENTITLEMENTS_INTEGRATION.md](./ENTITLEMENTS_INTEGRATION.md) in the Wechselplan repo for the full list of app-side changes.

---

## 7. Summary checklist (server repo)

- [ ] New repo; minimal Node (or other) app with one public endpoint and optional admin CRUD.
- [ ] DB: licenses table with `license_key`, `customer_name`, `enabled_features` (and timestamps).
- [ ] GET /api/entitlements: auth by license key; return `{ "features": [...] }` or 401.
- [ ] Admin: create/list/update licenses; generate and return license key on create; protect with admin secret.
- [ ] Valid feature keys: `notensammler`, `student_photos` (and validate on write).
- [ ] HTTPS, env-based config, migrations, optional rate limit and health check.
- [ ] Document base URL and auth header for the Wechselplan team (or for yourself when integrating).
