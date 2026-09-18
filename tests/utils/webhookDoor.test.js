/**
 * P27 item 1 — the Shopify webhook door refuses, counts, and says why.
 *
 * Every assertion here exists because the door previously did none of it. On
 * 18 September a deliberately wrong signature was posted at the live door: it
 * answered 401 and the database gained zero rows. That is the behaviour these
 * tests make impossible to reintroduce.
 *
 * The two that matter most are the last two. A door reporting "0 webhooks" when
 * nobody has installed anything and nobody has changed a plan is a calm door; a
 * door reporting "0 webhooks" while two shops installed is a broken one. A
 * counter that cannot tell those apart is not an instrument — it is decoration,
 * and this project has now shipped four of those and caught all four.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { db, sent } = vi.hoisted(() => ({
  db: {
    deliveries: [],
    installs: 0,
    planMoves: 0,
    createThrows: false,
  },
  sent: [],
}));

vi.mock("../../app/db.server.js", () => ({
  default: {
    webhookDelivery: {
      create: vi.fn(async ({ data }) => {
        if (db.createThrows) throw new Error("database is down");
        db.deliveries.push({ ...data, receivedAt: new Date() });
        return data;
      }),
      count: vi.fn(async ({ where }) => {
        if (where?.webhookId) {
          return db.deliveries.filter((d) => d.webhookId === where.webhookId && d.shop === where.shop).length;
        }
        return db.deliveries.length;
      }),
      findFirst: vi.fn(async () => db.deliveries.at(-1) ?? null),
      groupBy: vi.fn(async () => {
        const m = new Map();
        for (const d of db.deliveries) m.set(d.topic, (m.get(d.topic) ?? 0) + 1);
        return [...m].map(([topic, n]) => ({ topic, _count: { _all: n } }));
      }),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    shop: { count: vi.fn(async () => db.installs) },
    plan: { count: vi.fn(async () => db.planMoves) },
  },
}));
vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../app/utils/notify.server.js", () => ({
  sendOperatorEmail: vi.fn(async (o) => {
    sent.push(o);
    return { sent: true };
  }),
  OPERATOR_EMAIL: "ops@example.test",
}));

const door = await import("../../app/utils/webhookDoor.server.js");

beforeEach(() => {
  door.__resetDoor();
  db.deliveries.length = 0;
  db.installs = 0;
  db.planMoves = 0;
  db.createThrows = false;
  sent.length = 0;
});

describe("what the door refuses, and what it says about it", () => {
  it("a request that is not a POST is counted and never paged", () => {
    expect(door.doorBadMethod()).toBe("not a POST");
    expect(door.doorCounts().badMethod).toBe(1);
    expect(sent).toEqual([]);
  });

  it("a request with no signature is counted and NEVER paged — scanners find this URL daily", () => {
    door.doorNoSignature();
    door.doorNoSignature();
    door.doorNoSignature();
    expect(door.doorCounts().noSignature).toBe(3);
    expect(sent).toEqual([]);
  });

  it("a signature that did not verify is counted AND raises itself, with a reason", async () => {
    expect(door.doorBadSignature()).toBe("signature did not verify");
    await new Promise((r) => setTimeout(r, 0));
    expect(door.doorCounts().badSignature).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toMatch(/signature did not verify/i);
    expect(sent[0].text).toMatch(/subscription/i);
  });

  it("a run of bad signatures raises at most once an hour", async () => {
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < 25; i++) door.doorBadSignature(t0 + i * 1000);
    await new Promise((r) => setTimeout(r, 0));
    expect(door.doorCounts().badSignature).toBe(25);
    expect(sent).toHaveLength(1);

    door.doorBadSignature(t0 + 61 * 60 * 1000);
    await new Promise((r) => setTimeout(r, 0));
    expect(sent).toHaveLength(2);
  });

  it("a shop-header mismatch IS paged — it needs a genuine signed body, so it is not a scanner", async () => {
    expect(door.doorShopMismatch()).toBe("signed payload names a different shop than the header");
    await new Promise((r) => setTimeout(r, 0));
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toMatch(/different shop/i);
  });

  it("a stale delivery is counted and never paged — a retry storm is Shopify's, not an attack", () => {
    expect(door.doorStale()).toBe("delivery older than the backstop window");
    expect(door.doorCounts().stale).toBe(1);
    expect(sent).toEqual([]);
  });

  it("says nothing about the secret — no value, no length, no prefix", async () => {
    const SECRET = "shpss_a_very_distinctive_test_secret_value";
    process.env.SHOPIFY_API_SECRET = SECRET;
    door.doorBadSignature();
    door.doorNoSignature();
    door.doorShopMismatch();
    await new Promise((r) => setTimeout(r, 0));

    /* The two wall-clock timestamps are dropped before the length check, and only
       those two. A 13-digit epoch contains any given two-digit number about a
       third of the time, so leaving them in made this assertion pass or fail on
       what minute it ran — which is worse than not asserting it, because a green
       flaky test is read as proof. Everything that could actually carry something
       derived from the secret is still searched. */
    const counts = door.doorCounts();
    expect(typeof counts.firstRefusalAt).toBe("number");
    delete counts.firstRefusalAt;
    delete counts.lastRefusalAt;
    const printed = JSON.stringify(sent) + JSON.stringify(counts) + JSON.stringify(door.DOOR_REASONS);

    expect(printed).not.toContain("shpss");
    expect(printed).not.toContain("a_very_distinctive_test_secret_value");
    expect(printed).not.toContain(SECRET.slice(0, 8));
    expect(printed).not.toContain(String(SECRET.length));
    /* and the control: the assertion CAN fail, so a pass means something */
    expect(JSON.stringify({ leaked: SECRET })).toContain("shpss");
  });
});

describe("the ledger", () => {
  it("records an arrival, including a topic the app ignores", async () => {
    await door.recordDelivery({ webhookId: "w1", topic: "orders/create", shop: "a.myshopify.com", duplicate: false });
    expect(db.deliveries).toHaveLength(1);
    expect(db.deliveries[0].topic).toBe("orders/create");
    expect(door.doorCounts().accepted).toBe(1);
  });

  it("records a duplicate as a row too, flagged", async () => {
    await door.recordDelivery({ webhookId: "w1", topic: "app/uninstalled", shop: "a.myshopify.com", duplicate: true });
    expect(db.deliveries[0].duplicate).toBe(true);
    expect(door.doorCounts().duplicates).toBe(1);
    expect(door.doorCounts().accepted).toBe(0);
  });

  it("never lets a failed write refuse a signed webhook, and counts the gap", async () => {
    db.createThrows = true;
    await expect(
      door.recordDelivery({ webhookId: "w1", topic: "app/uninstalled", shop: "a.myshopify.com", duplicate: false }),
    ).resolves.toBe(false);
    expect(door.doorCounts().ledgerWriteFailed).toBe(1);
  });

  it("stores the body's size, never the body — payloads carry merchant data", async () => {
    await door.recordDelivery({
      webhookId: "w1",
      topic: "customers/redact",
      shop: "a.myshopify.com",
      duplicate: false,
      bodyBytes: 412,
    });
    const row = db.deliveries[0];
    expect(row.bodyBytes).toBe(412);
    expect(Object.keys(row)).not.toContain("payload");
    expect(Object.keys(row)).not.toContain("rawBody");
  });

  it("answers the duplicate question durably, which is what Redis could not", async () => {
    expect(await door.ledgerHasSeen("a.myshopify.com", "w1")).toBe(false);
    await door.recordDelivery({ webhookId: "w1", topic: "app/uninstalled", shop: "a.myshopify.com", duplicate: false });
    expect(await door.ledgerHasSeen("a.myshopify.com", "w1")).toBe(true);
    /* the same id from a DIFFERENT shop is not the same delivery */
    expect(await door.ledgerHasSeen("b.myshopify.com", "w1")).toBe(false);
  });
});

describe("silence read against traffic, not against a clock", () => {
  it("no webhooks and no traffic is “—”, not a calm zero", async () => {
    const d = await door.webhookDoor();
    expect(d.arrivals.state).toBe("unmeasured");
    expect(d.arrivals.why).toMatch(/nothing for Shopify to send/);
    expect(await door.webhookDoorAlarm()).toBeNull();
  });

  it("no webhooks WHILE shops installed is the alarm, and names the number", async () => {
    db.installs = 2;
    db.planMoves = 1;
    const d = await door.webhookDoor();
    expect(d.arrivals.state).toBe("measured");
    expect(d.arrivals.value).toBe(0);
    const alarm = await door.webhookDoorAlarm();
    expect(alarm).toMatch(/2 installs and 1 plan change/);
    expect(alarm).toMatch(/not one Shopify webhook arrived/);
  });

  it("webhooks arriving alongside traffic is not an alarm", async () => {
    db.installs = 2;
    await door.recordDelivery({ webhookId: "w1", topic: "app/uninstalled", shop: "a.myshopify.com", duplicate: false });
    const d = await door.webhookDoor();
    expect(d.arrivals.value).toBe(1);
    expect(await door.webhookDoorAlarm()).toBeNull();
  });

  it("a bad signature outranks a quiet door — a cause beats a symptom", async () => {
    db.installs = 2;
    door.doorBadSignature();
    const alarm = await door.webhookDoorAlarm();
    expect(alarm).toMatch(/refused for a bad signature/);
    expect(alarm).not.toMatch(/not one Shopify webhook arrived/);
  });

  it("the control: the alarm CAN stay silent, so a null answer means something", async () => {
    db.installs = 5;
    db.planMoves = 5;
    for (let i = 0; i < 3; i++) {
      await door.recordDelivery({ webhookId: "w" + i, topic: "app/uninstalled", shop: "a.myshopify.com", duplicate: false });
    }
    expect(await door.webhookDoorAlarm()).toBeNull();
    /* and CAN fire, on the same fixture, with the deliveries removed */
    db.deliveries.length = 0;
    expect(await door.webhookDoorAlarm()).toMatch(/not one Shopify webhook arrived/);
  });
});
