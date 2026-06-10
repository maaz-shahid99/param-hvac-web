import { useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { ago, api, nowSec } from "../api";

export default function Firmware() {
  const [releases, setReleases] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // publish form
  const [kind, setKind] = useState("c3");
  const [version, setVersion] = useState("");
  const [severity, setSeverity] = useState("optional");
  const [canary, setCanary] = useState(true);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmMandatory, setConfirmMandatory] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Highest firmware version any gateway reports for a chip (canary-confirmed gate).
  const maxFleetFw = (k: string) =>
    Math.max(0, ...tenants.map((t) => (k === "c3" ? t.fw_c3 : t.fw_c6) || 0));

  async function refresh() {
    try {
      const [r, o] = await Promise.all([api.firmwareList(), api.overview()]);
      setReleases(r.releases || []);
      setTenants(o.tenants || []);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, []);

  async function publish() {
    const file = fileRef.current?.files?.[0];
    const v = parseInt(version, 10);
    if (!file) return setErr("Choose a firmware .bin first.");
    if (!Number.isInteger(v) || v <= 0) return setErr("Version must be a positive integer.");
    // Only the immediate fleet-wide path (mandatory + NOT canary) needs the
    // blast-radius confirm; a canary rolls the gateway first, so it's safe.
    if (severity === "mandatory" && !canary && !confirmMandatory) {
      setConfirmMandatory(true);
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const buf = await file.arrayBuffer();
      const res = await api.publishFirmware(kind, v, severity, canary ? "canary" : "full", notes, buf);
      setMsg(
        `Published ${res.kind} v${res.version} (${res.stage}, ${(res.size / 1024).toFixed(0)} KB, sha256 ${res.sha256.slice(0, 12)}…).` +
          (res.stage === "canary" ? " The gateway updates first — Promote once it reports healthy." : "")
      );
      setVersion("");
      setNotes("");
      setConfirmMandatory(false);
      if (fileRef.current) fileRef.current.value = "";
      refresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function promote(r: any) {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await api.promoteOta(r.kind, r.version);
      setMsg(`Promoted ${r.kind.toUpperCase()} v${r.version} to full — the fleet rolls on next check-in.`);
      refresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const latest = (k: string) =>
    releases.filter((r) => r.kind === k).sort((a, b) => b.version - a.version)[0];

  return (
    <>
      <div className="pagehead">
        <h2>
          <Icon name="system_update" size={24} color="var(--accent)" /> Firmware / OTA
        </h2>
        <button className="ghost" onClick={refresh}>
          <Icon name="refresh" size={18} /> Refresh
        </button>
      </div>
      {err && <div className="err">{err}</div>}
      {msg && <div className="badge green" style={{ marginBottom: 12 }}><Icon name="check_circle" size={14} /> {msg}</div>}

      {/* Publish */}
      <div className="card">
        <b style={{ display: "block", marginBottom: 12 }}>Publish a release</b>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <label className="field">
            <span>Chip</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="c3">C3 (Bridge)</option>
              <option value="c6">C6 (Commissioner)</option>
            </select>
          </label>
          <label className="field">
            <span>Version (integer)</span>
            <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="18" inputMode="numeric" />
          </label>
          <label className="field">
            <span>Severity</span>
            <select
              value={severity}
              onChange={(e) => {
                setSeverity(e.target.value);
                setConfirmMandatory(false);
              }}
            >
              <option value="optional">Optional — user opts in from the app</option>
              <option value="mandatory">Mandatory — auto-rolls the whole fleet</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span>Notes (shown to the customer for optional updates)</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What changed" />
        </label>
        <label className="field">
          <span>Firmware image (.bin)</span>
          <input type="file" accept=".bin" ref={fileRef} />
        </label>

        <label className="btnrow" style={{ marginBottom: 12, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={canary}
            onChange={(e) => setCanary(e.target.checked)}
            style={{ width: "auto" }}
          />
          <span>
            <b>Roll as canary</b> — the <b>gateway updates first</b>; verify it's healthy in Fleet Health,
            then <b>Promote</b> to roll the rest of the fleet. (Recommended for mandatory builds.)
          </span>
        </label>

        {confirmMandatory && (
          <div className="hint" style={{ marginBottom: 12, borderColor: "var(--red)", color: "var(--red)" }}>
            <Icon name="warning" size={16} /> A <b>mandatory, non-canary</b> release auto-applies to <b>every unit</b>
            at once. No rollback (version-gated) — recovery is to publish a higher version. Tick <b>Roll as canary</b>
            to update the gateway first instead. Click Publish again to confirm.
          </div>
        )}
        <button onClick={publish} disabled={busy} className={severity === "mandatory" && !canary ? "danger" : ""}>
          <Icon name="publish" size={18} /> {busy ? "Publishing…" : confirmMandatory ? "Confirm mandatory publish" : "Publish"}
        </button>
      </div>

      {/* Rollout status */}
      <div className="card">
        <b style={{ display: "block", marginBottom: 10 }}>Rollout status</b>
        {["c3", "c6"].map((k) => {
          const l = latest(k);
          return (
            <div key={k} style={{ marginBottom: 12 }}>
              <div className="btnrow" style={{ marginBottom: 6 }}>
                <span className="mono">{k.toUpperCase()}</span>
                {l ? (
                  <>
                    <span className={`badge ${l.severity === "mandatory" ? "red" : "gray"}`}>
                      latest v{l.version} · {l.severity}
                    </span>
                    <span className={`badge ${l.stage === "canary" ? "amber" : "green"}`}>{l.stage || "full"}</span>
                    <span className="muted small">{l.notes}</span>
                  </>
                ) : (
                  <span className="muted small">no release published</span>
                )}
              </div>
              {tenants.length > 0 && (
                <table>
                  <thead>
                    <tr><th>Tenant</th><th>On version</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {tenants.map((t) => {
                      const cur = k === "c3" ? t.fw_c3 : t.fw_c6;
                      const target = l?.version || 0;
                      const upToDate = !target || cur >= target;
                      return (
                        <tr key={t.tenant_id}>
                          <td>{t.tenant}</td>
                          <td className="mono">{cur ? `v${cur}` : "—"}</td>
                          <td>
                            <span className={`badge ${upToDate ? "green" : "amber"}`}>
                              {upToDate ? "up to date" : `pending → v${target}`}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>

      {/* History */}
      {releases.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>Published</th><th>Chip</th><th>Version</th><th>Severity</th><th>Stage</th><th>Size</th><th>Notes</th><th></th></tr>
            </thead>
            <tbody>
              {releases.map((r) => {
                const confirmed = maxFleetFw(r.kind) >= r.version; // gateway reports the new build
                return (
                  <tr key={r.id}>
                    <td className="muted small">{ago(nowSec() - r.created_at)}</td>
                    <td className="mono">{r.kind.toUpperCase()}</td>
                    <td>v{r.version}</td>
                    <td><span className={`badge ${r.severity === "mandatory" ? "red" : "gray"}`}>{r.severity}</span></td>
                    <td>
                      <span className={`badge ${r.stage === "canary" ? "amber" : "green"}`}>
                        {r.stage || "full"}
                      </span>
                    </td>
                    <td className="muted small">{(r.size / 1024).toFixed(0)} KB</td>
                    <td className="muted small">{r.notes}</td>
                    <td>
                      {r.stage === "canary" && (
                        <button
                          className="ghost"
                          disabled={busy || !confirmed}
                          title={confirmed ? "Roll this build to the rest of the fleet" : "Waiting for the gateway to report this version"}
                          onClick={() => promote(r)}
                        >
                          <Icon name="rocket_launch" size={15} />
                          {confirmed ? "Promote to fleet" : "Awaiting gateway"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
