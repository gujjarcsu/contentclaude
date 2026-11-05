/**
 * fixRows — blockers → IssueList rows, the same way on every screen.
 *
 * Redesign (Nov 2026). Home's "What to fix first" and the Audit's issue tabs
 * show the same findings with the same words and the same button, so the
 * mapping from a blocker ({key, grade, count, fix}) to a row lives once.
 *
 * Rules (00-CONSTITUTION L5, Phase 15 in firstRun.js):
 *   - blocking → critical, degrading → warning;
 *   - the sentence is blockerLine() — one catalogue key per finding;
 *   - a fix the plan cannot run says which plan can, in words, and the button
 *     goes to the plans page — never a dark button that refuses;
 *   - a blocker with no fix has no button, never a disabled one.
 *
 * PURE. `navigate` is only called from the row's onAction.
 */
import { blockerLine, canRunFix } from "./firstRun.js";
import { cheapestPlanLabelWith } from "./billing-plans.js";
import { enT } from "../i18n/index.js";

/**
 * @param {Array<{key: string, grade: string, count: number|null, fix?: object|null}>} blockers
 * @param {{entitlements?: object, t?: Function, navigate?: Function, count?: (b: object) => string|undefined}} opts
 *   count — an optional per-row count label (the Audit says "23 of 500 scanned").
 * @returns {Array<{id: string, severity: "critical"|"warning", title: string, detail?: string, locked: boolean, count?: string, action?: object}>}
 */
export function blockerRows(blockers, { entitlements, t = enT, navigate = () => {}, count } = {}) {
  const list = Array.isArray(blockers) ? blockers.filter(Boolean) : [];
  return list.map((b) => {
    const fix = b.fix;
    let action;
    let lockedPlan = null;
    if (fix) {
      if (canRunFix(fix, entitlements)) {
        action = fix.external ? { content: t(fix.label), url: fix.to, external: true } : { content: t(fix.label), onAction: () => navigate(fix.to) };
      } else {
        lockedPlan = cheapestPlanLabelWith("bulkJobs");
        action = { content: t("See plans"), onAction: () => navigate("/app/plans") };
      }
    }
    return {
      id: b.key,
      severity: b.grade === "blocking" ? "critical" : "warning",
      title: blockerLine(b, t),
      // One sentence naming the plan (the brief's locked-feature rule); the
      // row's action is the plain "See plans" link.
      detail: lockedPlan ? t("Fixing many products at once is on {plan} and above.", { plan: lockedPlan }) : undefined,
      locked: !!lockedPlan,
      count: typeof count === "function" ? count(b) : undefined,
      action,
    };
  });
}
