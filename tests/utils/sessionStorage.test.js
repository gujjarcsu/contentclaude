/**
 * Incident 2026-10-28 — Shopify's PrismaSessionStorage checks the session table
 * once at boot. When that failed (a database blip), web machine 784eed3dbe7158
 * threw MissingSessionTableError on every admin request for ~11 days, while
 * /api/health said "ok". These pin the recovery and the health signal.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../app/db.server.js", () => ({ default: { session: { count: vi.fn(async () => 1) } } }));
vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { SelfHealingPrismaSessionStorage, checkSessionStorage, sessionStorage } = await import(
  "../../app/utils/sessionStorage.server.js"
);

/** A fake Prisma client whose session table can be switched between down and up. */
function fakeDb() {
  const db = { up: false, counts: 0 };
  db.client = {
    session: {
      count: vi.fn(async () => {
        db.counts++;
        if (!db.up) throw new Error("db unreachable");
        return 1;
      }),
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => ({})),
    },
  };
  return db;
}
const bootDown = async (db) => {
  const s = new SelfHealingPrismaSessionStorage(db.client, { connectionRetries: 1, connectionRetryIntervalMs: 1 });
  await s.ready; // the boot check has run (and failed)
  return s;
};

describe("SelfHealingPrismaSessionStorage", () => {
  beforeEach(() => vi.useRealTimers());

  it("normal boot: ready is true and requests run no extra checks", async () => {
    const db = fakeDb();
    db.up = true;
    const s = new SelfHealingPrismaSessionStorage(db.client);
    expect(await s.ready).toBe(true);
    const before = db.counts;
    await s.loadSession("a");
    await s.loadSession("b");
    expect(db.counts).toBe(before); // no per-request table checks
  });

  it("boot failed, database back: the next request recovers instead of failing forever", async () => {
    const db = fakeDb();
    const s = await bootDown(db);
    expect(await s.ready).toBe(false);
    db.up = true;
    await expect(s.loadSession("x")).resolves.toBeUndefined();
    expect(await s.ready).toBe(true);
  });

  it("database still down: throws the library's own error type, as before", async () => {
    const db = fakeDb();
    const s = await bootDown(db);
    const err = await s.loadSession("x").catch((e) => e);
    expect(err?.constructor?.name).toBe("MissingSessionStorageError");
  });

  it("during an outage, concurrent requests share one check and a failed check is not hammered", async () => {
    const db = fakeDb();
    const s = await bootDown(db);
    const before = db.counts;
    const results = await Promise.allSettled([1, 2, 3, 4, 5].map((i) => s.loadSession(String(i))));
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect(db.counts - before).toBe(1); // one shared re-check
    await Promise.allSettled([s.loadSession("again")]);
    expect(db.counts - before).toBe(1); // cooldown: no new query straight after a failure
  });

  it("after the cooldown, it tries again", async () => {
    const db = fakeDb();
    const s = await bootDown(db);
    await Promise.allSettled([s.loadSession("x")]);
    const realNow = Date.now;
    vi.spyOn(Date, "now").mockImplementation(() => realNow() + 6_000);
    db.up = true;
    await expect(s.loadSession("y")).resolves.toBeUndefined();
    vi.restoreAllMocks();
  });
});

describe("checkSessionStorage (used by /api/health)", () => {
  it("is true for the app's own storage when the table is reachable", async () => {
    expect(await checkSessionStorage()).toBe(true);
    expect(sessionStorage).toBeInstanceOf(SelfHealingPrismaSessionStorage);
  });
});
