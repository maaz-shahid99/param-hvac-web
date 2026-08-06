import { useState } from "react";
import { Link } from "react-router-dom";
import { usePoll } from "../usePoll";
import { api, autoName } from "../api";
import { AlertsCard, AttentionCard, attentionItems, fleetRollup, isOnline, tenantHighLimit, num } from "../components/Cards";
import GatewayStatus from "../components/GatewayStatus";
import ThermalMap from "../components/ThermalMap";
import DeltaTrend from "../components/DeltaTrend";
import PageHeader from "../components/PageHeader";
import Icon from "../components/Icon";

export default function DashboardPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [sensors, setSensors] = useState<any[]>([]);
  const [roster, setRoster] = useState<any[]>([]);
  const [high, setHigh] = useState(40);
  const [deltaLimit, setDeltaLimit] = useState(30);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      const [a, c, t] = await Promise.all([api.alerts("open"), api.current(), api.thresholds()]);
      setAlerts(a.alerts || []);
      setSensors(c.sensors || []);
      // Must match what the alert engine evaluates against — the tenant
      // override, not the server default. See tenantHighLimit().
      setHigh(tenantHighLimit(t));
      const tenant = (t?.thresholds || []).find((x: any) => x?.scope === "tenant");
      const d = Number(tenant?.delta_c ?? t?.defaults?.delta_c);
      setDeltaLimit(Number.isFinite(d) ? d : 30);
      setErr(null);
    } catch (e: any) {
      setErr(e.message || "Could not reach the cloud server.");
    } finally {
      setLoading(false);
    }
    // Separate try: the commissioned-device roster is what reveals a node that
    // has never reported, but an older server has no /v1/devices — and losing
    // the whole dashboard over a missing nice-to-have would be a bad trade.
    try {
      setRoster((await api.devices()).devices || []);
    } catch {/* older server: fall back to reporting-nodes only */}
  }

  usePoll(refresh, 10000);

  const ack = async (id: string) => {
    try { await api.ackAlert(id); refresh(); } catch {/* */}
  };

  // Probes and NODES are counted separately. /v1/current only contains probes
  // that have data, so dividing by its length made a dark node cancel itself out
  // of both halves of the fraction — "16 / 16 · all reporting" with a node off.
  const fleet = fleetRollup(sensors, roster);
  const dark = fleet.darkEuis;
  // "Hottest NOW" must ignore sensors that stopped reporting — otherwise a probe
  // that died an hour ago at 51 °C keeps headlining the tile indefinitely.
  const hottest = sensors
    .filter((s) => isOnline(+s.ts))
    .reduce((m, s) => Math.max(m, +s.max_c || 0), 0);
  const top = alerts[0];

  const darkTitle = dark
    .map((e) => `${autoName(e)} — ${fleet.neverReported(e) ? "has never reported" : "stopped reporting"}`)
    .join("\n");

  // Computed here as well as in the card so the hero can't contradict it.
  const darkNodes = dark.map((e) => ({
    eui: e,
    label: autoName(e),
    reason: fleet.neverReported(e) ? "commissioned but has never reported" : "stopped reporting",
  }));
  const attention = attentionItems({ sensors, highLimit: high, deltaLimit, darkNodes });


  return (
    <>
      <PageHeader title="Dashboard">
        <button className="secondary" onClick={refresh}>Refresh</button>
      </PageHeader>
      <div className="page dash">
        {err && <div className="error" role="alert">{err}</div>}
        <div className="dash-grid">
          <div className="dash-main">
            {/* Loading now renders INSIDE the layout. The old early return replaced
                the whole screen, so PageHeader — and with it the alert bell — vanished
                on every navigation to the dashboard. */}
            {loading && <div className="center-msg">Loading…</div>}

            {/* Hero — emergency when there are open alerts, calm otherwise */}
            {!loading && (top ? (
              <div className="hero">
                <h3 className="hd-ico"><Icon name="warning" size={24} fill /> {top.kind === "stale" ? "Sensor offline" : top.kind === "delta" ? "High ΔT" : "High temperature"}</h3>
                <div className="sub">{top.location || "Unmapped"}{alerts.length > 1 ? ` · +${alerts.length - 1} more open` : ""}</div>
                <div className="pills">
                  <div className="pill"><div className="k">Reading</div><div className="v2">{top.kind === "stale" ? "—" : num(top.value, 1, "°C")}</div></div>
                  <div className="pill"><div className="k">Limit</div><div className="v2">{top.kind === "stale" ? "—" : num(top.threshold, 1, "°C")}</div></div>
                  <div className="pill"><div className="k">Open alerts</div><div className="v2">{alerts.length}</div></div>
                </div>
              </div>
            ) : attention.length ? (
              // Third state. "All clear" printed above a list of three things
              // needing attention is exactly the sort of self-contradiction this
              // dashboard keeps getting fixed for — nothing has crossed a limit,
              // but that is not the same as nothing being wrong.
              <div className="hero watch">
                <h3 className="hd-ico"><Icon name="visibility" size={24} fill /> Nothing alarming</h3>
                <div className="sub">
                  No limit has been crossed, but {attention.length} thing{attention.length === 1 ? "" : "s"} need
                  {attention.length === 1 ? "s" : ""} a look.
                </div>
              </div>
            ) : (
              <div className="hero calm">
                <h3 className="hd-ico"><Icon name="task_alt" size={24} fill /> All clear</h3>
                <div className="sub">No open alerts — every rack is within limits.</div>
              </div>
            ))}

            {/* Daily insights tiles */}
            <div className="stats">
              <Stat label="Open alerts" value={`${alerts.length}`} chip="pink" icon="notifications"
                delta={alerts.length ? { dir: "down", text: "needs attention" } : { dir: "up", text: "all clear" }} />
              {/* The headline stays the PROBE count — honest, and all of them really
                  are live. A node that has never reported has no known probe count
                  (ROMs are discovered from readings), so it can only be surfaced at
                  node level, in the subtitle. */}
              <Stat
                label="Sensors online"
                value={`${fleet.probesOnline}`}
                unit={`/ ${fleet.probesTotal}`}
                chip={dark.length ? "amber" : "green"}
                icon="sensors"
                to="/devices"
                title={dark.length ? darkTitle : undefined}
                delta={
                  dark.length
                    ? { dir: "down", text: `${dark.length} node${dark.length === 1 ? "" : "s"} not reporting` }
                    : { dir: "up", text: `all ${fleet.nodesTotal} node${fleet.nodesTotal === 1 ? "" : "s"} reporting` }
                }
              />
              <Stat label="Hottest now" value={hottest ? hottest.toFixed(1) : "—"} unit={hottest ? "°C" : ""} chip="amber" icon="thermostat"
                delta={{ dir: hottest >= high ? "down" : "flat", text: hottest >= high ? "over limit" : "within limit" }} />
            </div>

            <GatewayStatus />
            <AlertsCard alerts={alerts} onAck={ack} />
            {/* Exceptions, not an inventory. This slot used to hold a 16-row
                table of every probe — the same readings the thermal map beside
                it already shows, and the same table Environment & Logs shows in
                full. A dashboard's job is "is anything wrong", so it now lists
                only what someone would act on. */}
            <AttentionCard sensors={sensors} highLimit={high} deltaLimit={deltaLimit} darkNodes={darkNodes} />
          </div>

          {/* Right rail — fills the space `.page`'s max-width used to leave empty
              on a desktop. Stacks under the main column below 1280px. */}
          <aside className="dash-rail">
            <ThermalMap />
            <DeltaTrend />
          </aside>
        </div>
      </div>
    </>
  );
}

function Stat({
  label, value, unit, chip, icon, delta, to, title,
}: {
  label: string; value: string; unit?: string; chip: string; icon: string;
  delta: { dir: "up" | "down" | "flat"; text: string };
  /** Optional destination — a tile reporting a problem should lead somewhere. */
  to?: string;
  title?: string;
}) {
  const arrow = delta.dir === "up" ? "trending_up" : delta.dir === "down" ? "trending_down" : "trending_flat";
  const body = (
    <>
      <div className="stat-top">
        <span className="l">{label}</span>
        <span className={`iconwrap ${chip}`}><Icon name={icon} size={20} /></span>
      </div>
      <div className="v">{value}{unit ? <span className="u">{unit}</span> : null}</div>
      <div className={`delta ${delta.dir} hd-ico`}><Icon name={arrow} size={15} /> {delta.text}</div>
    </>
  );
  if (to) {
    return (
      <Link className="stat statlink" to={to} title={title} aria-label={`${label}: ${value}${unit || ""} — ${delta.text}`}>
        {body}
      </Link>
    );
  }
  return <div className="stat" title={title}>{body}</div>;
}
