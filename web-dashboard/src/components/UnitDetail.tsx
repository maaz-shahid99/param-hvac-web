import { useEffect, useState } from "react";
import { api, ApiError, autoName } from "../api";
import Icon from "./Icon";
import { ago, deltaColor, nowSec, num, tempColor } from "./Cards";

/**
 * Detail for one rack unit, opened by clicking it on the Visualization page.
 *
 * Fills the space the fixed-width racks used to waste with something worth
 * having: what the two sides of this unit are actually doing over time, and
 * which physical probe each reading came from.
 */

export type SelectedPort = {
  label: string;
  side: "intake" | "exhaust";
  eui: string;
  rom: string;
  temp: number | null;
  ts: number;
  online: boolean;
};

export type SelectedUnit = {
  unitId: string;
  rack: string;
  unit: string;
  ports: SelectedPort[];
};

type Point = { t: number; intake: number | null; exhaust: number | null; delta: number | null };

const RANGES = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
];

const W = 340, H = 130, PAD_L = 28, PAD_R = 8, PAD_T = 10, PAD_B = 18;

export default function UnitDetail({
  sel,
  deltaLimit,
  highLimit,
  ambient,
  onClose,
}: {
  sel: SelectedUnit;
  deltaLimit: number;
  highLimit: number;
  /** Router/gateway BME sample. Humidity, pressure and VOC are measured there,
   *  NOT inside a rack unit — the probes are DS18B20, temperature only — so it
   *  is presented as room context and labelled as such. */
  ambient?: { name?: string; eui?: string; temp?: number; hum?: number; pres?: number; voc?: number; ts?: number };
  onClose: () => void;
}) {
  const [range, setRange] = useState(1);
  const [points, setPoints] = useState<Point[]>([]);
  const [win, setWin] = useState<{ start: number; end: number } | null>(null);
  const [loading, setLoading] = useState(true);
  // The bundle and the server deploy separately; against a server that predates
  // /v1/readings/series the panel still has to be useful, so the chart hides and
  // everything else stays.
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const s = await api.readingsSeries(RANGES[range].hours, 90);
        if (cancelled) return;
        const u = (s.units || []).find((x: any) => x.unit_id === sel.unitId);
        setPoints(u?.points || []);
        setWin({ start: s.start, end: s.end });
        setUnsupported(false);
      } catch (e: any) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) setUnsupported(true);
        setPoints([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range, sel.unitId]);

  const intake = sel.ports.filter((p) => p.side === "intake");
  const exhaust = sel.ports.filter((p) => p.side === "exhaust");
  const hottest = (ps: SelectedPort[]) =>
    ps.reduce<SelectedPort | null>((m, p) => (p.online && (!m || (p.temp ?? -Infinity) > (m.temp ?? -Infinity)) ? p : m), null);
  const inP = hottest(intake);
  const outP = hottest(exhaust);
  const delta = inP?.temp != null && outP?.temp != null ? outP.temp - inP.temp : null;

  // Chart geometry — fit to data, include neither zero nor the limit, so the
  // two traces use the full height (the dashboard chart had to learn this too).
  const vals = points.flatMap((p) => [p.intake, p.exhaust].filter((v): v is number => v != null));
  const lo = vals.length ? Math.min(...vals) : 0;
  const hi = vals.length ? Math.max(...vals) : 1;
  const pad = Math.max(0.5, (hi - lo) * 0.12);
  const yMin = lo - pad, yMax = hi + pad;
  const t0 = win?.start ?? 0, t1 = win?.end ?? 1;
  const x = (t: number) => PAD_L + ((t - t0) / Math.max(1, t1 - t0)) * (W - PAD_L - PAD_R);
  const y = (v: number) => PAD_T + (1 - (v - yMin) / Math.max(0.001, yMax - yMin)) * (H - PAD_T - PAD_B);
  const path = (key: "intake" | "exhaust") => {
    const pts = points.filter((p) => p[key] != null);
    return pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p[key] as number).toFixed(1)}`).join(" ");
  };
  // Shade between the two traces: the gap IS the ΔT.
  const band = (() => {
    const pts = points.filter((p) => p.intake != null && p.exhaust != null);
    if (pts.length < 2) return "";
    const top = pts.map((p) => `${x(p.t).toFixed(1)},${y(p.exhaust as number).toFixed(1)}`);
    const bot = pts.slice().reverse().map((p) => `${x(p.t).toFixed(1)},${y(p.intake as number).toFixed(1)}`);
    return `M${top.join(" L")} L${bot.join(" L")} Z`;
  })();
  const hasChart = !unsupported && points.length > 1;

  function side(p: SelectedPort | null, ps: SelectedPort[], label: string) {
    if (ps.length === 0) return <div className="udet-side"><div className="t" style={{ color: "var(--faint)" }}>—</div><div className="l">no {label} port</div></div>;
    if (!p) return <div className="udet-side"><div className="t" style={{ color: "var(--faint)" }}>·</div><div className="l">{label} not assigned</div></div>;
    return (
      <div className="udet-side">
        <div className="t" style={{ color: tempColor(p.temp as number) }}>{(p.temp as number).toFixed(1)}°</div>
        <div className="l">{label}</div>
      </div>
    );
  }

  return (
    <div className="card udet">
      <div className="hd hd-ico">
        <span className="hd-ico"><Icon name="dns" size={17} /> {sel.rack} / {sel.unit}</span>
        <button className="iconbtn" aria-label="Close details" onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
      </div>

      <div className="udet-sides">
        {side(inP, intake, "intake")}
        <div className="udet-arrow">
          <Icon name="east" size={18} />
          {delta != null ? (
            <b style={{ color: deltaColor(delta, deltaLimit) }}>+{delta.toFixed(1)}</b>
          ) : (
            <span>ΔT —</span>
          )}
        </div>
        {side(outP, exhaust, "exhaust")}
      </div>

      <div className="bd small muted" style={{ paddingTop: 0 }}>
        {delta != null
          ? `${Math.round((delta / (deltaLimit || 30)) * 100)}% of the ${deltaLimit}° ΔT limit${
              outP?.temp != null ? ` · exhaust ${Math.round(((outP.temp as number) / (highLimit || 70)) * 100)}% of ${highLimit}°` : ""
            }`
          : intake.length === 0
            ? "This unit has no intake port, so no rise can be measured across it."
            : "ΔT needs both sides assigned and reporting."}
      </div>

      {/* Chart */}
      <div className="bd" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="segmented tiny" style={{ marginBottom: 10 }}>
          {RANGES.map((r, i) => (
            <button key={r.label} className={`seg ${i === range ? "on" : ""}`} onClick={() => setRange(i)}>
              {r.label}
            </button>
          ))}
        </div>
        {unsupported ? (
          <div className="small muted">History needs a newer cloud server than this one.</div>
        ) : loading ? (
          <div className="small muted">Loading history…</div>
        ) : !hasChart ? (
          <div className="small muted">No history for this unit in the last {RANGES[range].label}.</div>
        ) : (
          <>
            <svg className="udet-chart" viewBox={`0 0 ${W} ${H}`} role="img"
                 aria-label={`Intake and exhaust temperature for ${sel.unit} over the last ${RANGES[range].label}`}>
              {[yMin, (yMin + yMax) / 2, yMax].map((v, i) => (
                <g key={i}>
                  <line x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)} className="uc-grid" />
                  <text x={PAD_L - 5} y={y(v) + 3.5} className="uc-tick">{v.toFixed(0)}</text>
                </g>
              ))}
              {band && <path d={band} className="uc-band" />}
              <path d={path("intake")} className="uc-in" />
              <path d={path("exhaust")} className="uc-out" />
              <text x={PAD_L} y={H - 5} className="uc-tick" textAnchor="start">−{RANGES[range].label}</text>
              <text x={W - PAD_R} y={H - 5} className="uc-tick" textAnchor="end">now</text>
            </svg>
            <div className="ch-legend small muted" style={{ display: "flex", gap: 14 }}>
              <span className="hm-key"><i style={{ width: 12, height: 2, background: "#4f7fd0" }} /> intake</span>
              <span className="hm-key"><i style={{ width: 12, height: 2, background: "#e0653f" }} /> exhaust</span>
              <span className="hm-key">shaded = ΔT</span>
            </div>
          </>
        )}
      </div>

      {/* Which physical probe each side is */}
      {[...intake, ...exhaust].map((p, i) => (
        <div className="udet-probe" key={`${p.eui}-${p.rom || i}`}>
          <div className="k">{p.label || p.side}</div>
          {p.eui ? (
            <>
              <div className="v">{autoName(p.eui)} · {p.online ? `${(p.temp as number).toFixed(1)}°` : "offline"}</div>
              <div className="m mono">
                {p.eui}{p.rom ? ` · probe …${p.rom.slice(-6)}` : ""}
                {p.ts ? ` · ${ago(nowSec() - p.ts)}` : ""}
              </div>
            </>
          ) : (
            <div className="v muted">No sensor assigned — set one under Rack Layout.</div>
          )}
        </div>
      ))}

      {/* Room air. Explicitly not a property of this unit. */}
      {ambient && (
        <div className="udet-probe">
          <div className="k">Room air ({ambient.name || autoName(ambient.eui || "", "gateway")})</div>
          <div className="v">
            {num(ambient.temp, 1, "°C")} · {num(ambient.hum, 0, "% RH")} · {num(ambient.pres, 0, " hPa")}
          </div>
          <div className="m">
            Measured at the gateway BME, not inside this unit — the rack probes read temperature only.
          </div>
        </div>
      )}
    </div>
  );
}
