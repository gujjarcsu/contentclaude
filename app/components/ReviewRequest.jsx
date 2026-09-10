import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";

/**
 * App Store review ask — the client half.
 *
 * Phase 3 item 3.3. There is exactly one code path for this now, and the shape
 * of it is the compliance argument:
 *
 * **The server decides, not the client.** This component cannot ask for a
 * review on its own. It renders nothing and does nothing unless it is handed an
 * `ask` carrying an `attemptId`, and an attemptId only exists because a publish
 * ACTION the merchant confirmed created a `ReviewRequestAttempt` row for it. So
 * "never on page load" is not a rule someone has to remember — a page load has
 * no action result, so there is no attemptId, so nothing fires. The previous
 * version took `active`, a boolean the parent computed from loader data, which
 * is precisely how the jobs page ended up asking for a review on open.
 *
 * **App Bridge is client-side**, so the call itself has to happen here. The
 * ~2 s delay keeps the modal from colliding with the success banner the
 * merchant is still reading.
 *
 * **A hidden tab is not a decline.** If the merchant has switched away, the
 * modal would open behind their back and be dismissed unseen; that is reported
 * as `skipped-hidden`, which the server holds for a day rather than treating as
 * an answer.
 *
 * Every outcome is reported, including the ones where nothing was displayed,
 * because the server's hold depends on which it was.
 */
export function ReviewRequest({ ask }) {
  const fetcher = useFetcher();
  const fired = useRef(null);
  const attemptId = ask?.attemptId ?? null;

  useEffect(() => {
    // No server-issued attempt, nothing to do. This is the structural guard.
    if (!attemptId || fired.current === attemptId) return undefined;
    fired.current = attemptId;

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      let code = "unavailable";
      let success = false;

      // Asking a tab nobody is looking at burns the one ask on nothing.
      if (typeof document !== "undefined" && document.hidden) {
        code = "skipped-hidden";
      } else {
        try {
          const bridge = typeof window !== "undefined" ? window.shopify : undefined;
          if (bridge?.reviews?.request) {
            const result = await bridge.reviews.request();
            success = !!result?.success;
            code = success ? "success" : result?.code || "declined";
          }
        } catch {
          code = "error";
        }
      }

      const fd = new FormData();
      fd.append("attemptId", attemptId);
      fd.append("code", code);
      fd.append("success", success ? "1" : "0");
      fetcher.submit(fd, { method: "POST", action: "/app/review-request" });
    }, 2000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [attemptId, fetcher]);

  return null;
}
