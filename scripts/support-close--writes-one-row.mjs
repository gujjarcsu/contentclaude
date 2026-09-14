#!/usr/bin/env node
/**
 * P7 C2 — mark ONE support request answered, by reference.
 *
 * The first use is closing CC's own end-to-end test submission
 * (cmu0us9zg0003tyi8967iysxi), which was left in production deliberately —
 * reaching into the database to delete a test row would have removed the only
 * evidence that the queue reports real rows — and which the owner's first real
 * queue should not carry.
 *
 * Writes exactly one row's `status`. Prints the reference and the resulting
 * status, and nothing else: never the message body, never the reply address.
 * Refuses a reference it cannot find rather than reporting a no-op as a close.
 *
 *   fly ssh console -a contentclaude -C "node /app/scripts/support-close--writes-one-row.mjs <id>"
 */
import prisma from "../app/db.server.js";

const id = String(process.argv[2] ?? "").trim();
const out = { at: new Date().toISOString(), ref: id || null };

if (!id) {
  out.error = "no reference given";
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}

const row = await prisma.supportRequest.findUnique({
  where: { id },
  select: { id: true, status: true, subject: true, createdAt: true },
});

if (!row) {
  // Not found is an ERROR, not a quiet success: a mistyped reference must not
  // be reported as "closed".
  out.error = "no support request with that reference";
  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
  process.exit(1);
}

out.before = { status: row.status, subject: row.subject, createdAt: row.createdAt };

if (row.status === "answered") {
  out.note = "already answered — nothing changed";
} else {
  const updated = await prisma.supportRequest.update({
    where: { id },
    data: { status: "answered" },
    select: { status: true },
  });
  out.after = { status: updated.status };
}

console.log(JSON.stringify(out, null, 2));
await prisma.$disconnect();
