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
 * Live thermal map, drawn as a dumbbell chart.
 *
 * Every unit sits on ONE shared temperature axis: a filled dot for intake, a
 * hollow dot for exhaust, and the bar between them IS the ΔT. That choice is
 * doing three jobs the previous In/Out/ΔT table did badly:
 *
 *  - ΔT is a gap, so drawing it as a gap needs no explaining. (The dataviz rule
 *    of thumb: dumbbell when the size of each gap is the point.)
 *  - A unit whose intake isn't assigned is simply a single dot rather than two
 *    empty cells and a dash — it stops looking like broken UI and stays
 *    comparable against everything else.
 *  - Both racks share the axis, so it's obvious at a glance that Rack/Unit 2 at
 *    51.6 is as hot as Table/Unit 4 at 52.2. The table put them in separate
 *    blocks where nothing could be compared.
 *
 * Rows come from the TOPOLOGY, not the readings: /v1/current only contains
 * probes that have data, so a port nobody has wired up is absent from it
 * entirely — the same blind spot that let "16 / 16 · all reporting" render
 * while a whole node sat dark.
 */

// ASHRAE TC9.9 recommends server inlet air at 18-27 °C. Worth flagging, because
// an intake already at the ceiling is why the exhaust ends up where it does.
const ASHRAE_INTAKE_MAX = 27;

type Side = { eui: string; rom: string; temp: number | null; ts: number; online: boolean; port: string } | null;

type Row = {
  key: string;
  rack: string;
  unit: string;
  label: string;
  intake: Side;
  exhaust: Side;
  delta: number | null;
  euis: string[];
};

const NODE_COLORS = ["#4f7fd0", "#c25fb0", "#3f9f8f", "#d08a3a", "#7a6fd0", "#c0554f"];

/** Round tick values that sit inside [lo, hi] — a plain lo/mid/hi axis prints
 *  things like "26.8°" which nobody can read a position against. */
function niceTicks(lo: number, hi: number, want = 4): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / want;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  let step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const build = (s: number) => {
    const out: number[] = [];
    for (let v = Math.ceil(lo / s) * s; v <= hi + 1e-9; v += s) out.push(Math.round(v * 10) / 10);
    return out;
  };
  let out = build(step);
  // Rounding up to a nice step can leave only one or two labels on the axis,
  // which is not enough to read a dot's position against. Halve until it is.
  while (out.length < 3 && step > 0.5) {
    step /= 2;
    out = build(step);
  }
  return out;
}

export default function ThermalMap() {
  const [rows, setRows] = useState<Row[]>([]);
  const [high, setHigh] = useState(70);
  const [limit, setLimit] = useState(30);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      const [topo, cur, th] = await Promise.all([api.topology(), api.current(), api.thresholds()]);
      setHigh(tenantHighLimit(th));
      const tenant = (th?.thresholds || []).find((x: any) => x?.scope === "tenant");
      const d = Number(tenant?.delta_c ?? th?.defaults?.delta_c);
      setLimit(Number.isFinite(d) ? d : 30);

      const byKey: Record<string, { temp: number; ts: number }> = {};
      for (const s of cur.sensors || []) {
        const eui = String(s.eui).toLowerCase();
        const ts = Number(s.ts) || 0;
        const prev = byKey[eui];
        if (!prev || ts >= prev.ts) byKey[eui] = { temp: Number(s.max_c), ts };
        if (s.rom) {
          byKey[`${eui}:${String(s.rom).toLowerCase()}`] = {
            temp: s.temp != null ? Number(s.temp) : NaN, ts,
          };
        }
      }

      const out: Row[] = [];
      for (const rack of topo.topology?.racks || []) {
        for (const u of rack.units || []) {
          const ports = u.ports || [];
          const euis = new Set<string>();

          const side = (want: 0 | 1): Side => {
            let best: Side = null;
            for (const p of ports.filter((p: any) => portRank(p.type || p.label) === want)) {
              const eui = (p.assignedEui || "").toLowerCase();
              const rom = (p.assignedProbeRom || "").toLowerCase();
              if (!eui) continue;
              euis.add(eui);
              const r = rom ? byKey[`${eui}:${rom}`] : byKey[eui];
              const temp = r && Number.isFinite(r.temp) ? r.temp : null;
              const online = !!r && isOnline(r.ts) && temp != null;
              const cell = { eui, rom, temp, ts: r?.ts ?? 0, online, port: p.label || (want ? "Exhaust" : "Intake") };
              // Hottest wins, mirroring thresholds._hottest so the picture and
              // the alarm can't disagree about the same unit.
              if (!best) best = cell;
              else if (cell.online && (!best.online || (cell.temp ?? -Infinity) > (best.temp ?? -Infinity))) best = cell;
            }
            return best;
          };

          const intake = side(0);
          const exhaust = side(1);
          out.push({
            key: `${rack.id}:${u.id}`,
            rack: rack.name || "Rack",
            unit: u.name || "Unit",
            label: `${rack.name || "Rack"} ${(u.name || "Unit").replace(/^unit\s*/i, "U")}`,
            intake, exhaust,
            delta:
              intake?.online && exhaust?.online && intake.temp != null && exhaust.temp != null
                ? exhaust.temp - intake.temp
                : null,
            euis: [...euis],
          });
        }
      }
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

  // Three groups, because they answer different questions: units with a real
  // rise, units we can only see one side of, and units we can't see at all.
  const paired = rows.filter((r) => r.delta != null).sort((a, b) => (b.delta as number) - (a.delta as number));
  const single = rows
    .filter((r) => r.delta == null && (r.intake?.online || r.exhaust?.online))
    .sort((a, b) => {
      const t = (r: Row) => (r.exhaust?.online ? (r.exhaust.temp as number) : (r.intake?.temp as number)) ?? -Infinity;
      return t(b) - t(a);
    });
  const dark = rows.filter((r) => r.delta == null && !r.intake?.online && !r.exhaust?.online);

  const temps = [...paired, ...single].flatMap((r) =>
    [r.intake?.online ? r.intake.temp : null, r.exhaust?.online ? r.exhaust.temp : null].filter(
      (v): v is number => v != null
    )
  );
  const lo = temps.length ? Math.min(...temps) : 20;
  const hi = temps.length ? Math.max(...temps) : 50;
  const pad = Math.max(1.5, (hi - lo) * 0.1);
  const dMin = lo - pad, dMax = hi + pad;
  const pct = (t: number) => ((t - dMin) / Math.max(0.001, dMax - dMin)) * 100;
  const ticks = niceTicks(dMin, dMax);

  const intakes = paired.concat(single).map((r) => (r.intake?.online ? r.intake.temp : null)).filter((v): v is number => v != null);
  const hotIntake = intakes.length ? Math.max(...intakes) : null;

  function Track({ r }: { r: Row }) {
    const inT = r.intake?.online ? (r.intake.temp as number) : null;
    const outT = r.exhaust?.online ? (r.exhaust.temp as number) : null;
    const bar =
      inT != null && outT != null
        ? { left: pct(Math.min(inT, outT)), width: Math.abs(pct(outT) - pct(inT)) }
        : null;
    return (
      <span className="dumb-track">
        {ticks.map((t) => (
          <i key={t} className="dumb-tick" style={{ left: `${pct(t)}%` }} />
        ))}
        {high > dMin && high < dMax && (
          <i className="dumb-hilimit" style={{ left: `${pct(high)}%` }} title={`High-temp limit ${high} °C`} />
        )}
        {bar && (
          <i
            className="dumb-bar"
            style={{ left: `${bar.left}%`, width: `${bar.width}%`, background: deltaColor(r.delta as number, limit) }}
          />
        )}
        {inT != null && (
          <i
            className="dumb-dot in"
            style={{ left: `${pct(inT)}%`, background: tempColor(inT) }}
            title={`${r.intake?.port} · ${autoName(r.intake?.eui || "")}\nintake ${inT.toFixed(1)} °C${
              inT > ASHRAE_INTAKE_MAX ? `\n— above the ${ASHRAE_INTAKE_MAX} °C ASHRAE recommended inlet max` : ""
            }\n${ago(nowSec() - (r.intake?.ts ?? 0))}`}
          />
        )}
        {outT != null && (
          <i
            className={`dumb-dot out ${outT >= high ? "hot" : ""}`}
            style={{ left: `${pct(outT)}%`, borderColor: tempColor(outT) }}
            title={`${r.exhaust?.port} · ${autoName(r.exhaust?.eui || "")}\nexhaust ${outT.toFixed(1)} °C${
              outT >= high ? ` — at or over the ${high} °C limit` : ""
            }\n${ago(nowSec() - (r.exhaust?.ts ?? 0))}`}
          />
        )}
      </span>
    );
  }

  function RowView({ r }: { r: Row }) {
    const outT = r.exhaust?.online ? (r.exhaust.temp as number) : null;
    return (
      <div className="dumb-row">
        <span className="dumb-lbl" title={`${r.rack} / ${r.unit}`}>
          {r.euis.map((e) => (
            <i key={e} className="hm-node" style={{ background: nodeColor(e) }} title={autoName(e)} />
          ))}
          {r.label}
        </span>
        <Track r={r} />
        {r.delta != null ? (
          <b className="dumb-val" style={{ color: deltaColor(r.delta, limit) }}
             title={`Rise across ${r.unit}: ${r.delta.toFixed(1)} °C (limit ${limit} °C)`}>
            +{r.delta.toFixed(1)}
          </b>
        ) : (
          <span className="dumb-val muted" title="No ΔT — only one side of this unit is reporting">
            {outT != null ? `${outT.toFixed(1)}°` : "—"}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="hd hd-ico">
        <Icon name="align_horizontal_left" size={18} /> Thermal map
      </div>

      {err && <div className="bd error" role="alert">{err}</div>}

      {loading ? (
        <div className="bd muted">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="bd muted">
          No rack layout yet. Build racks and units under Rack Layout, assign sensors to ports,
          and every unit appears here.
        </div>
      ) : (
        <div className="dumb">
          <div className="dumb-sum small muted">
            {paired.length} of {rows.length} units measuring ΔT
            {hotIntake != null && hotIntake > ASHRAE_INTAKE_MAX && (
              <>
                {" · "}
                <b title={`ASHRAE TC9.9 recommends server inlet air at 18–${ASHRAE_INTAKE_MAX} °C. Intake air this warm is why exhausts run hot.`}>
                  intake {hotIntake.toFixed(1)}° over ASHRAE {ASHRAE_INTAKE_MAX}°
                </b>
              </>
            )}
          </div>

          <div className="dumb-row dumb-axis">
            <span />
            <span className="dumb-track">
              {ticks.map((t) => (
                <i key={t} className="dumb-tickl" style={{ left: `${pct(t)}%` }}>{t}°</i>
              ))}
              {/* Label the limit line. Unlabelled, a red dashed rule just raises
                  the question it was meant to answer. */}
              {high > dMin && high < dMax && (
                <i className="dumb-tickl lim" style={{ left: `${pct(high)}%` }}>limit</i>
              )}
            </span>
            <span />
          </div>

          {paired.map((r) => <RowView key={r.key} r={r} />)}

          {single.length > 0 && (
            <>
              <div className="dumb-sep small muted" title="ΔT needs both an intake and an exhaust. These units only have one side assigned or reporting, so the rise across them cannot be measured.">
                one side only — no ΔT
              </div>
              {single.map((r) => <RowView key={r.key} r={r} />)}
            </>
          )}

          {dark.length > 0 && (
            <div className="dumb-sep small muted">
              {dark.length} unit{dark.length === 1 ? "" : "s"} not reporting:{" "}
              {dark.map((r) => r.label).join(", ")}
            </div>
          )}

          <div className="dumb-legend small muted">
            <span className="hm-key"><i className="dumb-dot in legend" /> intake</span>
            <span className="hm-key"><i className="dumb-dot out legend" /> exhaust</span>
            <span className="hm-key"><i className="dumb-bar legend" /> ΔT (limit {limit}°)</span>
          </div>
        </div>
      )}
    </div>
  );
}
