/**
 * P6.2 — the support address, in ONE place.
 *
 * `notify.server.js` owns `OPERATOR_EMAIL` and reads it from the environment,
 * which is right for an alerting address and wrong for a client bundle: a route
 * component cannot import a `.server.js`, and the address is also printed on
 * the App Store listing, so it is merchant-facing copy as well as configuration.
 *
 * This is the merchant-facing one. A test asserts it matches the default
 * `notify.server.js` falls back to, so the two cannot drift — which is the
 * whole lesson of P5.0 applied before it has a chance to bite.
 */
export const OPERATOR_EMAIL_PUBLIC = "hello@navaal.ai";
