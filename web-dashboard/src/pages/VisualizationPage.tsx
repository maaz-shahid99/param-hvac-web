import { useEffect, useState } from "react";
import { api } from "../api";
import Fan from "../components/Fan";
import { isOnline, tempColor } from "../components/Cards";
import PageHeader from "../components/PageHeader";
import Icon from "../components/Icon";

type Reading = { temp: number; ts: number };

export default function VisualizationPage() {
  const [racks, setRacks] = useState<any[]>([]);
  const [readings, setReadings] = useState<Record<string, Reading>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      const [topo, cur] = await Promise.all([api.topology(), api.current()]);
      setRacks(topo.topology?.racks || []);
      const map: Record<string, Reading> = {};
      for (const s of cur.sensors || []) {
        const eui = String(s.eui).toLowerCase();
        const ts = Number(s.ts) || 0;
        const prev = map[eui];
        if (!prev || ts >= prev.ts) map[eui] = { temp: Number(s.max_c), ts }; // per-sensor hottest
        if (s.rom) map[`${eui}:${String(s.rom).toLowerCase()}`] = { temp: s.temp != null ? Number(s.temp) : NaN, ts };
      }
      setReadings(map);
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

  function portView(port: any) {
    const eui = (port.assignedEui || "").toLowerCase();
    const rom = (port.assignedProbeRom || "").toLowerCase();
    // per-probe reading when the port maps a specific probe, else the sensor's hottest
    const r = rom ? readings[`${eui}:${rom}`] : eui ? readings[eui] : undefined;
    const online = !!r && isOnline(r.ts) && Number.isFinite(r.temp);
    const tempC = r ? r.temp : null;
    return (
      <div className="fan-tile" key={port.id} title={eui || "unassigned"}>
        <Fan tempC={online ? tempC : null} online={online} />
        <div className="fan-temp" style={{ color: online ? tempColor(tempC as number) : "var(--faint)" }}>
          {online ? `${(tempC as number).toFixed(1)}°` : eui ? "—" : "·"}
        </div>
        <div className="fan-label">
          {port.label}
          {!online && eui ? <div className="small" style={{ color: "var(--faint)" }}>offline</div> : null}
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Visualization">
        <button className="secondary" onClick={refresh}><Icon name="refresh" size={17} /> Refresh</button>
      </PageHeader>
      <div className="page">
        {err && <div className="error">{err}</div>}

        <div className="legend" style={{ marginBottom: 18 }}>
          <span>Cooler</span>
          <span className="grad" />
          <span>Hotter</span>
          <span style={{ marginLeft: 10 }}>· fan speed tracks temperature · grey = offline</span>
        </div>

        {loading ? (
          <div className="center-msg">Loading…</div>
        ) : racks.length === 0 ? (
          <div className="card">
            <div className="bd muted">
              No rack layout configured yet. Build racks, units and ports in the phone
              app (Rack Layout), then assign sensors — they'll appear here.
            </div>
          </div>
        ) : (
          <div className="viz-grid">
            {racks.map((rack) => (
              <div className="rack" key={rack.id}>
                <div className="rack-hd">
                  <span className="hd-ico"><Icon name="dns" size={17} /> {rack.name}</span>
                  <span className="small muted">{(rack.units || []).length} units</span>
                </div>
                <div className="rack-body">
                  {(rack.units || []).map((u: any) => (
                    <div className="unit" key={u.id}>
                      <div className="unit-name">
                        <span>{u.name}</span>
                        <span>{(u.ports || []).length} ports</span>
                      </div>
                      <div className="fan-rail">
                        {(u.ports || []).length === 0 ? (
                          <span className="small muted">no ports</span>
                        ) : (
                          (u.ports || []).map((p: any) => portView(p))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
