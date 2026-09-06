import { useEffect, useState } from "react";
import { api, downloadCsv, getBaseUrl, setBaseUrl } from "../api";
import { useAuth } from "../auth";
import PageHeader from "../components/PageHeader";
import Icon from "../components/Icon";
import PasswordInput from "../components/PasswordInput";

export default function SettingsPage() {
  const { profile, isAdmin, signOut } = useAuth();
  const [url, setUrl] = useState(getBaseUrl());
  const [saved, setSaved] = useState(false);

  // Alert granularity + data-collection interval (cloud, admin-settable).
  const [gran, setGran] = useState<string | null>(null);
  const [interval, setInterval] = useState<string>("60");
  const [intervalSaved, setIntervalSaved] = useState(false);
  // Surfaced instead of swallowed: a failed load left `gran` null (so NEITHER
  // segment rendered selected) while the helper text still asserted a default,
  // and a subsequent save wrote the hardcoded 60 over the real server value.
  const [settingsErr, setSettingsErr] = useState<string | null>(null);
  const [granBusy, setGranBusy] = useState(false);
  const [intervalBusy, setIntervalBusy] = useState(false);
  // Minutes in the UI, seconds on the wire: nobody thinks about reminder
  // frequency in seconds, and a raw 900 in a box invites a mistyped 90.
  const [repeatMin, setRepeatMin] = useState("15");
  const [repeatBusy, setRepeatBusy] = useState(false);
  const [repeatSaved, setRepeatSaved] = useState(false);
  // Archive granularity, also minutes-in / seconds-out. 0 = archiving off.
  const [archiveMin, setArchiveMin] = useState("5");
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveSaved, setArchiveSaved] = useState(false);
  const [arch, setArch] = useState<any>(null);
  const [archRunBusy, setArchRunBusy] = useState(false);
  useEffect(() => {
    api.settings().then((s) => {
      setGran(s.alert_granularity || "sensor");
      setInterval(String(s.collect_interval_s ?? 60));
      setRepeatMin(String(Math.round((s.alert_repeat_s ?? 900) / 60)));
      setArchiveMin(String(Math.round((s.archive_interval_s ?? 300) / 60)));
      setSettingsErr(null);
    }).catch((e: any) => {
      setSettingsErr(e?.message || "Could not load settings from the server.");
    });
  }, []);
  const loadArchive = () => {
    api.archiveStatus().then(setArch).catch(() => setArch(null));
  };
  useEffect(loadArchive, []);
  const saveArchive = async () => {
    if (archiveBusy) return;
    const raw = Number(archiveMin);
    if (!Number.isFinite(raw) || raw < 0) {
      setSettingsErr("Archive interval must be a number of minutes (0 = off).");
      return;
    }
    // 0 is a real choice (stop archiving). Anything else is floored at 1 minute;
    // the server floors again at 60s, because the fleet only reports every ~12s
    // and a finer archive just makes a month too big for a git host to accept.
    const mins = raw === 0 ? 0 : Math.max(1, Math.min(1440, Math.round(raw)));
    if (mins !== raw) setSettingsErr(`Using ${mins} min.`);
    else setSettingsErr(null);
    setArchiveMin(String(mins));
    setArchiveBusy(true);
    try {
      await api.putSettings({ archive_interval_s: mins * 60 });
      setArchiveSaved(true);
      setTimeout(() => setArchiveSaved(false), 1500);
    } catch (e: any) {
      setSettingsErr(e?.message || "Could not save the archive interval.");
    } finally {
      setArchiveBusy(false);
    }
  };
  const dlCsv = async (path: string, file: string) => {
    try {
      await downloadCsv(path, file);
    } catch (e: any) {
      setSettingsErr(e?.message || "Could not download the export.");
    }
  };
  const runArchiveNow = async () => {
    if (archRunBusy) return;
    setArchRunBusy(true);
    try {
      setArch(await api.runArchive());
    } catch (e: any) {
      setSettingsErr(e?.message || "Could not start an archive run.");
    } finally {
      setArchRunBusy(false);
    }
  };
  // Rough monthly size at the chosen interval. This is the number that makes the
  // setting mean something: at full 12s resolution a month is ~300 MB, past what
  // GitHub will take as one file, and nobody can see that from "300 seconds".
  const archiveMb = (() => {
    const mins = Number(archiveMin);
    if (!Number.isFinite(mins) || mins <= 0) return 0;
    const probes = 24;            // 3 sensors x 8 probes at this site
    const bytesPerRow = 110;      // 92 measured, plus a typical location string
    return ((30 * 24 * 60) / mins * probes * bytesPerRow) / 1e6;
  })();
  const archiveSizeHint = archiveMb <= 0 ? ""
    : archiveMb >= 1 ? `≈${archiveMb.toFixed(0)} MB per month`
    : `≈${(archiveMb * 1000).toFixed(0)} KB per month`;
  // GitHub rejects any single file over 100 MB outright, and the push fails with
  // no warning until it happens. Say so while the number is still being chosen.
  const archiveTooBig = archiveMb > 80;
  const setGranularity = async (v: string) => {
    if (granBusy) return;
    const prev = gran;
    setGran(v);
    setGranBusy(true);
    setSettingsErr(null);
    try {
      await api.putSettings({ alert_granularity: v });
    } catch (e: any) {
      setGran(prev); // revert — but say why, instead of silently snapping back
      setSettingsErr(e?.message || "Could not save the alert granularity.");
    } finally {
      setGranBusy(false);
    }
  };
  const saveInterval = async () => {
    if (intervalBusy) return;
    const raw = Number(interval);
    if (!Number.isFinite(raw)) {
      setSettingsErr("Collection interval must be a number.");
      return;
    }
    const n = Math.max(10, Math.min(3600, Math.round(raw)));
    if (n !== raw) setSettingsErr(`Interval must be 10–3600 s — using ${n}s.`);
    else setSettingsErr(null);
    setInterval(String(n));
    setIntervalBusy(true);
    try {
      await api.putSettings({ collect_interval_s: n });
      setIntervalSaved(true);
      setTimeout(() => setIntervalSaved(false), 1500);
    } catch (e: any) {
      setSettingsErr(e?.message || "Could not save the collection interval.");
    } finally {
      setIntervalBusy(false);
    }
  };

  const saveRepeat = async () => {
    if (repeatBusy) return;
    const raw = Number(repeatMin);
    if (!Number.isFinite(raw) || raw < 0) {
      setSettingsErr("Reminder interval must be a number of minutes (0 = never).");
      return;
    }
    // 0 is a real choice — "one mail at onset, one on recovery, nothing between".
    // Anything else is floored at 1 minute; the server floors again at 60s.
    const mins = raw === 0 ? 0 : Math.max(1, Math.min(1440, Math.round(raw)));
    if (mins !== raw) setSettingsErr(`Using ${mins} min.`);
    else setSettingsErr(null);
    setRepeatMin(String(mins));
    setRepeatBusy(true);
    try {
      await api.putSettings({ alert_repeat_s: mins * 60 });
      setRepeatSaved(true);
      setTimeout(() => setRepeatSaved(false), 1500);
    } catch (e: any) {
      setSettingsErr(e?.message || "Could not save the reminder interval.");
    } finally {
      setRepeatBusy(false);
    }
  };

  const save = () => {
    setBaseUrl(url);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  // Change password. Previously the only way to rotate one was the emailed OTP
  // reset on the login screen, which needs working SMTP — so on an appliance
  // without mail configured there was no route at all.
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Email/SMS delivery channel. notify_email falls through SES -> SMTP -> log and
  // never raises, so a server with no mail configured looks perfectly healthy
  // while every alert it "sends" only reaches a log file.
  const [delivery, setDelivery] = useState<any>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (!isAdmin) return;
    api.notificationsStatus().then(setDelivery).catch(() => setDelivery(null));
  }, [isAdmin]);
  const sendTest = async () => {
    if (testBusy) return;
    setTestBusy(true);
    setTestMsg(null);
    try {
      const r = await api.sendTestNotification();
      setTestMsg({
        ok: !!r.ok,
        text: r.ok ? `${r.detail} Check ${r.sent_to}.` : r.detail,
      });
    } catch (e: any) {
      setTestMsg({ ok: false, text: e?.message || "Could not send the test email." });
    } finally {
      setTestBusy(false);
    }
  };

  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveErr, setLeaveErr] = useState<string | null>(null);
  const leaveOrg = async () => {
    setLeaveErr(null);
    if (!confirm(
      "Leave this organization?\n\nYour account is removed and you stop receiving alerts. " +
      "You can rejoin later with the org code."
    )) return;
    setLeaveBusy(true);
    try {
      await api.leaveOrg();
      signOut();                      // the account no longer exists — drop the session
    } catch (e: any) {
      setLeaveErr(e?.message || "Could not leave the organization.");
    } finally {
      setLeaveBusy(false);
    }
  };

  const changePassword = async () => {
    // The Enter handler called this directly, bypassing the button's disabled
    // guard — holding Enter fired concurrent POSTs.
    if (pwBusy) return;
    setPwMsg(null);
    if (newPw !== confirmPw) { setPwMsg({ ok: false, text: "New passwords don't match." }); return; }
    if (newPw.length < 6) { setPwMsg({ ok: false, text: "New password must be at least 6 characters." }); return; }
    setPwBusy(true);
    try {
      await api.changePassword(curPw, newPw);
      setCurPw(""); setNewPw(""); setConfirmPw("");
      setPwMsg({ ok: true, text: "Password changed. Existing sessions stay signed in." });
    } catch (e: any) {
      setPwMsg({ ok: false, text: e?.message || "Could not change the password." });
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Settings" />
      <div className="page cols">
        {settingsErr && <div className="error" role="alert">{settingsErr}</div>}
        {isAdmin && (
          <div className="card">
            <div className="hd hd-ico"><Icon name="notifications_active" size={18} /> Alert granularity</div>
            <div className="bd">
              <p className="muted" style={{ marginTop: 0 }}>
                How alerts fire when a sensor's probes map to different exhausts.
              </p>
              <div className="segmented">
                <button className={gran === "sensor" ? "seg on" : "seg"} onClick={() => setGranularity("sensor")}>
                  <Icon name="device_thermostat" size={18} /> Per sensor
                </button>
                <button className={gran === "probe" ? "seg on" : "seg"} onClick={() => setGranularity("probe")}>
                  <Icon name="grain" size={18} /> Per probe
                </button>
              </div>
              <div className="small muted" style={{ marginTop: 8 }}>
                {gran === "probe"
                  ? "Each mapped probe alerts independently at its own exhaust."
                  : "One alert per sensor on its hottest probe (default)."}
              </div>
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="card">
            <div className="hd hd-ico">
              <Icon name="notifications_active" size={18} /> Alert reminders
            </div>
            <div className="bd">
              <label>
                How often to re-send an alert that is still active (minutes, 0 = never)
              </label>
              <input className="input-sm" type="number" min={0} max={1440} value={repeatMin}
                     onChange={(e) => setRepeatMin(e.target.value)} />
              <div className="small muted" style={{ marginTop: 6 }}>
                {repeatMin === "0"
                  ? "One email when a limit is crossed and one when it recovers — no reminders in between."
                  : `A rack still over its limit is re-reported every ${repeatMin} min until it recovers.`}
                {" "}Devices going offline always send exactly one email, then one when they return —
                that is a state, not a recurring condition, and this setting does not affect it.
              </div>
              <div style={{ marginTop: 12 }} className="btnrow">
                <button onClick={saveRepeat} disabled={repeatBusy}>
                  <Icon name="save" size={17} /> {repeatBusy ? "Saving…" : "Save"}
                </button>
                {repeatSaved && <span className="small muted">Saved.</span>}
              </div>
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="card">
            <div className="hd hd-ico"><Icon name="schedule" size={18} /> Data collection</div>
            <div className="bd">
              <label>How often devices sample & forward data (seconds, 10–3600)</label>
              <input className="input-sm" type="number" min={10} max={3600} value={interval}
                     onChange={(e) => setInterval(e.target.value)} />
              <div style={{ marginTop: 12 }} className="btnrow">
                <button onClick={saveInterval} disabled={intervalBusy}>
                  <Icon name="save" size={17} /> {intervalBusy ? "Saving…" : "Save"}
                </button>
                {intervalSaved && <span className="small muted">Saved.</span>}
              </div>
              <div className="small muted" style={{ marginTop: 8 }}>
                Recorded for reference only. Devices currently report on a fixed
                ~12&nbsp;second timer built into their firmware and do not read this
                value, so changing it does not change how often they send.
              </div>
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="card">
            <div className="hd hd-ico"><Icon name="inventory_2" size={18} /> Long-term archive</div>
            <div className="bd">
              <label>How often to record a sample in the archive (minutes, 0 = off)</label>
              <input className="input-sm" type="number" min={0} max={1440} value={archiveMin}
                     onChange={(e) => setArchiveMin(e.target.value)} />
              <div className="small muted" style={{ marginTop: 6 }}>
                {archiveMin === "0"
                  ? "Archiving is off. Nothing is copied off this server, so a disk failure would lose everything."
                  : <>Every night the readings are written to monthly CSV files and pushed to
                     GitHub, so there is a copy off this machine and a format you can analyse
                     later. {archiveSizeHint && <strong>{archiveSizeHint}</strong>} at this
                     setting.</>}
                {" "}The database always keeps every raw sample — this only thins the archive,
                so charts and alerts are unaffected.
              </div>
              {archiveTooBig && (
                <div className="small" role="alert"
                     style={{ marginTop: 6, color: "var(--red)" }}>
                  A month at this setting would exceed GitHub's 100&nbsp;MB limit for a single
                  file, and the nightly push would start failing. Use 5&nbsp;minutes or longer.
                </div>
              )}
              <div style={{ marginTop: 12 }} className="btnrow">
                <button onClick={saveArchive} disabled={archiveBusy}>
                  <Icon name="save" size={17} /> {archiveBusy ? "Saving…" : "Save"}
                </button>
                {archiveSaved && <span className="small muted">Saved.</span>}
              </div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="hd hd-ico"><Icon name="backup" size={18} /> Backup status</div>
          <div className="bd">
            {!arch ? (
              <div className="small muted">Could not read the archive status.</div>
            ) : arch.last_ok === null ? (
              <div className="small muted">
                Has not run yet. It runs once a day, or press Run now.
              </div>
            ) : (
              <>
                <div className="small" role={arch.last_ok ? "status" : "alert"}
                     style={{ color: arch.last_ok ? "var(--green)" : "var(--red)" }}>
                  {arch.last_ok
                    ? `Last run succeeded — ${arch.rows_written} rows, commit ${arch.last_commit || "none needed"}.`
                    : `Last run FAILED: ${arch.last_error}`}
                </div>
                <div className="small muted" style={{ marginTop: 6 }}>
                  {new Date((arch.last_run_at || 0) * 1000).toLocaleString()}
                  {arch.pushed === false && " · committed locally but the push to GitHub failed"}
                  {arch.pushed === null && arch.last_ok && " · pushing is disabled, the copy is on the server only"}
                </div>
              </>
            )}
            <div style={{ marginTop: 12 }} className="btnrow">
              <button className="secondary" onClick={loadArchive}>
                <Icon name="refresh" size={16} /> Refresh
              </button>
              {isAdmin && (
                <button onClick={runArchiveNow} disabled={archRunBusy || arch?.running}>
                  <Icon name="play_arrow" size={17} /> {archRunBusy ? "Running…" : "Run now"}
                </button>
              )}
              <button className="secondary"
                      onClick={() => dlCsv("/v1/readings/export.csv", "sensors.csv")}>
                <Icon name="download" size={16} /> Sensors CSV
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="hd hd-ico"><Icon name="cloud" size={18} /> Cloud server</div>
          <div className="bd">
            <label>Base URL (blank = same origin / dev proxy to :8002)</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.yourdomain.com" />
            <div style={{ marginTop: 12 }} className="btnrow">
              <button onClick={save}><Icon name="save" size={17} /> Save</button>
              {saved && <span className="small muted">Saved — reload to apply.</span>}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="hd hd-ico"><Icon name="account_circle" size={18} /> Account</div>
          <div className="row">
            <div>
              <div>{profile?.name || profile?.email}</div>
              <div className="small muted">{profile?.email} · {profile?.role} · {profile?.status}</div>
            </div>
            <button className="danger" onClick={signOut}><Icon name="logout" size={17} /> Sign out</button>
          </div>
          {/* Leaving deletes this account from the org. The server refuses if you
              are the last admin, so nobody can strand the organization. */}
          <div className="row">
            <div>
              <div>Leave organization</div>
              <div className="small muted">
                Removes your account from <b>{profile?.org_code || "this org"}</b> and stops your
                alerts. You can rejoin later with the org code.
                {isAdmin && " As an admin, promote someone else first if you're the only one."}
              </div>
            </div>
            <button className="danger" disabled={leaveBusy} onClick={leaveOrg}>
              <Icon name="exit_to_app" size={17} /> {leaveBusy ? "Leaving…" : "Leave"}
            </button>
          </div>
          {leaveErr && <div className="bd"><span className="small" style={{ color: "var(--red)" }}>{leaveErr}</span></div>}
        </div>

        {isAdmin && delivery && (
          <div className="card">
            <div className="hd hd-ico"><Icon name="outgoing_mail" size={18} /> Alert delivery</div>
            <div className="bd">
              {delivery.email_configured ? (
                <p className="small" style={{ marginTop: 0 }}>
                  Email alerts are sent via <b>{delivery.email === "ses" ? "AWS SES" : `SMTP (${delivery.smtp_host})`}</b>
                  {delivery.email_from ? <> from <span className="mono">{delivery.email_from}</span></> : null}.
                </p>
              ) : (
                <p className="small" style={{ marginTop: 0, color: "var(--red)" }}>
                  <b>Alerts are not being emailed.</b> No SES or SMTP is configured, so every alert is
                  written to the server log only. Set <span className="mono">SMTP_HOST</span>,{" "}
                  <span className="mono">SMTP_USER</span>, <span className="mono">SMTP_PASS</span> and{" "}
                  <span className="mono">MAIL_FROM</span> in the server's <span className="mono">.env</span>,
                  then restart and re-test.
                </p>
              )}
              <p className="small muted">
                SMS: {delivery.sms_configured
                  ? <>sent via <b>{delivery.sms}</b>.</>
                  : <>no SMS provider configured — SMS alerts are logged only, even for members who have SMS switched on.</>}
              </p>
              <div className="btnrow">
                <button className="secondary" onClick={sendTest} disabled={testBusy}>
                  <Icon name="send" size={16} /> {testBusy ? "Sending…" : "Send test email"}
                </button>
                {testMsg && (
                  <span
                    className="small"
                    role={testMsg.ok ? "status" : "alert"}
                    style={{ color: testMsg.ok ? "var(--green)" : "var(--red)" }}
                  >
                    {testMsg.text}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="hd hd-ico"><Icon name="lock" size={18} /> Change password</div>
          <div className="bd">
            {/* A real <form>: this was a div, so Enter did nothing in the first
                two fields and only worked in the third via a keydown hack. */}
            <form
              style={{ display: "grid", gap: 10, maxWidth: 380 }}
              onSubmit={(e) => { e.preventDefault(); changePassword(); }}
            >
              <label className="small muted">Current password
                <PasswordInput value={curPw} onChange={setCurPw} autoComplete="current-password" />
              </label>
              <label className="small muted">New password
                <PasswordInput value={newPw} onChange={setNewPw} autoComplete="new-password" />
              </label>
              <label className="small muted">Confirm new password
                <PasswordInput value={confirmPw} onChange={setConfirmPw} autoComplete="new-password" />
              </label>
              <div className="btnrow">
                <button
                  type="submit"
                  disabled={pwBusy || !curPw || !newPw || !confirmPw}
                  title={!curPw || !newPw || !confirmPw ? "Fill in all three fields" : undefined}
                >
                  {pwBusy ? "Changing…" : "Change password"}
                </button>
                {pwMsg && (
                  <span
                    className="small"
                    role={pwMsg.ok ? "status" : "alert"}
                    style={{ color: pwMsg.ok ? "var(--green)" : "var(--red)" }}
                  >
                    {pwMsg.text}
                  </span>
                )}
              </div>
              {/* Tokens here are stateless with no revocation list, so a change
                  can't boot other sessions. Be honest about that rather than
                  implying a rotation locks everyone else out. */}
              <div className="small muted">
                Changing your password does <b>not</b> sign out sessions that are already
                signed in — tokens stay valid until they expire. To force every session
                off immediately, rotate <span className="mono">JWT_SECRET</span> on the server.
              </div>
            </form>
          </div>
        </div>

        <div className="card">
          <div className="hd hd-ico"><Icon name="info" size={18} /> About</div>
          <div className="bd muted">HVAC Monitor — web dashboard v1.1.0 · device names, per-probe mapping, rack layout</div>
        </div>
      </div>
    </>
  );
}
