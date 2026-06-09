import { useEffect, useState } from "react";
import { api, getBaseUrl, setBaseUrl } from "../api";
import { useAuth } from "../auth";
import PageHeader from "../components/PageHeader";
import Icon from "../components/Icon";

export default function SettingsPage() {
  const { profile, isAdmin, signOut } = useAuth();
  const [url, setUrl] = useState(getBaseUrl());
  const [saved, setSaved] = useState(false);

  // Alert granularity + data-collection interval (cloud, admin-settable).
  const [gran, setGran] = useState<string | null>(null);
  const [interval, setInterval] = useState<string>("60");
  const [intervalSaved, setIntervalSaved] = useState(false);
  useEffect(() => {
    api.settings().then((s) => {
      setGran(s.alert_granularity || "sensor");
      setInterval(String(s.collect_interval_s ?? 60));
    }).catch(() => {});
  }, []);
  const setGranularity = async (v: string) => {
    const prev = gran;
    setGran(v);
    try { await api.putSettings({ alert_granularity: v }); }
    catch { setGran(prev); }
  };
  const saveInterval = async () => {
    const n = Math.max(10, Math.min(3600, Number(interval) || 60));
    setInterval(String(n));
    try {
      await api.putSettings({ collect_interval_s: n });
      setIntervalSaved(true);
      setTimeout(() => setIntervalSaved(false), 1500);
    } catch { /* */ }
  };

  const save = () => {
    setBaseUrl(url);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <>
      <PageHeader title="Settings" />
      <div className="page">
        {isAdmin && (
          <div className="card">
            <div className="hd hd-ico"><Icon name="notifications_active" size={18} /> Alert granularity</div>
            <div className="bd">
              <p className="muted" style={{ marginTop: 0 }}>
                How alerts fire when a sensor's probes map to different exhausts.
              </p>
              <div className="segmented">
                <button className={gran === "sensor" ? "seg on" : "seg"} onClick={() => setGranularity("sensor")}>
                  <Icon name="device_thermostat" size={18} /> Per sensor
                </button>
                <button className={gran === "probe" ? "seg on" : "seg"} onClick={() => setGranularity("probe")}>
                  <Icon name="grain" size={18} /> Per probe
                </button>
              </div>
              <div className="small muted" style={{ marginTop: 8 }}>
                {gran === "probe"
                  ? "Each mapped probe alerts independently at its own exhaust."
                  : "One alert per sensor on its hottest probe (default)."}
              </div>
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="card">
            <div className="hd hd-ico"><Icon name="schedule" size={18} /> Data collection</div>
            <div className="bd">
              <label>How often devices sample & forward data (seconds, 10–3600)</label>
              <input type="number" min={10} max={3600} value={interval}
                     onChange={(e) => setInterval(e.target.value)} />
              <div style={{ marginTop: 12 }} className="btnrow">
                <button onClick={saveInterval}><Icon name="save" size={17} /> Save</button>
                {intervalSaved && <span className="small muted">Saved — propagates to the fleet via the gateway.</span>}
              </div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="hd hd-ico"><Icon name="cloud" size={18} /> Cloud server</div>
          <div className="bd">
            <label>Base URL (blank = same origin / dev proxy to :8002)</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.yourdomain.com" />
            <div style={{ marginTop: 12 }} className="btnrow">
              <button onClick={save}><Icon name="save" size={17} /> Save</button>
              {saved && <span className="small muted">Saved — reload to apply.</span>}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="hd hd-ico"><Icon name="account_circle" size={18} /> Account</div>
          <div className="row">
            <div>
              <div>{profile?.name || profile?.email}</div>
              <div className="small muted">{profile?.email} · {profile?.role} · {profile?.status}</div>
            </div>
            <button className="danger" onClick={signOut}><Icon name="logout" size={17} /> Sign out</button>
          </div>
        </div>

        <div className="card">
          <div className="hd hd-ico"><Icon name="info" size={18} /> About</div>
          <div className="bd muted">HVAC Monitor — web dashboard v1.1.0 · device names, per-probe mapping, rack layout</div>
        </div>
      </div>
    </>
  );
}
