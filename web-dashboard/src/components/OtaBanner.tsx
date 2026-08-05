import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import Icon from "./Icon";

/** One optional update as returned by GET /v1/ota/available. */
type Update = {
  kind: string; // "c3" | "c6"
  version: number;
  current: number;
  notes?: string;
  approved?: boolean;
};

/**
 * Prompt for OPTIONAL firmware updates the manufacturer published — the web
 * counterpart of the app's OtaUpdateBanner, so an admin at a desk can approve a
 * rollout without reaching for the phone.
 *
 * Polls every 60s and lists only builds that aren't approved yet. An admin gets
 * "Update now" (the gateway applies it on its next OTA poll); members are told to
 * ask an admin, matching the server, where /v1/ota/approve is admin-only.
 * Mandatory updates never appear here — the fleet auto-applies those.
 *
 * Renders nothing when there's nothing pending, so it's safe to mount app-wide.
 */
export default function OtaBanner() {
  const { profile, status } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [updates, setUpdates] = useState<Update[]>([]);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);

  const poll = useCallback(async () => {
    if (status !== "signedIn") {
      setUpdates([]);
      return;
    }
    try {
      const res = (await api.otaAvailable()) as { updates?: Update[] };
      setUpdates((res.updates ?? []).filter((u) => u.approved !== true));
    } catch {
      // Best-effort: keep the last state on a transient failure rather than
      // flickering the banner away.
    }
  }, [status]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 60_000);
    return () => clearInterval(t);
  }, [poll]);

  async function approve(u: Update) {
    setBusy((b) => new Set(b).add(u.kind));
    setErr(null);
    try {
      await api.approveOta(u.kind, u.version);
      await poll();
    } catch (e) {
      setErr(
        e instanceof ApiError
          ? `Update failed: ${e.message}`
          : "Update failed: could not reach the cloud server."
      );
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(u.kind);
        return n;
      });
    }
  }

  if (updates.length === 0) return null;

  return (
    <div className="ota-wrap">
      {err && <div className="error">{err}</div>}
      {updates.map((u) => (
        <div className="ota-banner" key={`${u.kind}-${u.version}`}>
          <span className="ota-ico">
            <Icon name="system_update" size={22} />
          </span>
          <div className="ota-txt">
            <b>
              Firmware update available · {u.kind.toUpperCase()} v{u.version}
            </b>
            <div className="sub">
              {u.notes?.trim()
                ? u.notes
                : `Optional update — the fleet is on v${u.current}.`}
            </div>
          </div>
          {isAdmin ? (
            <button onClick={() => approve(u)} disabled={busy.has(u.kind)}>
              {busy.has(u.kind) ? "Approving…" : "Update now"}
            </button>
          ) : (
            <span className="sub">Ask an admin</span>
          )}
        </div>
      ))}
    </div>
  );
}
