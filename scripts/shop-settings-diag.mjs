#!/usr/bin/env node
/**
 * Read a shop's stored settings STRAIGHT FROM THE DATABASE.
 *
 * Why this exists: proving a setting persists needs the stored value, not the
 * value the app renders. Those are two different things, and a read path that
 * disagrees with storage is the whole bug class L15 exists for —
 * `includeDraftProducts` shipped with a column, a read path, a write path and a
 * green suite, and no control on any screen.
 *
 * Nothing on this machine could read the database: local `flyctl` has no token
 * and there is no ops route. This runs where `DATABASE_URL` already exists:
 *
 *   fly ssh console -a contentclaude -C "node /app/scripts/shop-settings-diag.mjs <shop-domain>"
 *
 * or through the `Shop settings diagnostic` workflow, which is how a session
 * without a Fly token reaches it.
 *
 * READ ONLY. It never writes. It prints booleans, lengths and timestamps — never
 * a token, never a connection string, and never the merchant's sample copy
 * (only how many characters of it there are).
 */
import prisma from "../app/db.server.js";

const shop = process.argv[2];
if (!shop) {
  console.error("usage: node scripts/shop-settings-diag.mjs <shop-domain>");
  process.exit(2);
}

const row = await prisma.brandVoice.findUnique({ where: { shop } });

if (!row) {
  // "No row" and "row with false" are different findings and must never be
  // reported as each other: a missing row means the app has never written
  // settings for this shop at all.
  console.log(JSON.stringify({ shop, row: null, note: "no BrandVoice row exists for this shop" }, null, 2));
} else {
  console.log(
    JSON.stringify(
      {
        shop,
        readAt: new Date().toISOString(),
        // The flags a merchant can toggle. These are the whole point.
        includeDraftProducts: row.includeDraftProducts,
        publishWithoutReview: row.publishWithoutReview,
        autopilotEnabled: row.autopilotEnabled,
        autopilotAutoPublish: row.autopilotAutoPublish,
        autopilotContentTypes: row.autopilotContentTypes,
        // Context, without reproducing the merchant's own copy.
        storeName: row.storeName,
        language: row.language,
        sampleContentChars: (row.sampleContent || "").length,
        keyDifferentiatorsChars: (row.keyDifferentiators || "").length,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      null,
      2,
    ),
  );
}

await prisma.$disconnect();
