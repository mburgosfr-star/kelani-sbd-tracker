#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== Kelani Smart open-ended append QA =="
echo "Rule: Smart must append workout 29+ when readiness is not complete by old 28-workout boundary."
echo "No APK, no phone install, no tag, no release."
echo

npm run build

(npx serve -s build -l 4173 >/tmp/kelani-smart-open-ended-serve.log 2>&1 & echo $! >/tmp/kelani-smart-open-ended-serve.pid)
sleep 2

node scripts/kelani-smart-open-ended-append-qa-browser.js > /tmp/kelani-smart-open-ended-append-qa.json

kill "$(cat /tmp/kelani-smart-open-ended-serve.pid)" 2>/dev/null || true

python3 - <<'PY'
import json
from pathlib import Path
import sys

path = Path("/tmp/kelani-smart-open-ended-append-qa.json")
data = json.loads(path.read_text())
errors = []

if data.get("workoutCount", 0) < 29:
    errors.append(f"workoutCount stayed below 29: {data.get('workoutCount')}")

w29 = data.get("workout29")
if not w29:
    errors.append("workout29 missing")
else:
    if Number := False:
        pass
    if int(w29.get("number") or 0) < 29:
        errors.append(f"workout29 number invalid: {w29.get('number')}")
    if w29.get("smartVisible") is not True:
        errors.append("workout29 smartVisible is not true")
    if w29.get("smartSelectable") is not True:
        errors.append("workout29 smartSelectable is not true")
    if w29.get("completed") is True:
        errors.append("workout29 is already completed")

if errors:
    print("FAIL: Smart open-ended append QA")
    for error in errors:
        print("-", error)
    print("Result:", data)
    sys.exit(1)

print("PASS: Smart open-ended append QA")
print("Result:", data)
PY
