import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import Icon from "./Icon";

function NotificationBell() {
  const [count, setCount] = useState(0);
  const nav = useNavigate();
  useEffect(() => {
    const f = async () => {
      try {
        const r = await api.alerts("open");
        setCount((r.alerts || []).filter((a: any) => a.state !== "cleared").length);
      } catch {/* */}
    };
    f();
    const id = setInterval(f, 10000);
    return () => clearInterval(id);
  }, []);
  const label = count > 0 ? `${count} open alert${count === 1 ? "" : "s"}` : "No open alerts";
  return (
    <button
      className={`bell${count > 0 ? " has-alerts" : ""}`}
      title={label}
      aria-label={label}
      onClick={() => nav("/alerts")}
    >
      <Icon name={count > 0 ? "notifications_active" : "notifications"} size={20} fill={count > 0} />
      {count > 0 && <span className="bell-count">{count}</span>}
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
  const initial = (profile?.name || profile?.email || "?").trim().charAt(0).toUpperCase();
  return (
    <div className="topbar">
      <div className="topbar-title">
        <div className="crumb">HVAC Monitor</div>
        <h1>{title}</h1>
      </div>
      <div className="topbar-actions">
        {children}
        <NotificationBell />
        <div className="avatar" title={profile?.email}>{initial}</div>
      </div>
    </div>
  );
}
