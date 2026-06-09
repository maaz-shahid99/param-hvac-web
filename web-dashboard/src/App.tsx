import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./auth";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import PendingPage from "./pages/PendingPage";
import DashboardPage from "./pages/DashboardPage";
import VisualizationPage from "./pages/VisualizationPage";
import DevicesPage from "./pages/DevicesPage";
import RackLayoutPage from "./pages/RackLayoutPage";
import EnvDataPage from "./pages/EnvDataPage";
import DiagnosticsPage from "./pages/DiagnosticsPage";
import AlertsThresholdsPage from "./pages/AlertsThresholdsPage";
import MembersPage from "./pages/MembersPage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  const { status, isPending } = useAuth();

  if (status === "unknown") return <div className="center-msg">Loading…</div>;
  if (status === "signedOut") return <LoginPage />;
  if (isPending) return <PendingPage />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="visualization" element={<VisualizationPage />} />
        <Route path="devices" element={<DevicesPage />} />
        <Route path="layout" element={<RackLayoutPage />} />
        <Route path="env" element={<EnvDataPage />} />
        <Route path="alerts" element={<AlertsThresholdsPage />} />
        <Route path="diagnostics" element={<DiagnosticsPage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
