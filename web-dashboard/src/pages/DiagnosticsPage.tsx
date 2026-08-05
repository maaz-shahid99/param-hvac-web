import { useEffect, useState } from "react";
import { api, autoName, downloadCsv } from "../api";
import { ago, nowSec } from "../components/Cards";
import PageHeader from "../components/PageHeader";
import Icon from "../components/Icon";

type Crash = {
  id: string; eui: string; ts: number; reset_reason: string;
  fw: string; pc: string; backtrace: string; detail: string;
  /** Identical retries collapsed by the server; one panic uploads ~6 times. */
  occurrences?: number; first_ts?: number;
};

type Fleet = { fw_c3: number; fw_c6: number; heap_free: number; role: string; updated_at: number };

/** Resolve a crash's device to a truthful label.
 *
 *  A crash report can only come from a C3 (Bridge) panic, and the C6 tags it with
 *  its OWN EUI — so the device is always a gateway or router, never a sensor.
 *  This used to render autoName(eui) with its "sensor" default, labelling every
 *  crash "Sensor-XXXX" and sending you looking at the wrong hardware. Prefer the
 *  commissioned name / real kind, and fall back to a neutral "Device-XXXX" rather
 *  than asserting a kind we haven't confirmed.
 */
function crashLabel(eui: string, known: Record<string, { name?: string; kind?: string }>): string {
  const hit = known[(eui || "").trim().toLowerCase()];
  if (hit?.name) return hit.name;
  if (hit?.kind === "gateway" || hit?.kind === "router") return autoName(eui, hit.kind);
  const e = (eui || "").trim();
  return `Device-${(e.length >= 4 ? e.slice(-4) : e).toUpperCase()}`;
}

export default function DiagnosticsPage() {
  const [crashes, setCrashes] = useState<Crash[]>([]);
  const [fleet, setFleet] = useState<Fleet | null>(null);
  const [known, setKnown] = useState<Record<string, { name?: string; kind?: string }>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  async function refresh() {
    try { setCrashes((await api.crashes()).crashes || []); setErr(null); }
    catch (e: any) { setErr(e.message); }
    try { setFleet(((await api.fleet()) as { fleet: Fleet | null }).fleet); } catch { /* older server */ }
    // Best-effort identity lookup; a failure here only costs us nicer labels.
    try {
      const [devs, mesh] = await Promise.all([api.devices(), api.routers()]);
      const map: Record<string, { name?: string; kind?: string }> = {};
      for (const m of (mesh.routers || []) as any[]) {
        const e = String(m.eui || "").toLowerCase();
        if (e) map[e] = { ...(map[e] || {}), kind: m.kind };
      }
      for (const d of (devs.devices || []) as any[]) {
        const e = String(d.eui || "").toLowerCase();
        if (e) map[e] = { ...(map[e] || {}), name: d.name || undefined, kind: map[e]?.kind || d.kind };
      }
      setKnown(map);
    } catch { /* labels degrade to Device-XXXX */ }
  }
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, []);

  const dl = async () => {
    setBusy(true);
    try { await downloadCsv("/v1/crashes/export.csv", "crashes.csv"); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Diagnostics">
        <button className="secondary" disabled={busy} onClick={dl}><Icon name="download" size={16} /> CSV</button>
        <button className="secondary" onClick={refresh}><Icon name="refresh" size={17} /> Refresh</button>
      </PageHeader>
      <div className="page">
        {err && <div className="error">{err}</div>}
        {fleet && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="hd hd-ico"><Icon name="memory" size={18} /> Gateway health</div>
            <div className="row">
              <div className="btnrow">
                <span className="iconwrap blue"><Icon name="memory" size={20} /></span>
                <div>
                  <div>Free heap: <b>{fleet.heap_free ? `${(fleet.heap_free / 1024).toFixed(1)} KB` : "—"}</b></div>
                  <div className="small muted mono">
                    C3 v{fleet.fw_c3} · C6 v{fleet.fw_c6} · role {fleet.role || "—"}
                    {fleet.updated_at ? ` · ${ago(nowSec() - fleet.updated_at)}` : ""}
                  </div>
                </div>
              </div>
              {/* A heap that trends down between reboots points at a leak in the gateway. */}
              <span className={`badge ${fleet.heap_free && fleet.heap_free < 40000 ? "grey" : "green"}`}>
                {fleet.heap_free && fleet.heap_free < 40000 ? "LOW" : "OK"}
              </span>
            </div>
          </div>
        )}
        <div className="card">
          <div className="hd hd-ico"><Icon name="bug_report" size={18} /> Firmware crash reports ({crashes.length})</div>
          {crashes.length === 0 ? (
            <div className="bd muted">No crashes reported.</div>
          ) : crashes.map((c) => (
            <div key={c.id}>
              <div className="row" style={{ cursor: "pointer" }} onClick={() => setOpen(open === c.id ? null : c.id)}>
                <div className="btnrow">
                  <span className="iconwrap pink"><Icon name="warning" size={20} /></span>
                  <div>
                    <div className="hd-ico">
                      {crashLabel(c.eui, known)} <span className="badge grey">{c.reset_reason || "crash"}</span>
                      {/* One panic is re-uploaded ~6x; the server collapses them. */}
                      {(c.occurrences || 1) > 1 && (
                        <span className="badge grey" title="identical retry uploads of the same crash">
                          ×{c.occurrences}
                        </span>
                      )}
                    </div>
                    <div className="small muted mono">{c.eui} · {c.fw || "—"}{c.ts ? ` · ${ago(nowSec() - c.ts)}` : ""}</div>
                  </div>
                </div>
                <Icon name={open === c.id ? "expand_less" : "expand_more"} size={20} />
              </div>
              {open === c.id && (
                <div className="bd small mono" style={{ whiteSpace: "pre-wrap" }}>
                  PC: {c.pc || "—"}{"\n"}backtrace: {c.backtrace || "—"}{c.detail ? `\n${c.detail}` : ""}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
