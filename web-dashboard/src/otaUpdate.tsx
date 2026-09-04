import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, type FleetSnapshot } from "./api";
import { usePoll } from "./usePoll";

/**
 * Tracking for an in-flight firmware update, so approving one stops being a
 * silent act of faith.
 *
 * Before this, `approveOta()` returned in milliseconds, the banner's button
 * flicked back from "Approving…", and then the whole banner vanished — because
 * an approved build drops off /v1/ota/available on the very next poll. Meanwhile
 * the gateway takes 2-8 minutes to actually pick up, download, flash and reboot.
 * The admin had no idea whether anything was happening.
 *
 * ## There is no byte progress, and we do not invent any
 *
 * Nothing in the cloud server records bytes transferred, a percentage or a
 * transfer rate — the only OTA state is OtaState.approved_c3/approved_c6. So
 * this reports PHASES with an indeterminate bar and a real elapsed timer. A
 * fabricated percentage would be worse than none: it would be read as fact.
 *
 * ## Phases are observed, not guessed
 *
 * The gateway's loop() is single-threaded and fully blocked during download and
 * flash (Bridge.ino, task watchdog deliberately detached), so its 30s mesh push
 * STOPS while it updates. That silence is a genuine signal, not an inference:
 *
 *   approved   the approve call resolved
 *   waiting    fleet.updated_at still advancing — alive, hasn't picked it up
 *   updating   updated_at stopped advancing — blocked in the OTA loop
 *   rebooting  pushes resumed but the new version isn't announced yet
 *   done       fleet.fw_c3 (or fw_c6) >= the target version
 *   failed     a per-phase budget blew, or the fleet became untrackable
 *
 * Two rules keep it honest:
 *
 *  - Silence is measured as `lastGoodPollAt - lastPushChangedAt`: only time we
 *    ACTUALLY OBSERVED the value unchanged. Otherwise a cloud outage or a hidden
 *    tab would masquerade as "flashing".
 *  - We never compute `Date.now() - fleet.updated_at`. updated_at is stamped by
 *    the appliance, whose clock runs ~35s ahead of the browser here (see
 *    Cards.ago()), so that subtraction produces negative ages and nonsense.
 */

export type OtaPhase =
  | "approved"
  | "waiting"
  | "updating"
  | "rebooting"
  | "done"
  | "failed";

export type OtaJob = {
  kind: string; // "c3" | "c6"
  target: number; // version we are waiting to see announced
  phase: OtaPhase;
  startedAt: number; // local ms, survives a refresh
  phaseSince: number; // local ms
  /** Last `fleet.updated_at` we saw (appliance clock — compared, never subtracted from now). */
  lastPushValue: number | null;
  /** Local ms when `lastPushValue` last CHANGED. */
  lastPushChangedAt: number | null;
  /** Local ms of the last poll that actually succeeded. */
  lastGoodPollAt: number | null;
  /** Consecutive transient failures; phase and clocks freeze while non-zero. */
  errors: number;
  /** reboot_req latched at silence onset — an admin-queued reboot lengthens the budget. */
  rebootLatched: boolean;
  failReason?: string;
};

/** One poll result. `ok:false` is a transport failure, which must NOT be read as progress. */
export type FleetSample =
  | { ok: true; fleet: FleetSnapshot | null }
  | { ok: false };

/**
 * Speed every timer up for manual testing:
 *   VITE_OTA_TIMESCALE=60 npm run dev
 * makes the 7-minute budget reachable in 7 seconds. Ships as a no-op.
 */
const SCALE = Number(import.meta.env.VITE_OTA_TIMESCALE) || 1;
const s = (ms: number) => ms / SCALE;

/* Budgets are PER PHASE, not one flat timer. Worst case is
 * <=300s OTA poll + 90s gateway stagger + 60-180s flash + <=30s push ~ 8-10 min,
 * so a single 10-minute stall timer would fire during a legitimate slow update. */
const WAITING_BUDGET = s(7 * 60_000); // gateway hasn't picked it up
const UPDATING_BUDGET = s(5 * 60_000); // blocked in download+flash
const REBOOTING_BUDGET = s(2 * 60_000); // pushing again, version not announced
const SILENCE_FOR_UPDATING = s(75_000); // >2 missed 30s pushes
const SILENCE_WITH_REBOOT = s(150_000); // an admin-queued reboot also stops pushes

const STORAGE_KEY = "ota_job_v1";
const RESTORE_MAX_AGE = 20 * 60_000;

function fwFor(kind: string, f: FleetSnapshot): number | null {
  const v = kind === "c6" ? f.fw_c6 : f.fw_c3;
  return typeof v === "number" ? v : null;
}

const to = (job: OtaJob, phase: OtaPhase, now: number, failReason?: string): OtaJob =>
  job.phase === phase ? job : { ...job, phase, phaseSince: now, failReason };

/**
 * The whole state machine, pure and with `now` injected so it can be driven from
 * a scripted list of samples in a test without any hardware or clock mocking.
 */
export function advance(job: OtaJob, sample: FleetSample, now: number): OtaJob {
  if (job.phase === "done" || job.phase === "failed") return job;

  // A transport failure is not evidence about the gateway. Freeze everything —
  // rendering an outage as "installing" would be a lie the admin acts on.
  if (!sample.ok) return { ...job, errors: job.errors + 1 };

  // An older server has no /v1/fleet at all; `{fleet:null}` means it has never
  // heard from this gateway. Either way we cannot track, and blocking the UI
  // forever on that would be the worst possible outcome.
  if (!sample.fleet) {
    return to(job, "failed", now, "untrackable");
  }

  const f = sample.fleet;
  let next: OtaJob = { ...job, errors: 0, lastGoodPollAt: now };

  // Compare the appliance's own timestamp with the previous one we saw; record
  // when it CHANGED in local time.
  const pushed = typeof f.updated_at === "number" ? f.updated_at : null;
  if (pushed !== null && pushed !== next.lastPushValue) {
    next = { ...next, lastPushValue: pushed, lastPushChangedAt: now };
  } else if (next.lastPushChangedAt === null) {
    next = { ...next, lastPushChangedAt: now };
  }

  // Success beats every other rule: `>=` not `===`, so if a second admin
  // approves a newer build this job resolves instead of hanging forever.
  const fw = fwFor(job.kind, f);
  if (fw !== null && fw >= job.target) return to(next, "done", now);

  const silence =
    next.lastGoodPollAt !== null && next.lastPushChangedAt !== null
      ? next.lastGoodPollAt - next.lastPushChangedAt
      : 0;
  const rebootLatched = next.rebootLatched || !!f.reboot_req;
  const silenceLimit = rebootLatched ? SILENCE_WITH_REBOOT : SILENCE_FOR_UPDATING;
  next = { ...next, rebootLatched };

  const inPhase = now - next.phaseSince;

  switch (next.phase) {
    case "approved":
      return to(next, "waiting", now);

    case "waiting":
      if (silence >= silenceLimit) return to(next, "updating", now);
      if (inPhase >= WAITING_BUDGET) return to(next, "failed", now, "no-pickup");
      return next;

    case "updating":
      // Pushes resumed but the version hasn't changed yet -> it rebooted and is
      // coming back up.
      if (silence < silenceLimit) return to(next, "rebooting", now);
      if (inPhase >= UPDATING_BUDGET) return to(next, "failed", now, "stalled");
      return next;

    case "rebooting":
      if (inPhase >= REBOOTING_BUDGET) return to(next, "failed", now, "unchanged");
      return next;

    default:
      return next;
  }
}

export function newJob(kind: string, target: number, now: number): OtaJob {
  return {
    kind,
    target,
    phase: "approved",
    startedAt: now,
    phaseSince: now,
    lastPushValue: null,
    lastPushChangedAt: null,
    lastGoodPollAt: null,
    errors: 0,
    rebootLatched: false,
  };
}

type Ctx = {
  job: OtaJob | null;
  /** Begin tracking. `opener` is restored focus on close, if it still exists. */
  track: (kind: string, target: number, opener?: HTMLElement | null) => void;
  dismiss: () => void;
  openerRef: React.MutableRefObject<HTMLElement | null>;
};

const OtaCtx = createContext<Ctx>({
  job: null,
  track: () => {},
  dismiss: () => {},
  openerRef: { current: null },
});

export const useOtaUpdate = () => useContext(OtaCtx);

function restore(now: number): OtaJob | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as OtaJob;
    if (!j || typeof j.startedAt !== "number") return null;
    if (now - j.startedAt > RESTORE_MAX_AGE) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    if (j.phase === "done" || j.phase === "failed") return null;
    // Reset every OBSERVATION clock: we saw nothing while the page was gone, and
    // carrying the old ones over would read that gap as flashing silence.
    return {
      ...j,
      phaseSince: now,
      lastPushValue: null,
      lastPushChangedAt: null,
      lastGoodPollAt: null,
      errors: 0,
    };
  } catch {
    return null;
  }
}

/**
 * Owns the job at SHELL level, deliberately — not inside OtaBanner.
 *
 * OtaBanner early-returns null the moment the approved build drops off
 * /v1/ota/available, i.e. on the first poll after approval. State kept there
 * would be destroyed mid-update. This follows the existing NavCtx precedent in
 * Layout: provider at the shell, consumed by a child that may unmount.
 */
export function OtaUpdateProvider({ children }: { children: ReactNode }) {
  const [job, setJob] = useState<OtaJob | null>(() => restore(Date.now()));
  const jobRef = useRef<OtaJob | null>(job);
  const openerRef = useRef<HTMLElement | null>(null);

  const write = useCallback((j: OtaJob | null) => {
    jobRef.current = j;
    setJob(j);
    try {
      if (j && j.phase !== "done" && j.phase !== "failed")
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(j));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* private mode: tracking still works for this page's lifetime */
    }
  }, []);

  const track = useCallback(
    (kind: string, target: number, opener?: HTMLElement | null) => {
      openerRef.current = opener ?? null;
      write(newJob(kind, target, Date.now()));
    },
    [write]
  );

  const dismiss = useCallback(() => {
    write(null);
  }, [write]);

  const poll = useCallback(async () => {
    const current = jobRef.current;
    if (!current) return;
    let sample: FleetSample;
    try {
      const r = (await api.fleet()) as { fleet?: FleetSnapshot | null };
      sample = { ok: true, fleet: r?.fleet ?? null };
    } catch {
      sample = { ok: false };
    }
    const nextJob = advance(jobRef.current!, sample, Date.now());
    if (nextJob !== jobRef.current) write(nextJob);
  }, [write]);

  // Never pass 0 — that busy-loops setInterval. usePoll keeps `fn` in a ref and
  // depends only on [ms], so changing the interval re-arms it and polls at once.
  usePoll(poll, job ? 5_000 : 3_600_000);

  return (
    <OtaCtx.Provider value={{ job, track, dismiss, openerRef }}>
      {children}
    </OtaCtx.Provider>
  );
}
