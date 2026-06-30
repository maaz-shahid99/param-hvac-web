# field-console — manufacturer field-service tool (React + Vite)

A standalone web console for **servicing a deployed appliance over the LAN** when
you (the manufacturer) have **no customer account and no server login**. It
authenticates with the appliance's shared **support token** (`X-Support-Token`)
and lets you pull fleet diagnostics and publish tiered firmware — separate from
the customer-facing [web-dashboard](../web-dashboard/) and [app](https://github.com/YOUR-ORG/hvac-mobile).

> Distinct audience + auth: the dashboard/app use a customer JWT; this console uses
> the manufacturer `SUPPORT_TOKEN`. Keep it internal.

## What it does
- **Connect** — appliance URL + support token (stored per-browser). Connect by IP
  or by the appliance's mDNS name **`http://hvac-appliance.local:8002`** (the
  server advertises it; resolves on Windows/macOS — no in-browser scan).
- **Fleet Health** — per-tenant gateway firmware (c3/c6), free heap, role, mesh
  roster + online state, crash/alert counts; flags stale/old-firmware units.
- **Crash Reports** — cross-tenant crashes with reset reason + faulting PC; a
  **decode helper** that generates the `riscv32-esp-elf-addr2line -fCe <fw>.elf <pc>`
  command to run locally against the matching build; CSV export.
- **Env & Readings** — latest BME + sensor readings with CSV export.
- **Alerts** — open/historical alert history.
- **Firmware / OTA** — publish a `.bin` (chip + version + severity + notes); see
  rollout status (each tenant's current vs latest). **Mandatory** auto-rolls the
  fleet; **optional** waits for the customer to opt in from their app.
  - **Canary → Promote** (recommended for mandatory): tick *Roll as canary* and the
    **gateway updates first**; once it reports the new version healthy in Fleet
    Health, the **Promote to fleet** button enables → click it to roll the rest.
    A blast-radius confirm only appears for *mandatory + non-canary* (immediate
    fleet-wide).

## Prerequisite on the appliance
Set a strong `SUPPORT_TOKEN` in the Cloud Server's environment / `.env` (≥ 24
chars). Blank ⇒ the entire `/v1/support` + OTA-publish API is **disabled** (404).
The console talks to the same appliance the gateway/app use.

## Run (dev)
```bash
cd field-console
npm install
npm run dev          # http://localhost:5174
```
Leave the appliance URL blank to use the dev proxy (`/v1` + `/firmware` →
`http://localhost:8002`), or enter a real appliance URL + token on the Connect
screen.

## Build
```bash
npm run build        # dist/ (static) — host anywhere on your service laptop/LAN
npm run typecheck
```

## Security notes
- The support token is a powerful manufacturer secret (read-all + firmware
  publish). Over plain-HTTP LAN it can be sniffed — prefer HTTPS, and rotate it.
- All manufacturer access is **audit-logged** on the appliance and is visible to
  the customer admin (`GET /v1/support-access`).
- Firmware is version-gated + SHA-256-stamped but **not signed** yet — image
  signing is a planned hardening step.
