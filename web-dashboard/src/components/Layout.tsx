import { createContext, useContext, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth";
import Icon from "./Icon";
import OtaBanner from "./OtaBanner";
import ErrorBoundary from "./ErrorBoundary";

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

/** Lets PageHeader render the hamburger inline in the top bar while Layout owns
 *  the drawer state. */
const NavCtx = createContext<{ open: () => void }>({ open: () => {} });
export const useNavDrawer = () => useContext(NavCtx);

export default function Layout() {
  const { profile, signOut } = useAuth();
  const { pathname } = useLocation();
  const isAdmin = profile?.role === "admin";
  const navItems = items.filter((it) => !it.adminOnly || isAdmin);

  // Off-canvas drawer below the mobile breakpoint. The sidebar was a fixed 256px
  // column with no way to dismiss it, so on a phone it ate two thirds of the
  // screen and the content beside it was clipped.
  const [navOpen, setNavOpen] = useState(false);
  // Close on navigation, so tapping a link doesn't leave the drawer covering the
  // page you just opened.
  useEffect(() => { setNavOpen(false); }, [pathname]);
  // Escape closes it, matching every other drawer people have used.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setNavOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    <NavCtx.Provider value={{ open: () => setNavOpen(true) }}>
    <div className="layout">
      {navOpen && (
        <button
          className="navscrim"
          aria-label="Close the navigation menu"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside className={`sidebar${navOpen ? " open" : ""}`}>
        <div className="brand">
          <span className="brand-logo">
            <Icon name="thermostat" size={20} fill />
          </span>
          HVAC Monitor
        </div>
        <div className="nav-group">Monitoring</div>
        <nav className="nav" aria-label="Main">
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
        {/* Keyed on the route so navigating away clears a crashed page instead
            of trapping the user on it. */}
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
    </NavCtx.Provider>
  );
}
