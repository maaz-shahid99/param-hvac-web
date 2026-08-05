import Icon from "./Icon";

// Cloud-only freshness window (no live BLE fallback here). Sensors forward ~every
// 10s, so 60s = ~6 missed forwards: responsive (offline within ~70s incl. the 10s
// poll) yet still tolerant of a brief Wi-Fi hiccup. Raise it if you see flicker.
export const STALE_SECONDS = 60;

export function nowSec() {
  return Date.now() / 1000;
}
export function ago(s: number): string {
  // Clamp: these ages come from comparing a SERVER timestamp against the
  // BROWSER's clock, and the appliance's clock currently runs ~35s ahead — so a
  // fresh reading rendered as "-26s ago". Never show a negative age.
  if (!Number.isFinite(s) || s < 0) s = 0;
  if (s < 5) return "just now";
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
export function isOnline(ts: number) {
  return nowSec() - ts < STALE_SECONDS;
}

/**
 * Copy text to the clipboard, with a fallback for insecure origins.
 *
 * `navigator.clipboard` is undefined unless the page is a secure context, and
 * this appliance is served over plain http — so the modern API silently isn't
 * there. Returns whether the copy actually happened, so the caller can confirm
 * or fall back to showing the value.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Format a number that came from unvalidated JSON. Returns an em dash rather
 * than "NaN" or throwing, so a null reading degrades to "—" instead of taking
 * the page down (a bare `.toFixed()` on a null threw a TypeError, and with no
 * error boundary that blanked the whole app).
 */
export function num(v: unknown, digits = 1, unit = ""): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}${unit}`;
}

/**
 * The high-temperature limit that alerts ACTUALLY fire on, from a /v1/thresholds
 * response: the tenant override if one exists, else the server default.
 *
 * Both temperature cards used to colour against `defaults.high_c` while the
 * threshold engine evaluated against the tenant override. With a default of 40
 * and an override of 70 that painted probes at 41–53 °C bright red with no alert
 * firing; flip the values and it silently paints them green WHILE alerting.
 * Either way the dashboard contradicted the alarm.
 */
export function tenantHighLimit(thresholds: any): number {
  const def = Number(thresholds?.defaults?.high_c);
  const tenant = (thresholds?.thresholds || []).find((x: any) => x?.scope === "tenant");
  const v = Number(tenant?.high_c);
  if (Number.isFinite(v)) return v;
  return Number.isFinite(def) ? def : 40;
}

// --- ordering helpers -------------------------------------------------------
// Layout data is authored in creation order, which reads as random once a rack
// has a few units. These give every list the same physical ordering: racks
// alphabetically, units by number (Unit 2 before Unit 10, which a plain string
// sort gets wrong), and intake before exhaust so airflow reads left-to-right.

/** String compare that treats embedded digits as numbers: "Unit 2" < "Unit 10". */
export function naturalCompare(a: string, b: string): number {
  const ax = (a || "").toLowerCase().match(/(\d+|\D+)/g) || [];
  const bx = (b || "").toLowerCase().match(/(\d+|\D+)/g) || [];
  for (let i = 0; i < Math.max(ax.length, bx.length); i++) {
    const x = ax[i], y = bx[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (/^\d/.test(x) && /^\d/.test(y)) {
      const d = parseInt(x, 10) - parseInt(y, 10);
      if (d) return d;
    } else {
      const c = x.localeCompare(y);
      if (c) return c;
    }
  }
  return 0;
}

/** Intake sorts before exhaust — air comes in, then goes out. */
export function portRank(s: string): number {
  return /exhaust/i.test(s || "") ? 1 : 0;
}

/** Order a "Rack / Unit 2 / Exhaust 1" location: rack alphabetical, unit by
 *  number, then intake before exhaust. */
export function compareLocation(a: string, b: string): number {
  const A = (a || "").split("/").map((s) => s.trim());
  const B = (b || "").split("/").map((s) => s.trim());
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const x = A[i] ?? "", y = B[i] ?? "";
    if (i === 2) {                       // the port segment
      const r = portRank(x) - portRank(y);
      if (r) return r;
    }
    const c = naturalCompare(x, y);
    if (c) return c;
  }
  return 0;
}

// Temperature -> colour ramp (blue -> green -> amber -> red).
export function tempColor(t: number): string {
  const stops: [number, [number, number, number]][] = [
    [15, [90, 140, 210]],
    [28, [80, 180, 120]],
    [40, [235, 180, 50]],
    [55, [230, 90, 70]],
  ];
  if (t <= stops[0][0]) return rgb(stops[0][1]);
  if (t >= stops[stops.length - 1][0]) return rgb(stops[stops.length - 1][1]);
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i];
    const [b, cb] = stops[i + 1];
    if (t >= a && t <= b) {
      const k = (t - a) / (b - a);
      return rgb([
        Math.round(ca[0] + (cb[0] - ca[0]) * k),
        Math.round(ca[1] + (cb[1] - ca[1]) * k),
        Math.round(ca[2] + (cb[2] - ca[2]) * k),
      ]);
    }
  }
  return rgb(stops[0][1]);
}
function rgb(c: [number, number, number]) {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/**
 * ΔT -> colour, scored against the tenant's own delta limit rather than an
 * absolute temperature. A 14 °C rise is healthy where the limit is 30 and
 * alarming where it's 15, so the ramp has to be relative or it contradicts the
 * alert engine — the same mistake `tenantHighLimit` exists to prevent.
 */
export function deltaColor(d: number, limit: number): string {
  const lim = Number.isFinite(limit) && limit > 0 ? limit : 30;
  const k = d / lim;
  if (k >= 1) return "rgb(230,90,70)";      // at or over the limit: alerting
  if (k >= 0.75) return "rgb(235,180,50)";  // closing in
  if (k >= 0.4) return "rgb(120,175,110)";
  return "rgb(90,140,210)";                 // barely any rise across the unit
}

/**
 * Fleet totals for the "Sensors online" tile.
 *
 * The tile used to divide by the number of rows in /v1/current, which is built
 * from `SELECT DISTINCT eui FROM readings` — so a commissioned node that has
 * never reported (or whose data aged out) drops out of the numerator AND the
 * denominator together, and the fraction can never expose it. That is how
 * "16 / 16 · all reporting" was rendered while a whole node sat dark.
 *
 * Probes and nodes are counted separately on purpose: probe ROMs are discovered
 * from readings, so the server genuinely does not know how many probes a node
 * that has never reported has. Only the node itself can be counted.
 */
export function fleetRollup(currentRows: any[], roster: any[]) {
  const probesTotal = currentRows.length;
  const probesOnline = currentRows.filter((s) => isOnline(+s.ts)).length;

  // newest ts per EUI seen in /v1/current
  const seen = new Map<string, number>();
  for (const s of currentRows) {
    const eui = String(s.eui || "").toLowerCase();
    if (!eui) continue;
    const ts = Number(s.ts) || 0;
    if (ts >= (seen.get(eui) ?? -Infinity)) seen.set(eui, ts);
  }
  // Nodes = commissioned sensors UNION whatever is actually reporting, so this
  // stays right whether the roster is stale or the device predates it.
  const nodes = new Set<string>(seen.keys());
  for (const d of roster || []) {
    if (String(d?.kind ?? "sensor") !== "sensor") continue;
    const eui = String(d?.eui || "").toLowerCase();
    if (eui) nodes.add(eui);
  }
  const darkEuis = [...nodes].filter((e) => {
    const ts = seen.get(e);
    return ts === undefined || !isOnline(ts);
  }).sort();

  return {
    probesOnline,
    probesTotal,
    nodesTotal: nodes.size,
    nodesReporting: nodes.size - darkEuis.length,
    darkEuis,
    /** true when a dark node has never sent anything at all, vs went quiet. */
    neverReported: (eui: string) => !seen.has(eui),
  };
}

// Hotter sensor -> faster fan. Returns seconds per revolution.
export function tempSpinSeconds(t: number): number {
  const lo = 18, hi = 55, slow = 2.6, fast = 0.5;
  const k = Math.max(0, Math.min(1, (t - lo) / (hi - lo)));
  return slow + (fast - slow) * k;
}

const KIND_META: Record<string, { icon: string; label: string }> = {
  high_temp: { icon: "local_fire_department", label: "High temperature" },
  delta: { icon: "swap_horiz", label: "High ΔT" },
  stale: { icon: "sensors_off", label: "Sensor offline" },
};

export function AlertsCard({
  alerts,
  onAck,
}: {
  alerts: any[];
  onAck: (id: string) => void;
}) {
  return (
    <div className="card">
      <div className="hd hd-ico"><Icon name="notifications_active" size={18} fill /> Open alerts</div>
      {alerts.length === 0 ? (
        <div className="bd muted">No open alerts. All racks within limits.</div>
      ) : (
        alerts.map((a) => {
          const acked = a.state === "acked";
          const meta = KIND_META[a.kind] || { icon: "warning", label: a.kind };
          // Only "stale" was special-cased, so any other alert with a missing
          // value rendered "NaN°C (limit NaN°C)" in the most prominent element
          // on the page. num() degrades to an em dash instead.
          const sub =
            a.kind === "stale"
              ? "Sensor stopped reporting"
              : `${num(a.value, 1, "°C")} (limit ${num(a.threshold, 1, "°C")})`;
          return (
            <div className="row" key={a.id}>
              <div className="btnrow">
                <span className="iconwrap pink"><Icon name={meta.icon} size={20} /></span>
                <div>
                  <div>{a.location || "(unmapped)"}</div>
                  <div className="small muted">{meta.label} · {sub}</div>
                </div>
              </div>
              {acked ? (
                <span className="badge grey">acked</span>
              ) : (
                <button className="ghost" onClick={() => onAck(a.id)}>
                  <Icon name="check" size={16} /> ACK
                </button>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

export function LiveTempsCard({
  sensors,
  highLimit,
}: {
  sensors: any[];
  highLimit: number;
}) {
  return (
    <div className="card">
      <div className="hd hd-ico"><Icon name="thermostat" size={18} /> Live temperatures</div>
      {sensors.length === 0 ? (
        <div className="bd muted">No readings yet. Once the gateway posts, sensors appear here.</div>
      ) : (
        sensors.map((s, i) => {
          // Per-probe temperature when present (cloud /v1/current expands per probe);
          // falls back to the sensor's hottest probe for legacy rows.
          const temp = s.temp != null ? +s.temp : s.max_c != null ? +s.max_c : NaN;
          const ok = Number.isFinite(temp);
          const t = nowSec() - +s.ts;
          const loc = s.location || s.eui;
          return (
            <div className="row" key={`${s.eui}-${s.rom || i}`}>
              <div className="btnrow">
                <b style={{ color: ok && temp >= highLimit ? "var(--red)" : ok ? tempColor(temp) : "var(--faint)", minWidth: 56 }}>
                  {ok ? `${temp.toFixed(1)}°` : "—"}
                </b>
                <div>
                  <div>{loc}</div>
                  <div className="small muted mono">{s.eui}</div>
                </div>
              </div>
              <span className="small muted">
                {/* A missing ts made t NaN, and ago(NaN) falls through every
                    comparison to render the literal "NaNd ago". */}
                {Number.isFinite(t) ? ago(t) : "no timestamp"}
                {s.slot ? ` · slot ${s.slot}` : ""}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}
