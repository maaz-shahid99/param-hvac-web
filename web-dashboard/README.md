# HVAC Monitor — web dashboard (React)

A browser dashboard for the [Cloud Server](../Cloud%20Server/), for **admins and
members**. It's the cloud half of the product (login, alerts, thresholds, live
temps, devices, member management) — Bluetooth commissioning stays in the phone
app (`../thread_commissioner/`), since you provision hardware standing next to it.

Built with **Vite + React + TypeScript**, talking to the Cloud Server REST API
(`/v1/...`). No backend of its own.

## Run (dev)
```bash
cd web-dashboard
npm install
npm run dev          # http://localhost:5173
```
By default the dev server **proxies** `/v1` → `http://localhost:8002` (the Cloud
Server), so you avoid CORS locally. Point the proxy elsewhere with
`VITE_CLOUD_URL=http://<server-ip>:8002 npm run dev`, or set the URL in the app's
**Settings** (stored per-browser).

## Build (production)
```bash
npm run build        # outputs dist/  (static files)
```

### Easiest: serve it from the Cloud Server (single URL, no CORS)
The Cloud Server auto-serves this build at its **root** if `web-dashboard/dist`
exists (override the path with `WEB_DIR`). Then there's one origin for both the
API and the app — **no CORS needed**:
```bash
cd web-dashboard && npm run build           # produces dist/
cd "../Cloud Server" && uvicorn app:app --host 0.0.0.0 --port 8002
# open http://<server-ip>:8002/   -> the dashboard; /v1/* is the API
```
On startup the server logs `[web] serving dashboard from … at /`. Client-side
routes (e.g. `/devices`) fall back to `index.html`, and the app calls `/v1/...`
on the same origin, so nothing else to configure.

### Or host the static files separately
Serve `dist/` from any static host / Nginx. Then the browser calls the cloud
**cross-origin**, so set the server's `CORS_ORIGINS` to this dashboard's origin,
e.g. `CORS_ORIGINS=https://app.yourdomain.com`, and point the app at the cloud
URL (Settings, or `VITE_CLOUD_URL` at build time).

## Roles (same model as the app)
- **Member** — Dashboard, Devices, Alerts (view + ACK), Members (read-only),
  Settings. No threshold editing, no member management.
- **Admin** — all of the above **plus** edit thresholds, manage members
  (approve/reject, email/SMS opt-in, org code), generate a gateway API key, set
  recipients.

Auth covers sign in, **create organization** (bootstrap token), **join by org
code** (→ pending until an admin approves), and **password reset by emailed
OTP** — all against the Cloud Server.

## Structure
- `src/api.ts` — REST client (base URL + JWT).
- `src/auth.tsx` — `AuthProvider`/`useAuth` (session, role/status, persistence).
- `src/App.tsx` — auth gate + routes; `src/components/Layout.tsx` — sidebar.
- `src/pages/*` — Login, Pending, Dashboard, Devices, Alerts & Thresholds,
  Members, Settings.
- `src/components/Cards.tsx` — shared Alerts / Live-temps cards + helpers.
