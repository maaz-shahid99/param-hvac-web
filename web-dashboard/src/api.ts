// Thin REST client for the HVAC Cloud Server. Mirrors the Flutter app's
// CloudApi: a configurable base URL + a bearer JWT, JSON in/out.

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let _token: string | null = localStorage.getItem("cloud_jwt");

export function setToken(t: string | null) {
  _token = t;
  if (t) localStorage.setItem("cloud_jwt", t);
  else localStorage.removeItem("cloud_jwt");
}
export function getToken() {
  return _token;
}

/** Base URL: a runtime override (Settings) wins, else build-time env, else ""
 *  (relative — uses the Vite dev proxy /v1 -> :8002). */
export function getBaseUrl(): string {
  const override = localStorage.getItem("cloud_base_url");
  if (override) return override;
  return (import.meta.env.VITE_CLOUD_URL as string) || "";
}
export function setBaseUrl(u: string) {
  const clean = u.trim().replace(/\/+$/, "");
  if (clean) localStorage.setItem("cloud_base_url", clean);
  else localStorage.removeItem("cloud_base_url");
}

async function req(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean } = {}
): Promise<any> {
  const { method = "GET", body, auth = true } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth && _token) headers["Authorization"] = `Bearer ${_token}`;
  let res: Response;
  try {
    res = await fetch(`${getBaseUrl()}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Could not reach the server. Check the URL and your connection.");
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new ApiError(res.status, (data && data.detail) || `HTTP ${res.status}`);
  }
  return data;
}

export const api = {
  // auth
  login: (email: string, password: string) =>
    req("/v1/auth/login", { method: "POST", auth: false, body: { email, password } }),
  register: (b: Record<string, unknown>) =>
    req("/v1/auth/register", { method: "POST", auth: false, body: b }),
  join: (b: Record<string, unknown>) =>
    req("/v1/auth/join", { method: "POST", auth: false, body: b }),
  forgot: (email: string) =>
    req("/v1/auth/forgot", { method: "POST", auth: false, body: { email } }),
  reset: (b: Record<string, unknown>) =>
    req("/v1/auth/reset", { method: "POST", auth: false, body: b }),
  me: () => req("/v1/me"),

  // members (admin manage; read allowed for any member)
  members: (state = "all") => req(`/v1/members?state=${state}`),
  approveMember: (id: string) => req(`/v1/members/${id}/approve`, { method: "POST" }),
  rejectMember: (id: string) => req(`/v1/members/${id}/reject`, { method: "POST" }),
  setMemberNotify: (id: string, b: Record<string, unknown>) =>
    req(`/v1/members/${id}/notifications`, { method: "PUT", body: b }),

  // thresholds / alerts / temps
  thresholds: () => req("/v1/thresholds"),
  putThreshold: (b: Record<string, unknown>) =>
    req("/v1/thresholds", { method: "PUT", body: b }),
  current: () => req("/v1/current"),
  alerts: (state = "open") => req(`/v1/alerts?state=${state}`),
  ackAlert: (id: string) => req(`/v1/alerts/${id}/ack`, { method: "POST" }),
  setRecipients: (b: Record<string, unknown>) =>
    req("/v1/recipients", { method: "PUT", body: b }),
  createApiKey: (label: string) =>
    req("/v1/apikeys", { method: "POST", body: { label } }),
  topology: () => req("/v1/topology"),
};
