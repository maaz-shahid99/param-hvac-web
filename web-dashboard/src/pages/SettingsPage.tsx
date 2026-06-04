import { useState } from "react";
import { getBaseUrl, setBaseUrl } from "../api";
import { useAuth } from "../auth";

export default function SettingsPage() {
  const { profile, signOut } = useAuth();
  const [url, setUrl] = useState(getBaseUrl());
  const [saved, setSaved] = useState(false);

  const save = () => {
    setBaseUrl(url);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <>
      <div className="topbar">
        <h1>Settings</h1>
      </div>
      <div className="page">
        <div className="card">
          <div className="hd">Cloud server</div>
          <div className="bd">
            <label>Base URL (blank = dev proxy to :8002)</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.yourdomain.com" />
            <div style={{ marginTop: 12 }} className="btnrow">
              <button onClick={save}>Save</button>
              {saved && <span className="small muted">Saved — reload to apply.</span>}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="hd">Account</div>
          <div className="row">
            <div>
              <div>{profile?.name || profile?.email}</div>
              <div className="small muted">{profile?.email} · {profile?.role} · {profile?.status}</div>
            </div>
            <button className="danger" onClick={signOut}>Sign out</button>
          </div>
        </div>

        <div className="card">
          <div className="hd">About</div>
          <div className="bd muted">HVAC Monitor — web dashboard v1.0.0</div>
        </div>
      </div>
    </>
  );
}
