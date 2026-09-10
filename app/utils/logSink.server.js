/**
 * INFRA2 — durable log retention, without a new vendor.
 *
 * Fly keeps roughly the last 100 lines. At four requests a second that is under
 * ten seconds of history, so no incident is traceable minutes after it happens.
 * The 03:45 lost generation could not be investigated at 11:00; A6.6 is blocked
 * on exactly that. Every future "could not reproduce" is self-inflicted until
 * this exists.
 *
 * ── Why Postgres and not a log service ────────────────────────────────────
 *
 * A log service needs an account, a token and an owner to create both, which
 * makes it a human task and leaves the gap open in the meantime. We already have
 * Neon, a Prisma client, a worker that can sweep, and the retention we need is
 * 30 days of *incidents*, not of stdout.
 *
 * ── What is stored, and what deliberately is not ──────────────────────────
 *
 * NOT a copy of stdout. Storing every request would be a large table full of
 * `GET /api/health 200` and would make the interesting rows harder to find, not
 * easier. Two things go in:
 *
 *   1. everything at WARN and above, and
 *   2. any line the app deliberately tagged with an `event` — the app already
 *      does this: `quality_gate_flagged`, `autopilot_withheld`,
 *      `install_link_click`, `brand_voice_inferred`, `uninstall_delivery_stale`.
 *
 * ── Four rules it must never break ────────────────────────────────────────
 *
 * **It never blocks a request.** Rows are buffered and flushed on a timer. A log
 * write is not worth a millisecond of a merchant's page load.
 *
 * **It never throws.** A logging failure that breaks a request would be worse
 * than the missing logs it exists to fix. Every path here swallows and counts.
 *
 * **It is bounded.** A log storm must not fill the database or the heap: the
 * buffer has a hard cap and drops the excess, keeping a count of what it
 * dropped so the gap is visible rather than silent.
 *
 * **It cannot leak a secret.** This reads pino's OUTPUT, after `redact` has
 * already run, so an access token censored in stdout is censored here too. That
 * is the whole reason this hooks the stream rather than the call site.
 */
import { Writable } from "node:stream";

/** Levels pino emits as numbers; 40 is warn. */
const WARN = 40;

/** Flush at most this often. */
export const FLUSH_MS = Number(process.env.LOG_SINK_FLUSH_MS || 5_000);
/** Hard cap on buffered rows between flushes. Beyond this, rows are dropped. */
export const MAX_BUFFER = Number(process.env.LOG_SINK_MAX_BUFFER || 500);
/** How long rows are kept. The item asked for at least 30 days. */
export const RETENTION_DAYS = Number(process.env.LOG_RETENTION_DAYS || 30);

/** Fields lifted into their own columns; the rest goes to `data`. */
const LIFTED = new Set(["level", "time", "msg", "event", "shop", "service", "env", "hostname", "pid"]);

const state = { buffer: [], dropped: 0, written: 0, failures: 0, timer: null };

/** Numeric pino level → the name we store. Pure. */
export function levelName(level) {
  if (level >= 60) return "fatal";
  if (level >= 50) return "error";
  if (level >= WARN) return "warn";
  if (level >= 30) return "info";
  if (level >= 20) return "debug";
  return "trace";
}

/**
 * Should this line be kept? Pure, and the only place the policy lives.
 *
 * A line qualifies on level OR on carrying an `event` tag. Anything else is
 * request noise that would bury the rows an investigation needs.
 */
export function shouldKeep(obj) {
  if (!obj || typeof obj !== "object") return false;
  if (Number(obj.level) >= WARN) return true;
  return typeof obj.event === "string" && obj.event.length > 0;
}

/** Turn a parsed pino line into a LogEvent row. Pure. */
export function toRow(obj) {
  const data = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!LIFTED.has(k)) data[k] = v;
  }
  return {
    level: levelName(Number(obj.level) || 30),
    event: typeof obj.event === "string" ? obj.event.slice(0, 120) : null,
    shop: typeof obj.shop === "string" ? obj.shop.slice(0, 255) : null,
    msg: String(obj.msg ?? "").slice(0, 2000),
    data: Object.keys(data).length ? data : undefined,
    createdAt: obj.time ? new Date(obj.time) : new Date(),
  };
}

/**
 * A cheap pre-filter before `JSON.parse`.
 *
 * Parsing every log line on the hot path costs real CPU at volume, and the vast
 * majority of lines are `GET /api/health 200` which we do not keep. A substring
 * test rejects those without parsing. It can produce false POSITIVES — a message
 * containing the text `"event":` — which `shouldKeep` then rejects properly. It
 * must never produce a false negative, which is why it tests for the raw JSON
 * fragments rather than anything clever.
 */
export function mightQualify(line) {
  if (typeof line !== "string" || line.length < 2) return false;
  if (line.includes('"event":')) return true;
  // "level":40 upward. Cheap and exact for pino's numeric levels.
  return /"level":\s*(4\d|5\d|6\d)/.test(line);
}

/** Push a row, dropping (and counting) beyond the cap. */
function buffer(row) {
  if (state.buffer.length >= MAX_BUFFER) {
    state.dropped += 1;
    return;
  }
  state.buffer.push(row);
}

/**
 * Write what is buffered. Never throws.
 *
 * Prisma is imported lazily so the logger works before the database client
 * exists, and so a process with no database (a build step) can still log.
 */
export async function flush() {
  if (state.buffer.length === 0) return { written: 0 };
  const rows = state.buffer;
  state.buffer = [];

  // A drop count is only useful if somebody sees it, so it rides the next batch
  // as a row of its own rather than sitting in a counter nobody reads.
  if (state.dropped > 0) {
    const dropped = state.dropped;
    state.dropped = 0;
    rows.push({
      level: "warn",
      event: "log_sink_dropped",
      shop: null,
      msg: `Log sink dropped ${dropped} rows: more than ${MAX_BUFFER} qualifying lines between flushes`,
      data: { dropped, cap: MAX_BUFFER },
      createdAt: new Date(),
    });
  }

  try {
    const { default: prisma } = await import("../db.server.js");
    await prisma.logEvent.createMany({ data: rows });
    state.written += rows.length;
    return { written: rows.length };
  } catch {
    // Deliberately silent: logging that logging failed, through the logger that
    // failed, is a loop. The counter is exposed through `sinkStats()` and the
    // deep health check reads it.
    state.failures += 1;
    return { written: 0, failed: rows.length };
  }
}

/** Counters, for the health check and for tests. */
export function sinkStats() {
  return { buffered: state.buffer.length, dropped: state.dropped, written: state.written, failures: state.failures };
}

/** Test seam: empty the buffer without touching the database. */
export function _resetSink() {
  state.buffer = [];
  state.dropped = 0;
  state.written = 0;
  state.failures = 0;
}

/**
 * The pino destination. Parses qualifying lines and buffers them.
 *
 * Returns a Writable rather than installing a global, so a test can drive it
 * directly and `logger.server.js` decides whether to attach it at all.
 */
export function createLogSink() {
  if (!state.timer) {
    state.timer = setInterval(() => {
      void flush();
    }, FLUSH_MS);
    // Never hold the process open for a log flush.
    state.timer.unref?.();
  }

  return new Writable({
    write(chunk, _enc, cb) {
      try {
        for (const line of String(chunk).split("\n")) {
          if (!mightQualify(line)) continue;
          let obj;
          try {
            obj = JSON.parse(line);
          } catch {
            continue; // a partial line is not worth a row
          }
          if (shouldKeep(obj)) buffer(toRow(obj));
        }
      } catch {
        // A malformed chunk must never break the log stream.
      }
      cb();
    },
  });
}

/**
 * Delete rows past the retention window. Called by the worker's scheduler.
 *
 * Returns the count so the caller can log it — which itself becomes a row, so
 * "the sweep ran" is answerable from the table it swept.
 */
export async function sweepOldLogs({ days = RETENTION_DAYS } = {}) {
  try {
    const { default: prisma } = await import("../db.server.js");
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const { count } = await prisma.logEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
    return { ok: true, deleted: count, cutoff };
  } catch (err) {
    return { ok: false, deleted: 0, error: err?.message };
  }
}
