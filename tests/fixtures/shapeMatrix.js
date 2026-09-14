/**
 * Phase 10 Part C (backlog F1) — the store-shape matrix, as data.
 *
 * Every axis in 05-EVIDENCE.md §4, crossed with every phase of the app a
 * fixture can reach, and for each cell one of three honest words:
 *
 *   PASS     tests/utils/shapeMatrix.test.js drives the real function with
 *            this shape and asserts what it does. The test refuses to run a
 *            PASS cell that has no assertion, and refuses an assertion that
 *            is not a PASS cell, so this table cannot claim more than the
 *            test proves.
 *   HELD     proved elsewhere, by the named file, before this matrix existed.
 *   NOT RUN  a fixture cannot reach it (it needs the AI, a Shopify write, or
 *            a real screen). Says where it goes: the navaal-shape-* stores (F2).
 *
 * A cell you did not test is a defect you have not found yet. That is why
 * NOT RUN is a word here and not a blank.
 *
 * docs/navaal/SHAPE-MATRIX.md carries renderMatrix() verbatim;
 * tests/docs/shapeMatrix.test.js holds the two together.
 */

export const PHASES = Object.freeze([
  { key: "count", label: "Count", what: "reading Shopify's product count honestly (exact vs 10,000+)" },
  { key: "candidates", label: "Candidates", what: "which products the app will act on under the default scope" },
  { key: "content", label: "Content", what: "own-content detection: Generate vs Enhance" },
  { key: "scan", label: "First-run scan", what: "the store score and the three targets on the first screen" },
  { key: "grade", label: "Catalogue walk", what: "P2.2 eligibility grading, F3 variant barcodes" },
  { key: "plan", label: "Plan fit", what: "quota split and the plan that covers the catalogue" },
  { key: "screens", label: "Screens", what: "what the merchant is told" },
  { key: "draft", label: "Draft", what: "the AI writes for this shape" },
  { key: "publish", label: "Publish", what: "Shopify accepts the write for this shape" },
]);

export const AXES = Object.freeze([
  { axis: "catalogue size", rows: ["SIZE:EMPTY", "SIZE:SINGLE", "SIZE:TINY", "SIZE:ONE_PAGE", "SIZE:MULTI_PAGE", "SIZE:LARGE", "SIZE:HUGE"] },
  { axis: "status mix", rows: ["ALL_ACTIVE", "ALL_DRAFT", "MAJORITY_ARCHIVED"] },
  { axis: "channel", rows: ["ACTIVE_NOT_PUBLISHED", "B2B_ONLY", "MULTI_CHANNEL"] },
  { axis: "existing content", rows: ["NO_CONTENT", "BLANK_MARKUP_CONTENT", "THIN_TEMPLATED", "HAND_WRITTEN", "PARTIAL_BY_FIELD", "COMPLIANCE_CLAIMS"] },
  { axis: "structure", rows: ["VARIANT_FAMILY", "FASTENER_SIZES", "VARIANT_HEAVY_BARCODES", "ONE_PRODUCT_100_VARIANTS", "MULTIPACKS"] },
  { axis: "locale", rows: ["NON_ENGLISH", "MULTI_LOCALE"] },
  { axis: "plan", rows: ["PLAN:FREE_WITH_QUOTA", "PLAN:FREE_EXHAUSTED", "PLAN:MID_TIER", "ABOVE_PLAN_CAP", "PLAN:ABOVE_ANY_PLAN", "PLAN:BYO_KEY"] },
  { axis: "API", rows: ["API:HEALTHY", "API:THROTTLED", "API:PARTIAL_FAILURE", "API:DEPLOY_MID_JOB"] },
]);

const STORE = "navaal-shape-* store (F2)";
const NOT_RUN = (where) => ({ status: "NOT RUN", where });
const HELD = (where) => ({ status: "HELD", where });
const PASS = { status: "PASS", where: "shapeMatrix.test.js" };
const NA = { status: "n/a", where: "" };

/** The catalogue shapes: every phase a fixture can drive, then the three that need a store. */
const catalogueRow = (over = {}) => ({
  count: NA,
  candidates: PASS,
  content: PASS,
  scan: PASS,
  grade: PASS,
  plan: NA,
  screens: NOT_RUN(STORE),
  draft: NOT_RUN(STORE),
  publish: NOT_RUN(STORE),
  ...over,
});

export const CELLS = Object.freeze({
  // catalogue size — the Count payload is what changes; the scan reads at most 30 either way
  "SIZE:EMPTY": { count: PASS, candidates: PASS, content: NA, scan: PASS, grade: PASS, plan: NA, screens: HELD("tests/routes/emptyStates.test.js"), draft: NA, publish: NA },
  "SIZE:SINGLE": { count: PASS, candidates: PASS, content: NA, scan: PASS, grade: NA, plan: NA, screens: NOT_RUN(STORE), draft: NOT_RUN(STORE), publish: NOT_RUN(STORE) },
  "SIZE:TINY": { count: PASS, candidates: NA, content: NA, scan: PASS, grade: NA, plan: NA, screens: NOT_RUN(STORE), draft: NOT_RUN(STORE), publish: NOT_RUN(STORE) },
  "SIZE:ONE_PAGE": { count: PASS, candidates: NA, content: NA, scan: PASS, grade: NA, plan: NA, screens: NOT_RUN("a 250-product dev store"), draft: NOT_RUN("a 250-product dev store"), publish: NOT_RUN("a 250-product dev store") },
  "SIZE:MULTI_PAGE": { count: PASS, candidates: NA, content: NA, scan: NA, grade: HELD("tests/utils/catalogueWatch.test.js (paging)"), plan: NA, screens: NOT_RUN("no 3,000-product dev store"), draft: NOT_RUN("no 3,000-product dev store"), publish: NOT_RUN("no 3,000-product dev store") },
  "SIZE:LARGE": { count: PASS, candidates: NA, content: NA, scan: NA, grade: NA, plan: NA, screens: NOT_RUN("no 50,000-product store; Count says 10,000+"), draft: NOT_RUN("no 50,000-product store"), publish: NOT_RUN("no 50,000-product store") },
  "SIZE:HUGE": { count: PASS, candidates: NA, content: NA, scan: NA, grade: NA, plan: NA, screens: NOT_RUN("no 500,000-product store; Count says 10,000+"), draft: NOT_RUN("no 500,000-product store"), publish: NOT_RUN("no 500,000-product store") },
  // status mix
  ALL_ACTIVE: catalogueRow({ screens: HELD("tests/routes/firstRun.test.js, tools/proof/read-screen.mjs on navaal-ttv-03"), draft: HELD("navaal-ttv-03 first run, Phase 8"), publish: HELD("tools/proof/review-scoped-proof.mjs on navaal-ttv-03") }),
  ALL_DRAFT: catalogueRow({ screens: PASS }),
  MAJORITY_ARCHIVED: catalogueRow(),
  // channel
  ACTIVE_NOT_PUBLISHED: catalogueRow({ screens: PASS }),
  B2B_ONLY: catalogueRow({ screens: PASS }),
  MULTI_CHANNEL: catalogueRow(),
  // existing content
  NO_CONTENT: catalogueRow(),
  BLANK_MARKUP_CONTENT: catalogueRow(),
  THIN_TEMPLATED: catalogueRow(),
  HAND_WRITTEN: catalogueRow(),
  PARTIAL_BY_FIELD: catalogueRow(),
  COMPLIANCE_CLAIMS: catalogueRow({ draft: NOT_RUN("navaal-shape-* store; the claims must survive the draft (09-DOCTRINE)") }),
  // structure
  VARIANT_FAMILY: catalogueRow(),
  FASTENER_SIZES: catalogueRow(),
  VARIANT_HEAVY_BARCODES: catalogueRow(),
  ONE_PRODUCT_100_VARIANTS: catalogueRow(),
  MULTIPACKS: catalogueRow(),
  // locale
  NON_ENGLISH: catalogueRow(),
  MULTI_LOCALE: catalogueRow({ draft: NOT_RUN("navaal-shape-* store; Translations are not read, the primary locale is written") }),
  // plan — contexts, not catalogues
  "PLAN:FREE_WITH_QUOTA": { count: NA, candidates: NA, content: NA, scan: NA, grade: NA, plan: PASS, screens: HELD("tests/routes/firstRun.test.js (quota sentence)"), draft: NA, publish: NA },
  "PLAN:FREE_EXHAUSTED": { count: NA, candidates: NA, content: NA, scan: NA, grade: NA, plan: PASS, screens: HELD("tests/utils/startState.test.js (no credits left)"), draft: NA, publish: NA },
  "PLAN:MID_TIER": { count: NA, candidates: NA, content: NA, scan: NA, grade: NA, plan: PASS, screens: NOT_RUN("a paid dev store (Phase 8 read-screen on Starter)"), draft: NA, publish: NA },
  ABOVE_PLAN_CAP: catalogueRow({ plan: PASS, screens: NOT_RUN("navaal-shape-cap: 150 products on Free") }),
  "PLAN:ABOVE_ANY_PLAN": { count: NA, candidates: NA, content: NA, scan: NA, grade: NA, plan: PASS, screens: NOT_RUN("no 20,000-product store"), draft: NA, publish: NA },
  "PLAN:BYO_KEY": { count: NA, candidates: NA, content: NA, scan: NA, grade: NA, plan: PASS, screens: HELD("tests/utils/byok.test.js"), draft: HELD("tests/utils/byok.test.js (zero credits, recorded)"), publish: NA },
  // API — contexts the scan and the writers run under
  "API:HEALTHY": { count: NA, candidates: NA, content: NA, scan: PASS, grade: NA, plan: NA, screens: NA, draft: NA, publish: NA },
  "API:THROTTLED": { count: NA, candidates: NA, content: NA, scan: PASS, grade: HELD("tests/utils/catalogueWatch.test.js"), plan: NA, screens: NA, draft: HELD("tests/utils/bulkProcessor.test.js"), publish: HELD("tests/utils/adminGraphql.publish.test.js") },
  "API:PARTIAL_FAILURE": { count: NA, candidates: NA, content: NA, scan: PASS, grade: NA, plan: NA, screens: NA, draft: HELD("tests/utils/bulkProcessor.test.js"), publish: HELD("tests/routes/review.publish.test.js") },
  "API:DEPLOY_MID_JOB": { count: NA, candidates: NA, content: NA, scan: PASS, grade: NA, plan: NA, screens: NA, draft: HELD("tests/utils/bulkProcessor.test.js (resume)"), publish: NOT_RUN("a deploy during a publish on a navaal-shape-* store") },
});

/** Every (row, phase) with a given status. */
export function cellsWith(status) {
  const out = [];
  for (const [row, phases] of Object.entries(CELLS)) for (const p of PHASES) if (phases[p.key]?.status === status) out.push({ row, phase: p.key, where: phases[p.key].where });
  return out;
}

export function tally() {
  const t = { PASS: 0, HELD: 0, "NOT RUN": 0, "n/a": 0 };
  for (const phases of Object.values(CELLS)) for (const p of PHASES) t[phases[p.key].status] += 1;
  return t;
}

const MARK = { PASS: "✅ PASS", HELD: "🟦 HELD", "NOT RUN": "⬜ NOT RUN", "n/a": "·" };

/** The Markdown table the doc carries, verbatim. */
export function renderMatrix() {
  const lines = [];
  lines.push(`| axis | shape | ${PHASES.map((p) => p.label).join(" | ")} |`);
  lines.push(`|---|---|${PHASES.map(() => "---").join("|")}|`);
  for (const { axis, rows } of AXES) {
    for (const row of rows) {
      const phases = CELLS[row];
      if (!phases) throw new Error(`no cells for ${row}`);
      lines.push(`| ${axis} | \`${row}\` | ${PHASES.map((p) => MARK[phases[p.key].status]).join(" | ")} |`);
    }
  }
  const t = tally();
  lines.push("");
  lines.push(`PASS ${t.PASS} · HELD ${t.HELD} · NOT RUN ${t["NOT RUN"]} · n/a ${t["n/a"]} — ${Object.keys(CELLS).length} rows × ${PHASES.length} phases.`);
  lines.push("");
  lines.push("**NOT RUN, and where each one goes:**");
  lines.push("");
  for (const c of cellsWith("NOT RUN")) lines.push(`- \`${c.row}\` / ${PHASES.find((p) => p.key === c.phase).label} → ${c.where}`);
  lines.push("");
  lines.push("**HELD, and by what:**");
  lines.push("");
  for (const c of cellsWith("HELD")) lines.push(`- \`${c.row}\` / ${PHASES.find((p) => p.key === c.phase).label} — ${c.where}`);
  return lines.join("\n");
}
