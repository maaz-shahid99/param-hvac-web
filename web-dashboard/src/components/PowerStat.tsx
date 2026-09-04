import { useCallback, useState } from "react";
import { usePoll } from "../usePoll";
import { api } from "../api";
import Icon from "./Icon";

/**
 * Mains-power tile for the dashboard's stats row.
 *
 * A battery-backed sensor on the live wire joins the mesh like any other node
 * and is commissioned with kind "power". Two INDEPENDENT facts come out of that,
 * and conflating them is the one way to make this tile lie:
 *
 *   1. Is the sensor reachable?  -> its own online/last_seen, same as any node
 *   2. Is the mains live?        -> an open `power_lost` alert means it is not
 *
 * So there are three states, not two. "Mains Live" is only claimed when a live
 * sensor is actually saying so. A silent sensor means we do not know — printing
 * "Mains Live" because nobody told us otherwise would be the most dangerous
 * thing this tile could do, and it is exactly what a two-state version does.
 *
 * `alerts` is passed in rather than fetched: DashboardPage already polls
 * /v1/alerts, and a second poller for the same data would double the requests
 * and could disagree with the hero card beside it.
 */
export default function PowerStat({ alerts }: { alerts: any[] }) {
  const [sensor, setSensor] = useState<{ online: boolean } | null>(null);
  const [known, setKnown] = useState(false);

  const poll = useCallback(async () => {
    try {
      // Commissioned roster tells us the sensor EXISTS; the mesh roster tells us
      // whether it is currently reporting.
      const [rosterRes, meshRes] = await Promise.all([
        api.devices().catch(() => ({ devices: [] })),
        api.routers().catch(() => ({ routers: [] })),
      ]);
      const roster = (rosterRes as any).devices || [];
      const mesh = (meshRes as any).routers || [];
      const euis = new Set(
        roster
          .filter((d: any) => String(d.kind) === "power")
          .map((d: any) => String(d.eui).toLowerCase())
      );
      for (const r of mesh) {
        if (String(r.kind) === "power") euis.add(String(r.eui).toLowerCase());
      }
      if (euis.size === 0) {
        setSensor(null);
      } else {
        const live = mesh.some(
          (r: any) => euis.has(String(r.eui).toLowerCase()) && !!r.online
        );
        setSensor({ online: live });
      }
      setKnown(true);
    } catch {
      // Hold the last state rather than inventing one.
    }
  }, []);

  usePoll(poll, 30000);

  const outage = alerts.some((a) => a?.kind === "power_lost" && !a?.cleared_at);

  let value: string;
  let chip: string;
  let dir: "up" | "down" | "flat";
  let text: string;
  let title: string;

  if (outage) {
    // An open alert is a positive report of loss — trust it even if the sensor
    // has since gone quiet (a dying battery mid-outage must not read as "fine").
    value = "Mains Offline";
    chip = "pink";
    dir = "down";
    text = "no mains supply";
    title = "The power sensor reported loss of mains supply.";
  } else if (!known) {
    value = "…";
    chip = "amber";
    dir = "flat";
    text = "checking";
    title = "Reading power sensor status.";
  } else if (!sensor) {
    value = "—";
    chip = "amber";
    dir = "flat";
    text = "no sensor";
    title = "No power sensor is commissioned on this site.";
  } else if (!sensor.online) {
    value = "Unknown";
    chip = "amber";
    dir = "flat";
    text = "sensor offline";
    title =
      "The power sensor is not reporting, so the mains state can't be confirmed.";
  } else {
    value = "Mains Live";
    chip = "green";
    dir = "up";
    text = "supply healthy";
    title = "The power sensor reports mains supply present.";
  }

  const arrow =
    dir === "up" ? "trending_up" : dir === "down" ? "trending_down" : "trending_flat";

  // Markup mirrors DashboardPage's local <Stat>. Deliberately duplicated rather
  // than imported: this component is rendered BY that page, so importing from it
  // would be a circular import.
  return (
    <div className="stat" title={title}>
      <div className="stat-top">
        <span className="l">Power</span>
        <span className={`iconwrap ${chip}`}>
          <Icon name={outage ? "power_off" : "bolt"} size={20} />
        </span>
      </div>
      <div className="v">{value}</div>
      <div className={`delta ${dir} hd-ico`}>
        <Icon name={arrow} size={15} /> {text}
      </div>
    </div>
  );
}
