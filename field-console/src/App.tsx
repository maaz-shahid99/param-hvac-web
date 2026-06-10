import { useState } from "react";
import Icon from "./components/Icon";
import { api, clearConn, getBase, isConnected, setConn } from "./api";
import FleetHealth from "./pages/FleetHealth";
import Crashes from "./pages/Crashes";
import EnvReadings from "./pages/EnvReadings";
import Alerts from "./pages/Alerts";
import Firmware from "./pages/Firmware";

type Tab = "fleet" | "crashes" | "data" | "alerts" | "firmware";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "fleet", label: "Fleet Health", icon: "vital_signs" },
  { id: "crashes", label: "Crash Reports", icon: "bug_report" },
  { id: "data", label: "Env & Readings", icon: "monitoring" },
  { id: "alerts", label: "Alerts", icon: "notifications_active" },
  { id: "firmware", label: "Firmware / OTA", icon: "system_update" },
];

function Connect({ onConnected }: { onConnected: () => void }) {
  const [base, setBase] = useState(getBase() || "http://");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setErr(null);
    setConn(base, token);
    try {
      await api.ping();
      onConnected();
    } catch (e: any) {
      clearConn();
      setErr(
        e.status === 401
          ? "Support token rejected by the appliance."
          : e.status === 404
          ? "Support API is disabled on this appliance (no SUPPORT_TOKEN set)."
          : e.message || "Connection failed."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="connect-wrap">
      <div className="connect-card">
        <h1>
          <Icon name="construction" size={26} color="var(--accent)" /> HVAC Field Console
        </h1>
        <p className="sub">
          Manufacturer service tool. Connect to a deployed appliance on your LAN with the
          support token — no customer account needed.
        </p>
        <label className="field">
          <span>Appliance URL — by IP, or the mDNS name http://hvac-appliance.local:8002</span>
          <input
            value={base}
            onChange={(e) => setBase(e.target.value)}
            placeholder="http://hvac-appliance.local:8002"
            spellCheck={false}
          />
        </label>
        <label className="field">
          <span>Support token</span>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="X-Support-Token"
            onKeyDown={(e) => e.key === "Enter" && go()}
          />
        </label>
        {err && <div className="err">{err}</div>}
        <button onClick={go} disabled={busy || !base || !token}>
          <Icon name="login" size={18} /> {busy ? "Connecting…" : "Connect"}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [connected, setConnected] = useState(isConnected());
  const [tab, setTab] = useState<Tab>("fleet");

  if (!connected) return <Connect onConnected={() => setConnected(true)} />;

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <Icon name="construction" size={22} color="var(--accent)" /> Field Console
        </div>
        <nav className="nav">
          {TABS.map((t) => (
            <a key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
              <Icon name={t.icon} size={20} /> {t.label}
            </a>
          ))}
          <div className="spacer" />
          <a
            onClick={() => {
              clearConn();
              setConnected(false);
            }}
          >
            <Icon name="logout" size={20} /> Disconnect
          </a>
        </nav>
        <div className="conn">{getBase()}</div>
      </aside>
      <main className="main">
        {tab === "fleet" && <FleetHealth />}
        {tab === "crashes" && <Crashes />}
        {tab === "data" && <EnvReadings />}
        {tab === "alerts" && <Alerts />}
        {tab === "firmware" && <Firmware />}
      </main>
    </div>
  );
}
