/**
 * P3.1 (Phase 8) — what Home's Proof card reads. One query; never throws.
 */
import prisma from "../db.server.js";
import logger from "./logger.server.js";
import { summariseExperiment } from "./crawlHoldout.js";
import { lockConfigured } from "./remediation.server.js";

export async function proofSummary(shop, { now = new Date() } = {}) {
  try {
    const row = await prisma.shop.findUnique({ where: { shop }, select: { bingEnabledAt: true } });
    if (!row?.bingEnabledAt) return { enabled: false, lockConfigured: lockConfigured(), latest: null };
    const exp = await prisma.crawlExperiment.findFirst({
      where: { shop },
      orderBy: { startedAt: "desc" },
      select: { id: true, seed: true, status: true, startedAt: true, urls: { select: { arm: true, changedAt: true, firstCrawledAt: true } } },
    });
    return {
      enabled: true,
      lockConfigured: lockConfigured(),
      latest: exp ? { id: exp.id, status: exp.status, startedAt: exp.startedAt.toISOString(), summary: summariseExperiment(exp.urls, { seed: exp.seed, now }) } : null,
    };
  } catch (err) {
    logger.warn({ shop, err: err?.message }, "proof summary unavailable (non-fatal)");
    return { enabled: false, lockConfigured: false, latest: null };
  }
}
