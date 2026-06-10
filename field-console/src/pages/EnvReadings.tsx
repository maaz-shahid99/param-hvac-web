import { useEffect, useState } from "react";
import Icon from "../components/Icon";
import { ago, api, autoName, downloadCsv, nowSec } from "../api";

export default function EnvReadings() {
  const [env, setEnv] = useState<any[]>([]);
  const [readings, setReadings] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const [e, r] = await Promise.all([api.env(1000), api.readings(1000)]);
      setEnv(e.env || []);
      setReadings(r.readings || []);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <div className="pagehead">
        <h2>
          <Icon name="monitoring" size={24} color="var(--accent)" /> Env & Readings
        </h2>
        <button className="ghost" onClick={refresh}>
          <Icon name="refresh" size={18} /> Refresh
        </button>
      </div>
      {err && <div className="err">{err}</div>}
      {loading && <div className="muted">Loading…</div>}

      <div className="card">
        <div className="btnrow" style={{ marginBottom: 10 }}>
          <Icon name="thermostat" size={20} color="var(--amber)" />
          <b>Environmental (BME) — latest {env.length}</b>
          <div className="spacer" />
          <button className="ghost" onClick={() => downloadCsv("/v1/support/env?format=csv", "fleet_env.csv")}>
            <Icon name="download" size={16} /> CSV
          </button>
        </div>
        <table>
          <thead>
            <tr><th>When</th><th>Tenant</th><th>Device</th><th>Temp</th><th>Humidity</th><th>Pressure</th><th>VOC</th></tr>
          </thead>
          <tbody>
            {env.slice(0, 200).map((r, i) => (
              <tr key={i}>
                <td className="muted small">{ago(nowSec() - r.ts)}</td>
                <td>{r.tenant}</td>
                <td className="mono small">{autoName(r.eui, "router")}</td>
                <td><b>{r.temp?.toFixed(1)}°</b></td>
                <td>{r.hum?.toFixed(0)}%</td>
                <td>{r.pres?.toFixed(0)} hPa</td>
                <td>{Math.round(r.voc)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="btnrow" style={{ marginBottom: 10 }}>
          <Icon name="device_thermostat" size={20} color="var(--accent)" />
          <b>Sensor readings (DS18B20) — latest {readings.length}</b>
          <div className="spacer" />
          <button className="ghost" onClick={() => downloadCsv("/v1/support/readings?format=csv", "fleet_readings.csv")}>
            <Icon name="download" size={16} /> CSV
          </button>
        </div>
        <table>
          <thead>
            <tr><th>When</th><th>Tenant</th><th>Device</th><th>Max °C</th><th>Probes</th></tr>
          </thead>
          <tbody>
            {readings.slice(0, 200).map((r, i) => {
              let n = 0;
              try { n = (JSON.parse(r.probes) || []).length; } catch { /* ignore */ }
              return (
                <tr key={i}>
                  <td className="muted small">{ago(nowSec() - r.ts)}</td>
                  <td>{r.tenant}</td>
                  <td className="mono small">{autoName(r.eui)}</td>
                  <td><b>{r.max_c?.toFixed(1)}°</b></td>
                  <td className="muted">{n} probe{n === 1 ? "" : "s"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
