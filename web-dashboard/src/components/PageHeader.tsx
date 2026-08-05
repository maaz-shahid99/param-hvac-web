import { useEffect, useState, type ReactNode } from "react";
import { usePoll } from "../usePoll";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import Icon from "./Icon";
import { useNavDrawer } from "./Layout";

function NotificationBell() {
  // `null` means "we don't know yet / the last fetch failed" — deliberately NOT
  // 0. Swallowing the error and leaving the count at 0 rendered a calm grey bell
  // labelled "No open alerts", so a broken API was indistinguishable from a
  // healthy site. On an alarm product that is the worst possible failure mode.
  const [count, setCount] = useState<number | null>(null);
  const nav = useNavigate();
  // PageHeader renders on every page, so this poller runs constantly and stacks
  // with each page's own. usePoll pauses it while the tab is hidden.
  usePoll(async () => {
    try {
      const r = await api.alerts("open");
      setCount((r.alerts || []).filter((a: any) => a.state !== "cleared").length);
    } catch {
      setCount(null);
    }
  }, 10000);
  const unknown = count === null;
  const active = !unknown && count > 0;
  const label = unknown
    ? "Alert status unavailable — could not reach the server"
    : active
      ? `${count} open alert${count === 1 ? "" : "s"}`
      : "No open alerts";
  return (
    <button
      className={`bell${active ? " has-alerts" : ""}${unknown ? " unknown" : ""}`}
      title={label}
      aria-label={label}
      onClick={() => nav("/alerts")}
    >
      <Icon
        name={unknown ? "notifications_paused" : active ? "notifications_active" : "notifications"}
        size={20}
        fill={active}
      />
      {active && <span className="bell-count">{count}</span>}
      {unknown && <span className="bell-count">?</span>}
    </button>
  );
}

/** Butlr-style page header: org crumb + big title on the left, page actions +
 *  notification bell + avatar on the right. */
export default function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  const { profile } = useAuth();
  const { open: openNav } = useNavDrawer();
  const initial = (profile?.name || profile?.email || "?").trim().charAt(0).toUpperCase();
  return (
    <div className="topbar">
      <div className="topbar-title">
        {/* Hidden above the mobile breakpoint by CSS. */}
        <button className="navtoggle" aria-label="Open the navigation menu" onClick={openNav}>
          <Icon name="menu" size={22} />
        </button>
        <div>
          <div className="crumb">HVAC Monitor</div>
          <h1>{title}</h1>
        </div>
      </div>
      <div className="topbar-actions">
        {children}
        <NotificationBell />
        <div className="avatar" title={profile?.email}>{initial}</div>
      </div>
    </div>
  );
}
