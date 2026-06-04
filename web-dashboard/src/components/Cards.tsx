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
