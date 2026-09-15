/**
 * P3.1 (Phase 8) — the crawl-time holdout. The pure half.
 *
 * The trial's hero moment: a CAUSAL result about the merchant's own store,
 * inside 72 hours, with no OAuth and no approval. When product pages change,
 * a seeded random half is submitted to Bing and the other half is withheld;
 * the time until Bing first crawls each page after its change is recorded for
 * both arms. The randomisation is the product — the seed is stored, both
 * arms are shown, and the interval is shown, never the point estimate alone.
 *
 * ── Why Bing's URL Submission API and not the IndexNow key file ────────────
 *
 * The brief named IndexNow. Verified 2026-09-14 against indexnow.org: a key
 * file hosted anywhere but the root only authorises URLs under its own
 * directory — "a key file located at example.com/catalog/key.txt can include
 * any URLs starting with example.com/catalog/ but cannot include URLs starting
 * with example.com/help/". A Shopify storefront cannot serve a root file from
 * an app (the app proxy lives under /apps/navaal/, and a theme write needs the
 * write_themes exemption). Bing's URL Submission API takes the merchant's own
 * Webmaster key, needs no hosted file, is sanctioned for commerce pages, and
 * feeds the same crawl scheduler IndexNow does. Same experiment, honest
 * channel; the screen names it.
 *
 * ── Power ──────────────────────────────────────────────────────────────────
 *
 * 10-MARKET.md §6: crawl-time proof has no catalogue minimum — every store
 * that changes pages can run it — but a small batch gets a wide interval and
 * the screen says so. Below MIN_PER_ARM the result is "too few to conclude",
 * and it is shown as that.
 *
 * PURE. No I/O.
 */

/** Below this per arm, no verdict — the interval would be meaningless. */
import { enT } from "../i18n/index.js";

export const MIN_PER_ARM = 5;
/** A page not crawled by then is right-censored at this value and said to be. */
export const CENSOR_DAYS = 14;
/** Bootstrap resamples for the interval on the difference of medians. */
export const BOOTSTRAP_ITERS = 2000;
/** Most URLs one experiment takes; Bing's daily quota is the merchant's. */
export const MAX_URLS_PER_EXPERIMENT = 40;

/** mulberry32 — small, seedable, good enough for a coin flip per URL. Pure. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed from the clock and a little entropy; stored with the experiment. */
export function newSeed(now = Date.now()) {
  return (Math.floor(now / 1000) ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0 & 0x7fffffff;
}

/** Fisher–Yates with the seeded rng. Returns a new array. */
export function seededShuffle(items, seed) {
  const out = [...(items ?? [])];
  const next = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Split URLs into the two arms with a seed. Deterministic: the same URLs and
 * seed always give the same split, so the split can be reproduced from the
 * stored seed. Sizes differ by at most one.
 */
export function splitArms(urls, seed) {
  const uniq = [...new Set((urls ?? []).filter(Boolean))].sort();
  const shuffled = seededShuffle(uniq, seed);
  const half = Math.ceil(shuffled.length / 2);
  return { submit: shuffled.slice(0, half), hold: shuffled.slice(half) };
}

const HOUR = 3600 * 1000;

/** Hours from change to first crawl; null if not crawled yet. */
export function hoursToCrawl(row) {
  if (!row?.changedAt || !row?.firstCrawledAt) return null;
  const h = (new Date(row.firstCrawledAt).getTime() - new Date(row.changedAt).getTime()) / HOUR;
  return Number.isFinite(h) ? Math.max(0, h) : null;
}

/** Observed hours, with uncrawled pages censored at CENSOR_DAYS. */
export function observedHours(row, now = new Date()) {
  const h = hoursToCrawl(row);
  if (h !== null) return { hours: h, censored: false };
  const elapsed = (now.getTime() - new Date(row.changedAt).getTime()) / HOUR;
  return { hours: Math.min(elapsed, CENSOR_DAYS * 24), censored: true };
}

export function median(values) {
  const v = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** One arm, summarised. */
export function summariseArm(rows, now = new Date()) {
  const obs = (rows ?? []).map((r) => observedHours(r, now));
  return {
    n: obs.length,
    crawled: obs.filter((o) => !o.censored).length,
    censored: obs.filter((o) => o.censored).length,
    medianHours: median(obs.map((o) => o.hours)),
    hours: obs.map((o) => o.hours),
  };
}

/**
 * Bootstrap percentile interval on (hold − submit) difference of medians, in
 * hours. Positive means submitted pages were crawled sooner. Seeded, so the
 * interval on the screen is reproducible.
 */
export function bootstrapDifference(submitHours, holdHours, seed, iters = BOOTSTRAP_ITERS) {
  const a = submitHours.filter(Number.isFinite);
  const b = holdHours.filter(Number.isFinite);
  if (a.length === 0 || b.length === 0) return { diff: null, lo: null, hi: null };
  const next = rng(seed ^ 0x9e3779b9);
  const draw = (arr) => arr[Math.floor(next() * arr.length)];
  const diffs = [];
  for (let i = 0; i < iters; i++) {
    const sa = a.map(() => draw(a));
    const sb = b.map(() => draw(b));
    diffs.push(median(sb) - median(sa));
  }
  diffs.sort((x, y) => x - y);
  const q = (p) => diffs[Math.min(diffs.length - 1, Math.max(0, Math.floor(p * diffs.length)))];
  return { diff: median(b) - median(a), lo: q(0.025), hi: q(0.975) };
}

/**
 * The whole result for an experiment, as the screen and the report show it.
 * @param {Array<{arm: string, changedAt: Date|string, firstCrawledAt?: Date|string|null}>} rows
 */
export function summariseExperiment(rows, { seed = 1, now = new Date() } = {}) {
  const submit = summariseArm((rows ?? []).filter((r) => r.arm === "submit"), now);
  const hold = summariseArm((rows ?? []).filter((r) => r.arm === "hold"), now);
  const enough = submit.n >= MIN_PER_ARM && hold.n >= MIN_PER_ARM;
  const interval = enough ? bootstrapDifference(submit.hours, hold.hours, seed) : { diff: null, lo: null, hi: null };
  const done = submit.censored + hold.censored === 0;
  const oldest = Math.min(...(rows ?? []).map((r) => new Date(r.changedAt).getTime()).filter(Number.isFinite));
  const dayOf = Number.isFinite(oldest) ? Math.floor((now.getTime() - oldest) / (24 * HOUR)) + 1 : 1;
  const strip = (a) => Object.fromEntries(Object.entries(a).filter(([k]) => k !== "hours"));
  return {
    submit: strip(submit),
    hold: strip(hold),
    enough,
    diffHours: interval.diff,
    lo: interval.lo,
    hi: interval.hi,
    // The interval excludes zero on the favourable side: submitted pages were crawled sooner.
    favourable: enough && interval.lo !== null && interval.lo > 0,
    complete: done || dayOf > CENSOR_DAYS,
    dayOf: Math.min(dayOf, CENSOR_DAYS),
  };
}

const fmt = (h) => (h === null || h === undefined ? "—" : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${Math.round(h)} h` : `${(h / 24).toFixed(1)} d`);
export { fmt as formatHours };

/**
 * The sentence, never a point estimate alone. Every number carries its
 * method in the screen's paragraph; this is what the number says.
 */
/**
 * Phase 12 Part C (C1) — the sentence that leads the readout: both arms, the
 * interval and the direction, in words. Never the point estimate alone (the
 * range is always in the sentence), never a verdict under MIN_PER_ARM.
 *
 *   "Pages we submitted were crawled a median 31 hours sooner than pages we
 *    didn't — with this few pages the honest range is 9 to 52 hours."
 */
export function plainSentence(s, t = enT) {
  if (!s) return "";
  if (!s.enough) {
    return t("Not enough pages yet to say anything honest: {a} submitted and {b} withheld, and we need {min} of each. The next batch of changed pages adds to it.", { a: s.submit.n, b: s.hold.n, min: MIN_PER_ARM });
  }
  // Plain hours, whole numbers, no unit games: a merchant reads "31 hours",
  // not "1.3 d", and a range is two numbers of the same unit.
  const hours = (h) => t("{h, plural, one {# hour} other {# hours}}", { h: Math.round(Math.abs(h)) });
  const few = s.submit.n + s.hold.n < 40 ? t("with this few pages ") : "";
  const lo = Math.min(s.lo, s.hi);
  const hi = Math.max(s.lo, s.hi);
  if (s.favourable) {
    return t("Pages we submitted were crawled a median {median} sooner than pages we didn't — {few}the honest range is {lo} to {hi}.", { median: hours(s.diffHours), few, lo: Math.round(lo), hi: hours(hi) });
  }
  if (s.lo !== null && s.hi !== null && hi < 0) {
    return t("Pages we submitted were crawled a median {median} LATER than pages we didn't — {few}the honest range is {lo} to {hi} later (both sides slower). Rare, and worth knowing.", { median: hours(s.diffHours), few, lo: Math.round(Math.abs(hi)), hi: hours(lo) });
  }
  return t("We cannot tell the two halves apart this batch: submitted pages were crawled a median {median} {direction}, but {few}the honest range runs from {lo} later to {hi} sooner, which includes no difference at all.", { median: hours(s.diffHours), direction: s.diffHours >= 0 ? t("sooner") : t("later"), few, lo: hours(lo), hi: hours(hi) });
}

export function verdictSentence(s, t = enT) {
  if (!s) return "";
  if (!s.enough) {
    return t("Too few pages to conclude: {a} submitted, {b} held ({min} each is the minimum). The next batch of changed pages adds to it.", { a: s.submit.n, b: s.hold.n, min: MIN_PER_ARM });
  }
  const arms = t("Submitted pages: median {m1} to first crawl ({c1} of {n1} crawled). Withheld pages: median {m2} ({c2} of {n2} crawled).", { m1: fmt(s.submit.medianHours), c1: s.submit.crawled, n1: s.submit.n, m2: fmt(s.hold.medianHours), c2: s.hold.crawled, n2: s.hold.n });
  const ci = t("Difference {d}, 95% interval {lo} to {hi}.", { d: fmt(s.diffHours), lo: fmt(s.lo), hi: fmt(s.hi) });
  const read = s.favourable
    ? t("The interval is entirely above zero: submitting sped up crawling for this store.")
    : s.lo !== null && s.hi !== null && s.hi < 0
      ? t("The interval is entirely below zero: submitted pages were crawled later — worth knowing, and rare.")
      : t("The interval includes zero: no difference this batch can show.");
  const censor = s.submit.censored + s.hold.censored > 0 ? t(" {c} page(s) not crawled by day {day} are counted at {day} days.", { c: s.submit.censored + s.hold.censored, day: CENSOR_DAYS }) : "";
  return `${arms} ${ci} ${read}${censor}`;
}
