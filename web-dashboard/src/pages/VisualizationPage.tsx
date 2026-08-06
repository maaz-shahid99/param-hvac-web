import { useEffect, useState } from "react";
import { usePoll } from "../usePoll";
import { api, autoName } from "../api";
import Fan from "../components/Fan";
import UnitDetail, { type SelectedUnit } from "../components/UnitDetail";
import { ago, isOnline, naturalCompare, nowSec, num, portRank, tempColor, tenantHighLimit } from "../components/Cards";
import PageHeader from "../components/PageHeader";
import Icon from "../components/Icon";

type Reading = { temp: number; ts: number };

export default function VisualizationPage() {
  const [racks, setRacks] = useState<any[]>([]);
  const [readings, setReadings] = useState<Record<string, Reading>>({});
  const [env, setEnv] = useState<any[]>([]);
  const [limits, setLimits] = useState({ high: 70, delta: 30 });
  const [sel, setSel] = useState<SelectedUnit | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      const [topo, cur, th] = await Promise.all([api.topology(), api.current(), api.thresholds()]);
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
      const tenant = (th?.thresholds || []).find((x: any) => x?.scope === "tenant");
      const d = Number(tenant?.delta_c ?? th?.defaults?.delta_c);
      setLimits({ high: tenantHighLimit(th), delta: Number.isFinite(d) ? d : 30 });
      setErr(null);
    } catch (e: any) {
      setErr(e.message || "Could not reach the cloud server.");
    } finally {
      setLoading(false);
    }
    // Ambient air, kept in its own try so a router with no BME can't blank the
    // racks. Humidity/pressure/VOC come from the gateway+router BME280 — there
    // is no humidity sensor per rack unit, the DS18B20 probes are temperature
    // only — so this is room context, deliberately not shown per unit.
    try {
      setEnv((await api.envCurrent()).env || []);
    } catch {/* older server or no BME: the strip just doesn't render */}
  }

  usePoll(refresh, 10000);

  // Escape closes the panel, matching the nav drawer in Layout.tsx.
  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSel(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel]);

  /** Reading + identity for one port, or null when nothing is assigned to it. */
  function portInfo(port: any) {
    const eui = (port.assignedEui || "").toLowerCase();
    const rom = (port.assignedProbeRom || "").toLowerCase();
    if (!eui) return null;
    const r = rom ? readings[`${eui}:${rom}`] : readings[eui];
    const temp = r && Number.isFinite(r.temp) ? r.temp : null;
    // No `label` here on purpose: the caller owns it, and returning it too meant
    // the spread below silently overwrote whatever the caller had set.
    return { eui, rom, temp, ts: r?.ts ?? 0, online: !!r && isOnline(r.ts) && temp != null };
  }

  function portView(port: any) {
    const info = portInfo(port);

    // An unassigned port is an EMPTY slot. It used to draw a grey <Fan>, which
    // is exactly what an assigned-but-offline probe looks like — the two states
    // were indistinguishable, and eight of them read as eight broken fans.
    if (!info) {
      return (
        <div
          className="fan-tile empty"
          key={port.id}
          title={`${port.label || "Port"} — no sensor assigned. Assign one under Rack Layout and it starts reporting here.`}
        >
          <div className="fan-slot">+</div>
          <div className="fan-temp" style={{ color: "var(--faint)" }}>·</div>
          <div className="fan-label">
            {port.label}
            <div className="small" style={{ color: "var(--faint)" }}>not assigned</div>
          </div>
        </div>
      );
    }

    const { online, temp } = info;
    return (
      <div className="fan-tile" key={port.id} title={`${port.label} · ${autoName(info.eui)}${info.rom ? ` · probe …${info.rom.slice(-6)}` : ""}${info.ts ? `\n${ago(nowSec() - info.ts)}` : ""}`}>
        <Fan tempC={online ? temp : null} online={online} />
        <div className="fan-temp" style={{ color: online ? tempColor(temp as number) : "var(--faint)" }}>
          {online ? `${(temp as number).toFixed(1)}°` : "—"}
        </div>
        <div className="fan-label">
          {port.label}
          {!online ? <div className="small" style={{ color: "var(--faint)" }}>offline</div> : null}
        </div>
      </div>
    );
  }

  /** Hottest reading on one side of a unit, matching thresholds._hottest. */
  function sideTemp(unit: any, want: 0 | 1) {
    let best: number | null = null;
    for (const p of unit.ports || []) {
      if (portRank(p.type || p.label) !== want) continue;
      const info = portInfo(p);
      if (!info?.online || info.temp == null) continue;
      if (best === null || info.temp > best) best = info.temp;
    }
    return best;
  }

  const sortedRacks = racks.slice().sort((a, b) => naturalCompare(a.name || "", b.name || ""));

  return (
    <>
      <PageHeader title="Visualization">
        <button className="secondary" onClick={refresh}><Icon name="refresh" size={17} /> Refresh</button>
      </PageHeader>
      <div className="page">
        {err && <div className="error" role="alert">{err}</div>}

        {/* Ambient air from the router/gateway BME. Room-level, and labelled as
            such: nothing here is measured inside a rack unit. */}
        {env.length > 0 && (
          <div className="ambient">
            {env.map((d: any) => (
              <div className="amb-card" key={d.eui}>
                <div className="amb-name">
                  <Icon name="air" size={16} /> {d.name || autoName(d.eui, "gateway")}
                  <span className="small muted">ambient{d.ts ? ` · ${ago(nowSec() - +d.ts)}` : ""}</span>
                </div>
                <div className="amb-vals">
                  <span><b>{num(d.temp, 1, "°C")}</b><i>air temp</i></span>
                  <span><b>{num(d.hum, 0, "%")}</b><i>humidity</i></span>
                  <span><b>{num(d.pres, 0, " hPa")}</b><i>pressure</i></span>
                  <span><b>{num(d.voc, 0)}</b><i>VOC</i></span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="legend" style={{ margin: "14px 0 18px" }}>
          <span>Cooler</span>
          <span className="grad" />
          <span>Hotter</span>
          <span style={{ marginLeft: 10 }}>· fan speed tracks temperature · click a unit for its history</span>
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
          <div className={`viz-layout${sel ? " open" : ""}`}>
            <div className="viz-grid">
              {sortedRacks.map((rack) => {
                const units = (rack.units || []).slice().sort((a: any, b: any) =>
                  naturalCompare(a.name || "", b.name || ""));
                // Header numbers now that it has the width to hold them.
                let hottest = -Infinity;
                let withDelta = 0;
                for (const u of units) {
                  const inT = sideTemp(u, 0), outT = sideTemp(u, 1);
                  if (outT != null && outT > hottest) hottest = outT;
                  if (inT != null && outT != null) withDelta++;
                }
                return (
                  <div className="rack" key={rack.id}>
                    <div className="rack-hd">
                      <span className="hd-ico"><Icon name="dns" size={17} /> {rack.name}</span>
                      <span className="small muted rack-sum">
                        {units.length} units
                        {withDelta > 0 && ` · ${withDelta} with ΔT`}
                        {Number.isFinite(hottest) && ` · hottest ${hottest.toFixed(1)}°`}
                      </span>
                    </div>
                    <div className="rack-body">
                      {units.map((u: any) => {
                        const inT = sideTemp(u, 0);
                        const outT = sideTemp(u, 1);
                        const delta = inT != null && outT != null ? outT - inT : null;
                        const selected = sel?.unitId === u.id;
                        return (
                          <button
                            type="button"
                            className="unit-btn"
                            key={u.id}
                            aria-pressed={selected}
                            aria-label={`${rack.name} ${u.name}${delta != null ? `, ΔT ${delta.toFixed(1)} degrees` : ""} — open details`}
                            onClick={() =>
                              setSel(selected ? null : {
                                unitId: u.id,
                                rack: rack.name || "Rack",
                                unit: u.name || "Unit",
                                ports: (u.ports || []).map((p: any) => ({
                                  label: p.label || "",
                                  side: portRank(p.type || p.label) === 1 ? "exhaust" : "intake",
                                  ...(portInfo(p) || { eui: "", rom: "", temp: null, ts: 0, online: false }),
                                })),
                              })
                            }
                          >
                            <div className={`unit${selected ? " sel" : ""}`}>
                              <div className="unit-name">
                                <span>{u.name}</span>
                                <span>
                                  {delta != null ? (
                                    <b style={{ color: delta >= limits.delta ? "var(--red)" : "var(--muted)" }}>
                                      ΔT +{delta.toFixed(1)}
                                    </b>
                                  ) : (
                                    `${(u.ports || []).length} ports`
                                  )}
                                </span>
                              </div>
                              <div className="fan-rail">
                                {(u.ports || []).length === 0 ? (
                                  <span className="small muted">no ports</span>
                                ) : (
                                  // Always intake left, exhaust right, whatever
                                  // order they were created in, so the rail reads
                                  // the way the air actually flows.
                                  (u.ports || [])
                                    .slice()
                                    .sort(
                                      (a: any, b: any) =>
                                        portRank(a.type || a.label) - portRank(b.type || b.label) ||
                                        naturalCompare(a.label || "", b.label || "")
                                    )
                                    .map((p: any) => portView(p))
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {sel && (
              <UnitDetail
                sel={sel}
                deltaLimit={limits.delta}
                highLimit={limits.high}
                ambient={env[0]}
                onClose={() => setSel(null)}
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}
