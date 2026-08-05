import { useEffect, useState } from "react";
import { usePoll } from "../usePoll";
import { api, autoName, downloadCsv } from "../api";
import { ago, nowSec, compareLocation, naturalCompare, num } from "../components/Cards";
import PageHeader from "../components/PageHeader";
import Icon from "../components/Icon";

type Env = {
  eui: string; name: string; ts: number;
  temp: number; hum: number; pres: number; voc: number;
};

export default function EnvDataPage() {
  const [env, setEnv] = useState<Env[]>([]);
  // Distinguishes "nothing to show" from "haven't asked yet" — the empty
  // state used to be asserted as fact during the very first fetch.
  const [loaded, setLoaded] = useState(false);
  const [kinds, setKinds] = useState<Record<string, string>>({});
  const [sensors, setSensors] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const [e, p] = await Promise.all([api.envCurrent(), api.envProbes()]);
      const list: Env[] = (e.env || []).slice();
      list.sort((a, b) => naturalCompare(a.name || a.eui, b.name || b.eui));
      setEnv(list);
      // The server builds this from a set, so the order it arrives in is
      // arbitrary. Order it physically: rack alphabetical, unit by number, then
      // intake before exhaust. Probes with no rack mapping sort to the end —
      // they have no place in the layout to sort by.
      const probes = (p.probes || []).slice().sort((a: any, b: any) => {
        const am = !!a.location, bm = !!b.location;
        if (am !== bm) return am ? -1 : 1;
        if (am) return compareLocation(a.location, b.location);
        return naturalCompare(a.label || a.eui, b.label || b.eui);
      });
      setSensors(probes);
      setErr(null);
      // The BME reporters are routers AND the gateway, but this list used to name
      // every one of them "Router-XXXX". Resolve the real kind so the gateway
      // isn't disguised as a router.
      try {
        const mesh = await api.routers();
        const km: Record<string, string> = {};
        for (const m of (mesh.routers || []) as any[]) {
          const eui = String(m.eui || "").toLowerCase();
          if (eui) km[eui] = m.kind || "router";
        }
        setKinds(km);
      } catch { /* falls back to "router" */ }
      setLoaded(true);
    } catch (ex: any) {
      setErr(ex.message || "Could not reach the cloud server.");
    }
  }
  usePoll(refresh, 60000); // routers report roughly once a minute

  const dl = async (path: string, file: string) => {
    setBusy(true);
    try { await downloadCsv(path, file); } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Environment & Logs">
        <button className="secondary" onClick={refresh}><Icon name="refresh" size={17} /> Refresh</button>
      </PageHeader>
      <div className="page">
        {err && <div className="error">{err}</div>}

        <div className="card">
          <div className="hd hd-ico" style={{ justifyContent: "space-between" }}>
            <span className="hd-ico"><Icon name="hub" size={18} /> Routers — environment ({env.length})</span>
            <button className="secondary" disabled={busy} onClick={() => dl("/v1/env/export.csv", "routers_env.csv")}>
              <Icon name="download" size={16} /> CSV
            </button>
          </div>
          {!loaded ? (
            <div className="bd muted">Loading…</div>
          ) : env.length === 0 ? (
            <div className="bd muted">No router environment data yet. Routers forward their BME readings over the mesh.</div>
          ) : env.map((d) => (
            <div className="row" key={d.eui}>
              <div className="btnrow">
                <span className="iconwrap blue"><Icon name="thermostat" size={20} /></span>
                <div>
                  <div>{d.name || autoName(d.eui, kinds[d.eui.toLowerCase()] || "router")}</div>
                  <div className="small muted mono">{d.eui}{d.ts ? ` · ${ago(nowSec() - d.ts)}` : ""}</div>
                </div>
              </div>
              {/* These come from unvalidated JSON. A router with a dead BME
                  sensor sends nulls, and a bare .toFixed() there threw a
                  TypeError that took the whole app down with it. */}
              <span className="small">
                {num(d.temp, 1, "°C")} · {num(d.hum, 0, "%RH")} · {num(d.pres, 0, "hPa")} · VOC {num(d.voc, 0)}
              </span>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="hd hd-ico" style={{ justifyContent: "space-between" }}>
            <span className="hd-ico"><Icon name="thermostat" size={18} /> Sensors — temperatures ({sensors.length})</span>
            <button className="secondary" disabled={busy} onClick={() => dl("/v1/readings/export.csv", "sensors.csv")}>
              <Icon name="download" size={16} /> CSV
            </button>
          </div>
          {!loaded ? (
            <div className="bd muted">Loading…</div>
          ) : sensors.length === 0 ? (
            <div className="bd muted">No sensor data yet.</div>
          ) : sensors.map((s: any, i: number) => {
            const t = s.temp != null ? +s.temp : NaN;
            const name = (s.name || autoName(s.eui)).toString();
            return (
              <div className="row" key={`${s.eui}-${s.rom || i}`}>
                <div className="btnrow">
                  <span className="iconwrap amber"><Icon name="thermostat" size={20} /></span>
                  <div>
                    <div>{s.label || s.eui}</div>
                    <div className="small muted">{name}{s.ts ? ` · ${ago(nowSec() - +s.ts)}` : ""}</div>
                  </div>
                </div>
                <b>{Number.isFinite(t) ? `${t.toFixed(1)}°` : "—"}</b>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
