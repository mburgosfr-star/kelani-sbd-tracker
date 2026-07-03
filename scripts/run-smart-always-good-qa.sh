#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== Kelani Smart always-good QA =="
echo "Purpose: perfect normal clean-good scenario should reach meetday around a normal long build."
echo "Rule: no easy acceleration, no deload, small taper/recovery before meetday."
echo "No APK, no phone install, no tag, no release."
echo

npm run build

(npx serve -s build -l 4173 >/tmp/kelani-smart-good-serve.log 2>&1 & echo $! >/tmp/kelani-smart-good-serve.pid)
sleep 2

node scripts/kelani-smart-always-good-qa-browser.js > /tmp/kelani-smart-always-good-qa.json

kill "$(cat /tmp/kelani-smart-good-serve.pid)" 2>/dev/null || true

python3 - <<'PY'
import json
from pathlib import Path
import sys

path = Path("/tmp/kelani-smart-always-good-qa.json")
data = json.loads(path.read_text())
rows = data.get("rows", [])
meet = data.get("meetDay")

errors = []

if not meet:
    errors.append("meetday was not available in always-good scenario")
else:
    step = meet.get("availableAfterCompletingStep") or meet.get("reachedAsCurrentOnStep")
    if not step:
        errors.append("meetday step missing")
    elif step < 30:
        errors.append(f"meetday too early for always-good: {step}")
    elif step > 50:
        errors.append(f"meetday too late for always-good: {step}")

    meet_row = next((r for r in rows if r.get("step") == step), None)
    nxt = (meet_row or {}).get("afterEasyNext") or {}

    if nxt.get("smartDayType") != "meet":
        errors.append(f"meet row did not produce meet day: {nxt.get('smartDayType')}")

    if nxt.get("meetPlanReady") is not True:
        errors.append("meetday appeared without meetPlanReady=true")

    if nxt.get("meetdayBlockers"):
        errors.append(f"meetday still had blockers: {nxt.get('meetdayBlockers')}")

    before_meet = [r for r in rows if r.get("step", 999) < step]
    if any((r.get("afterEasyNext") or {}).get("recentEasyCount", 0) for r in before_meet):
        errors.append("always-good incorrectly accumulated recentEasyCount")

first_recovery = next((r for r in rows if (r.get("afterEasyNext") or {}).get("smartDayType") == "recovery"), None)
first_deload = next((r for r in rows if (r.get("afterEasyNext") or {}).get("smartDayType") == "deload"), None)

if not first_recovery:
    errors.append("always-good had no recovery/taper day")

if first_deload:
    errors.append(f"unexpected deload in always-good at step {first_deload.get('step')}")

if errors:
    print("FAIL: Smart always-good QA")
    for error in errors:
        print("-", error)
    print("Result:", data.get("meetDay"))
    print("Full JSON:", path)
    sys.exit(1)

print("PASS: Smart always-good QA")
print("meetDay:", meet)
print("firstRecoveryStep:", first_recovery.get("step") if first_recovery else None)
print("firstDeloadStep:", first_deload.get("step") if first_deload else None)
print("rowsChecked:", len(rows))
print("Full JSON:", path)
PY
