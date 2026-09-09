/**
 * Phase 1 item 2 — web and worker are separate processes.
 *
 * One process used to serve the admin AND run the BullMQ worker. That is why a
 * web deploy killed whatever bulk job was running, why a long generation
 * competed with page loads for the same CPU and the same database connections,
 * and why the worker could only ever live where the web server lived.
 *
 * Getting the role wrong in either direction is expensive: a web machine that
 * starts a worker recreates the original problem N times over, and a worker that
 * thinks it is web never drains the queue at all. These lock the decision.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

const ORIGINAL = { ...process.env };

async function roleWith(env) {
  vi.resetModules();
  for (const k of ["FLY_PROCESS_GROUP", "RUN_WORKER", "FLY_MACHINE_ID", "FLY_REGION"]) delete process.env[k];
  Object.assign(process.env, env);
  return import("../../app/utils/processRole.server.js");
}

beforeEach(() => vi.resetModules());
afterEach(() => {
  for (const k of ["FLY_PROCESS_GROUP", "RUN_WORKER", "FLY_MACHINE_ID", "FLY_REGION"]) delete process.env[k];
  Object.assign(process.env, ORIGINAL);
});

const code = (f) =>
  readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

describe("who runs the jobs", () => {
  it("Fly's worker group runs jobs and does not claim to be web", async () => {
    const r = await roleWith({ FLY_PROCESS_GROUP: "worker" });
    expect(r.IS_WORKER).toBe(true);
    expect(r.IS_WEB).toBe(false);
    expect(r.RUNS_JOBS).toBe(true);
    expect(r.PROCESS_ROLE).toBe("worker");
  });

  it("Fly's web group serves HTTP and runs NO jobs", async () => {
    const r = await roleWith({ FLY_PROCESS_GROUP: "web" });
    expect(r.IS_WEB).toBe(true);
    expect(r.IS_WORKER).toBe(false);
    expect(r.RUNS_JOBS).toBe(false);
    expect(r.PROCESS_ROLE).toBe("web");
  });

  it("RUN_WORKER=1 works off Fly, which is how worker.js and local runs work", async () => {
    const r = await roleWith({ RUN_WORKER: "1" });
    expect(r.IS_WORKER).toBe(true);
    expect(r.RUNS_JOBS).toBe(true);
  });

  it("a plain local process is still both, so one npm run dev can do everything", async () => {
    const r = await roleWith({});
    expect(r.IS_WEB).toBe(true);
    expect(r.RUNS_JOBS).toBe(true);
  });

  it("case and whitespace in the Fly variable do not change the answer", async () => {
    const r = await roleWith({ FLY_PROCESS_GROUP: "  WORKER " });
    expect(r.IS_WORKER).toBe(true);
    expect(r.RUNS_JOBS).toBe(true);
  });

  it("reports the machine and region, which the heartbeat needs to identify itself", async () => {
    const r = await roleWith({ FLY_PROCESS_GROUP: "worker", FLY_MACHINE_ID: "abc123", FLY_REGION: "syd" });
    expect(r.MACHINE_ID).toBe("abc123");
    expect(r.REGION).toBe("syd");
  });
});

describe("the split is actually wired up (source guards)", () => {
  it("the worker is started only by the process whose job it is", () => {
    const src = code("app/queues/generationQueue.server.js");
    const fn = src.slice(src.indexOf("export async function startWorker"), src.indexOf("_worker = new Worker"));
    expect(fn).toMatch(/if \(!RUNS_JOBS\)/);
  });

  it("startup runs the recovery loop and the worker only in the job process", () => {
    const src = code("app/utils/startup.server.js");
    expect(src).toMatch(/if \(RUNS_JOBS\) \{/);
    expect(src).toMatch(/REDIS_URL && RUNS_JOBS/);
  });

  it("liveness is a shared heartbeat, not an in-process check", () => {
    const src = code("app/queues/generationQueue.server.js");
    expect(src).toMatch(/HEARTBEAT_KEY/);
    expect(src).toMatch(/HEARTBEAT_STALE_MS/);
    // getQueueHealth must read the heartbeat — a web machine cannot ask the
    // worker's process about itself.
    const health = src.slice(src.indexOf("export async function getQueueHealth"));
    expect(health).toMatch(/redis\.get\(HEARTBEAT_KEY\)/);
  });

  it("the worker entry starts jobs and no HTTP server", () => {
    const src = code("worker.js");
    expect(src).toMatch(/process\.env\.RUN_WORKER = "1"/);
    expect(src).toMatch(/startupPromise/);
    expect(src).not.toMatch(/react-router-serve|createServer|listen\(/);
  });
});

describe("fly.toml describes the two processes correctly", () => {
  const toml = readFileSync("fly.toml", "utf8");

  it("declares both processes", () => {
    expect(toml).toMatch(/\[processes\]/);
    expect(toml).toMatch(/web\s*=\s*"npm run start"/);
    expect(toml).toMatch(/worker\s*=\s*"node worker\.js"/);
  });

  it("routes HTTP and the health check to web only", () => {
    // Without this Fly would send traffic to the worker, whose health check
    // would fail forever because it has no port.
    const httpBlock = toml.slice(toml.indexOf("[http_service]"), toml.indexOf("[[vm]]"));
    expect(httpBlock).toMatch(/processes\s*=\s*\["web"\]/);
    const checks = toml.slice(toml.indexOf("[checks]"));
    expect(checks).toMatch(/processes\s*=\s*\["web"\]/);
  });

  it("never auto-stops the worker — a stopped worker is a queue nobody drains", () => {
    const workerVm = toml.slice(toml.lastIndexOf("[[vm]]"));
    expect(workerVm).toMatch(/processes\s*=\s*\["worker"\]/);
    expect(workerVm).toMatch(/auto_stop_machines\s*=\s*"off"/);
    expect(workerVm).toMatch(/shared-cpu-2x/);
    expect(workerVm).toMatch(/memory\s*=\s*"1gb"/);
    expect(workerVm).toMatch(/swap_size_mb\s*=\s*512/);
  });

  it("keeps the 60s kill timeout the drain needs", () => {
    expect(toml).toMatch(/kill_timeout\s*=\s*"60s"/);
  });

  it("applies migrations rather than pushing the schema", () => {
    expect(toml).toMatch(/release_command\s*=\s*"npx prisma migrate deploy"/);
    // Comments explain what it used to be, so check the directives only.
    const directives = toml.replace(/^\s*#.*$/gm, "");
    expect(directives).not.toMatch(/db push/);
  });
});

describe("the image is current and does not run as root (item 3)", () => {
  const dockerfile = readFileSync("Dockerfile", "utf8");

  it("is on a supported Node — 20 is end of life", () => {
    expect(dockerfile).toMatch(/FROM node:22-alpine/);
    expect(dockerfile).not.toMatch(/node:20/);
  });

  it("drops to the node user after the build", () => {
    expect(dockerfile).toMatch(/USER node/);
    // and the drop has to come after the build steps, or the build cannot write
    expect(dockerfile.indexOf("USER node")).toBeGreaterThan(dockerfile.indexOf("npm run build"));
  });

  it("still excludes tests and docs from the image", () => {
    const ignore = readFileSync(".dockerignore", "utf8");
    expect(ignore).toMatch(/^tests$/m);
    expect(ignore).toMatch(/\*\.md/);
  });
});
