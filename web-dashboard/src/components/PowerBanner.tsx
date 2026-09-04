import { useCallback, useState } from "react";
import { usePoll } from "../usePoll";
import { api } from "../api";
import { useAuth } from "../auth";
import Icon from "./Icon";

/** One alert row from GET /v1/alerts. */
type Alert = {
  id: string;
  kind: string;
  state: string;
  location?: string | null;
  opened_at: number; // SERVER epoch seconds
  cleared_at?: number | null;
};

/** The kind the server raises when the mains-power sensor reports 0. */
const POWER_KIND = "power_lost";

/**
 * Site-wide mains-power banner.
 *
 * A battery-backed sensor on the live wire reports 0/1; the server opens a
 * `power_lost` alert on 0 and clears it on 1. This is the in-dashboard half of
 * that — the email is the part that actually reaches an admin who isn't looking
 * at a screen.
 *
 * Deliberately NOT a tile in the sensor grid: mains power is a site-wide fact,
 * not a rack reading. It has no trend, no threshold and no per-unit meaning, and
 * burying it among the temperature tiles would hide the single most urgent
 * signal the system can produce. It sits at the top of the shell, on every page.
 *
 * Renders nothing while power is fine, so it is safe to mount app-wide — and
 * nothing at all until the server actually knows this alert kind, which is why
 * it can ship before the hardware exists.
 */
export default function PowerBanner() {
  const { status } = useAuth();
  const [outage, setOutage] = useState<Alert | null>(null);
  // Tick so the elapsed time advances between polls.
  const [, setTick] = useState(0);

  const poll = useCallback(async () => {
    if (status !== "signedIn") {
      setOutage(null);
      return;
    }
    try {
      const r = (await api.alerts("open")) as { alerts?: Alert[] };
      const open = (r.alerts ?? []).filter(
        (a) => a.kind === POWER_KIND && !a.cleared_at
      );
      // Oldest first: if several were somehow opened, the earliest is when the
      // outage actually began.
      open.sort((a, b) => a.opened_at - b.opened_at);
      setOutage(open[0] ?? null);
    } catch {
      // A dashboard that can't reach the cloud must not invent a power cut, and
      // must not clear a real one it already knows about. Hold the last state.
    }
    setTick((n) => n + 1);
  }, [status]);

  usePoll(poll, 20000);

  // Demo override for laying out and reviewing this before the sensor exists:
  //   VITE_POWER_DEMO=1 npm run dev
  // Ships as a no-op — import.meta.env inlines the literal at build time, so the
  // branch is dead code in a normal build.
  const demo = import.meta.env.VITE_POWER_DEMO === "1";
  const shown =
    outage ?? (demo ? ({ id: "demo", kind: POWER_KIND, state: "open", opened_at: Date.now() / 1000 - 372 } as Alert) : null);

  if (!shown) return null;

  // opened_at is stamped by the SERVER, whose clock runs ahead of the browser's
  // here — so clamp rather than render a negative duration (same reason
  // Cards.ago() clamps).
  const secs = Math.max(0, Date.now() / 1000 - shown.opened_at);
  const m = Math.floor(secs / 60);
  const h = Math.floor(m / 60);
  const dur = h > 0 ? `${h}h ${m % 60}m` : m > 0 ? `${m}m` : "just now";

  return (
    <div className="power-banner" role="alert">
      <span className="power-ico">
        <Icon name="power_off" size={22} />
      </span>
      <div className="power-txt">
        <b>Mains power lost{shown.location ? ` · ${shown.location}` : ""}</b>
        <div className="sub">
          The power sensor is reporting no mains supply. Cooling is not on backup
          power.
        </div>
      </div>
      <span className="power-dur" title="Time since the outage was detected">
        {dur}
      </span>
    </div>
  );
}
