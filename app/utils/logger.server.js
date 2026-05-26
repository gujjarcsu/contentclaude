import pino from "pino";
import { createRequire } from "module";

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

const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: { service: "contentpilot-ai", env: process.env.NODE_ENV ?? "development" },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(transport ? { transport } : {}),
});

export default logger;
