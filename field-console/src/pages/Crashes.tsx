import { Fragment, useEffect, useState } from "react";
import Icon from "../components/Icon";
import { ago, api, autoName, downloadCsv, nowSec } from "../api";

export default function Crashes() {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const d = await api.crashes();
      setRows(d.crashes || []);
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
          <Icon name="bug_report" size={24} color="var(--accent)" /> Crash Reports
        </h2>
        <div className="btnrow">
          <button className="ghost" onClick={() => downloadCsv("/v1/support/crashes?format=csv", "fleet_crashes.csv")}>
            <Icon name="download" size={18} /> CSV
          </button>
          <button className="ghost" onClick={refresh}>
            <Icon name="refresh" size={18} /> Refresh
          </button>
        </div>
      </div>
      {err && <div className="err">{err}</div>}
      {loading && <div className="muted">Loading…</div>}
      {!loading && rows.length === 0 && <div className="muted">No crash reports. 🎉</div>}

      {rows.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Tenant</th>
                <th>Device</th>
                <th>Reset</th>
                <th>FW</th>
                <th>PC</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <Fragment key={c.id}>
                  <tr className="click" onClick={() => setOpen(open === c.id ? null : c.id)}>
                    <td className="muted small">{ago(nowSec() - c.ts)}</td>
                    <td>{c.tenant}</td>
                    <td>
                      {autoName(c.eui)}
                      <div className="mono small muted">{c.eui}</div>
                    </td>
                    <td>
                      <span className="badge red">{c.reset_reason || "panic"}</span>
                    </td>
                    <td className="mono small">{c.fw || "—"}</td>
                    <td className="mono small">{c.pc || "—"}</td>
                    <td>
                      <Icon name={open === c.id ? "expand_less" : "expand_more"} size={18} />
                    </td>
                  </tr>
                  {open === c.id && (
                    <tr>
                      <td colSpan={7} style={{ background: "var(--panel2)" }}>
                        <Decode crash={c} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Decode({ crash }: { crash: any }) {
  // Both the C3 and C6 are RISC-V (ESP32-C3 / C6), so the same toolchain decodes
  // either PC. The engineer runs this locally against the .elf for `fw`.
  const elf = crash.fw ? `${crash.fw}.elf` : "<firmware>.elf";
  const cmd = `riscv32-esp-elf-addr2line -fCe ${elf} ${crash.pc || "<pc>"}`;
  const [copied, setCopied] = useState(false);
  return (
    <div>
      {crash.backtrace && (
        <>
          <div className="muted small" style={{ marginBottom: 4 }}>Backtrace / task</div>
          <pre className="bt">{crash.backtrace}</pre>
        </>
      )}
      {crash.detail && (
        <>
          <div className="muted small" style={{ margin: "8px 0 4px" }}>Detail</div>
          <pre className="bt">{crash.detail}</pre>
        </>
      )}
      <div className="muted small" style={{ margin: "8px 0 4px" }}>Decode (run locally with the matching build's .elf)</div>
      <div className="btnrow">
        <pre className="bt" style={{ flex: 1, margin: 0 }}>{cmd}</pre>
        <button
          className="ghost"
          onClick={() => {
            navigator.clipboard?.writeText(cmd);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          <Icon name={copied ? "check" : "content_copy"} size={16} /> {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
