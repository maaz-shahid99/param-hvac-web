import { useState } from "react";
import { usePoll } from "../usePoll";
import { api, autoName } from "../api";
import Icon from "./Icon";
import {
  ago,
  deltaColor,
  isOnline,
  naturalCompare,
  nowSec,
  portRank,
  tempColor,
  tenantHighLimit,
} from "./Cards";

/**
 * Live thermal map: one row per rack unit, columns intake / exhaust / ΔT.
 *
 * Built from the TOPOLOGY rather than from the readings, which is the whole
 * point — /v1/current only contains probes that have data, so a port nobody has
 * wired up yet is simply absent from it. Driving the rows off the topology makes
 * those gaps visible instead of invisible, which is exactly the class of blind
 * spot that let "16 / 16 · all reporting" render while a node sat dark.
 */

type Cell = {
  assigned: boolean;
  eui: string;
  rom: string;
  temp: number | null;
  ts: number;
  online: boolean;
  port: string;
};

type UnitRow = {
  key: string;
  rack: string;
  unit: string;
  intake: Cell | null;
  exhaust: Cell | null;
  delta: number | null;
  euis: string[];
  unassigned: number;
};

// Distinct hues for the (few) sensor nodes on a site. Assigned by sorted EUI so
// a node keeps its colour across reloads.
const NODE_COLORS = ["#4f7fd0", "#c25fb0", "#3f9f8f", "#d08a3a", "#7a6fd0", "#c0554f"];

/** Pick readable text for a swatch — the amber band of the ramp is bright enough
 *  that white-on-amber fails contrast, so this can't be hardcoded. */
function inkFor(rgb: string): string {
  const m = rgb.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return "#fff";
  const [r, g, b] = [+m[1], +m[2], +m[3]];
  return 0.299 * r + 0.587 * g + 0.114 * b > 165 ? "#1a1d26" : "#fff";
}

export default function ThermalMap() {
  const [rows, setRows] = useState<UnitRow[]>([]);
  const [high, setHigh] = useState(40);
  const [limit, setLimit] = useState(30);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      const [topo, cur, th] = await Promise.all([
        api.topology(),
        api.current(),
        api.thresholds(),
      ]);
      setHigh(tenantHighLimit(th));
      const tenant = (th?.thresholds || []).find((x: any) => x?.scope === "tenant");
      const d = Number(tenant?.delta_c ?? th?.defaults?.delta_c);
      setLimit(Number.isFinite(d) ? d : 30);

      // readings: exact probe first, sensor-hottest as the legacy fallback
      const byKey: Record<string, { temp: number; ts: number }> = {};
      for (const s of cur.sensors || []) {
        const eui = String(s.eui).toLowerCase();
        const ts = Number(s.ts) || 0;
        const prev = byKey[eui];
        if (!prev || ts >= prev.ts) byKey[eui] = { temp: Number(s.max_c), ts };
        if (s.rom) {
          byKey[`${eui}:${String(s.rom).toLowerCase()}`] = {
            temp: s.temp != null ? Number(s.temp) : NaN,
            ts,
          };
        }
      }

      const out: UnitRow[] = [];
      for (const rack of topo.topology?.racks || []) {
        for (const u of rack.units || []) {
          const ports = u.ports || [];
          const euis = new Set<string>();
          let unassigned = 0;

          const side = (want: 0 | 1): Cell | null => {
            const mine = ports.filter((p: any) => portRank(p.type || p.label) === want);
            if (mine.length === 0) return null;
            let best: Cell | null = null;
            for (const p of mine) {
              const eui = (p.assignedEui || "").toLowerCase();
              const rom = (p.assignedProbeRom || "").toLowerCase();
              if (!eui) continue;
              euis.add(eui);
              const r = rom ? byKey[`${eui}:${rom}`] : byKey[eui];
              const temp = r && Number.isFinite(r.temp) ? r.temp : null;
              const online = !!r && isOnline(r.ts) && temp != null;
              const cell: Cell = {
                assigned: true, eui, rom, temp, ts: r?.ts ?? 0, online,
                port: p.label || (want ? "Exhaust" : "Intake"),
              };
              // Hottest wins, mirroring thresholds._hottest so this agrees with
              // whatever the alert engine decided for the same unit.
              if (!best) best = cell;
              else if (cell.online && (!best.online || (cell.temp ?? -Infinity) > (best.temp ?? -Infinity))) best = cell;
            }
            if (!best) {
              unassigned += mine.length;
              return { assigned: false, eui: "", rom: "", temp: null, ts: 0, online: false,
                       port: mine[0]?.label || (want ? "Exhaust" : "Intake") };
            }
            return best;
          };

          const intake = side(0);
          const exhaust = side(1);
          const delta =
            intake?.online && exhaust?.online && intake.temp != null && exhaust.temp != null
              ? exhaust.temp - intake.temp
              : null;

          out.push({
            key: `${rack.id}:${u.id}`,
            rack: rack.name || "Rack",
            unit: u.name || "Unit",
            intake, exhaust, delta,
            euis: [...euis],
            unassigned,
          });
        }
      }
      out.sort((a, b) => naturalCompare(a.rack, b.rack) || naturalCompare(a.unit, b.unit));
      setRows(out);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || "Could not load the thermal map.");
    } finally {
      setLoading(false);
    }
  }

  usePoll(refresh, 10000);

  const allEuis = [...new Set(rows.flatMap((r) => r.euis))].sort();
  const nodeColor = (eui: string) => NODE_COLORS[allEuis.indexOf(eui) % NODE_COLORS.length];
  const withDelta = rows.filter((r) => r.delta != null).length;
  const gaps = rows.reduce((n, r) => n + r.unassigned, 0);

  function cellView(c: Cell | null) {
    if (!c) return <span className="hm-cell none" title="no port of this type on this unit">–</span>;
    if (!c.assigned) {
      return (
        <span className="hm-cell unassigned" title={`${c.port} — no sensor assigned to this port yet`}>
          ·
        </span>
      );
    }
    if (!c.online) {
      return (
        <span
          className="hm-cell offline"
          title={`${c.port} · ${autoName(c.eui)}\n${c.ts ? `last reading ${ago(nowSec() - c.ts)}` : "no reading yet"}`}
        >
          —
        </span>
      );
    }
    const t = c.temp as number;
    const bg = tempColor(t);
    return (
      <span
        className={`hm-cell ${t >= high ? "hot" : ""}`}
        style={{ background: bg, color: inkFor(bg) }}
        title={`${c.port} · ${autoName(c.eui)}\n${t.toFixed(1)} °C${
          t >= high ? ` — at or over the ${high} °C limit` : ""
        }\n${ago(nowSec() - c.ts)}${c.rom ? `\nprobe …${c.rom.slice(-6)}` : ""}`}
      >
        {t.toFixed(1)}
      </span>
    );
  }

  let lastRack = "";

  return (
    <div className="card">
      <div className="hd hd-ico">
        <Icon name="grid_on" size={18} /> Thermal map
      </div>

      {err && <div className="bd error" role="alert">{err}</div>}

      {loading ? (
        <div className="bd muted">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="bd muted">
          No rack layout yet. Build racks and units under Rack Layout, assign sensors to
          ports, and every unit appears here.
        </div>
      ) : (
        <>
          <div className="hm-sum small muted">
            {rows.length} units · {withDelta} with ΔT
            {gaps > 0 && (
              <>
                {" · "}
                <b title="These ports exist in the layout but have no sensor assigned, so no ΔT can be computed for their unit.">
                  {gaps} port{gaps === 1 ? "" : "s"} unassigned
                </b>
              </>
            )}
          </div>

          <div className="heatmap">
            {rows.map((r) => {
              const head = r.rack !== lastRack;
              lastRack = r.rack;
              return (
                <div key={r.key} className="hm-block">
                  {head && <div className="hm-rack">{r.rack}</div>}
                  {head && (
                    <div className="hm-row hm-head">
                      <span />
                      <span>In</span>
                      <span>Out</span>
                      <span>ΔT</span>
                    </div>
                  )}
                  <div className="hm-row">
                    <span className="hm-unit">
                      {r.euis.map((e) => (
                        <i
                          key={e}
                          className="hm-node"
                          style={{ background: nodeColor(e) }}
                          title={autoName(e)}
                        />
                      ))}
                      {r.unit}
                    </span>
                    {cellView(r.intake)}
                    {cellView(r.exhaust)}
                    {r.delta == null ? (
                      <span
                        className="hm-cell none"
                        title={
                          r.intake?.assigned === false
                            ? "No ΔT — this unit's intake port has no sensor assigned"
                            : "No ΔT — both sides must be online to measure the rise"
                        }
                      >
                        —
                      </span>
                    ) : (
                      <span
                        className={`hm-cell ${r.delta >= limit ? "hot" : ""}`}
                        style={{
                          background: deltaColor(r.delta, limit),
                          color: inkFor(deltaColor(r.delta, limit)),
                        }}
                        title={`Rise across ${r.unit}: ${r.delta.toFixed(1)} °C (limit ${limit} °C)`}
                      >
                        {r.delta > 0 ? "+" : ""}
                        {r.delta.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hm-legend small muted">
            <span className="hm-key">
              15° <i className="grad" /> 55°
            </span>
            <span className="hm-key">
              <i className="hm-cell unassigned">·</i> unassigned
            </span>
            <span className="hm-key">
              <i className="hm-cell offline">—</i> offline
            </span>
          </div>
        </>
      )}
    </div>
  );
}
