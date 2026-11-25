import { DEFAULT_WEIGHT_ROUNDING, LEGACY_WEIGHT_ROUNDING, normalizeWeightRounding, resolveStoredWeightRounding, uniformWeightRounding } from './weightRounding';
import { buildMeetAttemptsFromE1RM } from './meetAttemptPlanning';
import { buildSmartIdealTrainingWorkout, generateWorkoutsForTrainingModel, buildSmartMeetPlanReadiness } from './smartTrainingEngine';
import { getSmartIdealRouteWorkout, SMART_IDEAL_LEVELS } from './smartIdealRoute';
import { buildSmartReturnTraining, restoreSmartReturnTraining } from './smartReturnTraining';
import { mergeGeneratedWorkoutStructure } from './workoutStateMerge';
import { calculatePlateBreakdown, plateSetForLoad } from './plateMath';
import { roundTrainingWeight } from './workoutUnits';

const options = { squat: 157.5, bench: 104, deadlift: 184, athleteLevel: 'intermediate',
  history: [], currentCycle: 1, currentIndex: 0, idealRouteEnabled: true, preparationMode: 'off', accessoryMode: 'standard' };
const generate = rounding => generateWorkoutsForTrainingModel('smart', { ...options, weightRounding: rounding });

test('old saves keep the mixed policy; new profiles use 2.5 for both', () => {
  expect(resolveStoredWeightRounding({})).toEqual({ training: 0.5, meet: 2.5 });
  expect(DEFAULT_WEIGHT_ROUNDING).toEqual({ training: 2.5, meet: 2.5 });
  for (const step of [0.5, 2.5]) {
    const data = JSON.parse(JSON.stringify({ weightRounding: uniformWeightRounding(step) }));
    expect(resolveStoredWeightRounding(data)).toEqual({ training: step, meet: step });
  }
  expect(normalizeWeightRounding({ training: 0, meet: 3 })).toEqual(LEGACY_WEIGHT_ROUNDING);
});
test('nearest training rounding follows the selected step without rounding maxima', () => {
  expect(roundTrainingWeight(83.2, 'nearest', 0.5)).toBe(83);
  expect(roundTrainingWeight(83.2, 'nearest', 2.5)).toBe(82.5);
  expect(options.bench).toBe(104);
});
test.each([0.5, 2.5].flatMap(step => ['standard', 'practical', 'beginnerSquat'].map(trainingFocus => [step, trainingFocus])))(
  'all route levels use %s kg in %s, preserve grids and fixed warmups', (step, trainingFocus) => {
  let checked = 0;
  for (const athleteLevel of SMART_IDEAL_LEVELS) {
    for (let number = 1; number <= 28; number++) {
      const routeWorkout = getSmartIdealRouteWorkout({ workoutNumber: number, athleteLevel, trainingFocus });
      if (routeWorkout?.type !== 'training') continue;
      checked += 1;
      const workout = buildSmartIdealTrainingWorkout({ ...options, athleteLevel, routeWorkout, weightRounding: uniformWeightRounding(step) });
      for (const lift of workout.lifts) {
        if (lift.sets[1]?.labelKey === 'backoff') expect(lift.sets.length - 1).toBe((lift.sets[1].reps) - 2);
        else expect((lift.warmups.length + lift.sets.length) % 5).toBe(0);
        for (const set of lift.sets) expect(set.weight / step).toBeCloseTo(Math.round(set.weight / step));
        for (const warmup of lift.warmups) {
          expect(warmup.weight % 10).toBe(0);
          expect(warmup.weight).toBeLessThan(lift.sets[0].weight);
        }
      }
    }
  }
  expect(checked).toBeGreaterThan(40);
});
test('existing profiles generate identical loads without making a choice', () => {
  const before = generate(); const after = generate(LEGACY_WEIGHT_ROUNDING);
  expect(after).toEqual(before);
});
test.each([0.5, 2.5])('meet plans and readiness share the %s kg step and preserve precise e1RM', step => {
  const policy = uniformWeightRounding(step);
  const readiness = buildSmartMeetPlanReadiness({ prs: { Squat: 157.5, Bench: 104, Deadlift: 184 }, weightRounding: policy });
  expect(readiness.byLift.Bench.attempts).toEqual(buildMeetAttemptsFromE1RM(104, step));
  for (const max of [1, 5, 20, 32.5, 104, 184, 400]) {
    const attempts = Object.values(buildMeetAttemptsFromE1RM(max, step));
    expect(attempts.every(w => w > 0 && Number.isInteger(w / step))).toBe(true);
    expect(attempts[1]).toBeGreaterThan(attempts[0]);
    expect(attempts[2]).toBeGreaterThan(attempts[1]);
  }
});
test('manual half-kilogram attempts are preserved in coarse mode', () => {
  const readiness = buildSmartMeetPlanReadiness({ prs: { Bench: 104 }, weightRounding: uniformWeightRounding(2.5),
    meetPlannerAttempts: { Bench: { thirdAttempt: 104 } } });
  expect(readiness.byLift.Bench.attempts.thirdAttempt).toBe(104);
});
test.each([0.5, 2.5])('accessories and lighter workouts follow %s kg; restoring keeps original loads', step => {
  const workout = generate(uniformWeightRounding(step))[0];
  for (const accessory of workout.accessories) for (const w of accessory.weights || []) expect(w / step).toBeCloseTo(Math.round(w / step));
  const lighter = buildSmartReturnTraining(workout);
  expect(lighter.smartReturnTraining).toBe(true);
  for (const lift of lighter.lifts) for (const set of lift.sets) expect(set.weight / step).toBeCloseTo(Math.round(set.weight / step));
  expect(restoreSmartReturnTraining(lighter).lifts.map(l => l.sets.map(s => s.weight)))
    .toEqual(workout.lifts.map(l => l.sets.map(s => s.weight)));
});
test('switching modes preserves a started session, manual edits and completed history', () => {
  const original = generate(LEGACY_WEIGHT_ROUNDING);
  original[0].lifts[0].sets[0].weight = 141;
  original[0].lifts[0].sets[0].adjustedFromOriginal = true;
  original[0].lifts[0].warmups[0].done = true;
  const next = generate(uniformWeightRounding(2.5));
  const merged = mergeGeneratedWorkoutStructure(original, next, [], 1);
  expect(merged[0]).toEqual(original[0]);
  const completed = { ...original[0], completed: true };
  const history = [{ cycle: 1, workoutNumber: 1, workoutSnapshot: completed }];
  expect(mergeGeneratedWorkoutStructure(original, next, history, 1)[0]).toEqual(completed);
});
test('calculator follows coarse mode but still explains a manually entered fine load', () => {
  const coarse = calculatePlateBreakdown(82.5, { availablePlatesKg: plateSetForLoad(82.5, 2.5) });
  expect(coarse.isExact).toBe(true);
  expect(coarse.perSidePlates.every(p => p.weightKg >= 1.25)).toBe(true);
  const manual = calculatePlateBreakdown(83, { availablePlatesKg: plateSetForLoad(83, 2.5) });
  expect(manual.isExact).toBe(true); expect(manual.achievedTotalKg).toBe(83);
});


test.each([0.5, 2.5])('actual generated meet and Dashboard targets use the same %s kg grid', step => {
  const meet = generate(uniformWeightRounding(step)).find(workout => workout.type === 'meet');
  expect(meet).toBeDefined();
  for (const lift of meet.lifts) {
    expect(lift.sets.map(set => set.weight)).toEqual(Object.values(buildMeetAttemptsFromE1RM(
      { Squat: options.squat, Bench: options.bench, Deadlift: options.deadlift }[lift.lift], step)));
    expect(lift.warmups.every(warmup => warmup.weight % 10 === 0)).toBe(true);
  }
});
