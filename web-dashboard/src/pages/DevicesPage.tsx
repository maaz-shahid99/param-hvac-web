import { useEffect, useState } from "react";
import { api, autoName } from "../api";
import { ago, isOnline, nowSec } from "../components/Cards";
import GatewayStatus from "../components/GatewayStatus";
import PageHeader from "../components/PageHeader";
import Icon from "../components/Icon";

type Sensor = {
  eui: string; name: string; loc: string; ts: number; online: boolean;
};
type Mesh = {
  eui: string; name: string; role: "G" | "R"; online: boolean; ts: number;
};

export default function DevicesPage() {
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [mesh, setMesh] = useState<Mesh[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      const [c, topo] = await Promise.all([api.current(), api.topology()]);
      let roster: any[] = [];
      try { roster = (await api.devices()).devices || []; } catch {/* older server */}
      let routers: any[] = [];
      try { routers = (await api.routers()).routers || []; } catch {/* older server */}

      // ---- sensors: roster (names) ∪ topology (location) ∪ cloud current (live) ----
      const sm: Record<string, Sensor> = {};
      for (const d of roster) {
        if (String(d.kind) !== "sensor") continue;
        const eui = String(d.eui).toLowerCase();
        sm[eui] = { eui, name: d.name || autoName(eui, "sensor"), loc: "", ts: 0, online: false };
      }
      for (const r of topo.topology?.racks || []) {
        for (const u of r.units || []) {
          for (const p of u.ports || []) {
            const eui = (p.assignedEui || "").toLowerCase();
            if (!eui) continue;
            (sm[eui] ||= { eui, name: autoName(eui, "sensor"), loc: "", ts: 0, online: false }).loc =
              `${r.name} / ${u.name} / ${p.label}`;
          }
        }
      }
      // current is per-probe -> aggregate to one row per EUI (latest ts wins)
      for (const s of c.sensors || []) {
        const eui = String(s.eui).toLowerCase();
        const ts = Number(s.ts) || 0;
        const d = (sm[eui] ||= { eui, name: autoName(eui, "sensor"), loc: "", ts: 0, online: false });
        if (ts >= d.ts) d.ts = ts;
        if (!d.loc && s.location) d.loc = s.location;
      }
      const slist = Object.values(sm).map((d) => ({ ...d, online: d.ts > 0 && isOnline(d.ts) }));
      slist.sort((a, b) =>
        a.online === b.online ? a.name.toLowerCase().localeCompare(b.name.toLowerCase()) : a.online ? -1 : 1);

      // ---- mesh: roster ∪ cloud /v1/routers ----
      const mm: Record<string, Mesh> = {};
      for (const d of roster) {
        if (String(d.kind) === "sensor") continue;
        const eui = String(d.eui).toLowerCase();
        const role = (d.role === "G" || d.kind === "gateway") ? "G" : "R";
        mm[eui] = { eui, name: d.name || autoName(eui, role === "G" ? "gateway" : "router"), role, online: false, ts: 0 };
      }
      for (const r of routers) {
        const eui = String(r.eui).toLowerCase();
        const role = String(r.kind) === "gateway" ? "G" : "R";
        const d = (mm[eui] ||= { eui, name: autoName(eui, role === "G" ? "gateway" : "router"), role, online: false, ts: 0 });
        d.role = role as "G" | "R";
        d.online = !!r.online;
        d.ts = Number(r.last_seen) || 0;
      }
      const mlist = Object.values(mm).sort((a, b) =>
        a.role !== b.role ? (a.role === "G" ? -1 : 1)
          : a.online === b.online ? a.name.localeCompare(b.name) : a.online ? -1 : 1);

      setSensors(slist);
      setMesh(mlist);
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

  async function rename(eui: string, kind: string, role: string, current: string) {
    const name = window.prompt("Device name", current);
    if (name == null) return;
    try { await api.putDevices([{ eui, kind, role, name: name.trim() }]); refresh(); }
    catch (e: any) { setErr(e.message); }
  }
  async function remove(eui: string, label: string) {
    if (!window.confirm(`Remove "${label}" from the list?\n\nIt reappears automatically if it comes back online.`)) return;
    try { await api.deleteDevice(eui); refresh(); }
    catch (e: any) { setErr(e.message); }
  }

  const online = sensors.filter((r) => r.online).length;
  const meshOnline = mesh.filter((r) => r.online).length;

  return (
    <>
      <PageHeader title="Devices">
        <button className="secondary" onClick={refresh}><Icon name="refresh" size={17} /> Refresh</button>
      </PageHeader>
      <div className="page">
        {err && <div className="error">{err}</div>}
        <GatewayStatus />

        <div className="card">
          <div className="hd hd-ico"><Icon name="hub" size={18} /> Mesh nodes ({meshOnline}/{mesh.length} online)</div>
          {mesh.length === 0 ? (
            <div className="bd muted">
              No mesh nodes reported yet. The active gateway and any routers appear here
              once the gateway reports the roster to the cloud.
            </div>
          ) : (
            mesh.map((d) => {
              const isGw = d.role === "G";
              return (
                <div className="row" key={d.eui}>
                  <div className="btnrow">
                    <span className={`iconwrap ${isGw ? "blue" : "grey"}`}>
                      <Icon name={isGw ? "router" : "settings_input_antenna"} size={20} />
                    </span>
                    <div>
                      <div className="hd-ico">
                        <span className={`dot-s ${d.online ? "on" : "off"}`} /> {d.name}
                        <span className="small muted">{isGw ? "· gateway" : "· router"}</span>
                      </div>
                      <div className="small muted mono">{d.eui}{d.ts > 0 ? ` · ${ago(nowSec() - d.ts)}` : ""}</div>
                    </div>
                  </div>
                  <div className="btnrow">
                    <span className={`badge ${d.online ? "green" : "grey"}`}>{d.online ? "ONLINE" : "OFFLINE"}</span>
                    <button className="iconbtn" title="Rename" onClick={() => rename(d.eui, isGw ? "gateway" : "router", d.role, d.name)}><Icon name="edit" size={18} /></button>
                    <button className="iconbtn" title="Remove" onClick={() => remove(d.eui, d.name)}><Icon name="delete" size={18} /></button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="card">
          <div className="hd hd-ico"><Icon name="thermostat" size={18} /> Sensors ({online}/{sensors.length} online)</div>
          {loading ? (
            <div className="bd muted">Loading…</div>
          ) : sensors.length === 0 ? (
            <div className="bd muted">No sensors yet. Commission them from the phone app.</div>
          ) : (
            sensors.map((d) => (
              <div className="row" key={d.eui}>
                <div className="btnrow">
                  <span className="iconwrap amber"><Icon name="thermostat" size={20} /></span>
                  <div>
                    <div className="hd-ico">
                      <span className={`dot-s ${d.online ? "on" : "off"}`} /> {d.name}
                    </div>
                    <div className="small muted mono">
                      {d.loc ? `${d.loc} · ` : ""}{d.eui}{d.ts > 0 ? ` · ${ago(nowSec() - d.ts)}` : ""}
                    </div>
                  </div>
                </div>
                <div className="btnrow">
                  <span className={`badge ${d.online ? "green" : "grey"}`}>{d.online ? "ONLINE" : "OFFLINE"}</span>
                  <button className="iconbtn" title="Rename" onClick={() => rename(d.eui, "sensor", "", d.name)}><Icon name="edit" size={18} /></button>
                  <button className="iconbtn" title="Remove" onClick={() => remove(d.eui, d.name)}><Icon name="delete" size={18} /></button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
