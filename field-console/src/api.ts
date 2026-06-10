// REST client for the manufacturer field-service console. Talks to a deployed
// appliance over the LAN, authenticated by the shared SUPPORT_TOKEN (sent as
// X-Support-Token) — never a customer account. Base URL + token are stored
// per-browser and entered on the Connect screen.

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let _base = localStorage.getItem("fc_base") || "";
let _token = localStorage.getItem("fc_token") || "";

export function getBase() {
  return _base;
}
export function getToken() {
  return _token;
}
export function isConnected() {
  return !!_base && !!_token;
}
export function setConn(base: string, token: string) {
  _base = base.trim().replace(/\/+$/, "");
  _token = token.trim();
  localStorage.setItem("fc_base", _base);
  localStorage.setItem("fc_token", _token);
}
export function clearConn() {
  _base = "";
  _token = "";
  localStorage.removeItem("fc_base");
  localStorage.removeItem("fc_token");
}

async function req(path: string): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${_base}${path}`, { headers: { "X-Support-Token": _token } });
  } catch {
    throw new ApiError(0, "Could not reach the appliance. Check the URL and that you're on the same network.");
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new ApiError(res.status, (data && data.detail) || `HTTP ${res.status}`);
  }
  return data;
}

export const api = {
  // a cheap call used to validate the connection on the Connect screen
  ping: () => req("/v1/support/overview"),
  overview: () => req("/v1/support/overview"),
  crashes: () => req("/v1/support/crashes"),
  env: (limit = 2000) => req(`/v1/support/env?limit=${limit}`),
  readings: (limit = 2000) => req(`/v1/support/readings?limit=${limit}`),
  alerts: () => req("/v1/support/alerts"),
  firmwareList: () => req("/v1/support/firmware"),

  /** Publish a firmware image: metadata in the query string, the raw .bin as the body. */
  async publishFirmware(
    kind: string,
    version: number,
    severity: string,
    stage: string,
    notes: string,
    file: ArrayBuffer
  ): Promise<any> {
    const qs =
      `kind=${kind}&version=${version}&severity=${severity}&stage=${stage}` +
      `&notes=${encodeURIComponent(notes)}`;
    let res: Response;
    try {
      res = await fetch(`${_base}/v1/support/firmware?${qs}`, {
        method: "POST",
        headers: { "X-Support-Token": _token, "Content-Type": "application/octet-stream" },
        body: file,
      });
    } catch {
      throw new ApiError(0, "Could not reach the appliance.");
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) throw new ApiError(res.status, (data && data.detail) || `HTTP ${res.status}`);
    return data;
  },

  /** Promote a canary release to full so the gateway rolls it to the fleet. */
  async promoteOta(kind: string, version: number): Promise<any> {
    let res: Response;
    try {
      res = await fetch(`${_base}/v1/support/ota/promote`, {
        method: "POST",
        headers: { "X-Support-Token": _token, "Content-Type": "application/json" },
        body: JSON.stringify({ kind, version }),
      });
    } catch {
      throw new ApiError(0, "Could not reach the appliance.");
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) throw new ApiError(res.status, (data && data.detail) || `HTTP ${res.status}`);
    return data;
  },
};

/** Fetch an authenticated CSV export and trigger a browser download. */
export async function downloadCsv(path: string, filename: string): Promise<void> {
  const res = await fetch(`${_base}${path}`, { headers: { "X-Support-Token": _token } });
  if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Short EUI-derived auto-name, matching the app/dashboard. */
export function autoName(eui: string, kind = "sensor"): string {
  const e = (eui || "").trim();
  const suffix = (e.length >= 4 ? e.slice(-4) : e).toUpperCase();
  const label = kind === "gateway" ? "Gateway" : kind === "router" ? "Router" : "Sensor";
  return `${label}-${suffix}`;
}

export function ago(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "—";
  if (sec < 60) return `${Math.round(sec)}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`;
  return `${Math.round(sec / 86400)}d ago`;
}

export function nowSec() {
  return Date.now() / 1000;
}
