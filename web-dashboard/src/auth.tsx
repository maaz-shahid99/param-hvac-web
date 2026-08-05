import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError, setToken, setUnauthorizedHandler } from "./api";

export type Profile = {
  role: string; // admin | member
  status: string; // pending | active | rejected
  name: string;
  email: string;
  phone: string;
  org_code: string;
};

type Status = "unknown" | "signedOut" | "signedIn";

type AuthCtx = {
  status: Status;
  profile: Profile | null;
  error: string | null;
  /** True when /v1/me last failed for a NON-auth reason, so `profile` is a
   *  cached copy that may no longer match the server (a cached role:"admin"
   *  would otherwise keep rendering admin controls that all 403). */
  stale: boolean;
  isAdmin: boolean;
  isPending: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (b: Record<string, unknown>) => Promise<boolean>;
  join: (b: Record<string, unknown>) => Promise<boolean>;
  refreshMe: () => Promise<void>;
  signOut: () => void;
};

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = () => useContext(Ctx);

const PROFILE_KEY = "cloud_profile";

function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}
function saveProfile(p: Profile | null) {
  if (p) localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  else localStorage.removeItem(PROFILE_KEY);
}

function toProfile(data: any): Profile {
  return {
    role: data.role ?? "member",
    status: data.status ?? "active",
    name: data.name ?? "",
    email: data.email ?? "",
    phone: data.phone ?? "",
    org_code: data.org_code ?? "",
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("unknown");
  const [profile, setProfile] = useState<Profile | null>(loadProfile());
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  // Restore a persisted session on load, then refresh from /v1/me.
  useEffect(() => {
    const token = localStorage.getItem("cloud_jwt");
    if (token) {
      setStatus("signedIn");
      refreshMe();
    } else {
      setStatus("signedOut");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // End the session centrally whenever ANY request 401s, not just the one /v1/me
  // call on mount. Every page polls forever, so a token expiring mid-session was
  // the normal case — and it used to surface as components quietly reporting
  // false hardware state instead of "you are signed out".
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      saveProfile(null);
      setProfile(null);
      setStatus("signedOut");
      setError("Your session expired. Please sign in again.");
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  async function refreshMe() {
    try {
      const me = await api.me();
      const p = toProfile(me);
      // keep org_code if /me didn't include one
      if (!p.org_code && profile?.org_code) p.org_code = profile.org_code;
      setProfile(p);
      saveProfile(p);
      setStale(false);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        doSignOut();
      } else {
        // Not an auth problem — server down, network drop, bad gateway. Don't
        // sign the user out, but stop pretending the cached profile is current.
        setStale(true);
      }
    }
  }

  async function run(fn: () => Promise<any>): Promise<boolean> {
    setError(null);
    try {
      const data = await fn();
      if (data.token) setToken(data.token as string);
      const p = toProfile(data);
      setProfile(p);
      saveProfile(p);
      setStatus("signedIn");
      setStale(false);
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
      return false;
    }
  }

  const login = (email: string, password: string) => run(() => api.login(email, password));
  const register = (b: Record<string, unknown>) => run(() => api.register(b));
  const join = (b: Record<string, unknown>) => run(() => api.join(b));

  function doSignOut() {
    setToken(null);
    saveProfile(null);
    setProfile(null);
    setStatus("signedOut");
    // A deliberate sign-out starts clean; without this a leftover error from the
    // previous session renders on the login screen the user lands on.
    setError(null);
    setStale(false);
  }

  const value: AuthCtx = {
    status,
    profile,
    error,
    stale,
    isAdmin: profile?.role === "admin",
    isPending: profile?.status === "pending",
    login,
    register,
    join,
    refreshMe,
    signOut: doSignOut,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
