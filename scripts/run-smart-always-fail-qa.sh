#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== Kelani Smart always-fail QA =="
echo "Purpose: true failure scenario must block meetday permanently."
echo "Rule: failed/skipped sets are real blockers; recovery may happen, but no meetday should appear."
echo "No APK, no phone install, no tag, no release."
echo

node ./scripts/kelani-smart-always-fail-qa-browser.js
node /tmp/kelani-always-fail-cycle-sim.js > /tmp/kelani-smart-always-fail-qa.json

python3 - <<'PY'
import json
from pathlib import Path
from collections import Counter
import sys

path = Path("/tmp/kelani-smart-always-fail-qa.json")
data = json.loads(path.read_text())
rows = data.get("rows", [])
meet = data.get("meetDay")

errors = []

if not rows:
    errors.append("no rows produced by always-fail sim")

if meet:
    errors.append(f"meetday appeared in always-fail scenario: {meet}")

types = Counter()
blockers = Counter()
reasons = Counter()
failed_evidence_rows = 0

for row in rows:
    nxt = row.get("afterEasyNext") or row.get("next") or {}
    types[nxt.get("smartDayType")] += 1
    reasons[nxt.get("smartDecisionSummary", {}).get("reason") or nxt.get("reason")] += 1

    if (nxt.get("failed") or 0) > 0:
        failed_evidence_rows += 1

    for blocker in nxt.get("meetdayBlockers") or []:
        blockers[blocker] += 1

if types.get("meet", 0) > 0:
    errors.append("meet smartDayType appeared in rows")

if not any(key in types for key in ["deload", "recovery", "training"]):
    errors.append(f"unexpected day types: {dict(types)}")

if not any(blockers.get(key, 0) > 0 for key in ["failed-skipped", "meet-plan-not-ready", "fatigue", "last-workout-hard"]):
    errors.append(f"no meaningful blockers found: {dict(blockers)}")

if errors:
    print("FAIL: Smart always-fail QA")
    for error in errors:
        print("-", error)
    print("types:", dict(types))
    print("reasons:", dict(reasons))
    print("blockers:", dict(blockers))
    print("Result:", meet)
    print("Full JSON:", path)
    sys.exit(1)

print("PASS: Smart always-fail QA")
print("meetDay:", meet)
print("types:", dict(types))
print("reasons:", dict(reasons))
print("blockers:", dict(blockers))
print("rowsChecked:", len(rows))
print("Full JSON:", path)
PY
