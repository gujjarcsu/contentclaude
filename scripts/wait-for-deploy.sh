#!/usr/bin/env bash
# Prove a push actually reached production. L19: not live is not done.
#
# This exists because the ad-hoc version of it produced a FALSE GREEN on
# 2026-09-12: it asked "has the most recent run finished?", matched a PREVIOUS
# run that was already complete, exited instantly and reported a deploy that had
# never happened. Only /api/build-info still showing the old sha caught it.
#
# So every wait here is scoped to ONE commit sha, and the sha is the thing
# checked at the end. A run that is not for this commit is not this deploy.
#
# Usage: scripts/wait-for-deploy.sh [sha]   (defaults to HEAD)
set -uo pipefail

# Resolve whatever was given to a FULL sha. `gh run list --commit` matches only
# on the full 40-character sha: pass it a short one and it silently returns no
# runs, which this script would have read as "the run has not appeared yet" and
# waited the full 30 minutes before timing out. Accepting a short sha and then
# not finding it is worse than refusing it.
SHA=$(git rev-parse "${1:-HEAD}" 2>/dev/null) || { echo "not a known git ref: ${1:-HEAD}"; exit 1; }
SHORT="${SHA:0:7}"
APP="${APP_URL:-https://app.navaal.ai}"

# Read one field from a JSON document on stdin. jq is present on the GitHub
# runners but NOT in Git Bash on Windows, where this script is run by hand —
# and a missing jq returned empty for every read, so nothing ever matched and a
# healthy deploy reported NOT LIVE. A false red is the same defect as the false
# green this script exists to prevent. node is always here.
jsonfield() {
  node -e '
    let raw = "";
    process.stdin.on("data", (d) => (raw += d));
    process.stdin.on("end", () => {
      try {
        const path = process.argv[1].split(".");
        let v = JSON.parse(raw);
        for (const k of path) v = v?.[k];
        process.stdout.write(v === undefined || v === null ? "" : String(v));
      } catch {
        process.stdout.write("");
      }
    });
  ' "$1"
}

# Fail loudly rather than silently polling forever against a tool that is not here.
command -v node >/dev/null 2>&1 || { echo "node is required (used to parse JSON)"; exit 1; }
command -v gh   >/dev/null 2>&1 || { echo "gh is required (used to read the CI run)"; exit 1; }

echo "watching deploy of ${SHORT}"

# ---- 1. the CI run FOR THIS SHA ------------------------------------------
status=""
for i in $(seq 1 120); do
  line=$(gh run list --commit "$SHA" --limit 1 --json status,conclusion,displayTitle \
           --jq '.[0] | "\(.status)\t\(.conclusion)"' 2>/dev/null || echo "")
  status="${line%%$'\t'*}"
  concl="${line##*$'\t'}"

  if [ -z "$line" ] || [ "$line" = "null" ]; then
    echo "  [$i] no run registered for ${SHORT} yet"
  else
    echo "  [$i] status=${status} conclusion=${concl}"
    if [ "$status" = "completed" ]; then
      echo "CI: ${concl}"
      [ "$concl" = "success" ] || { echo "::CI FAILED:: ${concl}"; gh run list --commit "$SHA" --limit 1; exit 1; }
      break
    fi
  fi
  sleep 15
done

if [ "$status" != "completed" ]; then
  echo "::TIMEOUT:: CI for ${SHORT} did not complete in 30 minutes"
  exit 1
fi

# ---- 2. the deployed sha IS this sha -------------------------------------
# Cache-busted: a cached read is not evidence.
for i in $(seq 1 40); do
  live=$(curl -fsS --max-time 15 "${APP}/api/build-info?cb=${RANDOM}${RANDOM}" | jsonfield sha)
  if [ "$live" = "$SHA" ]; then
    echo "build-info reports ${SHORT} after ${i} attempt(s)"
    break
  fi
  echo "  [$i] build-info says ${live:0:7}, want ${SHORT}"
  sleep 15
done
[ "$live" = "$SHA" ] || { echo "::NOT LIVE:: build-info never reported ${SHORT}"; exit 1; }

# ---- 3. deep health, worker, failed jobs ---------------------------------
body=$(curl -fsS --max-time 25 "${APP}/api/health?deep=1" || echo "{}")

st=$(echo "$body"       | jsonfield status)
worker=$(echo "$body"   | jsonfield checks.queue.workerRunning)
schema_ok=$(echo "$body" | jsonfield checks.schema.ok)
failed10m=$(echo "$body" | jsonfield checks.queue.failedLast10m)
columns=$(echo "$body"   | jsonfield checks.schema.columns)
echo "status=${st:-?} worker=${worker:-?} schema.ok=${schema_ok:-absent} columns=${columns:-?} failed10m=${failed10m:-?}"

fail=0
[ "$st" = "error" ] && { echo "::HEALTH:: status=error"; fail=1; }
[ "$worker" = "true" ] || { echo "::HEALTH:: worker not running"; fail=1; }
[ "$schema_ok" = "true" ] || { echo "::HEALTH:: schema check ${schema_ok:-absent}"; fail=1; }

[ "$fail" -eq 0 ] && echo "LIVE AND HEALTHY: ${SHORT}" || echo "DEPLOYED BUT UNHEALTHY: ${SHORT}"
exit "$fail"
