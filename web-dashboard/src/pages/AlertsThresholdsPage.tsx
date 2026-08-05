import { useEffect, useState } from "react";
import { usePoll } from "../usePoll";
import { api } from "../api";
import { useAuth } from "../auth";
import { AlertsCard, LiveTempsCard, tenantHighLimit, copyText, ago, nowSec } from "../components/Cards";
import PageHeader from "../components/PageHeader";
import Icon from "../components/Icon";

export default function AlertsThresholdsPage() {
  const { isAdmin } = useAuth();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [sensors, setSensors] = useState<any[]>([]);
  const [high, setHigh] = useState("40");
  const [delta, setDelta] = useState("20");
  const [defs, setDefs] = useState({ high_c: 40, delta_c: 20 });
  // The SAVED limit alerts fire on. Kept separate from the `high` input so the
  // card below reflects what the server is actually using, not an unsaved edit.
  const [effHigh, setEffHigh] = useState(40);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  // Success and failure used to share one grey `savedMsg` span, so a failed save
  // was easily read as a successful one.
  const [saved, setSaved] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Minted gateway key, shown in-page instead of a window.prompt.
  const [newKey, setNewKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  // Recipients editor.
  const [recipOpen, setRecipOpen] = useState(false);
  const [recipLoading, setRecipLoading] = useState(false);
  const [recipSaving, setRecipSaving] = useState(false);
  const [recipEmails, setRecipEmails] = useState("");
  const [recipPhones, setRecipPhones] = useState("");
  const [recipEffective, setRecipEffective] = useState<string[]>([]);

  // Delivery channel, so the page can say when alerts are only being logged.
  const [delivery, setDelivery] = useState<any>(null);
  // How many people are actually opted in (null = not checked / failed).
  const [recipCount, setRecipCount] = useState<number | null>(null);

  // Existing gateway keys. There was no way to see or revoke them, so a
  // mis-clicked "Gateway API key" left an extra key on the tenant forever.
  const [keys, setKeys] = useState<any[]>([]);
  const [keysOpen, setKeysOpen] = useState(false);
  const loadKeys = async () => {
    try { setKeys((await api.apiKeys()).keys || []); }
    catch (e: any) { setSaved({ ok: false, text: e?.message || "Could not load API keys." }); }
  };
  const revokeKey = async (k: any) => {
    const used = k.last_used_at
      ? `\n\nIt was last used ${Math.round((Date.now()/1000 - k.last_used_at)/60)} min ago — if that is your live gateway, revoking it STOPS it reporting and it cannot be re-provisioned without physical access to the device.`
      : "\n\nThis key has never been used, so nothing is relying on it.";
    if (!confirm(`Revoke the API key "${k.label || "(no label)"}"?${used}`)) return;
    try {
      await api.deleteApiKey(k.id);
      setSaved({ ok: true, text: "API key revoked." });
      loadKeys();
    } catch (e: any) {
      setSaved({ ok: false, text: e?.message || "Could not revoke that key." });
    }
  };

  async function refresh(initial = false) {
    try {
      const [a, c, t] = await Promise.all([api.alerts("open"), api.current(), api.thresholds()]);
      setAlerts(a.alerts || []);
      setSensors(c.sensors || []);
      const d = t.defaults || { high_c: 40, delta_c: 20 };
      setDefs(d);
      setEffHigh(tenantHighLimit(t));
      if (initial) {
        const tenant = (t.thresholds || []).find((x: any) => x.scope === "tenant");
        setHigh(String(tenant ? tenant.high_c : d.high_c));
        setDelta(String(tenant ? tenant.delta_c : d.delta_c));
      }
      setErr(null);
    } catch (e: any) {
      setErr(e.message || "Could not reach the cloud server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  usePoll(() => refresh(false), 10000);

  // Admin-only; a member gets 403 and simply sees no banner.
  useEffect(() => {
    if (!isAdmin) return;
    api.notificationsStatus().then(setDelivery).catch(() => setDelivery(null));
    // Who is actually opted in. An org can end up with nobody — the one admin
    // receiving alerts leaves or is removed, and everyone left has notifications
    // switched off. Alerts then fire into the void.
    api.recipients()
      .then((r) => setRecipCount((r.effective_emails || []).length))
      .catch(() => setRecipCount(null));
  }, [isAdmin]);

  const ack = async (id: string) => {
    setSaved(null);
    try {
      await api.ackAlert(id);
      refresh(false);
    } catch (e: any) {
      // Was swallowed: clicking ACK on a failure did nothing at all, so the user
      // clicked again and assumed it had worked.
      setSaved({ ok: false, text: e?.message || "Could not acknowledge that alert." });
    }
  };

  const save = async () => {
    setSaved(null);
    // Plain text inputs with no validation: Number("4o") is NaN, which
    // JSON.stringify turns into null — silently clearing the limit that governs
    // when the alarm fires.
    const h = Number(high), d = Number(delta);
    if (!Number.isFinite(h) || !Number.isFinite(d)) {
      setSaved({ ok: false, text: "Both limits must be numbers." });
      return;
    }
    if (h < -50 || h > 150 || d < 0 || d > 150) {
      setSaved({ ok: false, text: "High limit must be −50…150 °C and ΔT 0…150 °C." });
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      await api.putThreshold({ scope: "tenant", high_c: h, delta_c: d });
      setSaved({ ok: true, text: "Thresholds saved." });
      refresh(false); // pull back the value the card colours against
    } catch (e: any) {
      setSaved({ ok: false, text: e?.message || "Could not save the thresholds." });
    } finally {
      setSaving(false);
    }
  };

  /** Mint a key and show it IN the page. A window.prompt truncates it, offers no
   *  copy button, and is suppressed outright once the browser's "prevent
   *  additional dialogs" is ticked — destroying a key that is only shown once. */
  const genKey = async () => {
    setSaved(null);
    try {
      const r = await api.createApiKey("gateway");
      setNewKey(r.api_key);
    } catch (e: any) {
      setSaved({ ok: false, text: e?.message || "Could not create an API key." });
    }
  };

  /** Load the CURRENT recipients before editing. The old flow opened two blank
   *  prompts and saved whatever was in them, so pressing OK deleted every
   *  configured alert email. */
  const openRecipients = async () => {
    setSaved(null);
    setRecipOpen(true);
    setRecipLoading(true);
    try {
      const r = await api.recipients();
      setRecipEmails(r.alert_emails || "");
      setRecipPhones(r.alert_phones || "");
      setRecipEffective(r.effective_emails || []);
    } catch (e: any) {
      setSaved({ ok: false, text: e?.message || "Could not load the current recipients." });
      setRecipOpen(false);
    } finally {
      setRecipLoading(false);
    }
  };

  const saveRecipients = async () => {
    if (recipSaving) return;
    setRecipSaving(true);
    try {
      await api.setRecipients({ alert_emails: recipEmails, alert_phones: recipPhones });
      setRecipOpen(false);
      setSaved({ ok: true, text: "Alert recipients saved." });
    } catch (e: any) {
      setSaved({ ok: false, text: e?.message || "Could not save the recipients." });
    } finally {
      setRecipSaving(false);
    }
  };


  return (
    <>
      <PageHeader title="Alerts & Thresholds">
        {isAdmin && <button className="secondary" onClick={genKey}><Icon name="vpn_key" size={17} /> Gateway API key</button>}
        {isAdmin && <button className="secondary" onClick={openRecipients}><Icon name="group" size={17} /> Recipients</button>}
        {isAdmin && (
          <button
            className="secondary"
            onClick={() => { setKeysOpen((o) => !o); if (!keysOpen) loadKeys(); }}
          >
            <Icon name="key" size={17} /> Manage keys
          </button>
        )}
        <button className="secondary" onClick={() => refresh(false)}><Icon name="refresh" size={17} /> Refresh</button>
      </PageHeader>
      <div className="page">
        {/* Rendered inside the layout: the old early return replaced the
            whole screen, so the top bar and alert bell vanished on every
            navigation to this page. */}
        {loading && <div className="center-msg">Loading…</div>}
        {err && <div className="error" role="alert">{err}</div>}
        {saved && (
          <div className={saved.ok ? "success" : "error"} role={saved.ok ? "status" : "alert"}>
            {saved.text}
          </div>
        )}

        {/* Mail can be perfectly configured and still reach nobody, if every
            member has notifications switched off. */}
        {isAdmin && recipCount === 0 && (
          <div className="error" role="alert">
            <b>No one is set to receive alerts.</b> Every alert will fire and be recorded, but
            nobody will be emailed. Switch on Email for a member under <b>Members</b>, or add an
            address with <b>Recipients</b> above.
          </div>
        )}

        {/* Alerts that only reach a log file are worse than no alerts, because
            they look like coverage. Say so plainly. */}
        {isAdmin && delivery && !delivery.email_configured && (
          <div className="error" role="alert">
            <b>Alerts are not being emailed.</b> No SES or SMTP is configured on the server,
            so every alert is written to the server log only. Set <span className="mono">SMTP_HOST</span>,{" "}
            <span className="mono">SMTP_USER</span> and <span className="mono">SMTP_PASS</span> in the
            server's <span className="mono">.env</span>, then use <b>Settings → Send test email</b> to confirm.
          </div>
        )}

        {/* The minted key is shown once by the server; keep it on the page with a
            copy button rather than in a dialog the browser can suppress. */}
        {newKey && (
          <div className="card" style={{ borderColor: "var(--accent)" }}>
            <div className="hd hd-ico"><Icon name="vpn_key" size={18} /> New gateway API key</div>
            <div className="bd">
              <p className="small muted" style={{ marginTop: 0 }}>
                Shown <b>once</b> — copy it now and provision it into the gateway. If you lose it
                you'll have to mint another.
              </p>
              <div className="btnrow">
                <code
                  className="mono"
                  style={{
                    flex: 1, minWidth: 0, overflowX: "auto", padding: "10px 12px",
                    background: "var(--surface-2)", border: "1px solid var(--border-strong)",
                    borderRadius: "var(--radius-sm)", whiteSpace: "nowrap",
                  }}
                >
                  {newKey}
                </code>
                <button
                  onClick={async () => {
                    const ok = await copyText(newKey);
                    setKeyCopied(ok);
                    if (ok) setTimeout(() => setKeyCopied(false), 2000);
                  }}
                >
                  <Icon name="content_copy" size={16} /> {keyCopied ? "Copied!" : "Copy"}
                </button>
                <button className="secondary" onClick={() => setNewKey(null)}>Done</button>
              </div>
            </div>
          </div>
        )}

        {keysOpen && (
          <div className="card">
            <div className="hd hd-ico"><Icon name="key" size={18} /> Gateway API keys ({keys.length})</div>
            {keys.length === 0 ? (
              <div className="bd muted">No keys yet. Use “Gateway API key” to mint one.</div>
            ) : keys.map((k) => {
              const used = Number(k.last_used_at) || 0;
              const live = used > 0 && nowSec() - used < 900;
              return (
                <div className="row" key={k.id}>
                  <div className="btnrow">
                    <span className={`iconwrap ${live ? "green" : "grey"}`}><Icon name="key" size={20} /></span>
                    <div>
                      <div>{k.label || "(no label)"} {live && <span className="badge green">IN USE</span>}</div>
                      <div className="small muted">
                        {used ? `last used ${ago(nowSec() - used)}` : "never used — safe to revoke"}
                      </div>
                    </div>
                  </div>
                  <button className="secondary" onClick={() => revokeKey(k)}>
                    <Icon name="delete" size={16} /> Revoke
                  </button>
                </div>
              );
            })}
            <div className="bd small muted">
              A gateway stores its key in NVS. Revoking the key a live gateway is using stops it
              reporting, and it cannot be re-provisioned without physical access — so the server
              refuses to remove the last in-use key.
            </div>
          </div>
        )}

        {/* Recipients editor — prefilled from the server so saving can no longer
            wipe the list. */}
        {recipOpen && (
          <div className="card">
            <div className="hd hd-ico"><Icon name="group" size={18} /> Extra alert recipients</div>
            <div className="bd">
              {recipLoading ? (
                <div className="muted">Loading current recipients…</div>
              ) : (
                <>
                  <p className="small muted" style={{ marginTop: 0 }}>
                    Comma-separated, in addition to opted-in members.
                    {recipEffective.length > 0 && (
                      <> Currently notified: <b>{recipEffective.join(", ")}</b>.</>
                    )}
                  </p>
                  <label>Extra emails</label>
                  <input value={recipEmails} onChange={(e) => setRecipEmails(e.target.value)}
                         placeholder="ops@example.com, oncall@example.com" />
                  <label>Extra phone numbers</label>
                  <input value={recipPhones} onChange={(e) => setRecipPhones(e.target.value)}
                         placeholder="+15551234567, +15559876543" />
                  <div className="btnrow" style={{ marginTop: 14 }}>
                    <button onClick={saveRecipients} disabled={recipSaving}>
                      {recipSaving ? "Saving…" : "Save recipients"}
                    </button>
                    <button className="secondary" onClick={() => setRecipOpen(false)} disabled={recipSaving}>
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <AlertsCard alerts={alerts} onAck={ack} />

        <div className="card">
          <div className="hd hd-ico"><Icon name="tune" size={18} /> Alert thresholds</div>
          <div className="bd">
            <div className="small muted">
              Applied to every rack unless overridden. Defaults: {defs.high_c}°C / Δ{defs.delta_c}°C.
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label htmlFor="thr-high">High temp °C</label>
                {/* type=number + bounds: these were plain text, so "4o" became
                    NaN and serialised to null, clearing the limit entirely. */}
                <input id="thr-high" type="number" step="0.1" min={-50} max={150}
                       value={high} disabled={!isAdmin} onChange={(e) => setHigh(e.target.value)} />
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label htmlFor="thr-delta">Max ΔT °C</label>
                <input id="thr-delta" type="number" step="0.1" min={0} max={150}
                       value={delta} disabled={!isAdmin} onChange={(e) => setDelta(e.target.value)} />
              </div>
            </div>
            <div style={{ marginTop: 14 }} className="btnrow">
              <button disabled={!isAdmin || saving} onClick={save}>
                {!isAdmin ? "Admins only" : saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>

        <LiveTempsCard sensors={sensors} highLimit={effHigh} />
      </div>
    </>
  );
}
