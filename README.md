# hvac-web

The browser frontends for the HVAC monitoring system. Two independent React + Vite
(TypeScript) apps that both talk to the Cloud Server (`hvac-server`).

> **Integration contract:** see the backend [PROTOCOL.md](https://github.com/maaz-shahid99/param-hvac-server/blob/main/PROTOCOL.md)
> for API endpoints, auth, and ports.

## Apps
| Path | Dev port | Audience | Auth | Backend |
|---|---|---|---|---|
| [web-dashboard/](web-dashboard/) | **5173** | Customers (admin / member) | JWT | Cloud Server `/v1/*` |
| [field-console/](field-console/) | **5174** | Manufacturer field-service | `X-Support-Token` | appliance `/v1/support/*` over LAN |

## Run either app
```bash
cd web-dashboard      # or: cd field-console
npm install
npm run dev           # Vite dev server; proxies /v1 (+ /firmware) -> http://localhost:8002
```
Point at a non-local backend with `VITE_CLOUD_URL` at build time, or override at runtime
in `localStorage` (`cloud_base_url` for web-dashboard, `fc_base` + `fc_token` for field-console).

## Sibling repos
- Backend: https://github.com/maaz-shahid99/param-hvac-server
- App: https://github.com/maaz-shahid99/param-hvac-mobile
- Firmware: https://github.com/maaz-shahid99/param-hvac-firmware
