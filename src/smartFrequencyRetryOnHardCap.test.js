import {
  generateWorkoutsForTrainingModel,
  generateWorkoutsForTrainingModelUnconstrained,
} from './smartTrainingEngine';
import beginnerHistory from './beginnerRetryHistory.json';
import beginnerExhaustionHistory from './beginnerFrequencyExhaustionHistory.json';

const beginnerArgs = {
  programProfile: 'kelaniSbd',
  squat: 42.5,
  bench: 32.5,
  deadlift: 60,
  oneRMs: { Squat: 42.5, Bench: 32.5, Deadlift: 60 },
  accessoryMode: 'standard',
  preparationMode: 'basicFirst',
  history: beginnerHistory,
  currentIndex: 17,
  currentCycle: 1,
  meetPlannerAttempts: {},
};

test('beginner tier produces a fully Smart-generated workout instead of stale Classic-template content', () => {
  const workouts = generateWorkoutsForTrainingModel('smart', {
    ...beginnerArgs,
    athleteLevel: 'beginner',
  });
  const workout = workouts[17];

  expect(workout.lifts.length).toBeGreaterThan(0);

  workout.lifts.forEach(liftBlock => {
    liftBlock.sets.forEach(set => {
      expect(set.smartGeneratedPrescription).toBe(true);
    });
  });

  // Final selection must rebuild one shared preparation section after any
  // supplemental lift replacement made by the retry/frequency policy.
  expect(workout.prepItems).toHaveLength(4);
  workout.lifts.forEach(liftBlock => {
    expect(liftBlock.prepItems).toEqual([]);
  });

  expect(workout.accessories.length).toBeGreaterThan(0);
});

test('intermediate tier is unaffected by the retry mechanism (no regression)', () => {
  const workouts = generateWorkoutsForTrainingModel('smart', {
    ...beginnerArgs,
    athleteLevel: 'intermediate',
  });
  const workout = workouts[17];

  workout.lifts.forEach(liftBlock => {
    liftBlock.sets.forEach(set => {
      expect(set.smartGeneratedPrescription).toBe(true);
    });
  });
});

test('the retry loop swaps away from a hard-capped primary lift instead of accepting it', () => {
  const unconstrained = generateWorkoutsForTrainingModelUnconstrained('smart', {
    ...beginnerArgs,
    athleteLevel: 'beginner',
  });
  const workout = unconstrained[17];

  // Squat is the lift that hits its beginner heavy-exposure cap first in
  // this history - the retry loop must never hand it out as a heavy
  // ('primary') lift here. It's still legitimately due as a LIGHT lift
  // though (its heavy cap is hit, but total/light capacity remains), so the
  // forced-secondary fallback correctly surfaces it in a 'secondary' role
  // instead of excluding it outright - that's a genuine improvement, not a
  // regression, so this only needs to rule out the heavy/primary case.
  const squatBlock = workout.lifts.find(liftBlock => liftBlock.lift === 'Squat');
  if (squatBlock) {
    expect(squatBlock.role).not.toBe('primary');
  }
  expect(workout.smartFrequencyValidated).toBe(true);
});

test('a genuinely frequency-exhausted beginner (every lift at/over its weekly cap) gets rest instead of another over-cap lift', () => {
  // Regression boundary: in the 6 workout slots before C1W19
  // (W13-W18), Squat=2/2, Bench=3/3, Deadlift=2/1 - every lift is already
  // at or over its beginner maxTotal cap, so there is no valid lift left to
  // prescribe this week and the day must become rest.
  const workouts = generateWorkoutsForTrainingModel('smart', {
    programProfile: 'kelaniSbd',
    squat: 42.5,
    bench: 32.5,
    deadlift: 60,
    oneRMs: { Squat: 42.5, Bench: 32.5, Deadlift: 60 },
    accessoryMode: 'off',
    preparationMode: 'off',
    history: beginnerExhaustionHistory,
    currentIndex: 18,
    currentCycle: 1,
    meetPlannerAttempts: {},
    athleteLevel: 'beginner',
  });
  const workout = workouts[18];

  expect(workout.type).toBe('rest');
  expect(workout.smartDayType).toBe('recovery');
  expect(workout.smartDecisionSummary?.reason).toBe('frequency-recovery');
});

test('after resting off a full exhaustion, the next day correctly offers the lift with remaining light capacity instead of re-blocking on a heavy-capped one', () => {
  // Continuation of the frequency-exhaustion scenario above: C1W19 is
  // rest day. For C1W20, the rolling window (W14-W19) has Squat at 2/2
  // (heavy-capped, no room left at all) and Deadlift at 2/1 (over cap), but
  // Bench is only at 2/3 total with 1 heavy already used - genuine light-only
  // capacity remains. Without the forced-secondary retry, the loop could
  // only ever try lifts as heavy/primary, so Bench would re-trip its own
  // heavy cap and get excluded too, leaving Squat (fully capped) as the
  // last-resort answer - exactly the "gets Squat when she should get rest
  // or Bench" bug this fixes.
  const restW19 = {
    workoutNumber: 19,
    cycle: 1,
    restDay: true,
    smartDayType: 'recovery',
    workoutEffort: 'easy',
    failedOrSkippedSetCount: 0,
    workoutSnapshot: { number: 19, type: 'rest', lift: null, smartDayType: 'recovery', completed: true, lifts: [], sets: [] },
  };

  const workouts = generateWorkoutsForTrainingModel('smart', {
    programProfile: 'kelaniSbd',
    squat: 42.5,
    bench: 32.5,
    deadlift: 60,
    oneRMs: { Squat: 42.5, Bench: 32.5, Deadlift: 60 },
    accessoryMode: 'off',
    preparationMode: 'off',
    history: [...beginnerExhaustionHistory, restW19],
    currentIndex: 19,
    currentCycle: 1,
    meetPlannerAttempts: {},
    athleteLevel: 'beginner',
  });
  const workout = workouts[19];

  expect(workout.type).toBe('training');
  expect(workout.lifts.map(liftBlock => liftBlock.lift)).toEqual(['Bench']);
  expect(workout.lifts[0].role).toBe('secondary');
  expect(workout.smartFrequencyValidated).toBe(true);
});
