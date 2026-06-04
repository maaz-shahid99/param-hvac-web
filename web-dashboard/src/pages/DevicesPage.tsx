import { useEffect, useState } from "react";
import { api } from "../api";
import { ago, isOnline, nowSec } from "../components/Cards";
import GatewayStatus from "../components/GatewayStatus";
import PageHeader from "../components/PageHeader";

// Sensors with online/offline. Merges the cloud's last-reading data with the
// commissioned set from the rack topology (so never-reported sensors still show
// as offline). Gateways/routers aren't shown on the web (no Bluetooth).
type Router = { eui: string; online: boolean; ts: number };

export default function DevicesPage() {
  const [rows, setRows] = useState<{ eui: string; label: string; ts: number; online: boolean }[]>([]);
  const [routers, setRouters] = useState<Router[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      const [c, topo] = await Promise.all([api.current(), api.topology()]);
      // Router roster (older servers won't have the endpoint — ignore failures).
      try {
        const rt = await api.routers();
        setRouters(
          (rt.routers || []).map((r: any) => ({
            eui: String(r.eui),
            online: !!r.online,
            ts: Number(r.last_seen) || 0,
          }))
        );
      } catch {/* no /v1/routers */}
      const byEui: Record<string, { eui: string; label: string; ts: number; online: boolean }> = {};
      // commissioned set from topology
      for (const r of topo.topology?.racks || []) {
        for (const u of r.units || []) {
          for (const p of u.ports || []) {
            const eui = (p.assignedEui || "").toLowerCase();
            if (eui) byEui[eui] = { eui, label: `${r.name} / ${u.name} / ${p.label}`, ts: 0, online: false };
          }
        }
      }
      // cloud last-reading
      for (const s of c.sensors || []) {
        const eui = String(s.eui).toLowerCase();
        const ts = Number(s.ts) || 0;
        const loc = s.location || "";
        const d = byEui[eui] || { eui, label: loc || "Unmapped", ts: 0, online: false };
        d.ts = ts;
        if (loc) d.label = loc;
        byEui[eui] = d;
      }
      const list = Object.values(byEui).map((d) => ({ ...d, online: d.ts > 0 && isOnline(d.ts) }));
      list.sort((a, b) => (a.online === b.online ? a.label.localeCompare(b.label) : a.online ? -1 : 1));
      setRows(list);
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

  const online = rows.filter((r) => r.online).length;
  const routersOnline = routers.filter((r) => r.online).length;

  return (
    <>
      <PageHeader title="Devices">
        <button className="secondary" onClick={refresh}>Refresh</button>
      </PageHeader>
      <div className="page">
        {err && <div className="error">{err}</div>}
        <GatewayStatus />

        <div className="card">
          <div className="hd">Routers ({routersOnline}/{routers.length} online)</div>
          {routers.length === 0 ? (
            <div className="bd muted">
              No routers in the mesh yet. Commission a router — it just joins the
              network (sensors relay through it) and appears here.
            </div>
          ) : (
            routers.map((d) => (
              <div className="row" key={d.eui}>
                <div className="btnrow">
                  <span className={`dot-s ${d.online ? "on" : "off"}`} />
                  <div>
                    <div>Router</div>
                    <div className="small muted mono">
                      {d.eui}
                      {d.ts > 0 ? ` · ${ago(nowSec() - d.ts)}` : ""}
                    </div>
                  </div>
                </div>
                <span className={`badge ${d.online ? "green" : "grey"}`}>
                  {d.online ? "ONLINE" : "OFFLINE"}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <div className="hd">Sensors ({online}/{rows.length} online)</div>
          {loading ? (
            <div className="bd muted">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="bd muted">No sensors yet. Commission + assign them from the phone app.</div>
          ) : (
            rows.map((d) => (
              <div className="row" key={d.eui}>
                <div className="btnrow">
                  <span className={`dot-s ${d.online ? "on" : "off"}`} />
                  <div>
                    <div>{d.label}</div>
                    <div className="small muted mono">
                      {d.eui}
                      {d.ts > 0 ? ` · ${ago(nowSec() - d.ts)}` : ""}
                    </div>
                  </div>
                </div>
                <span className={`badge ${d.online ? "green" : "grey"}`}>
                  {d.online ? "ONLINE" : "OFFLINE"}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
