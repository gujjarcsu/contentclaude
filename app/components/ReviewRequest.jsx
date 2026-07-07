import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";

/**
 * Post-publish App Store review ask.
 *
 * Render <ReviewRequest active={...} /> on a surface where a publish just
 * succeeded. When `active` first becomes true, it waits ~2s (so it doesn't
 * collide with the success toast/banner), calls App Bridge's
 * shopify.reviews.request(), then records the attempt server-side so the shop is
 * NEVER asked again — regardless of the outcome (success, cooldown, ineligible).
 *
 * App Bridge runs client-side, so this MUST fire from the frontend (never the
 * worker). The parent decides eligibility (first success + not-yet-asked +
 * not onboarding) and passes it via `active`.
 */
export function ReviewRequest({ active }) {
  const fetcher = useFetcher();
  const fired = useRef(false);

  useEffect(() => {
    if (!active || fired.current) return;
    fired.current = true; // one attempt per mount; server flag prevents future mounts

    const timer = setTimeout(async () => {
      let code = "unavailable";
      try {
        // eslint-disable-next-line no-undef
        const bridge = typeof window !== "undefined" ? window.shopify : undefined;
        if (bridge?.reviews?.request) {
          const result = await bridge.reviews.request();
          code = result?.success ? "success" : (result?.code || "declined");
        }
      } catch {
        code = "error";
      }
      // Persist regardless of outcome — one ask per shop, ever.
      const fd = new FormData();
      fd.append("code", code);
      fetcher.submit(fd, { method: "POST", action: "/app/review-request" });
    }, 2000);

    return () => clearTimeout(timer);
  }, [active, fetcher]);

  return null;
}
