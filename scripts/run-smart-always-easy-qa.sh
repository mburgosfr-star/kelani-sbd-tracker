#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== Kelani Smart accelerated always-easy QA =="
echo "Purpose: bad-input / underestimated-RM scenario guard."
echo "Rule: always easy + no fails + no fatigue must accelerate toward meetday safely."
echo "No APK, no phone install, no tag, no release."
echo

npm run build

(npx serve -s build -l 4173 >/tmp/kelani-smart-easy-serve.log 2>&1 & echo $! >/tmp/kelani-smart-easy-serve.pid)
sleep 2

node scripts/kelani-smart-always-easy-qa-browser.js > /tmp/kelani-smart-always-easy-qa.json

kill "$(cat /tmp/kelani-smart-easy-serve.pid)" 2>/dev/null || true

python3 - <<'PY'
import json
from pathlib import Path
import sys

path = Path("/tmp/kelani-smart-always-easy-qa.json")
data = json.loads(path.read_text())
rows = data.get("rows", [])
meet = data.get("meetDay")

errors = []

if not meet:
    errors.append("meetday was not available within 15 always-easy steps")
else:
    step = meet.get("availableAfterCompletingStep") or meet.get("reachedAsCurrentOnStep")
    if not step or step > 15:
        errors.append(f"meetday too late: {step}")

    meet_row = next((r for r in rows if r.get("step") == step), None)
    nxt = (meet_row or {}).get("afterEasyNext") or {}

    if nxt.get("smartDayType") != "meet":
        errors.append(f"meet row did not produce meet day: {nxt.get('smartDayType')}")

    if nxt.get("meetPlanReady") is not True:
        errors.append("meetday appeared without meetPlanReady=true")

    if nxt.get("meetdayBlockers"):
        errors.append(f"meetday still had blockers: {nxt.get('meetdayBlockers')}")

    for r in rows:
        if r.get("step", 999) >= step:
            break
        day_type = ((r.get("afterEasyNext") or {}).get("smartDayType"))
        if day_type in ("recovery", "deload"):
            errors.append(f"unexpected {day_type} before meetday at step {r.get('step')}")
            break

if errors:
    print("FAIL: Smart accelerated always-easy QA")
    for error in errors:
        print("-", error)
    print("Full JSON:", path)
    sys.exit(1)

print("PASS: Smart accelerated always-easy QA")
print("meetDay:", meet)
print("firstMeetPlanReadyStep:", next((r.get("step") for r in rows if (r.get("afterEasyNext") or {}).get("meetPlanReady")), None))
print("rowsChecked:", len(rows))
print("Full JSON:", path)
PY
