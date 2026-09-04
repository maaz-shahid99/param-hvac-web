import { useEffect, useMemo, useRef, useState } from "react";
import { useOtaUpdate, type OtaJob } from "../otaUpdate";
import Icon from "./Icon";

/** Copy per phase. Deliberately says what is TRUE, never a guessed percentage. */
function describe(job: OtaJob): { title: string; body: string; blocking: boolean } {
  const chip = `${job.kind.toUpperCase()} v${job.target}`;
  switch (job.phase) {
    case "approved":
      return {
        title: `Installing ${chip}`,
        body: "Update approved. Waiting for the gateway to check in…",
        blocking: true,
      };
    case "waiting":
      return {
        title: `Installing ${chip}`,
        body:
          "Waiting for the gateway to pick up the update. It checks for new firmware every few minutes.",
        blocking: true,
      };
    case "updating":
      return {
        title: `Installing ${chip}`,
        body:
          "The gateway has gone quiet, which is what happens while it downloads and writes the new firmware. Do not power it off.",
        blocking: true,
      };
    case "rebooting":
      return {
        title: `Installing ${chip}`,
        body: "The gateway is reporting again and is restarting on the new firmware.",
        blocking: true,
      };
    case "done":
      return {
        title: "Update complete",
        body: `The gateway is now running ${chip}.`,
        blocking: false,
      };
    case "failed":
      return { title: "Update not confirmed", ...failCopy(job) };
  }
}

function failCopy(job: OtaJob): { body: string; blocking: boolean } {
  switch (job.failReason) {
    case "untrackable":
      return {
        body:
          "The server can't report this gateway's status, so the update can't be tracked from here. It may still apply — check the firmware version on the Diagnostics page in a few minutes.",
        blocking: false,
      };
    case "no-pickup":
      return {
        body:
          "The gateway hasn't picked up the update yet. It stays approved and will apply on a later check — no need to approve it again.",
        blocking: false,
      };
    case "stalled":
      return {
        body:
          "The gateway stopped reporting and hasn't come back. It may still be writing firmware, or it may need a power cycle. Check the Diagnostics page before re-approving.",
        blocking: false,
      };
    case "unchanged":
      return {
        body:
          "The gateway is reporting again but is still on its previous firmware, so the update didn't take. It stays approved and will retry.",
        blocking: false,
      };
    default:
      return { body: "The update could not be confirmed from here.", blocking: false };
  }
}

function elapsed(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(t / 60);
  const sec = t % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/**
 * Blocking progress dialog for an approved firmware update.
 *
 * Blocking is the point: the only uplink to the whole mesh is mid-flash, and an
 * admin clicking into Diagnostics to queue a reboot at that moment would be
 * actively harmful. But it always has an escape once the outcome is known or a
 * budget blows — never trap someone whose gateway died.
 */
export default function OtaProgressModal() {
  const { job, dismiss, openerRef } = useOtaUpdate();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Re-render once a second purely to advance the timer.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!job) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [job?.kind, job?.target, !!job]);

  const info = useMemo(() => (job ? describe(job) : null), [job, job?.phase]);

  // Focus the dialog on open; restore afterwards. The opener button will usually
  // be GONE by then — OtaBanner unmounts as soon as the build drops off
  // /v1/ota/available — so guard on isConnected instead of assuming.
  useEffect(() => {
    if (!job) {
      const el = openerRef.current;
      if (el && el.isConnected) el.focus();
      return;
    }
    (closeRef.current ?? dialogRef.current)?.focus();
  }, [!!job]);

  // Trap Tab inside the dialog. `inert` on the shell covers modern browsers;
  // this covers the rest. Neither alone is sufficient.
  useEffect(() => {
    if (!job) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Swallowed while blocking, dismisses once the outcome is known.
        e.preventDefault();
        if (!info?.blocking) dismiss();
        return;
      }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const f = root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (f.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [job, info?.blocking, dismiss]);

  if (!job || !info) return null;

  const failed = job.phase === "failed";
  const done = job.phase === "done";

  return (
    <div className="ota-scrim" role="presentation">
      <div
        className="ota-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ota-modal-title"
        aria-describedby="ota-modal-body"
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className={`ota-modal-ico${done ? " ok" : failed ? " bad" : ""}`}>
          <Icon
            name={done ? "check_circle" : failed ? "error" : "system_update"}
            size={26}
          />
        </div>

        <h2 id="ota-modal-title">{info.title}</h2>

        {/* One live region, and it holds the phase sentence ONLY. The timer is
            outside it and aria-hidden, or a screen reader would re-announce the
            whole dialog every single second. */}
        <p
          id="ota-modal-body"
          className="ota-modal-body"
          aria-live={failed ? "off" : "polite"}
          role={failed ? "alert" : undefined}
        >
          {info.body}
        </p>

        {!done && !failed && (
          <div
            className="ota-bar"
            role="progressbar"
            aria-valuetext={info.body}
            aria-label="Firmware update progress"
          >
            <span />
          </div>
        )}

        <div className="ota-modal-meta" aria-hidden="true">
          {!done && !failed && <>Elapsed {elapsed(Date.now() - job.startedAt)}</>}
          {job.errors > 0 && (
            <span className="ota-modal-warn">
              {" "}
              · can't reach the server, retrying
            </span>
          )}
        </div>

        {(done || failed) && (
          <div className="ota-modal-actions">
            <button ref={closeRef} onClick={dismiss} autoFocus>
              {done ? "Done" : "Dismiss"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
