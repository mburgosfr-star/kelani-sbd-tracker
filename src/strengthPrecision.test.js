import { normalizeStrengthPrecision, normalizeStrengthHistory } from './strengthPrecision';
import { calculateStrengthRatioMaxes, getAthleteLevel, epley, mergeStrengthRatioMaxes } from './workoutHistoryStats';
import { displayWeightToKg, kgToDisplayWeight, formatWeightFromKg } from './workoutUnits';

function fixture() {
  const prs = { Squat: 157.5, Bench: 105, Deadlift: 185 };
  const oneRMs = { Squat: 155, Bench: 102.5, Deadlift: 180 };
  const history = Object.keys(prs).map(lift => ({
    cycle: 0, workoutNumber: 0, seedMax: true, lift, topWeight: oneRMs[lift], topReps: 1, e1rm: oneRMs[lift],
  }));
  for (const [lift, weight, workoutNumber] of [['Squat',147.5,1],['Bench',97.5,2],['Deadlift',172.5,3]]) {
    const summary = { type: 'multiTraining', lift, e1RMToday: prs[lift], previousBestE1RM: oneRMs[lift], bestE1RM: prs[lift],
      results: [{ lift, oneRMToday: weight, previousBest1RM: oneRMs[lift], e1RMToday: prs[lift], previousBestE1RM: oneRMs[lift], bestE1RM: prs[lift] }] };
    history.push({ cycle: 1, workoutNumber, lift, topWeight: weight, topReps: 2, e1rm: prs[lift],
      workoutSnapshot: { number: workoutNumber, completed: true, type: 'training',
        lifts: [{ lift, sets: [{ weight, originalWeight: weight, reps: 2, done: true }] }], completedSummary: summary } });
  }
  const oldRecords = { strengthMax: 5.47, eStrengthMax: 5.59 };
  return { prs, oneRMs, oneRMStateVersion: 2, history, bodyWeights: [{ cycle: 1, workoutNumber: 0, bodyWeight: 80 }],
    strengthRatioMaxes: oldRecords,
    inProgress: { currentCycle: 1, currentIndex: 3, selectedIndex: 3, workouts: [
      ...history.filter(h => h.workoutSnapshot).map(h => h.workoutSnapshot),
      { number: 4, type: 'meet', lifts: [{ lift: 'Bench', warmups: [{ weight: 60, done: true }],
        sets: [{ weight: 92.5, originalWeight: 92.5, reps: 1, done: false }] }] },
    ] } };
}

test('reconstructs old rounded e1RMs without changing actual maxes, sets or started work', () => {
  const source = fixture();
  const original = JSON.stringify(source);
  const corrected = normalizeStrengthPrecision(source);
  expect(corrected.prs).toEqual({ Squat: epley(147.5,2), Bench: 104, Deadlift: 184 });
  expect(corrected.oneRMs).toEqual(source.oneRMs);
  expect(corrected.history[4].e1rm).toBe(104);
  expect(corrected.history[4].workoutSnapshot.completedSummary.results[0].bestE1RM).toBe(104);
  expect(corrected.history[4].workoutSnapshot.lifts).toEqual(source.history[4].workoutSnapshot.lifts);
  expect(corrected.inProgress.workouts.at(-1)).toEqual(source.inProgress.workouts.at(-1));
  expect(JSON.stringify(source)).toBe(original);
  expect(normalizeStrengthPrecision(JSON.parse(JSON.stringify(corrected)))).toEqual(corrected);
});

test('a precision correction preserves the attained level without inflating the corrected ratio', () => {
  const source = fixture();
  source.strengthRatioMaxes = { eStrengthMax: 6, athleteLevelThresholdVersion: 3, athleteLevelFloor: 'beginner' };
  source.bodyWeights = [{ cycle: 1, workoutNumber: 0, bodyWeight: 74.6 }];
  const corrected = normalizeStrengthPrecision(source);
  expect(corrected.strengthRatioMaxes.eStrengthMax).toBeLessThan(6);
  expect(getAthleteLevel({ strengthRatioMaxes: corrected.strengthRatioMaxes })).toBe('advanced');
});

test('explicit manual estimates and values without reconstructible set evidence remain intact', () => {
  const source = fixture();
  source.history.push({ cycle: 1, workoutNumber: 4, lift: 'Bench', manualMax: true, topWeight: 102.5, e1rm: 108.125 });
  source.prs.Bench = 108.125;
  expect(normalizeStrengthPrecision(source).prs.Bench).toBe(108.125);
  expect(normalizeStrengthPrecision({ prs: { Squat: 123.456, Bench: 78.123, Deadlift: 156.789 } }).prs)
    .toEqual({ Squat: 123.456, Bench: 78.123, Deadlift: 156.789 });
});

test('failed sets cannot supply a restored estimate and shared snapshots retain all lifts', () => {
  const shared = { completed: true, type: 'training', lifts: [
    { lift: 'Bench', sets: [{ weight: 100, reps: 2, done: true, failed: true }] },
    { lift: 'Deadlift', sets: [{ weight: 172.5, reps: 2, done: true }] },
  ] };
  const normalized = normalizeStrengthHistory([
    { cycle: 1, workoutNumber: 1, lift: 'Bench', e1rm: 107.5, workoutSnapshot: shared },
    { cycle: 1, workoutNumber: 1, lift: 'Deadlift', e1rm: 185, workoutSnapshot: shared },
  ]);
  expect(normalized.map(h => h.e1rm)).toEqual([0,184]);
  expect(normalized[0].workoutSnapshot.lifts).toEqual(shared.lifts);
});

test('ratios, records and unit conversions preserve precision instead of barbell or decimal steps', () => {
  const ratios = calculateStrengthRatioMaxes({ prs: { Squat: 157.33333333333334, Bench: 104, Deadlift: 184 },
    oneRMs: { Squat: 155, Bench: 102.5, Deadlift: 180 }, bodyWeights: [{ bodyWeight: 85.7 }] });
  expect(ratios.eStrengthMax).toBe((157.33333333333334+104+184)/85.7);
  expect(mergeStrengthRatioMaxes(ratios).eStrengthMax).toBe(ratios.eStrengthMax);
  const converted = displayWeightToKg(200, 'lb');
  expect(converted).not.toBe(Number(converted.toFixed(1)));
  expect(kgToDisplayWeight(converted,'lb')).toBeCloseTo(200,12);
  expect(formatWeightFromKg(104,'kg',{recorded:true})).toBe('104 kg');
});
