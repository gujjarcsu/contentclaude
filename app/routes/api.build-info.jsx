/**
 * Public build-info endpoint — GET /api/build-info
 *
 * Exposes the exact git SHA of the running image so we can PROVE which build
 * production is serving (App Store rejection #4 forensics: "is the fix actually
 * live?"). The SHA is baked in at image build time via the GIT_SHA build arg
 * (Dockerfile ARG -> ENV, passed by CI as --build-arg GIT_SHA=${{ github.sha }}).
 * No auth — safe, non-secret metadata only.
 */

// Captured once at module load = process (machine) start time.
const startedAt = new Date().toISOString();

export const loader = () => {
  return Response.json(
    {
      sha: process.env.GIT_SHA || "unknown",
      shortSha: (process.env.GIT_SHA || "unknown").slice(0, 7),
      startedAt,
      node: process.version,
      env: process.env.NODE_ENV || "unknown",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
};
