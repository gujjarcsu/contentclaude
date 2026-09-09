/**
 * Nightly database backup to R2 — Phase 1 item 7.
 *
 * Neon's point-in-time restore is the first line of defence and covers the
 * common cases: a bad migration, a mistaken delete, a corrupted write. It does
 * NOT cover losing access to the Neon project itself — a billing lapse, an
 * account problem, a provider incident, or a deletion. A backup that lives only
 * inside the thing it is backing up is not a backup.
 *
 * So: one `pg_dump` a night, written to Cloudflare R2, which is a different
 * company. Restore is documented in docs/RUNBOOK.md and has to be REHEARSED,
 * because an untested backup is a hope.
 *
 * Runs in the worker. Uses the S3 API that R2 exposes, signed by hand, so this
 * needs no AWS SDK — one fetch and a signature.
 */
import { createHash, createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import logger from "./logger.server.js";
import { sendOperatorEmail } from "./notify.server.js";

const RETENTION_DAYS = 30;

function env(name) {
  return process.env[name] || "";
}

/** Is everything needed to take and store a backup configured? */
export function backupConfig() {
  const cfg = {
    accountId: env("R2_ACCOUNT_ID"),
    accessKeyId: env("R2_ACCESS_KEY_ID"),
    secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
    bucket: env("R2_BUCKET") || "navaal-backups",
    databaseUrl: env("DIRECT_URL") || env("DATABASE_URL"),
  };
  const missing = ["accountId", "accessKeyId", "secretAccessKey", "databaseUrl"].filter((k) => !cfg[k]);
  return { ...cfg, ready: missing.length === 0, missing };
}

// ── Minimal SigV4 for R2 ─────────────────────────────────────────────────────
const sha256hex = (b) => createHash("sha256").update(b).digest("hex");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();

function signingKey(secret, dateStamp, region, service) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, dateStamp), region), service), "aws4_request");
}

/**
 * PUT an object into R2. Pure-ish: everything it needs is an argument.
 * @returns {Promise<{ok: boolean, status: number, key: string, error?: string}>}
 */
export async function putObject({ cfg, key, body, contentType = "application/octet-stream", fetchImpl = fetch, now = new Date() }) {
  const region = "auto";
  const service = "s3";
  const host = `${cfg.accountId}.r2.cloudflarestorage.com`;
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256hex(body);
  const canonicalUri = `/${cfg.bucket}/${key}`;

  const canonicalHeaders =
    `host:${host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = ["PUT", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(cfg.secretAccessKey, dateStamp, region, service))
    .update(stringToSign)
    .digest("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  try {
    const res = await fetchImpl(`https://${host}${canonicalUri}`, {
      method: "PUT",
      headers: {
        Authorization: authorization,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
        "Content-Type": contentType,
        "Content-Length": String(body.length),
      },
      body,
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, key, error: text.slice(0, 300) };
    }
    return { ok: true, status: res.status, key };
  } catch (err) {
    return { ok: false, status: 0, key, error: err.message };
  }
}

/** Run pg_dump and resolve with the dump as a Buffer. */
function pgDump(databaseUrl) {
  return new Promise((resolve, reject) => {
    // --no-owner/--no-acl so the dump restores into any database, not just one
    // with the same roles. Custom format compresses and allows selective restore.
    const args = ["--no-owner", "--no-acl", "--format=custom", databaseUrl];
    const child = spawn("pg_dump", args, { stdio: ["ignore", "pipe", "pipe"] });
    const out = [];
    const err = [];
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => err.push(d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`pg_dump exited ${code}: ${Buffer.concat(err).toString().slice(0, 500)}`));
    });
  });
}

/**
 * Take one backup and store it. Never throws: it reports by email instead,
 * because a backup failing silently is the whole problem it exists to avoid.
 */
export async function runNightlyBackup({ now = new Date(), dump = pgDump, put = putObject } = {}) {
  const cfg = backupConfig();
  if (!cfg.ready) {
    logger.error(
      { event: "backup_not_configured", missing: cfg.missing },
      "Nightly backup skipped — R2 is not configured",
    );
    return { ok: false, reason: `not configured: ${cfg.missing.join(", ")}` };
  }

  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const key = `neondb/${now.toISOString().slice(0, 10)}/contentclaude-${stamp}.dump`;

  try {
    const body = await dump(cfg.databaseUrl);
    if (!body || body.length < 1024) {
      throw new Error(`pg_dump produced ${body?.length ?? 0} bytes — refusing to store an empty backup`);
    }
    const res = await put({ cfg, key, body, now });
    if (!res.ok) throw new Error(`R2 PUT failed (${res.status}): ${res.error ?? ""}`);

    logger.info({ event: "backup_ok", key, bytes: body.length }, "Nightly backup stored");
    return { ok: true, key, bytes: body.length, retentionDays: RETENTION_DAYS };
  } catch (err) {
    logger.error({ event: "backup_failed", err: err.message, key }, "Nightly backup FAILED");
    await sendOperatorEmail({
      subject: "Navaal nightly backup FAILED",
      text: [
        "The nightly database backup did not complete.",
        "",
        `key:   ${key}`,
        `error: ${err.message}`,
        "",
        "Neon point-in-time restore still covers the last 7 days, so this is not",
        "an emergency — but it is the second line of defence that is now missing.",
        "Restore procedure and the drill: docs/RUNBOOK.md.",
      ].join("\n"),
    });
    return { ok: false, reason: err.message };
  }
}
