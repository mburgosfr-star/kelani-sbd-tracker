import { applyWorkoutWeightLimits, getLiftWeightLimit, normalizeWeightLimits } from './weightLimits';
import { changeOpenWorkoutSetWeight, restoreOpenWorkoutSetWeight } from './workoutSetActions';
import { generateWorkoutsForTrainingModel, projectSmartPlanningHorizon } from './smartTrainingEngine';
import { formatSetPercentDisplay } from './workoutHistoryStats';

const policy = { training: 2.5, meet: 2.5 };
const training = () => ({ type: 'training', lift: 'Squat', warmups: [
  { weight: 20, reps: 5 }, { weight: 100, reps: 5 }, { weight: 170, reps: 3 },
], sets: [{ weight: 180, originalWeight: 180, pct: 90, reps: 1, labelKey: 'topSet' },
  { weight: 150, originalWeight: 150, pct: 75, reps: 5, labelKey: 'backoff' }] });

test('only over-limit sets change; warmup repetitions and raster size are preserved', () => {
  const original = training();
  const limited = applyWorkoutWeightLimits(original, { Squat: 169 }, null, policy);
  expect(limited.sets[0]).toMatchObject({ weight: 167.5, reps: 3, originalWeight: 167.5 });
  expect(limited.sets[1]).toMatchObject(original.sets[1]);
  expect(limited.warmups.map(set => set.reps)).toEqual([5, 5, 3]);
  expect(limited.warmups.map(set => set.weight)).toEqual([20, 100, 160]);
  expect(limited.sets.length + limited.warmups.length).toBe(5);
  expect(applyWorkoutWeightLimits(limited, { Squat: 169 }, null, policy)).toBe(limited);
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
      expect((lift.sets.length + lift.warmups.length) % 5).toBe(0);
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
