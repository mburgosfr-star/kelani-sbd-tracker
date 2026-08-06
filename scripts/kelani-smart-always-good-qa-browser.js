const CHROME = '/snap/bin/chromium';
const PORT = 9223;
const APP_URL = 'http://127.0.0.1:3000';

const { spawn } = require('child_process');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getJson(path) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`);
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json();
}

async function openPage() {
  await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(APP_URL)}`, {
    method: 'PUT',
  }).catch(async () => {
    await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(APP_URL)}`);
  });

  const pages = await getJson('/json');
  const page = pages.find(p => p.type === 'page' && p.url.includes('127.0.0.1:3000')) || pages[0];
  if (!page?.webSocketDebuggerUrl) throw new Error('No debuggable page found');
  return page.webSocketDebuggerUrl;
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let id = 0;
  const pending = new Map();

  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  };

  function send(method, params = {}) {
    const msgId = ++id;
    ws.send(JSON.stringify({ id: msgId, method, params }));
    return new Promise((resolve, reject) => {
      pending.set(msgId, { resolve, reject });
    });
  }

  return { ws, send };
}

async function waitFor(send, expression, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result?.result?.value) return true;
    await sleep(250);
  }
  throw new Error(`Timeout waiting for: ${expression}`);
}

(async () => {
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=/tmp/kelani-always-good-profile-${Date.now()}`,
    APP_URL,
  ], { stdio: 'ignore' });

  try {
    await sleep(1500);

    const wsUrl = await openPage();
    const { ws, send } = await connect(wsUrl);

    await send('Runtime.enable');
    await waitFor(send, `typeof window.__kelaniSmartResetToW1 === 'function'`);
    await send('Runtime.evaluate', {
      expression: `window.__kelaniSmartResetToW1()`,
      returnByValue: true,
      awaitPromise: true,
    });

    await sleep(2500);
    await waitFor(send, `typeof window.__kelaniSmartPreviewNextDay === 'function'`);

    const out = await send('Runtime.evaluate', {
      expression: `(() => {
        const key = 'kel-powerlifting-user-data-v1';
        const read = () => JSON.parse(localStorage.getItem(key) || '{}');
        const write = data => localStorage.setItem(key, JSON.stringify(data));

        const e1rm = (weight, reps) => {
          const w = Number(weight) || 0;
          const r = Number(reps) || 1;
          return Math.round((w * (1 + r / 30)) * 100) / 100;
        };

        const getLiftBlocks = workout => {
          if (Array.isArray(workout?.lifts) && workout.lifts.length) return workout.lifts;
          if (workout?.lift) return [{ lift: workout.lift, sets: workout.sets || [], warmups: workout.warmups || [] }];
          return [];
        };

        const setDone = workout => ({
          ...workout,
          completed: true,
          workoutEffort: 'good',
          completedAt: new Date().toISOString(),
          prepItems: (workout.prepItems || []).map(item => ({ ...item, done: true })),
          warmups: (workout.warmups || []).map(item => ({ ...item, done: true })),
          sets: (workout.sets || []).map(set => ({ ...set, done: true, failed: false, skipped: false, setEffort: 'good' })),
          lifts: (workout.lifts || []).map(lift => ({
            ...lift,
            prepItems: (lift.prepItems || []).map(item => ({ ...item, done: true })),
            warmups: (lift.warmups || []).map(item => ({ ...item, done: true })),
            sets: (lift.sets || []).map(set => ({ ...set, done: true, failed: false, skipped: false, setEffort: 'good' })),
          })),
        });

        const summarizeWorkout = workout => ({
          number: workout?.number,
          type: workout?.type,
          smartDayType: workout?.smartDayType,
          reason: workout?.smartDecisionSummary?.reason || workout?.reason || null,
          lifts: getLiftBlocks(workout).map(lift => ({
            lift: lift.lift,
            top: (lift.sets || [])
              .map(set => ({ reps: set.reps, weight: set.weight, labelKey: set.labelKey }))
              .sort((a, b) => (Number(b.weight) || 0) - (Number(a.weight) || 0))[0] || null,
            sets: (lift.sets || []).map(set => ({
              labelKey: set.labelKey,
              reps: set.reps,
              weight: set.weight,
              pct: set.pct,
            })),
          })),
        });

        const appendEasyHistory = (data, workout, index) => {
          const cycle = Number(data.currentCycle || data.inProgress?.currentCycle) || 1;
          const number = Number(workout?.number) || index + 1;
          const date = new Date().toLocaleDateString('nl-NL');
          const liftBlocks = getLiftBlocks(workout);

          const baseSnapshot = {
            number,
            type: workout?.type,
            smartDayType: workout?.smartDayType,
            workoutEffort: 'good',
            lifts: liftBlocks.map(lift => ({
              lift: lift.lift,
              sets: (lift.sets || []).map(set => ({
                ...set,
                done: true,
                failed: false,
                skipped: false,
                setEffort: 'good',
              })),
            })),
          };

          if (workout?.type === 'rest' || workout?.smartDayType === 'recovery') {
            return [{
              workoutNumber: number,
              cycle,
              restDay: true,
              smartDayType: workout?.smartDayType || 'recovery',
              workoutEffort: 'good',
              failedOrSkippedSetCount: 0,
              failedOrSkippedSetCountsByLift: { Squat: 0, Bench: 0, Deadlift: 0 },
              date,
              workoutSnapshot: baseSnapshot,
            }];
          }

          return liftBlocks.map(lift => {
            const best = (lift.sets || [])
              .map(set => ({
                weight: Number(set.weight) || 0,
                reps: Number(set.reps) || 1,
              }))
              .sort((a, b) => e1rm(b.weight, b.reps) - e1rm(a.weight, a.reps))[0] || { weight: 0, reps: 1 };

            return {
              workoutNumber: number,
              cycle,
              lift: lift.lift,
              topWeight: best.weight,
              topReps: best.reps,
              e1rm: e1rm(best.weight, best.reps),
              date,
              smartDayType: workout?.smartDayType,
              workoutEffort: 'good',
              failedOrSkippedSetCount: 0,
              failedOrSkippedSetCountsByLift: { Squat: 0, Bench: 0, Deadlift: 0 },
              workoutSnapshot: baseSnapshot,
            };
          });
        };

        const rows = [];
        let meetDay = null;

        for (let step = 1; step <= 80; step += 1) {
          const data = read();
          const index = Number(data.inProgress?.currentIndex ?? data.inProgress?.selectedIndex ?? 0);
          const workouts = data.inProgress?.workouts || [];
          const current = workouts[index];

          if (!current) {
            rows.push({ step, error: 'no-current-workout', index, workoutCount: workouts.length });
            break;
          }

          const preview = window.__kelaniSmartPreviewNextDay({
            effort: 'good',
            failedByLift: {},
          });

          const next = preview?.next || null;
          const readiness = next?.readiness || {};
          const currentSummary = summarizeWorkout(current);

          rows.push({
            step,
            current: currentSummary,
            afterEasyNext: next ? {
              number: next.number,
              type: next.type,
              smartDayType: next.smartDayType,
              reason: next.reason,
              lifts: (next.lifts || []).map(l => l.lift),
              nextLiftDetails: (next.lifts || []).map(lift => {
                const top = (lift.sets || [])
                  .map(set => ({ labelKey: set.labelKey, reps: set.reps, weight: set.weight, pct: set.pct }))
                  .sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0))[0] || null;

                return {
                  lift: lift.lift,
                  top,
                  autoregulation: next.autoregulationByLift?.[lift.lift] || null,
                };
              }),
              trainingFlags: next.trainingSelection?.reasonFlags || [],
              meetPlanReady: readiness.meetPlanReady,
              activeBlockCompletedCount: readiness.activeBlockCompletedCount,
              meetdayBlockers: readiness.meetdayBlockers || [],
              weakestLift: readiness.meetPlanWeakestLift || null,
              weakestBestE1RM: readiness.meetPlanWeakestBestE1RM || 0,
              weakestTarget: readiness.meetPlanWeakestTarget || 0,
              fatigue: readiness.recentFatigueScore || 0,
              recentEasyCount: readiness.recentEasyCount || 0,
              failed: readiness.recentFailedOrSkippedSetCount || 0,
            } : null,
          });

          if (current.smartDayType === 'meet' || current.type === 'meet') {
            meetDay = { reachedAsCurrentOnStep: step, workoutNumber: current.number };
            break;
          }

          if (next?.smartDayType === 'meet' || next?.type === 'meet') {
            meetDay = { availableAfterCompletingStep: step, meetWorkoutNumber: next.number };
            break;
          }

          const historyEntries = appendEasyHistory(data, current, index);
          data.history = [
            ...(data.history || []).filter(entry =>
              !(Number(entry.cycle) === Number(data.currentCycle) && Number(entry.workoutNumber) === Number(current.number))
            ),
            ...historyEntries,
          ];

          data.inProgress.workouts[index] = setDone(current);

          const nextIndex = index + 1;
          if (next) {
            const nextWorkoutForState = {
              ...(data.inProgress.workouts[nextIndex] || {}),
              ...next,
              smartVisible: true,
              smartSelectable: true,
              completed: false,
            };

            if (nextIndex < data.inProgress.workouts.length) {
              data.inProgress.workouts[nextIndex] = nextWorkoutForState;
            } else {
              data.inProgress.workouts.push(nextWorkoutForState);
            }
          }

          data.inProgress.currentIndex = nextIndex;
          data.inProgress.selectedIndex = nextIndex;

          write(data);
        }

        const finalData = read();
        const qa = window.__kelaniSmartQA({ mode: 'v1' });

        return {
          scenario: 'cycle-start-always-good-no-fails',
          qaPass: qa?.pass,
          meetDay,
          finalState: {
            currentCycle: finalData.currentCycle,
            currentIndex: finalData.inProgress?.currentIndex,
            selectedIndex: finalData.inProgress?.selectedIndex,
            historyCount: (finalData.history || []).length,
            workoutCount: (finalData.inProgress?.workouts || []).length,
          },
          rows,
        };
      })()`,
      returnByValue: true,
      awaitPromise: true,
    });

    console.log(JSON.stringify(out.result.value, null, 2));
    ws.close();
  } finally {
    chrome.kill('SIGTERM');
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
