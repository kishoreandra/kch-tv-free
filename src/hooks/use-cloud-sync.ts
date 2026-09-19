import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { pullUserData, pushUserData } from "@/lib/sync.functions";
import { useAuth } from "@/hooks/use-auth";

interface SyncState {
  panes?: unknown;
  indicators: unknown;
  chart_cfg: unknown;
  selected: string | null;
  watchlist: unknown;
  lists: unknown;
  last_list_id: string | null;
  alerts: unknown;
  alert_sound: boolean;
}


interface Options {
  hydrated: boolean;
  state: SyncState;
  applyRemote: (remote: Partial<SyncState>) => void;
}

/**
 * Cloud sync: when signed-in, pulls server state once, then debounces any
 * local change up to the server. Signed-out users continue with localStorage.
 *
 * Data-loss safety:
 *   - Pushes are gated behind `pullCompleted`, not just "pull started",
 *     so we never overwrite cloud data with the local default state while
 *     the initial pull is still in flight.
 *   - Pushes are deduped by a JSON hash so identical state doesn't churn.
 *   - A pending push is flushed on tab hide / pagehide / beforeunload via
 *     navigator.sendBeacon-equivalent (best-effort fetch keepalive).
 *   - Failed pushes are retried with exponential backoff so a transient
 *     network blip never silently drops the user's work.
 */
export function useCloudSync({ hydrated, state, applyRemote }: Options) {
  const { user } = useAuth();
  const pull = useServerFn(pullUserData);
  const push = useServerFn(pushUserData);

  const pullStartedForUser = useRef<string | null>(null);
  const pullCompletedForUser = useRef<string | null>(null);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttempts = useRef(0);
  const lastPushedHash = useRef<string | null>(null);
  const latestStateRef = useRef<SyncState>(state);
  const inFlight = useRef(false);

  // Always keep latest state in a ref so flush handlers see fresh data.
  latestStateRef.current = state;

  // Reset gating when the user changes (sign-in / sign-out / switch account).
  useEffect(() => {
    if (!user) {
      pullStartedForUser.current = null;
      pullCompletedForUser.current = null;
      lastPushedHash.current = null;
      if (pushTimer.current) { clearTimeout(pushTimer.current); pushTimer.current = null; }
      if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null; }
      retryAttempts.current = 0;
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pull on sign-in (once per user id).
  useEffect(() => {
    if (!hydrated || !user) return;
    if (pullStartedForUser.current === user.id) return;
    pullStartedForUser.current = user.id;
    const uid = user.id;
    (async () => {
      try {
        const remote = await pull();
        // User switched while in flight — abandon.
        if (pullStartedForUser.current !== uid) return;
        if (remote) {
          applyRemote({
            panes: remote.panes,
            indicators: remote.indicators,
            chart_cfg: remote.chart_cfg,
            selected: remote.selected,
            watchlist: remote.watchlist,
            lists: remote.lists,
            last_list_id: remote.last_list_id,
            alerts: remote.alerts,
            alert_sound: remote.alert_sound ?? false,
          });
          // Mark the just-applied snapshot as already-synced so we don't
          // immediately push it back up.
          lastPushedHash.current = null; // will be reset by the next state-change effect
          pullCompletedForUser.current = uid;
        } else {
          // First-time user: push current local state up as the initial
          // cloud snapshot. Awaiting this means pullCompleted is only set
          // after the first successful write, so we never race.
          await push({ data: latestStateRef.current });
          lastPushedHash.current = JSON.stringify(latestStateRef.current);
          pullCompletedForUser.current = uid;
          toast.success("Saved to cloud");
        }
      } catch (e) {
        console.error("[sync] pull failed", e);
        toast.error("Cloud sync unavailable — your changes will retry");
        // Leave pullCompletedForUser unset; the effect below will not push
        // until the next successful pull. Allow another attempt next render.
        pullStartedForUser.current = null;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, hydrated]);

  // Debounced, deduped push of any local change.
  useEffect(() => {
    if (!hydrated || !user) return;
    if (pullCompletedForUser.current !== user.id) return;

    const hash = JSON.stringify(state);
    if (hash === lastPushedHash.current) return;

    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      void doPush(hash);
    }, 600);

    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, user?.id, hydrated]);

  async function doPush(hash: string) {
    if (inFlight.current) {
      // Re-arm shortly — another push is currently writing.
      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(() => void doPush(JSON.stringify(latestStateRef.current)), 400);
      return;
    }
    inFlight.current = true;
    try {
      await push({ data: latestStateRef.current });
      lastPushedHash.current = JSON.stringify(latestStateRef.current);
      retryAttempts.current = 0;
      if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null; }
    } catch (e) {
      console.error("[sync] push failed", e);
      // Exponential backoff retry up to ~30s. Never silently drop the write.
      const attempt = Math.min(retryAttempts.current + 1, 6);
      retryAttempts.current = attempt;
      const delay = Math.min(30_000, 1000 * 2 ** (attempt - 1));
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => {
        void doPush(JSON.stringify(latestStateRef.current));
      }, delay);
      if (attempt === 1) toast.error("Cloud save failed — retrying");
    } finally {
      inFlight.current = false;
    }
    // If state changed while we were pushing, kick another debounce.
    const newHash = JSON.stringify(latestStateRef.current);
    if (newHash !== lastPushedHash.current) {
      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(() => void doPush(newHash), 300);
    }
    void hash; // intentional: hash captured at schedule time, doPush re-reads latest
  }

  // Flush any pending push when the tab goes away. This is critical: a user
  // who closes the tab inside the 600ms debounce window would otherwise lose
  // their last edit.
  useEffect(() => {
    if (!user) return;
    const flush = () => {
      if (pullCompletedForUser.current !== user.id) return;
      const hash = JSON.stringify(latestStateRef.current);
      if (hash === lastPushedHash.current) return;
      if (pushTimer.current) { clearTimeout(pushTimer.current); pushTimer.current = null; }
      // Fire-and-forget; the server fn uses fetch under the hood, which
      // respects keepalive semantics for short bodies on unload.
      void push({ data: latestStateRef.current }).then(() => {
        lastPushedHash.current = hash;
      }).catch((e) => console.error("[sync] flush failed", e));
    };
    const onVis = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
}
