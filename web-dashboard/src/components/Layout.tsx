import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth";
import Icon from "./Icon";
import OtaBanner from "./OtaBanner";

const items = [
  { to: "/", label: "Dashboard", icon: "dashboard", end: true },
  { to: "/visualization", label: "Visualization", icon: "view_in_ar" },
  { to: "/devices", label: "Devices", icon: "lan" },
  { to: "/layout", label: "Rack Layout", icon: "view_module" },
  { to: "/env", label: "Environment & Logs", icon: "monitoring" },
  { to: "/alerts", label: "Alerts & Thresholds", icon: "notifications" },
  { to: "/diagnostics", label: "Diagnostics", icon: "bug_report", adminOnly: true },
  { to: "/members", label: "Members", icon: "group" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

export default function Layout() {
  const { profile, signOut } = useAuth();
  const isAdmin = profile?.role === "admin";
  const navItems = items.filter((it) => !it.adminOnly || isAdmin);
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo">
            <Icon name="thermostat" size={20} fill />
          </span>
          HVAC Monitor
        </div>
        <div className="nav-group">Monitoring</div>
        <nav className="nav">
          {navItems.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end}>
              <span className="ico">
                <Icon name={it.icon} size={20} />
              </span>
              {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="userbox">
          <b>{profile?.name || profile?.email}</b>
          {profile?.email} · {profile?.role}
          <div style={{ marginTop: 10 }}>
            <button className="secondary" style={{ width: "100%" }} onClick={signOut}>
              <Icon name="logout" size={17} /> Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="content">
        {/* Mounted at the shell level so a pending optional update is visible on
            every page, not just the dashboard. Self-hides when there's none. */}
        <OtaBanner />
        <Outlet />
      </main>
    </div>
  );
}
