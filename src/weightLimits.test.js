import { createWorkoutWeightLimiter, applyWorkoutWeightLimits, getLiftWeightLimit, normalizeWeightLimits } from './weightLimits';
import { changeOpenWorkoutSetWeight, restoreOpenWorkoutSetWeight } from './workoutSetActions';
import { generateWorkoutsForTrainingModel, projectSmartPlanningHorizon } from './smartTrainingEngine';
import { formatSetPercentDisplay } from './workoutHistoryStats';

const policy = { training: 2.5, meet: 2.5 };
const training = () => ({ type: 'training', lift: 'Squat', warmups: [
  { weight: 20, reps: 5 }, { weight: 100, reps: 5 }, { weight: 170, reps: 3 },
], sets: [{ weight: 180, originalWeight: 180, pct: 90, reps: 1, labelKey: 'topSet' },
  { weight: 150, originalWeight: 150, pct: 75, reps: 5, labelKey: 'backoff' }] });

test('the cap regenerates warmups from the effective top set while keeping the lighter work set', () => {
  const original = training();
  const limited = applyWorkoutWeightLimits(original, { Squat: 169 }, null, policy);
  expect(limited.sets[0]).toMatchObject({ weight: 167.5, reps: 3, originalWeight: 167.5 });
  expect(limited.sets[1]).toMatchObject(original.sets[1]);
  expect(limited.warmups.map(set => set.reps)).toEqual([5, 5, 3, 3]);
  expect(limited.warmups.map(set => set.weight)).toEqual([20, 70, 120, 150]);
  expect(applyWorkoutWeightLimits(limited, { Squat: 169 }, null, policy)).toBe(limited);
});

test('updates the pending warmup before a capped double and keeps every recorded warmup', () => {
  const warmups = [[20, 5], [70, 5], [120, 3], [150, 1]].map(([weight, reps], index) => ({
    weight, reps, done: index < 3,
  }));
  const workout = { type: 'training', lift: 'Deadlift', warmups, sets: [
    { labelKey: 'topSingle', weight: 175, reps: 1, pct: 0.95 },
    ...Array.from({ length: 5 }, () => ({ labelKey: 'backoff', weight: 161, reps: 2, pct: 0.875 })),
  ], smartPrescription: { completeGrid: true } };
  const limited = applyWorkoutWeightLimits(workout, { Deadlift: 170 }, null, policy);
  expect(limited.sets[0]).toMatchObject({ weight: 170, reps: 2 });
  expect(limited.warmups.slice(0, 3)).toEqual(warmups.slice(0, 3));
  expect(limited.warmups.at(-1)).toMatchObject({ weight: 150, reps: 3, done: false });
  expect(limited.sets.slice(1)).toMatchObject(workout.sets.slice(1));

  const saved = JSON.parse(JSON.stringify(limited));
  saved.warmups[3].reps = 1;
  expect(applyWorkoutWeightLimits(saved, { Deadlift: 170 }, null, policy).warmups[3].reps).toBe(3);
});

test('a 30 kg capped top set takes one empty-bar warmup and three backoffs in Smart Training', () => {
  const workout = { type: 'training', lift: 'Bench',
    warmups: [{ weight: 20, reps: 5 }, { weight: 30, reps: 1 }],
    sets: [{ labelKey: 'topSingle', weight: 35, reps: 1, pct: 1 },
      ...Array.from({ length: 7 }, () => ({ labelKey: 'backoff', weight: 30, reps: 2, pct: 0.85 }))],
    smartPrescription: { completeGrid: true, gridItemCount: 10 },
  };
  const limited = applyWorkoutWeightLimits(workout, { Bench: 30 }, null, policy);
  expect(limited.warmups.map(set => [set.weight, set.reps])).toEqual([[20, 5]]);
  expect(limited.sets[0]).toMatchObject({ weight: 30, reps: 6 });
  expect(limited.sets.slice(1)).toHaveLength(3);
  expect(limited.smartPrescription.gridItemCount).toBe(5);
});

test('no rep ceiling; every over-limit work set gets its own conversion', () => {
  const limited = applyWorkoutWeightLimits(training(), { Squat: 70 }, null, policy);
  expect(limited.sets.map(set => set.weight)).toEqual([70, 70]);
  expect(limited.sets.every(set => set.reps > 10)).toBe(true);
  expect(limited.sets[0].reps).not.toBe(limited.sets[1].reps);
});

test('completed records and meet days are unchanged, including warmups and attempts', () => {
  for (const workout of [{ ...training(), completed: true }, { ...training(), type: 'meet' }]) {
    expect(applyWorkoutWeightLimits(workout, { Squat: 70 }, null, policy)).toBe(workout);
  }
  const workout = training(); workout.sets[0].done = true; workout.warmups[2].done = true;
  const limited = applyWorkoutWeightLimits(workout, { Squat: 70 }, null, policy);
  expect(limited.sets[0]).toBe(workout.sets[0]);
  expect(limited.warmups[2]).toBe(workout.warmups[2]);
  expect(limited.sets[1].weight).toBe(70);
});

test('bench uses the lower barbell and body-weight-adjusted capacity; missing capacity is fail closed', () => {
  expect(getLiftWeightLimit('Bench', { Bench: 160, benchCapacity: 210 }, 80)).toBe(130);
  expect(getLiftWeightLimit('Bench', { Bench: 160, benchCapacity: 210 }, 90)).toBe(120);
  expect(getLiftWeightLimit('Bench', { benchCapacity: 210 }, null)).toBe(0);
  const workout = { ...training(), lift: 'Bench' };
  const blocked = applyWorkoutWeightLimits(workout, { benchCapacity: 210 }, 200, policy);
  expect(blocked.sets.every(set => set.weightLimitUnavailable && set.weight === 0)).toBe(true);
  const restored = applyWorkoutWeightLimits(blocked, { benchCapacity: 210 }, 80, policy);
  expect(restored.sets.every(set => set.weight <= 130 && set.weight > 0 && !set.weightLimitUnavailable)).toBe(true);
  expect(restored.warmups[0].weight).toBe(20);
});

test('manual changes use half kilos within the physical limit and restore cannot bypass it', () => {
  const set = applyWorkoutWeightLimits(training(), { Squat: 169.2 }, null, policy).sets[0];
  expect(changeOpenWorkoutSetWeight(set, Infinity)).toBe(set);
  const edited = changeOpenWorkoutSetWeight(set, 185);
  expect(edited.weight).toBe(169);
  expect(restoreOpenWorkoutSetWeight(edited).weight).toBe(167.5);
  expect(changeOpenWorkoutSetWeight(set, 160.5).weight).toBe(160.5);
});

test('generated workouts and persistence roundtrip preserve the limit without changing maxima', () => {
  const options = { squat: 200, bench: 150, deadlift: 230, athleteLevel: 'intermediate', trainingFocus: 'standard',
    idealRouteEnabled: true, currentCycle: 1, currentIndex: 0, history: [], skipMeetProjectionSimulation: true,
    weightLimits: { Squat: 140, Bench: 100, Deadlift: 160 }, weightRounding: policy };
  const restored = JSON.parse(JSON.stringify(options));
  expect(normalizeWeightLimits(restored.weightLimits).Squat).toBe(140);
  const workouts = generateWorkoutsForTrainingModel('smart', restored);
  let checked = 0;
  for (const workout of workouts.filter(workout => workout.type === 'training')) {
    for (const lift of workout.lifts || [workout]) {
      checked++;
      expect(lift.sets.every(set => set.weight <= options.weightLimits[lift.lift])).toBe(true);
      if (lift.sets[1]?.labelKey === 'backoff') expect(lift.sets.length - 1).toBe((lift.sets[1].weightLimitPrescription?.reps ?? lift.sets[1].reps) - 2);
        else expect((lift.sets.length + lift.warmups.length) % 5).toBe(0);
    }
  }
  expect(checked).toBeGreaterThan(0);
  expect(options.squat).toBe(200);
});

test('future limited loads keep the same established strength basis instead of hypothetical future records', () => {
  const forecast = projectSmartPlanningHorizon({ squat: 160, bench: 100, deadlift: 184,
    oneRMs: { Squat: 160, Bench: 100, Deadlift: 180 }, athleteLevel: 'intermediate',
    trainingFocus: 'standard', idealRouteEnabled: true, currentCycle: 1, currentIndex: 0,
    history: [], weightRounding: { training: 0.5, meet: 2.5 }, weightLimits: { Deadlift: 170 } }, 28);
  const limitedSets = forecast.flatMap(({ workout }) => workout.type !== 'training' ? [] :
    (workout.lifts || []).filter(block => block.lift === 'Deadlift').flatMap(block => block.sets)
      .filter(set => set.weight === 170));
  expect(limitedSets.length).toBeGreaterThan(1);
  expect(new Set(limitedSets.map(set => formatSetPercentDisplay(set.pct)))).toEqual(new Set(['92.5']));
});

test('editing one workout reuses other prescriptions and keeps the new set state', () => {
  const limit = createWorkoutWeightLimiter({ Squat: 169 }, [], policy);
  const original = [training(), training()];
  const first = limit(original);
  const edited = { ...first[0], sets: first[0].sets.map(set => ({ ...set, done: true })) };
  const next = limit([edited, original[1]]);
  expect(next[0].sets.every(set => set.done)).toBe(true);
  expect(next[1]).toBe(first[1]);
  expect(createWorkoutWeightLimiter({ Squat: 100 }, [], policy)(original)[1].sets[0].weight).toBe(100);
});
