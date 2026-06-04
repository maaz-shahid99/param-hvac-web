import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import PageHeader from "../components/PageHeader";

export default function MembersPage() {
  const { isAdmin, profile } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const r = await api.members("all");
      setMembers(r.members || []);
      setErr(null);
    } catch (e: any) {
      setErr(e.message || "Could not load members.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function guard(fn: () => Promise<any>) {
    try {
      await fn();
      await load();
    } catch (e: any) {
      alert(e.message || "Failed");
    }
  }

  const pending = members.filter((m) => m.status === "pending");
  const active = members.filter((m) => m.status === "active");

  return (
    <>
      <PageHeader title="Members">
        <button className="secondary" onClick={load}>Refresh</button>
      </PageHeader>
      <div className="page">
        {err && <div className="error">{err}</div>}

        {isAdmin && (
          <div className="card">
            <div className="hd">Organization code</div>
            <div className="row">
              <span className="mono" style={{ fontSize: 18, letterSpacing: 2 }}>
                {profile?.org_code || "—"}
              </span>
              <button
                className="ghost"
                onClick={() => {
                  navigator.clipboard?.writeText(profile?.org_code || "");
                }}
              >
                Copy
              </button>
            </div>
            <div className="bd small muted">Share this code so members can request to join.</div>
          </div>
        )}

        {loading ? (
          <div className="center-msg">Loading…</div>
        ) : (
          <>
            {isAdmin && pending.length > 0 && (
              <div className="card">
                <div className="hd">Join requests ({pending.length})</div>
                {pending.map((m) => (
                  <div className="row" key={m.id}>
                    <div>
                      <div>{m.name || m.email}</div>
                      <div className="small muted">{m.email}{m.phone ? ` · ${m.phone}` : ""}</div>
                    </div>
                    <div className="btnrow">
                      <button className="secondary" onClick={() => guard(() => api.rejectMember(m.id))}>
                        Reject
                      </button>
                      <button onClick={() => guard(() => api.approveMember(m.id))}>Approve</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="card">
              <div className="hd">Members ({active.length})</div>
              {active.length === 0 && <div className="bd muted">No active members yet.</div>}
              {active.map((m) => (
                <div className="row" key={m.id}>
                  <div>
                    <div>
                      {m.name || m.email}{" "}
                      {m.role === "admin" && <span className="badge grey">admin</span>}
                    </div>
                    <div className="small muted">{m.email}{m.phone ? ` · ${m.phone}` : ""}</div>
                  </div>
                  {isAdmin ? (
                    <div className="btnrow">
                      <Toggle
                        label="Email"
                        on={m.email_enabled}
                        onClick={() => guard(() => api.setMemberNotify(m.id, { email_enabled: !m.email_enabled }))}
                      />
                      <Toggle
                        label="SMS"
                        on={m.sms_enabled}
                        disabled={!m.phone}
                        onClick={() => guard(() => api.setMemberNotify(m.id, { sms_enabled: !m.sms_enabled }))}
                      />
                    </div>
                  ) : (
                    <div className="btnrow">
                      {m.email_enabled && <span className="badge green">Email</span>}
                      {m.sms_enabled && <span className="badge green">SMS</span>}
                      {!m.email_enabled && !m.sms_enabled && <span className="small muted">No alerts</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Toggle({
  label,
  on,
  disabled,
  onClick,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="toggle" title={disabled ? "No phone number" : ""}>
      <span className="small muted">{label}</span>
      <div
        className={`switchbtn ${on ? "on" : ""}`}
        style={{ opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? "none" : "auto" }}
        onClick={onClick}
      />
    </div>
  );
}
