import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "../db.server.js";
import logger from "./logger.server.js";

/**
 * Shopify session storage that recovers from a database blip at boot.
 *
 * Incident 2026-10-28. Shopify's PrismaSessionStorage checks the `session`
 * table exactly once, in its constructor (2 tries, 5 s apart). If both tries
 * fail — Neon waking from idle, a network blip while the machine boots — its
 * `ready` promise rejects and is never re-created, so every authenticate.admin()
 * on that process throws MissingSessionTableError until someone restarts it.
 * The table was there the whole time. Web machine 784eed3dbe7158 sat in that
 * state for ~11 days: one request in two landed on it, so the home page was
 * "Application Error" half the time, while /api/health stayed green because it
 * never touched session storage.
 *
 * What this changes, and only this:
 *   - When the boot check succeeded (the normal case) behaviour is identical to
 *     the library: `ready` is true and nothing extra runs per request.
 *   - When it failed, the next request re-checks the table instead of failing
 *     forever. Concurrent requests share ONE in-flight check, and a failed
 *     check is not repeated for RECHECK_COOLDOWN_MS, so a real outage does not
 *     turn every request into another query against a database that is down.
 *   - Still not reachable: the library's own MissingSessionStorageError is
 *     thrown, exactly as before, so callers see the same error type.
 *
 * `checkSessionStorage()` is what /api/health uses, so a machine whose session
 * storage cannot reach its table now fails Fly's health check instead of
 * reporting "ok" (and the check itself repairs it once the database is back).
 */
const RECHECK_COOLDOWN_MS = 5_000;
const RECHECK_TIMEOUT_MS = 3_000;

export class SelfHealingPrismaSessionStorage extends PrismaSessionStorage {
  #inFlight = null;
  #lastFailedAt = 0;

  constructor(client, options = {}) {
    super(client, options);
    // The library's boot check rejects with nobody listening until the first
    // request. Turn that into a logged `false` so it is visible at boot and so
    // a later re-check can replace it.
    this.ready = this.ready.catch((err) => {
      logger.error({ err }, "Session storage: boot check could not reach the session table; will re-check on demand");
      return false;
    });
  }

  /** One shared re-check; resolves true when the table is reachable. Never throws. */
  recheck() {
    if (this.#inFlight) return this.#inFlight;
    if (Date.now() - this.#lastFailedAt < RECHECK_COOLDOWN_MS) return Promise.resolve(false);

    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`session table check timed out after ${RECHECK_TIMEOUT_MS}ms`)), RECHECK_TIMEOUT_MS);
      timer.unref?.();
    });

    this.#inFlight = Promise.race([this.getSessionTable().count(), timeout])
      .then(
        () => {
          this.ready = Promise.resolve(true);
          logger.info("Session storage: session table reachable again; recovered");
          return true;
        },
        (err) => {
          this.#lastFailedAt = Date.now();
          logger.error({ err }, "Session storage: re-check failed");
          return false;
        },
      )
      .finally(() => {
        clearTimeout(timer);
        this.#inFlight = null;
      });
    return this.#inFlight;
  }

  async ensureReady() {
    if (await this.ready) return;
    if (await this.recheck()) return;
    // Still unreachable: let the library throw its own error, unchanged.
    return super.ensureReady();
  }
}

export const sessionStorage = new SelfHealingPrismaSessionStorage(prisma);

/** For /api/health: true when this process can use its session storage. */
export async function checkSessionStorage() {
  if (await sessionStorage.ready) return true;
  return sessionStorage.recheck();
}
