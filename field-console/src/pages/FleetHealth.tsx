import { useEffect, useState } from "react";
import Icon from "../components/Icon";
import { ago, api, autoName } from "../api";

export default function FleetHealth() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const d = await api.overview();
      setTenants(d.tenants || []);
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

  return (
    <>
      <div className="pagehead">
        <h2>
          <Icon name="vital_signs" size={24} color="var(--accent)" /> Fleet Health
        </h2>
        <button className="ghost" onClick={refresh}>
          <Icon name="refresh" size={18} /> Refresh
        </button>
      </div>
      {err && <div className="err">{err}</div>}
      {loading && <div className="muted">Loading…</div>}
      {!loading && tenants.length === 0 && <div className="muted">No tenants on this appliance.</div>}

      {tenants.map((t) => {
        const stale = t.status_age_s == null || t.status_age_s > 120;
        return (
          <div className="card" key={t.tenant_id}>
            <div className="btnrow" style={{ marginBottom: 10 }}>
              <Icon name="dns" size={20} color="var(--accent)" />
              <b style={{ fontSize: 16 }}>{t.tenant || t.tenant_id}</b>
              <span className={`badge ${stale ? "amber" : "green"}`}>
                <Icon name={stale ? "warning" : "check_circle"} size={13} />
                {t.role || "—"} · {t.status_age_s == null ? "never reported" : ago(t.status_age_s)}
              </span>
              <div className="spacer" />
              {t.crash_count > 0 && (
                <span className="badge red">
                  <Icon name="bug_report" size={13} /> {t.crash_count} crashes
                </span>
              )}
              {t.open_alerts > 0 && (
                <span className="badge amber">
                  <Icon name="notifications_active" size={13} /> {t.open_alerts} alerts
                </span>
              )}
            </div>

            <div className="grid" style={{ marginBottom: 12 }}>
              <Kpi label="Gateway C3 fw" value={t.fw_c3 ? `v${t.fw_c3}` : "—"} icon="memory" />
              <Kpi label="Gateway C6 fw" value={t.fw_c6 ? `v${t.fw_c6}` : "—"} icon="memory" />
              <Kpi
                label="Free heap"
                value={t.heap_free ? `${Math.round(t.heap_free / 1024)} KB` : "—"}
                icon="developer_board"
              />
              <Kpi label="Mesh nodes" value={String((t.nodes || []).length)} icon="hub" />
            </div>

            {(t.nodes || []).length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Device</th>
                    <th>EUI</th>
                    <th>Kind</th>
                    <th>Status</th>
                    <th>Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {t.nodes.map((n: any) => (
                    <tr key={n.eui}>
                      <td>{autoName(n.eui, n.kind)}</td>
                      <td className="mono small">{n.eui}</td>
                      <td>{n.kind}</td>
                      <td>
                        <span className={`badge ${n.online ? "green" : "gray"}`}>
                          {n.online ? "online" : "offline"}
                        </span>
                      </td>
                      <td className="muted small">{ago((Date.now() / 1000) - n.last_seen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </>
  );
}

function Kpi({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="card" style={{ margin: 0, padding: 12 }}>
      <div className="btnrow muted small">
        <Icon name={icon} size={16} /> {label}
      </div>
      <div className="kpi">{value}</div>
    </div>
  );
}
