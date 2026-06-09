import { useEffect, useState } from "react";
import { api, autoName, downloadCsv } from "../api";
import { ago, nowSec } from "../components/Cards";
import PageHeader from "../components/PageHeader";
import Icon from "../components/Icon";

type Crash = {
  id: string; eui: string; ts: number; reset_reason: string;
  fw: string; pc: string; backtrace: string; detail: string;
};

export default function DiagnosticsPage() {
  const [crashes, setCrashes] = useState<Crash[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  async function refresh() {
    try { setCrashes((await api.crashes()).crashes || []); setErr(null); }
    catch (e: any) { setErr(e.message); }
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
                    <div className="hd-ico">{autoName(c.eui)} <span className="badge grey">{c.reset_reason || "crash"}</span></div>
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
