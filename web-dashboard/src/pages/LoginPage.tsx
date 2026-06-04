import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { api, ApiError, getBaseUrl, setBaseUrl } from "../api";

type Mode = "signin" | "create" | "join" | "forgot" | "reset";

export default function LoginPage() {
  const { login, register, join, error } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);

  // fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [org, setOrg] = useState("");
  const [bootstrap, setBootstrap] = useState("");
  const [orgCode, setOrgCode] = useState("");
  const [otp, setOtp] = useState("");
  const [newPass, setNewPass] = useState("");

  const setServer = () => {
    const v = window.prompt("Cloud server URL (blank = use the dev proxy)", getBaseUrl());
    if (v !== null) setBaseUrl(v);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setLocalErr(null);
    setMsg(null);
    try {
      if (mode === "signin") {
        await login(email.trim(), password);
      } else if (mode === "create") {
        await register({
          bootstrap_token: bootstrap.trim(),
          tenant_name: org.trim(),
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          password,
        });
      } else if (mode === "join") {
        await join({
          org_code: orgCode.trim().toUpperCase(),
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          password,
        });
      } else if (mode === "forgot") {
        await api.forgot(email.trim());
        setMsg("If that email has an account, a reset code is on its way.");
        setMode("reset");
      } else if (mode === "reset") {
        await api.reset({ email: email.trim(), otp: otp.trim(), new_password: newPass });
        setMsg("Password changed — sign in with your new password.");
        setMode("signin");
      }
    } catch (e2) {
      setLocalErr(e2 instanceof ApiError ? e2.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const title = {
    signin: "Sign in",
    create: "Create organization",
    join: "Join organization",
    forgot: "Reset password",
    reset: "Enter reset code",
  }[mode];

  const cta = {
    signin: "Sign in",
    create: "Create & sign in",
    join: "Request to join",
    forgot: "Send code",
    reset: "Reset password",
  }[mode];

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <h2>HVAC Monitor</h2>
        <div className="sub">{title}</div>

        {(error || localErr) && <div className="error">{localErr || error}</div>}
        {msg && <div className="error" style={{ background: "rgba(63,185,80,.12)", borderColor: "var(--green)", color: "#9be7a8" }}>{msg}</div>}

        {mode === "create" && (
          <>
            <label>Organization name</label>
            <input value={org} onChange={(e) => setOrg(e.target.value)} />
            <label>Bootstrap token</label>
            <input value={bootstrap} onChange={(e) => setBootstrap(e.target.value)} />
          </>
        )}
        {mode === "join" && (
          <>
            <label>Organization code</label>
            <input value={orgCode} onChange={(e) => setOrgCode(e.target.value)} style={{ textTransform: "uppercase" }} />
          </>
        )}
        {(mode === "create" || mode === "join") && (
          <>
            <label>Your name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
            <label>Phone (for SMS alerts)</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </>
        )}

        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />

        {mode === "reset" && (
          <>
            <label>Reset code</label>
            <input value={otp} onChange={(e) => setOtp(e.target.value)} />
            <label>New password</label>
            <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} autoComplete="new-password" />
          </>
        )}

        {mode !== "forgot" && mode !== "reset" && (
          <>
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </>
        )}

        <div style={{ height: 18 }} />
        <button type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? "…" : cta}
        </button>

        <div className="switch">
          {mode === "signin" && (
            <>
              <button type="button" className="ghost" onClick={() => setMode("join")}>Join with a code</button>
              <button type="button" className="ghost" onClick={() => setMode("create")}>Create organization</button>
              <button type="button" className="ghost" onClick={() => setMode("forgot")}>Forgot password?</button>
            </>
          )}
          {mode !== "signin" && (
            <button type="button" className="ghost" onClick={() => setMode("signin")}>← Back to sign in</button>
          )}
        </div>
        <div className="switch small">
          <button type="button" className="ghost" onClick={setServer}>Server: {getBaseUrl() || "dev proxy"}</button>
        </div>
      </form>
    </div>
  );
}
