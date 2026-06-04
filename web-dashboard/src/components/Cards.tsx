export const STALE_SECONDS = 180;

export function nowSec() {
  return Date.now() / 1000;
}
export function ago(s: number): string {
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
export function isOnline(ts: number) {
  return nowSec() - ts < STALE_SECONDS;
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

// Hotter sensor -> faster fan. Returns seconds per revolution.
export function tempSpinSeconds(t: number): number {
  const lo = 18, hi = 55, slow = 2.6, fast = 0.5;
  const k = Math.max(0, Math.min(1, (t - lo) / (hi - lo)));
  return slow + (fast - slow) * k;
}

const KIND_LABEL: Record<string, string> = {
  high_temp: "🔥 High temperature",
  delta: "↔ High ΔT",
  stale: "📴 Sensor offline",
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
      <div className="hd">🔔 Open alerts</div>
      {alerts.length === 0 ? (
        <div className="bd muted">No open alerts. All racks within limits.</div>
      ) : (
        alerts.map((a) => {
          const acked = a.state === "acked";
          const sub =
            a.kind === "stale"
              ? "Sensor stopped reporting"
              : `${(+a.value).toFixed(1)}°C (limit ${(+a.threshold).toFixed(1)}°C)`;
          return (
            <div className="row" key={a.id}>
              <div>
                <div>{a.location || "(unmapped)"}</div>
                <div className="small muted">
                  {KIND_LABEL[a.kind] || a.kind} · {sub}
                </div>
              </div>
              {acked ? (
                <span className="badge grey">acked</span>
              ) : (
                <button className="ghost" onClick={() => onAck(a.id)}>
                  ACK
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
      <div className="hd">🌡️ Live temperatures</div>
      {sensors.length === 0 ? (
        <div className="bd muted">No readings yet. Once the gateway posts, sensors appear here.</div>
      ) : (
        sensors.map((s) => {
          const maxc = +s.max_c;
          const t = nowSec() - +s.ts;
          const loc = s.location || s.eui;
          return (
            <div className="row" key={s.eui}>
              <div className="btnrow">
                <b style={{ color: maxc >= highLimit ? "var(--red)" : "var(--text)", minWidth: 56 }}>
                  {maxc.toFixed(1)}°
                </b>
                <div>
                  <div>{loc}</div>
                  <div className="small muted mono">{s.eui}</div>
                </div>
              </div>
              <span className="small muted">
                {ago(t)} · slot {s.slot}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}
