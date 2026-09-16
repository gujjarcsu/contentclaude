/**
 * Phase 16 — EVERY MODULE THE SCHEDULER IMPORTS MUST BE LOADABLE BY NODE.
 *
 * The weekly report had never run in production. `scheduler.server.js` imports
 * it on a 60-second timer; that chain reaches `app/i18n/catalogues.server.js`,
 * whose twelve bare JSON imports Node's own ESM loader refuses:
 *
 *   TypeError [ERR_IMPORT_ATTRIBUTE_MISSING]:
 *     Module "file:///app/app/i18n/locales/de.json" needs an import attribute
 *     of "type: json"
 *
 * The path in that error is the giveaway — `/app/app/…` is raw SOURCE. The web
 * process runs the Vite bundle, where JSON is inlined at build time and the
 * attribute is not needed. **The worker does not.** `worker.js` is started by
 * fly.toml as `node worker.js` and does `await import("./app/utils/…")`, so
 * every module it reaches is loaded by Node, unbundled, with Node's rules.
 *
 * That makes this a BUILD-SHAPE defect rather than one file's bug: the repo has
 * two loaders and `catalogues.server.js` was written for one of them. The other
 * three scheduled jobs did not throw for the single reason that none of them
 * imports the i18n catalogues — not because the shape was sound.
 *
 * ── Why this test spawns Node ──────────────────────────────────────────────
 *
 * Vitest runs through Vite. An `await import()` inside a normal test is
 * transformed by the same pipeline that made the bundle work, so it would have
 * passed on the broken code and proved nothing. The only way to test the
 * worker's loader is to use the worker's loader: a real `node` process, the
 * real file, no transform.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * The modules the scheduler pulls in on its timers, read from the scheduler
 * itself. A fifth job added next month is covered without anyone remembering
 * to add it here — which is the failure mode this whole phase is about.
 */
function scheduledModules() {
  const src = readFileSync("app/utils/scheduler.server.js", "utf8");
  const found = new Set();
  for (const m of src.matchAll(/import\(\s*"(\.\/[^"]+\.server\.js)"\s*\)/g)) found.add(m[1]);
  return [...found].sort();
}

/** Load one module in a real Node process. Resolves to its exit code. */
async function loadInNode(relFromUtils) {
  const abs = resolve("app/utils", relFromUtils);
  const href = pathToFileURL(abs).href;
  const code = `
    const t = setTimeout(() => { console.error("DID NOT SETTLE"); process.exit(3); }, 30000);
    import(${JSON.stringify(href)})
      .then(() => { clearTimeout(t); process.exit(0); })
      .catch((e) => { clearTimeout(t); console.error((e && e.code) || "", String(e && e.message).slice(0, 300)); process.exit(1); });
  `;
  try {
    await run(process.execPath, ["--input-type=module", "-e", code], {
      timeout: 60_000,
      // No DATABASE_URL, no REDIS_URL: loading a module must not need either,
      // and CI has neither. NODE_ENV stays out of production so nothing's boot
      // guard fires on a machine that is only being asked to parse.
      env: { ...process.env, NODE_ENV: "test", DATABASE_URL: "", WORKER_DATABASE_URL: "", REDIS_URL: "" },
    });
    return { ok: true, stderr: "" };
  } catch (err) {
    return { ok: false, stderr: String(err?.stderr ?? err?.message ?? "").trim() };
  }
}

describe("the scheduler's modules load under Node's own loader", () => {
  const modules = scheduledModules();

  it("finds the scheduled imports in the scheduler, so this test cannot silently cover nothing", () => {
    expect(modules.length).toBeGreaterThanOrEqual(4);
    expect(modules).toContain("./weeklyReport.server.js");
    expect(modules).toContain("./catalogueWatch.server.js");
    expect(modules).toContain("./crawlHoldout.server.js");
    expect(modules).toContain("./funnel.server.js");
  });

  it(
    "every one of them imports without throwing — THE DEFECT: weeklyReport did not",
    async () => {
      const results = await Promise.all(modules.map(async (m) => [m, await loadInNode(m)]));
      const broken = results.filter(([, r]) => !r.ok).map(([m, r]) => `${m}: ${r.stderr.split("\n").slice(0, 2).join(" ")}`);
      expect(broken, "a scheduled job whose module will not load has never run").toEqual([]);
    },
    120_000,
  );

  it(
    "the i18n catalogue itself loads under Node — the module the error named",
    async () => {
      const href = pathToFileURL(resolve("app/i18n/catalogues.server.js")).href;
      const code = `import(${JSON.stringify(href)}).then((m) => { if (Object.keys(m.SERVER_CATALOGUES).length !== 6) { console.error("wrong catalogue count"); process.exit(2); } process.exit(0); }).catch((e) => { console.error((e && e.code) || "", String(e && e.message).slice(0, 300)); process.exit(1); });`;
      const r = await run(process.execPath, ["--input-type=module", "-e", code], { timeout: 60_000 }).then(
        () => ({ ok: true, stderr: "" }),
        (err) => ({ ok: false, stderr: String(err?.stderr ?? err?.message ?? "") }),
      );
      expect(r.ok, r.stderr).toBe(true);
    },
    90_000,
  );
});

describe("the shape, so this cannot come back through a different file", () => {
  const walk = (d) =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`],
    );

  it("no JSON is imported without `type: json` anywhere the worker can reach", () => {
    // Routes are excluded on purpose: only the web process loads a route, and
    // only ever through the bundle. Everything else under app/ is fair game for
    // a `await import()` from the worker, today or next month.
    const files = walk("app")
      .filter((f) => /\.(js|jsx|mjs)$/.test(f))
      .filter((f) => !f.startsWith("app/routes/"));
    const offenders = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/^\s*import\s+\w+\s+from\s+"([^"]+\.json)"\s*(;|$)/gm)) offenders.push(`${f}: static ${m[1]}`);
      for (const m of src.matchAll(/import\(\s*"([^"]+\.json)"\s*\)/g)) offenders.push(`${f}: dynamic ${m[1]}`);
    }
    expect(offenders, 'every JSON import needs `with { type: "json" }` to survive Node\'s loader').toEqual([]);
  });

  it("the worker really does run raw source — the premise the rest of this rests on", () => {
    const fly = readFileSync("fly.toml", "utf8");
    expect(fly).toMatch(/worker\s*=\s*"node worker\.js"/);
    const w = readFileSync("worker.js", "utf8");
    // no build/ in sight: it imports the source tree directly
    expect(w).toMatch(/await import\("\.\/app\/utils\/startup\.server\.js"\)/);
    expect(w).not.toMatch(/\.\/build\//);
  });
});
