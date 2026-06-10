import { useEffect, useState } from "react";
import Icon from "../components/Icon";
import { ago, api, nowSec } from "../api";

export default function Alerts() {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const d = await api.alerts();
      setRows(d.alerts || []);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, []);

  const badge = (s: string) =>
    s === "open" ? "red" : s === "acked" ? "amber" : "gray";

  return (
    <>
      <div className="pagehead">
        <h2>
          <Icon name="notifications_active" size={24} color="var(--accent)" /> Alerts
        </h2>
        <button className="ghost" onClick={refresh}>
          <Icon name="refresh" size={18} /> Refresh
        </button>
      </div>
      {err && <div className="err">{err}</div>}
      {loading && <div className="muted">Loading…</div>}
      {!loading && rows.length === 0 && <div className="muted">No alerts on record.</div>}

      {rows.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>Opened</th><th>Tenant</th><th>Location</th><th>Kind</th><th>Value</th><th>Limit</th><th>State</th></tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="muted small">{ago(nowSec() - a.opened_at)}</td>
                  <td>{a.tenant}</td>
                  <td>{a.location || a.eui}</td>
                  <td>{a.kind}</td>
                  <td><b>{a.value?.toFixed(1)}</b></td>
                  <td className="muted">{a.threshold?.toFixed(1)}</td>
                  <td><span className={`badge ${badge(a.state)}`}>{a.state}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
