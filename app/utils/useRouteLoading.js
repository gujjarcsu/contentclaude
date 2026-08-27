import { useNavigation, useLocation } from "react-router";

/**
 * True only while THIS route is (re)loading — NOT while navigating away to a
 * different route.
 *
 * App Store rejection 2.1.1 (secondary): every route gated its skeleton on the
 * global `navigation.state === "loading"`, so navigating Dashboard → Products
 * kept the still-mounted Dashboard rendering its "Dashboard" skeleton while App
 * Bridge had already changed the URL to /app/products — a heading/URL mismatch.
 *
 * `navigation.location` is the DESTINATION of an in-flight navigation. If it
 * differs from where we currently are, we're leaving this route: keep showing
 * the real content (React Router's pending-UI) instead of flashing the wrong
 * skeleton. When they match (a revalidation) or there's no destination, show it.
 */
export function useRouteLoading() {
  const navigation = useNavigation();
  const location = useLocation();
  if (navigation.state !== "loading") return false;
  if (navigation.location && navigation.location.pathname !== location.pathname) {
    return false;
  }
  return true;
}
