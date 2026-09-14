/**
 * Phase 10 Part B — the funnel, pure.
 *
 * Scoreboard metric 9 read "not instrumented". Hoodify installed and left in
 * a minute and we knew only because CW read the Partner Dashboard by hand.
 * This is the number: per shop, timestamps only —
 *
 *   installed → first screen rendered → first draft seen → first approve →
 *   first publish → returned on a later day → (uninstalled)
 *
 * — and, across every NON-TEST shop, the count at each stage and the median
 * hours between consecutive stages. Nothing here reaches a merchant screen;
 * nothing here is a statistic for the listing; no shop domain appears in the
 * digest. Test shops are excluded by the same name pattern the reset
 * workflow uses, plus the two named dev stores.
 *
 * Stages are counted independently, not as a strict chain: firstScreenAt and
 * firstApproveAt were added on 15 Sep 2026, so a shop that installed before
 * then can have a first publish and no first screen. A median is over the
 * shops that have both ends of its pair.
 *
 * PURE. Reading the rows and sending the email live in funnel.server.js.
 */

export const STAGES = Object.freeze([
  { key: "installed", label: "Installed", field: null },
  { key: "firstScreen", label: "First screen rendered", field: "firstScreenAt" },
  { key: "firstDraft", label: "First draft seen", field: "firstDraftSeenAt" },
  { key: "firstApprove", label: "First approve", field: "firstApproveAt" },
  { key: "firstPublish", label: "First publish", field: "firstPublishAt" },
  { key: "returned", label: "Returned on a later day", field: "returnedAt" },
]);

/** The columns the funnel reads — and all it reads. No name, no content, no email. */
export const FUNNEL_SELECT = Object.freeze({
  shop: true,
  installedAt: true,
  reinstalledAt: true,
  uninstalledAt: true,
  firstScreenAt: true,
  firstDraftSeenAt: true,
  firstApproveAt: true,
  firstPublishAt: true,
  returnedAt: true,
});

/** The reset workflow's guard, and the two dev stores by name. */
export const TEST_SHOP_PATTERN = /^(navaal-ttv-\d+|navaal-qa-[a-z0-9-]+|navaal-shape-[a-z0-9-]+|contentpilot-dev\d*)\.myshopify\.com$/;
export const TEST_SHOPS = Object.freeze(["contentpilot-dev2.myshopify.com", "navaal-qa-fresh.myshopify.com"]);

export function isTestShop(shop) {
  const s = String(shop ?? "").trim().toLowerCase();
  return TEST_SHOP_PATTERN.test(s) || TEST_SHOPS.includes(s);
}

export function installAtOf(row) {
  return row?.reinstalledAt ?? row?.installedAt ?? null;
}

export function median(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

const hoursBetween = (a, b) => (a && b ? (new Date(b).getTime() - new Date(a).getTime()) / 3600e3 : null);

/**
 * Counts per stage and median hours between consecutive stages, over
 * non-test shops only. `uninstalled` is counted separately.
 *
 * @param {Array<object>} rows Shop rows with the funnel columns
 * @returns {{shops: number, excludedTestShops: number, counts: Record<string, number>, medianHours: Record<string, number|null>, pairN: Record<string, number>, uninstalled: number}}
 */
export function computeFunnel(rows) {
  const real = (rows ?? []).filter((r) => !isTestShop(r.shop));
  const counts = {};
  const gaps = {};
  let uninstalled = 0;
  for (const st of STAGES) counts[st.key] = 0;
  for (const r of real) {
    counts.installed += 1;
    if (r.uninstalledAt) uninstalled += 1;
    for (const st of STAGES.slice(1)) if (r[st.field]) counts[st.key] += 1;
    for (let i = 1; i < STAGES.length; i++) {
      const from = STAGES[i - 1].field ? r[STAGES[i - 1].field] : installAtOf(r);
      const to = r[STAGES[i].field];
      const h = hoursBetween(from, to);
      if (h !== null && h >= 0) (gaps[`${STAGES[i - 1].key}→${STAGES[i].key}`] ??= []).push(h);
    }
  }
  const medianHours = {};
  const pairN = {};
  for (let i = 1; i < STAGES.length; i++) {
    const k = `${STAGES[i - 1].key}→${STAGES[i].key}`;
    medianHours[k] = median(gaps[k] ?? []);
    pairN[k] = (gaps[k] ?? []).length;
  }
  return { shops: real.length, excludedTestShops: (rows ?? []).length - real.length, counts, medianHours, pairN, uninstalled };
}

export const fmtHours = (h) => (h === null || h === undefined ? "—" : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`);

/**
 * The owner's weekly digest, counts and medians only. Null when there is
 * not one non-test shop to report — a digest about nothing teaches the
 * reader to stop opening them.
 */
export function composeFunnelDigest(f, { now = new Date() } = {}) {
  if (!f || f.shops === 0) return null;
  const lines = [`Navaal funnel — week to ${now.toISOString().slice(0, 10)}`, "", `${f.shops} real shop(s); ${f.excludedTestShops} test shop(s) excluded by name.`, ""];
  let prev = null;
  for (const st of STAGES) {
    const n = f.counts[st.key];
    const pct = f.counts.installed ? Math.round((n / f.counts.installed) * 100) : 0;
    const k = prev ? `${prev.key}→${st.key}` : null;
    const gap = k ? `   median from ${prev.label.toLowerCase()}: ${fmtHours(f.medianHours[k])} (n=${f.pairN?.[k] ?? 0})` : "";
    lines.push(`${st.label.padEnd(24)} ${String(n).padStart(3)}  (${pct}%)${gap}`);
    prev = st;
  }
  lines.push(`${"Uninstalled".padEnd(24)} ${String(f.uninstalled).padStart(3)}`);
  lines.push("");
  lines.push("Timestamps only, one row per shop, no names. First screen and first approve are stamped from 15 Sep 2026; shops installed before then have no such stamp, which is why those counts can sit below the stages after them.");
  lines.push("The stage where the count drops is the conversation to have before the next outreach call.");
  return { subject: `Funnel: ${f.counts.installed} installed · ${f.counts.firstPublish} published · ${f.counts.returned} returned`, text: lines.join("\n") };
}
