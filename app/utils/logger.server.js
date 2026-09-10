import pino from "pino";
import { createRequire } from "module";
import { createLogSink } from "./logSink.server.js";

// ESM-safe way to check for optional dependencies
const _require = createRequire(import.meta.url);
function hasDep(name) {
  try { _require.resolve(name); return true; }
  catch { return false; }
}

const transport =
  process.env.NODE_ENV !== "production" && hasDep("pino-pretty")
    ? { target: "pino-pretty", options: { colorize: true, singleLine: false } }
    : undefined;

// INFRA2 — a second destination that keeps qualifying lines for 30 days.
//
// Attached as a pino MULTISTREAM rather than a call-site hook, deliberately:
// pino applies `redact` on the way to the stream, so the sink sees copy that is
// already censored. Hooking the call site would see the raw object and put us
// one mistake away from a token in the database.
//
// Off unless there is a database to write to, so local runs and build steps are
// unaffected.
const sinkEnabled = !!process.env.DATABASE_URL && process.env.LOG_SINK !== "0";
const destinations = sinkEnabled
  ? pino.multistream([{ stream: process.stdout }, { stream: createLogSink() }])
  : null;

const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: { service: "contentclaude", env: process.env.NODE_ENV ?? "development" },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Never let a credential reach the log stream, no matter what object a call
  // site passes. Session objects (accessToken/refreshToken) are the most
  // likely accidental leak — they flow through every background-job path.
  redact: {
    paths: [
      "accessToken", "*.accessToken", "*.*.accessToken",
      "refreshToken", "*.refreshToken", "*.*.refreshToken",
      "apiKey", "*.apiKey",
      "authorization", "*.authorization",
      "req.headers.authorization",
      "req.headers['x-shopify-access-token']",
    ],
    censor: "[REDACTED]",
  },
  // A transport and a multistream are mutually exclusive in pino. Development
  // keeps pino-pretty; production gets the sink.
  ...(transport && !destinations ? { transport } : {}),
}, destinations ?? undefined);

export default logger;
