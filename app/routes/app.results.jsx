// Retired in Phase 3 — same-origin 302 to /app. See app/utils/retiredRoute.server.js
// for why these keep answering instead of 404ing.
import { retiredRouteLoader } from "../utils/retiredRoute.server.js";

export const loader = retiredRouteLoader("/app");
