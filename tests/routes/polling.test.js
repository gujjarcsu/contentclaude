/**
 * Phase 1 item 6 — the app used to poll itself forever.
 *
 * JobProgressTicker hit /api/jobs-status every 15 seconds, in every open admin
 * tab, for as long as the tab stayed open, whether or not any job existed. Each
 * poll cost an authenticate.admin and a Prisma query. A merchant who left the
 * app open in a background tab generated ~5,700 authenticated database queries a
 * day, essentially all of them asking about jobs that were not running. And on
 * the Jobs page it ran alongside that page's own revalidation, polling the same
 * data twice.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const code = (f) =>
  readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

const layout = code("app/routes/app.jsx");
const jobsPage = code("app/routes/app.jobs.jsx");

describe("the layout answers the question instead of making the browser ask", () => {
  it("the loader reports whether a job is actually running", () => {
    expect(layout).toMatch(/activeJobCount = await prisma\.generationJob\.count/);
    expect(layout).toMatch(/status: \{ in: \["queued", "processing"\] \}/);
    expect(layout).toMatch(/activeJobCount \}/);
  });

  it("the ticker takes that count and the current path as input", () => {
    expect(layout).toMatch(/function JobProgressTicker\(\{ navigate, activeJobCount, onJobsPage \}\)/);
    expect(layout).toMatch(/activeJobCount=\{activeJobCount\}/);
    expect(layout).toMatch(/onJobsPage=\{location\.pathname\.startsWith\("\/app\/jobs"\)\}/);
  });
});

describe("the ticker stops polling", () => {
  const effect = layout.slice(layout.indexOf("useEffect(() => {", layout.indexOf("idleStreakRef")));

  it("does not start at all when nothing is running", () => {
    expect(effect).toMatch(/if \(activeJobCount === 0 && !hasJobsRef\.current\) return undefined/);
  });

  it("gives up after two consecutive empty responses", () => {
    expect(effect).toMatch(/idleStreakRef\.current >= 2/);
    expect(layout).toMatch(/idleStreakRef\.current = data\.count > 0 \? 0 : idleStreakRef\.current \+ 1/);
  });

  it("stays quiet on the Jobs page, which revalidates its own loader", () => {
    expect(effect).toMatch(/if \(onJobsPage\) return undefined/);
  });

  it("re-runs when the count changes, so starting a job restarts it", () => {
    // The old effect had an empty dependency array and never restarted.
    expect(layout).toMatch(/\}, \[activeJobCount, onJobsPage\]\)/);
    expect(layout).not.toMatch(/\}, \[\]\); \/\/ Effect is intentionally mount-only/);
  });
});

describe("the Jobs page polls only while it has something to show", () => {
  it("bails out of its revalidation loop when no job is active", () => {
    expect(jobsPage).toMatch(/if \(!hasActiveJobs\) \{/);
  });

  it("uses the router's revalidator rather than a second fetcher", () => {
    expect(jobsPage).toMatch(/useRevalidator\(\)/);
    expect(jobsPage).toMatch(/revalidator\.revalidate\(\)/);
  });

  it("backs off as progress stalls instead of hammering a fixed interval", () => {
    expect(jobsPage).toMatch(/Math\.min\(pollIntervalRef\.current \* 2, 30_000\)/);
  });
});

describe("the polled endpoint stays cheap and safe", () => {
  const endpoint = code("app/routes/api.jobs-status.jsx");

  it("never redirects a background poll to a login form", () => {
    // A fetcher.load follows redirects, so an auth blip here would yank the
    // whole embedded app to /auth/login.
    expect(endpoint).toMatch(/catch \{\s*return Response\.json\(EMPTY\)/);
  });

  it("reads only what the ticker displays", () => {
    expect(endpoint).toMatch(/take: 5/);
    expect(endpoint).toMatch(/select: \{/);
  });
});
