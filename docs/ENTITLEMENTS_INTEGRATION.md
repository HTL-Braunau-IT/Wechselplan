# Entitlements Integration (Wechselplan App)

This document lists the changes required in **this repository** to integrate with the external license/entitlements server. Each deployment will call the server with a license key and gate premium features (e.g. Notensammler, Student Photos) based on the returned feature list.

---

## 1. Environment and configuration

### 1.1 New environment variables

Add to [`.env.example`](../.env.example) and document:

- `LICENSE_SERVER_URL` (optional) – Base URL of the entitlements server, e.g. `https://license.example.com`. If unset, treat as "no license server" (see fallback below).
- `LICENSE_KEY` (optional) – Secret license key for this deployment. Sent to the server to identify the instance and receive its feature list.
- `DISABLE_ENTITLEMENTS` (optional, default unset) – When set to a truthy value (e.g. `true` or `1`), the app does not call the license server and treats all known feature keys as enabled. Use for local/dev or unrestricted deployments.

### 1.2 Env validation

In [`src/env.js`](../src/env.js):

- Add optional server vars, e.g.:
  - `LICENSE_SERVER_URL: z.string().url().optional()`
  - `LICENSE_KEY: z.string().optional()`
  - `DISABLE_ENTITLEMENTS: z.string().optional()` (or a coerce-to-boolean schema)
- Add them to `runtimeEnv` so they are available server-side.
- Do **not** expose the license key or the disable flag to the client (no `NEXT_PUBLIC_`).

### 1.3 Fallback behaviour

Precedence (the disable flag takes priority over the license server):

- **If `DISABLE_ENTITLEMENTS` is set (truthy):** Do not call the server. `getEnabledFeatures()` returns all feature keys; `isFeatureEnabled(...)` always returns `true`. All premium features are available.
- **Else if both `LICENSE_SERVER_URL` and `LICENSE_KEY` are set:** Fetch entitlements from the server and cache them.
- **Else:** No server call; treat as "no license server" (either all premium disabled or use existing fallback like `ENABLED_FEATURES=notensammler,student_photos` for local/dev). Define one policy and stick to it.

---

## 2. Feature keys (constants)

Define a single source of truth for feature identifiers used by the app and the server.

Suggested place: `src/lib/entitlements.ts` (or `src/lib/features.ts`).

- **Feature keys** (examples):
  - `notensammler` – Notensammler page and all related APIs (grades, final grades, PDF, transfer).
  - `student_photos` – Student photo upload (admin) and photo serving. When disabled: block upload and photo-serving APIs; all UI that displays photos stays in place and shows only the same fallback used when no photo is stored (do not hide or disable those components).

Add a type, e.g. `type FeatureKey = 'notensammler' | 'student_photos'` and an array or set of all keys for validation.

---

## 3. Entitlements client and cache

### 3.1 Entitlements client

In `src/lib/entitlements.ts` (or equivalent):

- **Disable flag:** If `DISABLE_ENTITLEMENTS` is set, do not fetch or use cache; `getEnabledFeatures()` returns the full list of all feature keys, and `isFeatureEnabled(feature)` always returns `true`. No request to the license server is made.
- **Fetch function:** `GET {LICENSE_SERVER_URL}/api/entitlements` with header `Authorization: Bearer {LICENSE_KEY}` (or `X-License-Key: {LICENSE_KEY}`). Parse JSON response, e.g. `{ "features": ["notensammler", "student_photos"] }`.
- **Caching:** In-memory cache (e.g. a module-level variable) holding the last successful response and a timestamp. TTL suggestion: 1 hour (configurable). On request, if cache is valid, return cached list; otherwise fetch from server and update cache. On fetch failure, keep using previous cache if still within a "stale" window (e.g. 24 hours); beyond that, treat as "no premium features" or all disabled.
- **Helper:** `getEnabledFeatures(): Promise<FeatureKey[]>` – returns the list of enabled feature keys for this instance (from cache or server, or empty if no server/config).
- **Helper:** `isFeatureEnabled(feature: FeatureKey): Promise<boolean>` – returns whether the given feature is in the enabled list. Use this everywhere you need to gate behaviour.

Ensure all of this runs only on the server (no `NEXT_PUBLIC_` usage for license key or server URL).

### 3.2 Server-side usage

- Use `getEnabledFeatures()` or `isFeatureEnabled()` in:
  - Middleware (route protection).
  - API route handlers (return 403 when feature is disabled).
  - Server components or getServerSideProps if you use them.
- Do not pass the raw license key or server URL to the client.

### 3.3 Exposing enabled features to the client (UI)

The client needs to know which features to show (e.g. nav links). Options:

- **Option A:** Add an API route, e.g. `GET /api/entitlements` (or `/api/features`), that returns only `{ "features": ["notensammler", "student_photos"] }` (no secrets). The app calls the license server server-side and caches; this API reads from the same cache and returns the list. Secure the route so only authenticated users can call it if desired.
- **Option B:** Inject the list into a layout or provider from a server component (e.g. pass `enabledFeatures` from a server layout that calls `getEnabledFeatures()`). Client components receive it via props or context.

Use one approach consistently so the UI can hide Notensammler when disabled and the Student Photos upload tab when `student_photos` is disabled; components that display photos keep showing the no-photo fallback.

### 3.4 Cache and fallback when license server is unreachable

- **Cache TTL:** Successful responses are cached in memory for 1 hour. While the cache is valid, no request is made to the license server.
- **On fetch failure (network error or 5xx):** The client reuses the previous cached list if it is still within a **stale window** (24 hours). This avoids disabling features during short outages.
- **Beyond stale window or no cache:** If the server is unreachable and there is no cache, or the cache is older than 24 hours, `getEnabledFeatures()` returns an empty list (all premium features disabled).

An optional **health/debug** endpoint `GET /api/entitlements/health` (admin-only) can be used to verify that the app can reach the license server and receive a feature list.

---

## 4. Middleware (route protection)

File: [`src/middleware.ts`](../src/middleware.ts).

Current behaviour: routes under `/schedule`, `/admin`, `/schedueles`, `/students`, `/notensammler` require an authenticated user with role `teacher`.

Add entitlement checks **after** auth:

- **`/notensammler`:** If the `notensammler` feature is not enabled for this instance, redirect to home (or to a "feature not available" page). Middleware runs in the Edge runtime; you cannot use Node-only APIs here. Options:
  - (a) In Edge, call the license server directly (if it supports CORS and is fast), or
  - (b) Keep middleware as-is (auth only) and do entitlement checks in the Notensammler layout/page (server-side) and in API routes; redirect from the page if the feature is disabled. Document which approach is used.

If you use (b), the middleware change is "no change" for entitlements; just document that `/notensammler` is protected by layout + API checks.

---

## 5. API routes to gate

Gate by calling `isFeatureEnabled('<feature_key>')` at the start of the handler. If disabled, return `403 Forbidden` with a consistent JSON body (e.g. `{ "error": "Feature not available" }`).

### 5.1 Notensammler (`notensammler`)

- [`src/app/api/notensammler/pdf/route.ts`](../src/app/api/notensammler/pdf/route.ts)
- [`src/app/api/notensammler/pdf/all/route.ts`](../src/app/api/notensammler/pdf/all/route.ts)
- [`src/app/api/notensammler/grades/route.ts`](../src/app/api/notensammler/grades/route.ts)
- [`src/app/api/notensammler/grades/batch/route.ts`](../src/app/api/notensammler/grades/batch/route.ts)
- [`src/app/api/notensammler/final-grades/route.ts`](../src/app/api/notensammler/final-grades/route.ts)
- [`src/app/api/notensammler/final-grades/batch/route.ts`](../src/app/api/notensammler/final-grades/batch/route.ts)
- [`src/app/api/notensammler/class/[id]/route.ts`](../src/app/api/notensammler/class/[id]/route.ts)
- [`src/app/api/notensammler/teacher-classes/route.ts`](../src/app/api/notensammler/teacher-classes/route.ts)
- [`src/app/api/notensammler/transfer/route.ts`](../src/app/api/notensammler/transfer/route.ts)
- [`src/app/api/notensammler/transfer/preview/route.ts`](../src/app/api/notensammler/transfer/preview/route.ts)
- [`src/app/api/notensammler/transfer/view/route.ts`](../src/app/api/notensammler/transfer/view/route.ts)

Keep existing role checks (teacher/admin); add the entitlement check first (or right after session check).

### 5.2 Student photos (`student_photos`)

- [`src/app/api/admin/student-photos/upload/route.ts`](../src/app/api/admin/student-photos/upload/route.ts)
- [`src/app/api/students/photo/route.ts`](../src/app/api/students/photo/route.ts) – return 403 when `student_photos` is disabled so no photo is served; UI components keep showing the no-photo fallback.
- [`src/app/api/students/photo/check/route.ts`](../src/app/api/students/photo/check/route.ts) – optional: return 403 when disabled for consistency (or let it return "no photo" so UI shows fallback).

---

## 6. UI changes

### 6.1 Navigation (header)

File: [`src/components/layout/header.tsx`](../src/components/layout/header.tsx).

- **Notensammler link:** Only show the "Notensammler" nav item when the `notensammler` feature is enabled. Use the same source as the rest of the app (e.g. context or API-backed list of features).
- **Admin / Student photos (upload):** When `student_photos` is disabled, hide the "Student Photos" tab under Admin → Data (upload UI only). Display components elsewhere (schedule, students, Notensammler) are not hidden; they keep showing the no-photo fallback.

### 6.2 Notensammler page

File: [`src/app/notensammler/page.tsx`](../src/app/notensammler/page.tsx).

- If the user lands on `/notensammler` (e.g. via bookmark) and the feature is disabled, show a clear message or redirect to home. Prefer doing this in a **layout** or **page** server component so the check is server-side; alternatively, fetch from `/api/entitlements` and redirect or show "Feature not available" when `notensammler` is not in the list.

### 6.3 Student photo component usage

Components that display student photos:

- [`src/app/notensammler/page.tsx`](../src/app/notensammler/page.tsx) – `StudentPhoto`
- [`src/components/overviews/teacher.tsx`](../src/components/overviews/teacher.tsx) – `StudentPhoto`
- [`src/app/students/page.tsx`](../src/app/students/page.tsx) – `StudentPhoto`
- [`src/components/schedule/student-item.tsx`](../src/components/schedule/student-item.tsx) – `StudentPhoto`

When `student_photos` is disabled: **do not** hide or remove these components. Keep them rendered; they always show the same fallback as when no photo is stored (placeholder / no image). Do not call the photo API when the feature is disabled so no photo is loaded—the component simply renders the fallback.

### 6.4 Admin data page – Student Photos (upload) tab

File: [`src/app/admin/data/page.tsx`](../src/app/admin/data/page.tsx).

- Hide the "Student Photos" tab (upload UI only) when `student_photos` is not enabled. Same for [`src/app/admin/data/_components/student-photos-upload.tsx`](../src/app/admin/data/_components/student-photos-upload.tsx) if it's reachable from elsewhere. This gates only the upload flow; display components elsewhere are unchanged and show the fallback.

---

## 7. Summary checklist

- [ ] Add `DISABLE_ENTITLEMENTS` to `.env.example` and `src/env.js`; when set, entitlements client returns "all features enabled" and skips server calls.
- [ ] Add `LICENSE_SERVER_URL` and `LICENSE_KEY` to `.env.example` and `src/env.js` (optional, server-only).
- [ ] Define feature keys and create `src/lib/entitlements.ts` (or equivalent) with fetch, cache, `getEnabledFeatures()`, `isFeatureEnabled()`.
- [ ] Add a way to expose enabled features to the client (API route or server layout/context).
- [ ] Middleware: document whether `/notensammler` is gated in middleware or only in layout/API; implement chosen approach.
- [ ] Gate all Notensammler API routes with `isFeatureEnabled('notensammler')` and 403 when disabled.
- [ ] Gate student-photos upload and photo serving (and optionally check) with `isFeatureEnabled('student_photos')` and 403 when disabled.
- [ ] Header: hide Notensammler link when `notensammler` is disabled; hide Student Photos upload tab (Admin → Data) when `student_photos` is disabled.
- [ ] Notensammler page/layout: redirect or show "not available" when feature is disabled.
- [ ] Student photo components: do not hide; when `student_photos` is disabled show fallback only and do not call photo API.
- [ ] Admin data page: hide Student Photos (upload) tab when `student_photos` is disabled.
- [ ] Document fallback when the license server is unreachable (use stale cache vs. treat all as disabled).
- [ ] (Optional) Add a simple health or debug check that verifies the entitlements client can reach the server and get a list (e.g. in a dev or admin-only route).

---

## 8. Reference: license server API

The app expects the license server to expose an endpoint, e.g.:

- **GET** `{LICENSE_SERVER_URL}/api/entitlements`
- **Header:** `Authorization: Bearer {LICENSE_KEY}` or `X-License-Key: {LICENSE_KEY}`
- **Response (200):** `{ "features": ["notensammler", "student_photos"] }`  
  (array of strings; only keys recognized by the app are used.)
- **Response (401):** Invalid or missing key – treat as no premium features.
- **Response (5xx / network error):** Use cache if available; otherwise treat as no premium features per your policy.

See [LICENSE_SERVER_DESIGN.md](./LICENSE_SERVER_DESIGN.md) for the full server design and implementation.
