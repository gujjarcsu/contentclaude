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

SHA="${1:-$(git rev-parse HEAD)}"
SHORT="${SHA:0:7}"
APP="${APP_URL:-https://app.navaal.ai}"

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
  live=$(curl -fsS --max-time 15 "${APP}/api/build-info?cb=${RANDOM}${RANDOM}" | jq -r .sha 2>/dev/null || echo "")
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
echo "$body" | jq -c '{status, schema: .checks.schema, worker: .checks.queue.workerRunning, failed10m: .checks.queue.failedLast10m}'

st=$(echo "$body" | jq -r .status)
worker=$(echo "$body" | jq -r '.checks.queue.workerRunning')
schema_ok=$(echo "$body" | jq -r '.checks.schema.ok // "absent"')

fail=0
[ "$st" = "error" ] && { echo "::HEALTH:: status=error"; fail=1; }
[ "$worker" = "true" ] || { echo "::HEALTH:: worker not running"; fail=1; }
[ "$schema_ok" = "true" ] || { echo "::HEALTH:: schema check ${schema_ok}"; fail=1; }

[ "$fail" -eq 0 ] && echo "LIVE AND HEALTHY: ${SHORT}" || echo "DEPLOYED BUT UNHEALTHY: ${SHORT}"
exit "$fail"
