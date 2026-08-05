import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import Icon from "./Icon";
import { deltaColor, naturalCompare, tempColor, tenantHighLimit } from "./Cards";

/**
 * History as a time heatmap: one row per unit, one column per time bucket,
 * colour = temperature (or ΔT).
 *
 * This replaced a multi-series line chart. Line and slope charts stop working
 * somewhere around 15 series — lines overlap, labels collide — and this site
 * already has 12 units in Exhaust mode, which is exactly what it looked like.
 * A heatmap is flat in the number of series, and it answers the question an
 * operator actually has: is this hotspot PERSISTENT or a transient spike?
 * A solid dark band reads differently from a speckled one at a glance.
 *
 * Hand-rolled: the project ships no charting library and the appliance runs on
 * a closed network over plain http (the icon font is bundled locally for the
 * same reason), so a CDN chart dependency would simply fail to resolve.
 */

type Point = { t: number; intake: number | null; exhaust: number | null; delta: number | null };
type Unit = { unit_id: string; label: string; has_intake: boolean; has_exhaust: boolean; points: Point[] };

const RANGES = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
];
const COLS = 48;   // ~8px cells in a 400px rail — dense enough to read, coarse enough to see

export default function DeltaTrend() {
  const [range, setRange] = useState(1);                   // default 6h
  const [mode, setMode] = useState<"delta" | "exhaust">("exhaust");
  const [units, setUnits] = useState<Unit[]>([]);
  const [win, setWin] = useState<{ start: number; end: number; bucket: number } | null>(null);
  const [limit, setLimit] = useState(30);
  const [high, setHigh] = useState(70);
  const [loading, setLoading] = useState(true);
  // The bundle and the server deploy separately, so a dashboard can legitimately
  // be talking to a server that predates this endpoint. Hide rather than show a
  // red error the operator can do nothing about.
  const [unsupported, setUnsupported] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [s, th] = await Promise.all([
          api.readingsSeries(RANGES[range].hours, COLS),
          api.thresholds().catch(() => null),
        ]);
        if (cancelled) return;
        setUnits(s.units || []);
        setWin({ start: s.start, end: s.end, bucket: s.bucket_s });
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

  // Bucket -> column. The endpoint omits empty buckets, so build a dense row and
  // leave real gaps blank rather than closing them up, which would silently
  // compress an outage into looking like continuous data.
  const rows = units
    .filter((u) => (mode === "delta" ? u.has_intake && u.has_exhaust : u.has_exhaust))
    .map((u) => {
      const cells: (number | null)[] = new Array(COLS).fill(null);
      if (win) {
        for (const p of u.points) {
          const v = pick(p);
          if (v == null) continue;
          const i = Math.max(0, Math.min(COLS - 1, Math.floor((p.t - win.start) / win.bucket)));
          cells[i] = v;
        }
      }
      const seen = cells.filter((c): c is number => c != null);
      return { ...u, cells, peak: seen.length ? Math.max(...seen) : -Infinity };
    })
    .filter((u) => u.peak > -Infinity)
    .sort((a, b) => b.peak - a.peak || naturalCompare(a.label, b.label));

  const rackNames = new Set(rows.map((r) => r.label.split("/")[0].trim()));
  const shortLabel = (label: string) => {
    const parts = label.split("/").map((s) => s.trim());
    if (parts.length < 2) return label;
    const u = parts[1].replace(/^unit\s*/i, "U");
    return rackNames.size <= 1 ? u : `${parts[0]} ${u}`;
  };

  const colorOf = (v: number) => (mode === "delta" ? deltaColor(v, limit) : tempColor(v));
  const over = (v: number) => (mode === "delta" ? v >= limit : v >= high);

  return (
    <div className="card">
      <div className="hd hd-ico">
        <Icon name="calendar_view_week" size={18} /> Trend
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
          <button className={`seg ${mode === "exhaust" ? "on" : ""}`} onClick={() => setMode("exhaust")}>
            Exhaust
          </button>
          <button className={`seg ${mode === "delta" ? "on" : ""}`} onClick={() => setMode("delta")}>
            ΔT
          </button>
        </div>

        {err && <div className="error" role="alert">{err}</div>}

        {loading ? (
          <div className="muted small">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="muted small">
            {mode === "delta"
              ? "No unit has both an intake and an exhaust assigned, so there is no ΔT history to show. Assign the intake ports and this fills in."
              : "No exhaust history in this window."}
          </div>
        ) : (
          <>
            <div className="tmap">
              {rows.map((r) => (
                <div className="tmap-row" key={r.unit_id}>
                  <span className="tmap-lbl" title={r.label}>{shortLabel(r.label)}</span>
                  <span className="tmap-cells" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
                    {r.cells.map((v, i) => (
                      <i
                        key={i}
                        className={`tmap-c ${v == null ? "gap" : over(v) ? "over" : ""}`}
                        style={v == null ? undefined : { background: colorOf(v) }}
                        title={
                          v == null
                            ? "no data in this interval"
                            : `${r.label}\n${mode === "delta" ? `ΔT +${v.toFixed(1)}` : `${v.toFixed(1)} °C`}`
                        }
                      />
                    ))}
                  </span>
                  <b className="tmap-peak" style={{ color: colorOf(r.peak) }} title="peak in this window">
                    {mode === "delta" ? `+${r.peak.toFixed(0)}` : `${r.peak.toFixed(0)}°`}
                  </b>
                </div>
              ))}
              <div className="tmap-row tmap-axis small muted">
                <span />
                <span className="tmap-cells span">
                  <em>−{RANGES[range].label}</em>
                  <em>now</em>
                </span>
                <span />
              </div>
            </div>

            <div className="tmap-legend small muted">
              <span className="hm-key">
                cool <i className="grad" style={mode === "delta" ? { background: "linear-gradient(90deg,#5a8cd2,#78af6e,#ebb432,#e65a46)" } : undefined} /> hot
              </span>
              <span className="hm-key">
                <i className="tmap-c over legend" /> over {mode === "delta" ? `${limit}° ΔT` : `${high}°`}
              </span>
              <span className="hm-key"><i className="tmap-c gap legend" /> no data</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
