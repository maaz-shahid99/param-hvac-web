import { useEffect, useState } from "react";
import { api } from "../api";
import { AlertsCard, LiveTempsCard, isOnline } from "../components/Cards";
import GatewayStatus from "../components/GatewayStatus";
import PageHeader from "../components/PageHeader";

export default function DashboardPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [sensors, setSensors] = useState<any[]>([]);
  const [high, setHigh] = useState(40);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      const [a, c, t] = await Promise.all([api.alerts("open"), api.current(), api.thresholds()]);
      setAlerts(a.alerts || []);
      setSensors(c.sensors || []);
      setHigh(Number(t.defaults?.high_c ?? 40));
      setErr(null);
    } catch (e: any) {
      setErr(e.message || "Could not reach the cloud server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, []);

  const ack = async (id: string) => {
    try { await api.ackAlert(id); refresh(); } catch {/* */}
  };

  const online = sensors.filter((s) => isOnline(+s.ts)).length;
  const offline = sensors.length - online;
  const hottest = sensors.reduce((m, s) => Math.max(m, +s.max_c || 0), 0);
  const top = alerts[0];

  if (loading) return <div className="center-msg">Loading…</div>;

  return (
    <>
      <PageHeader title="Dashboard">
        <button className="secondary" onClick={refresh}>Refresh</button>
      </PageHeader>
      <div className="page">
        {err && <div className="error">{err}</div>}

        {/* Hero — emergency when there are open alerts, calm otherwise */}
        {top ? (
          <div className="hero">
            <h3>⚠ {top.kind === "stale" ? "Sensor offline" : top.kind === "delta" ? "High ΔT" : "High temperature"}</h3>
            <div className="sub">{top.location || "Unmapped"}{alerts.length > 1 ? ` · +${alerts.length - 1} more open` : ""}</div>
            <div className="pills">
              <div className="pill"><div className="k">Reading</div><div className="v2">{top.kind === "stale" ? "—" : `${(+top.value).toFixed(1)}°C`}</div></div>
              <div className="pill"><div className="k">Limit</div><div className="v2">{top.kind === "stale" ? "—" : `${(+top.threshold).toFixed(1)}°C`}</div></div>
              <div className="pill"><div className="k">Open alerts</div><div className="v2">{alerts.length}</div></div>
            </div>
          </div>
        ) : (
          <div className="hero calm">
            <h3>✓ All clear</h3>
            <div className="sub">No open alerts — every rack is within limits.</div>
          </div>
        )}

        {/* Daily insights tiles */}
        <div className="stats">
          <Stat label="Open alerts" value={`${alerts.length}`} chip="pink" icon="🔔"
            delta={alerts.length ? { dir: "down", text: "needs attention" } : { dir: "up", text: "all clear" }} />
          <Stat label="Sensors online" value={`${online}`} unit={`/ ${sensors.length}`} chip="green" icon="📡"
            delta={offline ? { dir: "down", text: `${offline} offline` } : { dir: "up", text: "all reporting" }} />
          <Stat label="Hottest now" value={hottest ? hottest.toFixed(1) : "—"} unit={hottest ? "°C" : ""} chip="amber" icon="🌡️"
            delta={{ dir: hottest >= high ? "down" : "flat", text: hottest >= high ? "over limit" : "within limit" }} />
        </div>

        <GatewayStatus />
        <AlertsCard alerts={alerts} onAck={ack} />
        <LiveTempsCard sensors={sensors} highLimit={high} />
      </div>
    </>
  );
}

function Stat({
  label, value, unit, chip, icon, delta,
}: {
  label: string; value: string; unit?: string; chip: string; icon: string;
  delta: { dir: "up" | "down" | "flat"; text: string };
}) {
  const arrow = delta.dir === "up" ? "▲" : delta.dir === "down" ? "▼" : "•";
  return (
    <div className="stat">
      <div className="stat-top">
        <span className="l">{label}</span>
        <span className={`chip ${chip}`}>{icon}</span>
      </div>
      <div className="v">{value}{unit ? <span className="u">{unit}</span> : null}</div>
      <div className={`delta ${delta.dir}`}>{arrow} {delta.text}</div>
    </div>
  );
}
