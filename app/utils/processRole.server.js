/**
 * Which process is this — Phase 1 item 2.
 *
 * Until now one process did everything: served the admin AND ran the BullMQ
 * worker. That is why a web deploy killed running jobs, why a busy bulk run
 * competed with page loads for the same CPU and the same database connections,
 * and why the worker could only ever live wherever the web server lived.
 *
 * Fly sets FLY_PROCESS_GROUP per process group, so that is the signal in
 * production. RUN_WORKER=1 is the explicit override the worker entry point uses,
 * and it is what makes `node worker.js` work anywhere — locally, in CI, or on a
 * host that is not Fly.
 *
 * Local development keeps the old behavior on purpose: with neither variable
 * set, one `npm run dev` process is both web and worker, so nobody has to run
 * two terminals to try a bulk job.
 */

const group = (process.env.FLY_PROCESS_GROUP || "").trim().toLowerCase();

/** Explicitly the worker: `node worker.js`, or Fly's worker process group. */
export const IS_WORKER = process.env.RUN_WORKER === "1" || group === "worker";

/** Serves HTTP. True for Fly's web group, and true locally where there is no split. */
export const IS_WEB = group === "web" || (!group && !IS_WORKER);

/**
 * Does THIS process run the BullMQ worker?
 * In production exactly one process group does. Locally, the single process does.
 */
export const RUNS_JOBS = IS_WORKER || (!group && process.env.RUN_WORKER !== "0");

/** For logs and the health payload. */
export const PROCESS_ROLE = IS_WORKER ? "worker" : IS_WEB ? "web" : group || "unknown";

/** Which machine, for a heartbeat that has to identify itself. */
export const MACHINE_ID = process.env.FLY_MACHINE_ID || process.env.HOSTNAME || "local";
export const REGION = process.env.FLY_REGION || "local";
