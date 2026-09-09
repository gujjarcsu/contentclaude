/**
 * The worker process — Phase 1 item 2.
 *
 * Runs the BullMQ worker and nothing else: no HTTP server, no React, no Polaris.
 * Until now this lived inside the web process, which meant a web deploy killed
 * whatever bulk job was running, a long generation competed with page loads for
 * the same CPU and the same database connections, and the worker could only ever
 * be wherever the web server happened to be.
 *
 * Started by fly.toml:  worker = "node worker.js"
 * Locally:              RUN_WORKER=1 node worker.js
 *
 * RUN_WORKER is set here rather than relied upon from the environment, so this
 * file is correct however it is invoked. processRole.server.js reads it, and
 * startup.server.js does the rest: startup checks, Sentry, the stuck-job
 * recovery loop, the BullMQ worker itself, and the SIGTERM drain.
 */
process.env.RUN_WORKER = "1";

const { default: logger } = await import("./app/utils/logger.server.js");
const { PROCESS_ROLE, MACHINE_ID, REGION } = await import("./app/utils/processRole.server.js");

logger.info({ role: PROCESS_ROLE, machine: MACHINE_ID, region: REGION }, "Worker process starting");

try {
  // Importing startup runs every boot task and registers the shutdown handlers.
  const { startupPromise } = await import("./app/utils/startup.server.js");
  await startupPromise;
} catch (err) {
  // A worker that cannot boot must exit loudly rather than sit there looking
  // alive while no job ever runs. Fly restarts it; the health check reports the
  // missing heartbeat in the meantime.
  logger.error({ err }, "Worker failed to start — exiting");
  process.exit(1);
}

logger.info("Worker process ready — waiting for jobs");

// BullMQ's Worker holds the event loop open on its own. This keeps the intent
// explicit, and gives the process something to clear on shutdown.
const keepAlive = setInterval(() => {}, 60_000);
process.on("SIGTERM", () => clearInterval(keepAlive));
process.on("SIGINT", () => clearInterval(keepAlive));
