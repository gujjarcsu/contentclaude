// READ-ONLY. Phase 10 Part B — the funnel as the owner's digest would show it:
// counts at each stage across non-test shops and the median hours between
// stages. No shop name, no content, no email address is read or printed. The
// weekly email itself is sent by the scheduler (funnel.server.js); this is
// the same arithmetic on demand, to the terminal or a job summary.
// Run on the Fly machine (DATABASE_URL + generated Prisma client are there):
//   fly ssh console -a contentclaude -C "node /app/scripts/funnel-digest.mjs"
// Env: FUNNEL_FORMAT=json|md
import { PrismaClient } from "@prisma/client";
import { computeFunnel, composeFunnelDigest, FUNNEL_SELECT } from "../app/utils/funnel.js";

const p = new PrismaClient();
const rows = await p.shop.findMany({ where: { redactedAt: null }, select: FUNNEL_SELECT });
await p.$disconnect();

const f = computeFunnel(rows);
const digest = composeFunnelDigest(f, { now: new Date() });

if ((process.env.FUNNEL_FORMAT || "md") === "json") {
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), ...f, wouldSend: digest !== null }, null, 2));
} else if (!digest) {
  console.log(`## Navaal funnel\n\nNo real shop and nothing unclassified (${f.excludedTestShops} of ours / Shopify's excluded). The weekly digest would not send.`);
} else {
  console.log(`## ${digest.subject}\n\n\`\`\`\n${digest.text}\n\`\`\``);
}
