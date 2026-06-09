import { useState } from "react";
import { useAuth } from "../auth";
import Icon from "../components/Icon";

export default function PendingPage() {
  const { profile, refreshMe, signOut } = useAuth();
  const [checking, setChecking] = useState(false);

  const check = async () => {
    setChecking(true);
    await refreshMe();
    setChecking(false);
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ textAlign: "center" }}>
        <h2 className="hd-ico" style={{ justifyContent: "center" }}><Icon name="hourglass_top" size={22} /> Waiting for approval</h2>
        <p className="muted">
          Your request to join has been sent to the organization admin. You'll get
          access (and any alerts the admin enables) once it's approved.
        </p>
        <p className="small muted">Signed in as {profile?.email}</p>
        <button onClick={check} disabled={checking} style={{ width: "100%" }}>
          {checking ? "…" : "Check again"}
        </button>
        <div style={{ marginTop: 10 }}>
          <button className="ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
