import { useEffect, useState } from "react";
import { api } from "../api";
import { AlertsCard, LiveTempsCard, isOnline } from "../components/Cards";

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
    try {
      await api.ackAlert(id);
      refresh();
    } catch {/* next poll */}
  };

  const online = sensors.filter((s) => isOnline(+s.ts)).length;

  if (loading) return <div className="center-msg">Loading…</div>;

  return (
    <>
      <div className="topbar">
        <h1>Dashboard</h1>
        <button className="secondary" onClick={refresh}>Refresh</button>
      </div>
      <div className="page">
        {err && <div className="error">{err}</div>}
        <div className="stats">
          <div className="stat">
            <div className="v" style={{ color: alerts.length ? "var(--red)" : "var(--green)" }}>
              {alerts.length}
            </div>
            <div className="l">{alerts.length === 1 ? "open alert" : "open alerts"}</div>
          </div>
          <div className="stat">
            <div className="v" style={{ color: online < sensors.length ? "var(--amber)" : "var(--green)" }}>
              {online}/{sensors.length}
            </div>
            <div className="l">sensors online</div>
          </div>
        </div>
        <AlertsCard alerts={alerts} onAck={ack} />
        <LiveTempsCard sensors={sensors} highLimit={high} />
      </div>
    </>
  );
}
