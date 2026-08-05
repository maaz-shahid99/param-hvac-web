import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import Icon from "./Icon";
import { tenantHighLimit } from "./Cards";

/**
 * Intake-vs-exhaust history per rack unit.
 *
 * Hand-rolled SVG on purpose: the project ships no charting library, and the
 * appliance is served over plain http on a closed network (the icon font is
 * bundled locally for the same reason), so pulling one in for this would mean a
 * CDN dependency an air-gapped install can't resolve.
 *
 * Two modes because the site's data is lopsided: ΔT only exists for units whose
 * intake AND exhaust are both assigned. Where a rack is exhaust-only the ΔT view
 * is legitimately empty, and "Exhaust" is the view that has anything to say.
 */

type Point = { t: number; intake: number | null; exhaust: number | null; delta: number | null };
type Unit = { unit_id: string; label: string; has_intake: boolean; has_exhaust: boolean; points: Point[] };

const RANGES = [
  { label: "1h", hours: 1, points: 60 },
  { label: "6h", hours: 6, points: 90 },
  { label: "24h", hours: 24, points: 120 },
];

const SERIES_COLORS = [
  "#4f7fd0", "#c25fb0", "#3f9f8f", "#d08a3a", "#7a6fd0", "#c0554f",
  "#5a9bd4", "#9b6fb0", "#4faf8f", "#c99a4a", "#6f7fd0", "#b06a64",
];

const W = 360, H = 168, PAD_L = 30, PAD_R = 8, PAD_T = 10, PAD_B = 20;

export default function DeltaTrend() {
  const [range, setRange] = useState(1);              // default 6h
  const [mode, setMode] = useState<"delta" | "exhaust">("delta");
  const [units, setUnits] = useState<Unit[]>([]);
  const [window_, setWindow] = useState<{ start: number; end: number } | null>(null);
  const [limit, setLimit] = useState(30);
  const [high, setHigh] = useState(70);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  // The bundle and the server deploy separately, so a dashboard can legitimately
  // be talking to a server that predates this endpoint. Hide rather than sit
  // there showing a red error the operator can do nothing about.
  const [unsupported, setUnsupported] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const r = RANGES[range];
    setLoading(true);
    (async () => {
      try {
        const [s, th] = await Promise.all([
          api.readingsSeries(r.hours, r.points),
          api.thresholds().catch(() => null),
        ]);
        if (cancelled) return;
        setUnits(s.units || []);
        setWindow({ start: s.start, end: s.end });
        if (th) {
          setHigh(tenantHighLimit(th));
          const tenant = (th.thresholds || []).find((x: any) => x?.scope === "tenant");
          const d = Number(tenant?.delta_c ?? th?.defaults?.delta_c);
          setLimit(Number.isFinite(d) ? d : 30);
        }
        setErr(null);
      } catch (e: any) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) setUnsupported(true);
        else setErr(e?.message || "Could not load history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range]);

  if (unsupported) return null;

  const pick = (p: Point) => (mode === "delta" ? p.delta : p.exhaust);
  const series = units
    .filter((u) => (mode === "delta" ? u.has_intake && u.has_exhaust : u.has_exhaust))
    .map((u) => ({ ...u, pts: u.points.filter((p) => pick(p) != null) }))
    .filter((u) => u.pts.length > 1);

  const shown = series.filter((s) => !hidden.has(s.unit_id));
  const vals = shown.flatMap((s) => s.pts.map((p) => pick(p) as number));
  const ref = mode === "delta" ? limit : high;

  // Fit to the DATA, not to zero and not unconditionally to the limit. Forcing
  // either into the extent flattens the trace into a band at the top of the
  // chart — the shape you actually came to look at gets squashed out.
  const dataLo = vals.length ? Math.min(...vals) : 0;
  const dataHi = vals.length ? Math.max(...vals) : ref;
  const span = Math.max(1, dataHi - dataLo);
  // Pull the limit in only when it's near enough to be worth the vertical space
  // (live exhausts run ~32-52 °C against a 70 °C limit; including it there would
  // waste half the chart). When it's off-scale, say so at the edge instead.
  const nearRef = ref >= dataLo - span * 0.35 && ref <= dataHi + span * 0.35;
  const lo = nearRef ? Math.min(dataLo, ref) : dataLo;
  const hi = nearRef ? Math.max(dataHi, ref) : dataHi;
  const pad = Math.max(0.5, (hi - lo) * 0.12);
  const yMin = lo - pad, yMax = hi + pad;

  const t0 = window_?.start ?? 0, t1 = window_?.end ?? 1;
  const x = (t: number) => PAD_L + ((t - t0) / Math.max(1, t1 - t0)) * (W - PAD_L - PAD_R);
  const y = (v: number) => PAD_T + (1 - (v - yMin) / Math.max(0.001, yMax - yMin)) * (H - PAD_T - PAD_B);

  const hottest = shown.reduce<{ id: string; v: number }>(
    (m, s) => {
      const top = Math.max(...s.pts.map((p) => pick(p) as number));
      return top > m.v ? { id: s.unit_id, v: top } : m;
    },
    { id: "", v: -Infinity }
  );

  const ticks = [yMin, (yMin + yMax) / 2, yMax];

  // Chip labels: dropping the rack prefix is only safe when every series is from
  // ONE rack. Both racks here number their units from 1, so stripping it
  // unconditionally rendered "Unit 1".."Unit 4" twice, in different colours,
  // with nothing to tell them apart.
  const rackNames = new Set(series.map((s) => s.label.split("/")[0].trim()));
  const chipLabel = (label: string) => {
    const parts = label.split("/").map((s) => s.trim());
    if (parts.length < 2) return label;
    if (rackNames.size <= 1) return parts[1];
    return `${parts[0]} ${parts[1].replace(/^unit\s*/i, "U")}`;
  };

  return (
    <div className="card">
      <div className="hd hd-ico">
        <Icon name="show_chart" size={18} /> Trend
        <span style={{ flex: 1 }} />
        <div className="segmented tiny">
          {RANGES.map((r, i) => (
            <button key={r.label} className={`seg ${i === range ? "on" : ""}`} onClick={() => setRange(i)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bd chart-bd">
        <div className="segmented tiny" style={{ marginBottom: 10 }}>
          <button className={`seg ${mode === "delta" ? "on" : ""}`} onClick={() => setMode("delta")}>
            ΔT
          </button>
          <button className={`seg ${mode === "exhaust" ? "on" : ""}`} onClick={() => setMode("exhaust")}>
            Exhaust
          </button>
        </div>

        {err && <div className="error" role="alert">{err}</div>}

        {loading ? (
          <div className="muted small">Loading…</div>
        ) : series.length === 0 ? (
          <div className="muted small">
            {mode === "delta"
              ? "No unit has both an intake and an exhaust assigned yet, so there is no ΔT to plot. Assign the intake ports and this fills in."
              : "No exhaust history in this window."}
          </div>
        ) : (
          <>
            <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img"
                 aria-label={`${mode === "delta" ? "Delta T" : "Exhaust temperature"} over the last ${RANGES[range].label}`}>
              {ticks.map((v, i) => (
                <g key={i}>
                  <line x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)} className="ch-grid" />
                  <text x={PAD_L - 5} y={y(v) + 3.5} className="ch-tick">{v.toFixed(0)}</text>
                </g>
              ))}

              {/* the limit the alert engine actually fires on */}
              {nearRef ? (
                <>
                  <line x1={PAD_L} x2={W - PAD_R} y1={y(ref)} y2={y(ref)} className="ch-limit" />
                  <text x={W - PAD_R} y={y(ref) - 4} className="ch-limit-l" textAnchor="end">
                    limit {ref}°
                  </text>
                </>
              ) : (
                // Off-scale: still say where the limit is, or the chart silently
                // implies there isn't one.
                <text x={W - PAD_R} y={PAD_T + 7} className="ch-limit-l" textAnchor="end">
                  limit {ref}° {ref > dataHi ? "↑" : "↓"}
                </text>
              )}

              {shown.map((s) => {
                const color = SERIES_COLORS[series.findIndex((x2) => x2.unit_id === s.unit_id) % SERIES_COLORS.length];
                const d = s.pts
                  .map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(pick(p) as number).toFixed(1)}`)
                  .join(" ");
                return (
                  <path key={s.unit_id} d={d} fill="none" stroke={color}
                        strokeWidth={s.unit_id === hottest.id ? 2.2 : 1.1}
                        strokeOpacity={s.unit_id === hottest.id ? 1 : 0.55}
                        strokeLinejoin="round" strokeLinecap="round" />
                );
              })}

              <line x1={PAD_L} x2={W - PAD_R} y1={H - PAD_B} y2={H - PAD_B} className="ch-axis" />
              <text x={PAD_L} y={H - 6} className="ch-tick" textAnchor="start">
                -{RANGES[range].label}
              </text>
              <text x={W - PAD_R} y={H - 6} className="ch-tick" textAnchor="end">now</text>
            </svg>

            <div className="ch-legend">
              {series.map((s, i) => {
                const off = hidden.has(s.unit_id);
                return (
                  <button
                    key={s.unit_id}
                    className={`ch-chip ${off ? "off" : ""}`}
                    aria-pressed={!off}
                    title={`${off ? "Show" : "Hide"} ${s.label}`}
                    onClick={() => {
                      const n = new Set(hidden);
                      if (off) n.delete(s.unit_id); else n.add(s.unit_id);
                      setHidden(n);
                    }}
                  >
                    <i style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                    {chipLabel(s.label)}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
