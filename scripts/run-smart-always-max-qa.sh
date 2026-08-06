#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== Kelani Smart always-max QA =="
echo "Purpose: max-success scenario must not be treated as fail, but must reach meetday much later than hard."
echo "Rule: all sets succeed, effort is max; no deload expected; meet should be late but finite."
echo "Target: around W336; acceptable window W250-W420."
echo "No APK, no phone install, no tag, no release."
echo

node ./scripts/kelani-smart-always-max-qa-browser.js
node /tmp/kelani-always-max-cycle-sim.js > /tmp/kelani-smart-always-max-qa.json

python3 - <<'PY'
import json
from pathlib import Path
import sys

path = Path("/tmp/kelani-smart-always-max-qa.json")
data = json.loads(path.read_text())
rows = data.get("rows", [])
meet = data.get("meetDay")

errors = []

if not rows:
    errors.append("no rows produced by always-max sim")

if not meet:
    errors.append("meetday was not available within max scenario window")
else:
    step = meet.get("availableAfterCompletingStep") or meet.get("reachedAsCurrentOnStep")
    if not step:
        errors.append("meetday step missing")
    elif step < 250:
        errors.append(f"meetday too early for always-max: {step}")
    elif step > 420:
        errors.append(f"meetday too late for always-max: {step}")

    meet_row = next((r for r in rows if r.get("step") == step), None)
    nxt = (meet_row or {}).get("afterEasyNext") or {}

    if nxt.get("smartDayType") != "meet":
        errors.append(f"meet row did not produce meet day: {nxt.get('smartDayType')}")

    if nxt.get("meetPlanReady") is not True:
        errors.append("meetday appeared without meetPlanReady=true")

    if nxt.get("meetdayBlockers"):
        errors.append(f"meetday still had blockers: {nxt.get('meetdayBlockers')}")

first_recovery = next((r for r in rows if (r.get("afterEasyNext") or {}).get("smartDayType") == "recovery"), None)
first_deload = next((r for r in rows if (r.get("afterEasyNext") or {}).get("smartDayType") == "deload"), None)

if not first_recovery:
    errors.append("always-max had no recovery days")

if first_deload:
    errors.append(f"unexpected deload in always-max at step {first_deload.get('step')}")

if errors:
    print("FAIL: Smart always-max QA")
    for error in errors:
        print("-", error)
    print("Result:", data.get("meetDay"))
    print("Full JSON:", path)
    sys.exit(1)

print("PASS: Smart always-max QA")
print("meetDay:", meet)
print("firstRecoveryStep:", first_recovery.get("step") if first_recovery else None)
print("firstDeloadStep:", first_deload.get("step") if first_deload else None)
print("rowsChecked:", len(rows))
print("Full JSON:", path)
PY
