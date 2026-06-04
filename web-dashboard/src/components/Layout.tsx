import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth";

const items = [
  { to: "/", label: "Dashboard", ico: "📊", end: true },
  { to: "/visualization", label: "Visualization", ico: "🌀" },
  { to: "/devices", label: "Devices", ico: "🖥️" },
  { to: "/alerts", label: "Alerts & Thresholds", ico: "🔔" },
  { to: "/members", label: "Members", ico: "👥" },
  { to: "/settings", label: "Settings", ico: "⚙️" },
];

export default function Layout() {
  const { profile, signOut } = useAuth();
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="dot" /> HVAC Monitor
        </div>
        <div className="nav-group">Monitoring</div>
        <nav className="nav">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end}>
              <span className="ico">{it.ico}</span>
              {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="userbox">
          <b>{profile?.name || profile?.email}</b>
          {profile?.email} · {profile?.role}
          <div style={{ marginTop: 10 }}>
            <button className="secondary" style={{ width: "100%" }} onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
