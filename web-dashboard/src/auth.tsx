import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError, setToken } from "./api";

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

  async function refreshMe() {
    try {
      const me = await api.me();
      const p = toProfile(me);
      // keep org_code if /me didn't include one
      if (!p.org_code && profile?.org_code) p.org_code = profile.org_code;
      setProfile(p);
      saveProfile(p);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        doSignOut();
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
  }

  const value: AuthCtx = {
    status,
    profile,
    error,
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
