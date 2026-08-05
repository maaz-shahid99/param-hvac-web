import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { AlertsCard, LiveTempsCard, tenantHighLimit } from "../components/Cards";
import PageHeader from "../components/PageHeader";
import Icon from "../components/Icon";

export default function AlertsThresholdsPage() {
  const { isAdmin } = useAuth();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [sensors, setSensors] = useState<any[]>([]);
  const [high, setHigh] = useState("40");
  const [delta, setDelta] = useState("20");
  const [defs, setDefs] = useState({ high_c: 40, delta_c: 20 });
  // The SAVED limit alerts fire on. Kept separate from the `high` input so the
  // card below reflects what the server is actually using, not an unsaved edit.
  const [effHigh, setEffHigh] = useState(40);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  async function refresh(initial = false) {
    try {
      const [a, c, t] = await Promise.all([api.alerts("open"), api.current(), api.thresholds()]);
      setAlerts(a.alerts || []);
      setSensors(c.sensors || []);
      const d = t.defaults || { high_c: 40, delta_c: 20 };
      setDefs(d);
      setEffHigh(tenantHighLimit(t));
      if (initial) {
        const tenant = (t.thresholds || []).find((x: any) => x.scope === "tenant");
        setHigh(String(tenant ? tenant.high_c : d.high_c));
        setDelta(String(tenant ? tenant.delta_c : d.delta_c));
      }
      setErr(null);
    } catch (e: any) {
      setErr(e.message || "Could not reach the cloud server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh(true);
    const id = setInterval(() => refresh(false), 10000);
    return () => clearInterval(id);
  }, []);

  const ack = async (id: string) => {
    try {
      await api.ackAlert(id);
      refresh(false);
    } catch {/* */}
  };

  const save = async () => {
    setSavedMsg(null);
    try {
      await api.putThreshold({ scope: "tenant", high_c: Number(high), delta_c: Number(delta) });
      setSavedMsg("Thresholds saved.");
    } catch (e: any) {
      setSavedMsg(e.message || "Save failed.");
    }
  };

  const genKey = async () => {
    try {
      const r = await api.createApiKey("gateway");
      window.prompt("Gateway API key — provision this into the gateway (shown once):", r.api_key);
    } catch (e: any) {
      alert(e.message || "Failed");
    }
  };

  const setRecipients = async () => {
    const emails = window.prompt("Extra alert emails (comma-separated)", "");
    if (emails === null) return;
    const phones = window.prompt("Extra alert phones (comma-separated)", "") || "";
    try {
      await api.setRecipients({ alert_emails: emails, alert_phones: phones });
      alert("Recipients saved.");
    } catch (e: any) {
      alert(e.message || "Failed");
    }
  };

  if (loading) return <div className="center-msg">Loading…</div>;

  return (
    <>
      <PageHeader title="Alerts & Thresholds">
        {isAdmin && <button className="secondary" onClick={genKey}><Icon name="vpn_key" size={17} /> Gateway API key</button>}
        {isAdmin && <button className="secondary" onClick={setRecipients}><Icon name="group" size={17} /> Recipients</button>}
        <button className="secondary" onClick={() => refresh(false)}><Icon name="refresh" size={17} /> Refresh</button>
      </PageHeader>
      <div className="page">
        {err && <div className="error">{err}</div>}
        <AlertsCard alerts={alerts} onAck={ack} />

        <div className="card">
          <div className="hd hd-ico"><Icon name="tune" size={18} /> Alert thresholds</div>
          <div className="bd">
            <div className="small muted">
              Applied to every rack unless overridden. Defaults: {defs.high_c}°C / Δ{defs.delta_c}°C.
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label>High temp °C</label>
                <input value={high} disabled={!isAdmin} onChange={(e) => setHigh(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label>Max ΔT °C</label>
                <input value={delta} disabled={!isAdmin} onChange={(e) => setDelta(e.target.value)} />
              </div>
            </div>
            <div style={{ marginTop: 14 }} className="btnrow">
              <button disabled={!isAdmin} onClick={save}>{isAdmin ? "Save" : "Admins only"}</button>
              {savedMsg && <span className="small muted">{savedMsg}</span>}
            </div>
          </div>
        </div>

        <LiveTempsCard sensors={sensors} highLimit={effHigh} />
      </div>
    </>
  );
}
