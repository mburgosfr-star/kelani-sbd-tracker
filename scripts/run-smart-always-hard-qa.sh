#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== Kelani Smart always-hard QA =="
echo "Purpose: clean-hard no-fail scenario must not block meetday forever."
echo "Rule: lots of recovery is OK; deload is not expected; meet should land late but finite."
echo "No APK, no phone install, no tag, no release."
echo

npm run build

(npx serve -s build -l 4173 >/tmp/kelani-smart-hard-serve.log 2>&1 & echo $! >/tmp/kelani-smart-hard-serve.pid)
sleep 2

node /tmp/kelani-always-hard-cycle-sim.js > /tmp/kelani-smart-always-hard-qa.json

kill "$(cat /tmp/kelani-smart-hard-serve.pid)" 2>/dev/null || true

python3 - <<'PY'
import json
from pathlib import Path
import sys

path = Path("/tmp/kelani-smart-always-hard-qa.json")
data = json.loads(path.read_text())
rows = data.get("rows", [])
meet = data.get("meetDay")

errors = []

if not meet:
    errors.append("meetday was not available within hard scenario window")
else:
    step = meet.get("availableAfterCompletingStep") or meet.get("reachedAsCurrentOnStep")
    if not step:
        errors.append("meetday step missing")
    elif step < 80:
        errors.append(f"meetday too early for always-hard: {step}")
    elif step > 160:
        errors.append(f"meetday too late for always-hard: {step}")

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
    errors.append("always-hard had no recovery days")

if first_deload:
    errors.append(f"unexpected deload in always-hard at step {first_deload.get('step')}")

if errors:
    print("FAIL: Smart always-hard QA")
    for error in errors:
        print("-", error)
    print("Result:", data.get("meetDay"))
    print("Full JSON:", path)
    sys.exit(1)

print("PASS: Smart always-hard QA")
print("meetDay:", meet)
print("firstRecoveryStep:", first_recovery.get("step") if first_recovery else None)
print("firstDeloadStep:", first_deload.get("step") if first_deload else None)
print("rowsChecked:", len(rows))
print("Full JSON:", path)
PY
