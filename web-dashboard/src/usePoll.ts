import { useEffect, useRef } from "react";

/**
 * setInterval replacement for the dashboard's pollers.
 *
 * Three problems with the raw `setInterval(fn, ms)` this replaces:
 *
 *  1. It never paused. Every page polls, and PageHeader's bell polls on top, so
 *     an idle dashboard issued ~30 requests/minute — roughly 43,000 overnight
 *     for a tab nobody was looking at.
 *  2. It never skipped an in-flight request. On a slow link the calls overlapped
 *     and responses could land out of order, so an older alert count could
 *     overwrite a newer one.
 *  3. It kept running while the tab was hidden, then showed stale data on return
 *     because the next tick was up to a full interval away.
 *
 * This pauses on `document.hidden`, refetches immediately on becoming visible so
 * the data is current the moment you look at it, and holds a guard so a slow
 * response can't overlap the next tick.
 */
export function usePoll(fn: () => void | Promise<void>, ms: number) {
  const saved = useRef(fn);
  saved.current = fn;

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;

    const run = async () => {
      if (stopped || inFlight || document.hidden) return;
      inFlight = true;
      try {
        await saved.current();
      } finally {
        inFlight = false;
      }
    };

    const schedule = () => {
      if (timer) clearInterval(timer as any);
      timer = setInterval(run, ms);
    };

    const onVisibility = () => {
      if (document.hidden) {
        if (timer) { clearInterval(timer as any); timer = null; }
      } else {
        run();      // don't make the user wait a full interval for fresh data
        schedule();
      }
    };

    run();
    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      if (timer) clearInterval(timer as any);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ms]);
}
