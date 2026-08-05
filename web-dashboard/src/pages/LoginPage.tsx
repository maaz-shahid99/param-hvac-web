import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { api, ApiError, getBaseUrl, setBaseUrl } from "../api";
import PasswordInput from "../components/PasswordInput";

const MIN_PASSWORD = 6; // matches MIN_PASSWORD_LEN on the server

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
  const [newPass2, setNewPass2] = useState("");
  // Rendering getBaseUrl() directly meant the label never updated after a change
  // (setBaseUrl only writes localStorage), so it looked like the edit failed.
  const [server, setServerUrl] = useState(getBaseUrl());

  const editServer = () => {
    const v = window.prompt("Cloud server URL (blank = use the dev proxy)", server);
    if (v === null) return;
    const clean = v.trim();
    if (clean && !/^https?:\/\/.+/i.test(clean)) {
      setLocalErr("Server URL must start with http:// or https://");
      return;
    }
    setBaseUrl(clean);
    setServerUrl(getBaseUrl());
    setLocalErr(null);
  };

  /** Switch mode and clear any leftover banners — a failed sign-in error used to
   *  persist and render alongside the next screen's success message. */
  const go = (m: Mode) => {
    setMode(m);
    setLocalErr(null);
    setMsg(null);
  };

  /** Stop empty/short submissions reaching the server. Without this, a blank
   *  form produced a 422 whose validation detail rendered as "[object Object]". */
  function validate(): string | null {
    const needsEmail = true;
    if (needsEmail && !email.trim()) return "Enter your email address.";
    if (mode === "create" && !org.trim()) return "Enter an organization name.";
    if (mode === "create" && !bootstrap.trim()) return "Enter the bootstrap token.";
    if (mode === "join" && !orgCode.trim()) return "Enter your organization code.";
    if (mode === "reset") {
      if (!otp.trim()) return "Enter the reset code from your email.";
      if (newPass.length < MIN_PASSWORD) return `New password must be at least ${MIN_PASSWORD} characters.`;
      if (newPass !== newPass2) return "The new passwords don't match.";
    }
    if (mode === "signin" && !password) return "Enter your password.";
    if ((mode === "create" || mode === "join") && password.length < MIN_PASSWORD) {
      return `Password must be at least ${MIN_PASSWORD} characters.`;
    }
    return null;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const problem = validate();
    if (problem) {
      setLocalErr(problem);
      setMsg(null);
      return;
    }
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
        setPassword("");
        setNewPass("");
        setNewPass2("");
        setOtp("");
        setMode("signin");
        setMsg("Password changed — sign in with your new password.");
        return; // keep the success message; the finally block still clears busy
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

        {(error || localErr) && <div className="error" role="alert">{localErr || error}</div>}
        {/* Was `.error` overridden with a dark-theme green (#9be7a8) that landed
            at ~1.25:1 on this light theme — the success message was invisible. */}
        {msg && <div className="success" role="status">{msg}</div>}

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
            {/* Numeric keypad on mobile + iOS/Android SMS-code autofill. */}
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
            />
            <label>New password</label>
            <PasswordInput value={newPass} onChange={setNewPass} autoComplete="new-password" />
            {/* Reset had no confirmation field — the one flow used by someone
                already locked out, where a typo sets a password they don't know. */}
            <label>Confirm new password</label>
            <PasswordInput value={newPass2} onChange={setNewPass2} autoComplete="new-password" />
          </>
        )}

        {mode !== "forgot" && mode !== "reset" && (
          <>
            <label>Password</label>
            <PasswordInput
              value={password}
              onChange={setPassword}
              // create/join are account CREATION flows; telling the password
              // manager "current-password" stops it offering to generate/save one.
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
          </>
        )}

        <div style={{ height: 18 }} />
        <button type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? "…" : cta}
        </button>

        {/* Disabled while busy: these sat outside the guard, so you could switch
            from "Create organization" to "Sign in" mid-request and get signed in
            from a screen that said Sign in. */}
        <div className="switch">
          {mode === "signin" && (
            <>
              <button type="button" className="ghost" disabled={busy} onClick={() => go("join")}>Join with a code</button>
              <button type="button" className="ghost" disabled={busy} onClick={() => go("create")}>Create organization</button>
              <button type="button" className="ghost" disabled={busy} onClick={() => go("forgot")}>Forgot password?</button>
            </>
          )}
          {mode !== "signin" && (
            <button type="button" className="ghost" disabled={busy} onClick={() => go("signin")}>← Back to sign in</button>
          )}
        </div>
        <div className="switch small">
          <button type="button" className="ghost" disabled={busy} onClick={editServer}>Server: {server || "dev proxy"}</button>
        </div>
      </form>
    </div>
  );
}
