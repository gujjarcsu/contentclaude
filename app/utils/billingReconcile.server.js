/**
 * P27 item 2 — our plan table is a claim. Shopify's API is the authority.
 *
 * Webhook HMACs and authenticate.admin are signed with the same client secret,
 * so on 16 September, when that secret did not match Shopify's, every billing
 * webhook was rejected exactly as every page load was. Nothing recorded the
 * refusals (that is item 1), so afterwards the app could not say what it had
 * missed. A subscription that changed during those hours would have left the
 * `Plan` row frozen at whatever it said before — and the app would have gone on
 * billing, or not billing, on the strength of it.
 *
 * So this asks Shopify directly, every night, and compares:
 *
 *   plan name · status · charge id · period end
 *
 * Three rules, all of them deliberate:
 *
 *  1. READ-ONLY. It never writes a plan row, never contacts a merchant, never
 *     calls a billing mutation. A disagreement between us and Shopify is a
 *     decision — somebody is being over- or under-charged and which way to
 *     correct it is not a thing a cron job should pick. It reports and stops.
 *
 *  2. Unreachable is not disagreement. A shop whose token cannot be refreshed
 *     (uninstalled, revoked) answers nothing, and counting that as "Shopify says
 *     no subscription" would manufacture a downgrade out of an outage. Those are
 *     counted separately and never alarm on their own.
 *
 *  3. It goes through the app's own `unauthenticated.admin`, not the raw
 *     `Session.accessToken`. This app sets `expiringOfflineAccessTokens: true`,
 *     so the stored token is short-lived and is exchanged on use. The first
 *     version of this check read the token straight from the database and got
 *     "Invalid API key or access token" for all seventeen shops — which looked
 *     like a catastrophe and was a broken instrument. A check that returns the
 *     same answer for every input is not measuring anything.
 */
import prisma from "../db.server.js";
import logger from "./logger.server.js";
import { sendOperatorEmail } from "./notify.server.js";

const QUERY = `{
  currentAppInstallation {
    activeSubscriptions {
      id
      name
      status
      test
      currentPeriodEnd
    }
  }
}`;

/** A stable short handle for a shop, so a report can name rows without naming merchants. */
export function shopHandle(shop) {
  let h = 0;
  for (let i = 0; i < shop.length; i++) h = (h * 31 + shop.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0").slice(0, 6);
}

/** Is our row claiming this shop pays us? */
function weBill(plan) {
  return Boolean(plan && plan.planName !== "free" && plan.status === "active");
}

/**
 * Compare one shop. Pure apart from the two things passed in, so the comparison
 * itself is testable without a Shopify.
 *
 * @returns {{shop:string, handle:string, ours:string, theirs:string, problems:string[], unreachable:boolean}}
 */
export function compareShop(shop, plan, subs, error) {
  const handle = shopHandle(shop);
  const ours = plan
    ? `${plan.planName}/${plan.status} charge=${plan.shopifyChargeId ?? "none"} end=${plan.currentPeriodEnd ? plan.currentPeriodEnd.toISOString().slice(0, 10) : "none"}`
    : "no plan row";

  if (error) {
    return { shop, handle, ours, theirs: `unreachable: ${error}`, problems: [], unreachable: true };
  }

  const active = (subs || []).filter((s) => s.status === "ACTIVE");
  const theirs = active.length
    ? active
        .map(
          (s) =>
            `${s.name}/${s.status}${s.test ? "/TEST" : ""} id=${String(s.id).split("/").pop()} end=${String(s.currentPeriodEnd ?? "").slice(0, 10) || "none"}`,
        )
        .join(" + ")
    : "no active subscription";

  const problems = [];
  const paidHere = weBill(plan);
  const paidThere = active.length > 0;
  const chargeThere = active[0]?.id ?? null;
  const chargeHere = plan?.shopifyChargeId ?? null;

  if (paidHere && !paidThere) {
    problems.push("we have them on a paid plan and Shopify has no active subscription — they may be getting a paid plan for nothing");
  }
  if (!paidHere && paidThere) {
    problems.push("Shopify is billing them and we have them on free — they are paying for a plan we are not giving them");
  }
  if (paidThere && chargeHere !== chargeThere) {
    problems.push(`charge id differs (ours ${chargeHere ?? "none"}, Shopify ${chargeThere ?? "none"})`);
  }
  if (paidHere && paidThere) {
    const endThere = active[0]?.currentPeriodEnd ? String(active[0].currentPeriodEnd).slice(0, 10) : null;
    const endHere = plan?.currentPeriodEnd ? plan.currentPeriodEnd.toISOString().slice(0, 10) : null;
    if (endThere && endHere && endThere !== endHere) {
      problems.push(`period end differs (ours ${endHere}, Shopify ${endThere})`);
    }
  }

  return { shop, handle, ours, theirs, problems, unreachable: false };
}

/**
 * Ask Shopify about every installed shop and compare. Never writes anything.
 *
 * @param {object} deps
 * @param {(shop:string)=>Promise<{admin:{graphql:Function}}>} deps.adminFor
 */
export async function reconcileBilling({ adminFor } = {}) {
  if (!adminFor) {
    /* imported lazily: shopify.server.js pulls in the whole Shopify library, and
       the comparison above must stay unit-testable without it */
    ({ unauthenticated: { admin: adminFor } } = await import("../shopify.server.js"));
  }

  const sessions = await prisma.session.findMany({ where: { isOnline: false }, select: { shop: true } });
  const plans = await prisma.plan.findMany();
  const planFor = new Map(plans.map((p) => [p.shop, p]));

  const rows = [];
  for (const { shop } of sessions) {
    let subs = null;
    let error = null;
    try {
      const { admin } = await adminFor(shop);
      const res = await admin.graphql(QUERY);
      const body = await res.json();
      if (body.errors) error = JSON.stringify(body.errors).slice(0, 160);
      else subs = body.data?.currentAppInstallation?.activeSubscriptions ?? [];
    } catch (err) {
      error = err instanceof Response ? `HTTP ${err.status}` : String(err?.message ?? err).slice(0, 160);
    }
    rows.push(compareShop(shop, planFor.get(shop) ?? null, subs, error));
  }

  const disagreements = rows.filter((r) => !r.unreachable && r.problems.length);
  const unreachable = rows.filter((r) => r.unreachable);
  const checked = rows.length;

  const summary = {
    checked,
    agreed: checked - disagreements.length - unreachable.length,
    disagreements: disagreements.length,
    unreachable: unreachable.length,
    rows,
  };

  logger.info(
    {
      event: "billing_reconciled",
      checked,
      agreed: summary.agreed,
      disagreements: summary.disagreements,
      unreachable: summary.unreachable,
    },
    "Billing reconciled against Shopify",
  );

  if (disagreements.length) {
    await sendOperatorEmail({
      subject: `Billing disagrees with Shopify for ${disagreements.length} shop${disagreements.length === 1 ? "" : "s"}`,
      text: [
        "The nightly billing reconciliation found the plan table and Shopify disagreeing.",
        "",
        "Our plan table is a claim. Shopify's API is the authority. Nothing has been changed:",
        "which way to correct a disagreement is a decision, not a sweep.",
        "",
        ...disagreements.flatMap((r) => [
          `shop ${r.handle}`,
          `  ours   : ${r.ours}`,
          `  shopify: ${r.theirs}`,
          `  >>> ${r.problems.join("; ")}`,
          "",
        ]),
        `${checked} shops checked · ${summary.agreed} agreed · ${unreachable.length} unreachable.`,
        "",
        "Shops are shown as short handles, not domains. Match them in the admin.",
      ].join("\n"),
    });
  }

  return summary;
}
