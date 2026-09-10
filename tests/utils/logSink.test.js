/**
 * INFRA2 — durable log retention.
 *
 * Fly keeps roughly the last 100 lines: under ten seconds of history at four
 * requests a second. The 03:45 lost generation could not be investigated at
 * 11:00, and A6.6 is blocked on exactly that.
 *
 * ── What these print if the thing they watch is broken ────────────────────
 *
 * Make `shouldKeep` return true for everything and "plain info is not kept"
 * fails — and that matters more than it looks, because the failure mode of a
 * log sink is not silence, it is a table full of `GET /api/health 200` that
 * buries the rows an investigation needs. Remove the buffer cap and "a log
 * storm is bounded" fails. Make `flush` rethrow and "never throws" fails.
 *
 * ── What these CANNOT prove ───────────────────────────────────────────────
 *
 * That rows reach Postgres. Prisma is mocked here, so this proves what we hand
 * it and that failures are swallowed — not that the table accepts it or that
 * 30-day retention actually elapses. Only production does that, and the first
 * real read is queued for after the deploy.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: { logEvent: { createMany: vi.fn(async () => ({ count: 1 })), deleteMany: vi.fn(async () => ({ count: 0 })) } },
}));
vi.mock("../../app/db.server.js", () => ({ default: prisma }));

const {
  shouldKeep,
  mightQualify,
  toRow,
  levelName,
  flush,
  sweepOldLogs,
  sinkStats,
  _resetSink,
  createLogSink,
  MAX_BUFFER,
  RETENTION_DAYS,
} = await import("../../app/utils/logSink.server.js");

const line = (o) => JSON.stringify(o) + "\n";

beforeEach(() => {
  vi.clearAllMocks();
  _resetSink();
});

describe("what is kept, and what is deliberately not", () => {
  it("keeps WARN and above", () => {
    for (const level of [40, 50, 60]) expect(shouldKeep({ level, msg: "x" })).toBe(true);
  });

  it("keeps an INFO line that carries an event tag", () => {
    // The app already tags the lines an investigation needs.
    expect(shouldKeep({ level: 30, event: "autopilot_withheld", msg: "x" })).toBe(true);
  });

  it("does NOT keep plain info", () => {
    // The failure mode of a log sink is not silence, it is a table full of
    // `GET /api/health 200` burying the rows that matter.
    expect(shouldKeep({ level: 30, msg: "GET /api/health 200 - - 4.9 ms" })).toBe(false);
    expect(shouldKeep({ level: 20, msg: "debug" })).toBe(false);
    expect(shouldKeep({ level: 30, event: "" })).toBe(false);
  });

  it("survives rubbish without throwing", () => {
    for (const junk of [null, undefined, 0, "", [], "not json"]) expect(shouldKeep(junk)).toBe(false);
  });

  it("maps pino's numeric levels to names", () => {
    expect(levelName(60)).toBe("fatal");
    expect(levelName(50)).toBe("error");
    expect(levelName(40)).toBe("warn");
    expect(levelName(30)).toBe("info");
  });
});

describe("the cheap pre-filter", () => {
  it("never rejects a line that should be kept", () => {
    // A false negative here loses a row silently. A false POSITIVE only costs a
    // JSON.parse, which shouldKeep then rejects properly.
    expect(mightQualify(line({ level: 40, msg: "warn" }))).toBe(true);
    expect(mightQualify(line({ level: 50, msg: "error" }))).toBe(true);
    expect(mightQualify(line({ level: 30, event: "tagged", msg: "x" }))).toBe(true);
  });

  it("rejects the request noise that makes up almost every line", () => {
    expect(mightQualify(line({ level: 30, msg: "GET /api/health 200" }))).toBe(false);
  });

  it("handles partial and empty chunks", () => {
    for (const junk of ["", "\n", "{partial", null, undefined]) expect(mightQualify(junk)).toBe(false);
  });
});

describe("the row it builds", () => {
  it("lifts the queryable fields and keeps the rest as data", () => {
    const row = toRow({
      level: 40,
      time: "2026-09-11T09:00:00.000Z",
      msg: "something",
      event: "quality_gate_flagged",
      shop: "a.myshopify.com",
      service: "contentclaude",
      productId: "gid://shopify/Product/1",
      distance: 11,
    });
    expect(row.level).toBe("warn");
    expect(row.event).toBe("quality_gate_flagged");
    expect(row.shop).toBe("a.myshopify.com");
    expect(row.msg).toBe("something");
    // The searchable columns are not duplicated into data...
    expect(row.data).not.toHaveProperty("shop");
    expect(row.data).not.toHaveProperty("service");
    // ...and the context an investigation needs survives.
    expect(row.data).toMatchObject({ productId: "gid://shopify/Product/1", distance: 11 });
  });

  it("bounds every string it stores", () => {
    const row = toRow({ level: 40, msg: "x".repeat(9999), event: "e".repeat(500), shop: "s".repeat(500) });
    expect(row.msg.length).toBeLessThanOrEqual(2000);
    expect(row.event.length).toBeLessThanOrEqual(120);
    expect(row.shop.length).toBeLessThanOrEqual(255);
  });

  it("omits data entirely when there is none", () => {
    expect(toRow({ level: 40, msg: "bare" }).data).toBeUndefined();
  });
});

describe("it never breaks the thing it observes", () => {
  it("a log storm is bounded, and the gap is recorded rather than silent", async () => {
    const sink = createLogSink();
    for (let i = 0; i < MAX_BUFFER + 50; i += 1) {
      sink.write(line({ level: 40, msg: `storm ${i}` }));
    }
    expect(sinkStats().buffered).toBe(MAX_BUFFER);
    expect(sinkStats().dropped).toBe(50);

    await flush();
    const rows = prisma.logEvent.createMany.mock.calls[0][0].data;
    // The cap, plus one row saying what was dropped — a silent gap is worse
    // than a missing row, because it looks like nothing happened.
    expect(rows).toHaveLength(MAX_BUFFER + 1);
    expect(rows.at(-1)).toMatchObject({ event: "log_sink_dropped", level: "warn" });
    expect(rows.at(-1).msg).toMatch(/dropped 50 rows/);
  });

  it("never throws when the database is unavailable", async () => {
    prisma.logEvent.createMany.mockRejectedValueOnce(new Error("db down"));
    const sink = createLogSink();
    sink.write(line({ level: 50, msg: "an error worth keeping" }));

    await expect(flush()).resolves.toMatchObject({ written: 0, failed: 1 });
    expect(sinkStats().failures).toBe(1);
  });

  it("flushing an empty buffer touches the database at all", async () => {
    await flush();
    expect(prisma.logEvent.createMany).not.toHaveBeenCalled();
  });

  it("a malformed chunk does not break the stream", () => {
    const sink = createLogSink();
    expect(() => sink.write("{not json at all\n")).not.toThrow();
    expect(sinkStats().buffered).toBe(0);
  });
});

describe("retention", () => {
  it("deletes past the window and reports the count", async () => {
    prisma.logEvent.deleteMany.mockResolvedValueOnce({ count: 42 });
    const r = await sweepOldLogs({ days: 30 });
    expect(r).toMatchObject({ ok: true, deleted: 42 });

    const cutoff = prisma.logEvent.deleteMany.mock.calls[0][0].where.createdAt.lt;
    const days = (Date.now() - cutoff.getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });

  it("keeps at least the 30 days the item asked for", () => {
    expect(RETENTION_DAYS).toBeGreaterThanOrEqual(30);
  });

  it("never throws when the sweep fails", async () => {
    prisma.logEvent.deleteMany.mockRejectedValueOnce(new Error("db down"));
    await expect(sweepOldLogs()).resolves.toMatchObject({ ok: false, deleted: 0 });
  });
});
