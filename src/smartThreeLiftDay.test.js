import intermediateHistory from './intermediateThreeLiftHistory.json';
import {
  generateWorkoutsForTrainingModel,
  buildGeneratedSmartTrainingWorkout,
  constrainExplicitLightLiftDose,
} from './smartTrainingEngine';

const trainingMaxes = { Squat: 145, Bench: 97.5, Deadlift: 180 };

const baseArgs = {
  programProfile: 'kelaniSbdUltra',
  squat: trainingMaxes.Squat,
  bench: trainingMaxes.Bench,
  deadlift: trainingMaxes.Deadlift,
  accessoryMode: 'off',
  preparationMode: 'off',
  cooldownMode: 'off',
  currentCycle: 3,
  meetPlannerAttempts: {},
  athleteLevel: 'intermediate',
};

// Mirrors the C3W31 rest-day completion for this regression boundary;
// history alone doesn't include it yet because it is the current
// proposal), so it's added here to simulate "the day after resting".
const restCompletedEntry = {
  workoutNumber: 31,
  cycle: 3,
  restDay: true,
  smartDayType: 'recovery',
  workoutEffort: 'easy',
  failedOrSkippedSetCount: 0,
  workoutSnapshot: {
    number: 31,
    type: 'rest',
    lift: null,
    smartDayType: 'recovery',
    completed: true,
    lifts: [],
    sets: [],
  },
};

const historyAfterRest = [...intermediateHistory, restCompletedEntry];

test('C3W36 safety boundary turns an overloaded light Bench block into a genuinely light dose', () => {
  // Real C3W36 failure: the explicitly light, secondary Bench prescription
  // reached 6x6x75% after grid completion. The grid itself was correct;
  // the missing invariant was a final cap across sets, reps and real load.
  const unsafeSets = Array.from({ length: 6 }, () => ({
    lift: 'Bench',
    labelKey: 'workSets',
    reps: 6,
    pct: 0.75,
    precisePct: 0.725,
    weight: 75,
    originalPct: 0.75,
    originalWeight: 75,
  }));

  const safeSets = constrainExplicitLightLiftDose({
    sets: unsafeSets,
    trainingMax: 101.33333333333333,
  });

  expect(safeSets).toHaveLength(6);
  expect(safeSets.reduce((total, set) => total + set.reps, 0)).toBe(24);
  safeSets.forEach(set => {
    expect(set).toMatchObject({
      reps: 4,
      pct: 0.60,
      precisePct: 0.60,
      weight: 60,
      originalPct: 0.60,
      originalWeight: 60,
    });
  });
});

test("C3W32 scenario (all three lifts under target, clean post-rest readiness) becomes a genuine 3-lift day", () => {
  const workouts = generateWorkoutsForTrainingModel('smart', {
    ...baseArgs,
    history: historyAfterRest,
    currentIndex: 31,
  });
  const w32 = workouts.find(w => w.number === 32);

  expect(w32.lifts.map(l => l.lift)).toEqual(['Deadlift', 'Bench', 'Squat']);
  expect(w32.lifts.map(l => l.role)).toEqual(['primary', 'secondary', 'tertiary']);
});

test('elevated fatigue blocks the tertiary lift even when the deficit is real', () => {
  const goodReadiness = { recentFatigueScore: 0, recentFailedOrSkippedSetCount: 0, lastWorkoutLifts: [] };
  const tiredReadiness = { ...goodReadiness, recentFatigueScore: 1 };

  const restArgs = {
    sourceWorkout: { number: 32 },
    athleteLevel: 'intermediate',
    squat: trainingMaxes.Squat,
    bench: trainingMaxes.Bench,
    deadlift: trainingMaxes.Deadlift,
    accessoryMode: 'off',
    accessoryPRs: {},
    preparationMode: 'off',
    history: historyAfterRest,
    currentCycle: 3,
  };

  const restedCandidate = buildGeneratedSmartTrainingWorkout({ ...restArgs, readiness: goodReadiness });
  expect(restedCandidate.lifts).toHaveLength(3);

  const tiredCandidate = buildGeneratedSmartTrainingWorkout({ ...restArgs, readiness: tiredReadiness });
  expect(tiredCandidate.lifts.length).toBeLessThan(3);
});

test('a tertiary lift that would violate its own frequency cap is excluded, falling back to a clean 2-lift day', () => {
  // Give Squat a third exposure inside the same rolling window (cloned from
  // its real W28 entry, relabeled to W29) so it sits at its Intermediate
  // maxTotal cap (3) before the tertiary slot is even considered.
  const extraSquatExposure = JSON.parse(JSON.stringify(
    intermediateHistory.find(entry => entry.workoutNumber === 28 && entry.lift === 'Squat')
  ));
  extraSquatExposure.workoutNumber = 29;

  const historyWithSquatAtCap = [...historyAfterRest, extraSquatExposure];

  const workouts = generateWorkoutsForTrainingModel('smart', {
    ...baseArgs,
    history: historyWithSquatAtCap,
    currentIndex: 31,
  });
  const w32 = workouts.find(w => w.number === 32);

  expect(w32.type).toBe('training');
  expect(w32.lifts.map(l => l.lift)).not.toContain('Squat');
  expect(w32.lifts.length).toBeLessThanOrEqual(2);
});

test('every lift on a 3-lift day fills the 4-column grid exactly (no empty trailing cells), with the primary lift still getting a real top set', () => {
  const workouts = generateWorkoutsForTrainingModel('smart', {
    ...baseArgs,
    history: historyAfterRest,
    currentIndex: 31,
  });
  const w32 = workouts.find(w => w.number === 32);

  // Each lift's own warmup count varies (it's driven by how far that lift's
  // top weight is from an empty bar, not by role) - the shared invariant is
  // that warmups+sets always lands on a multiple of the grid's column count
  // (4), never leaving a half-empty last row.
  w32.lifts.forEach(liftBlock => {
    const totalRows = liftBlock.warmups.length + liftBlock.sets.length;
    expect(totalRows % 4).toBe(0);
  });

  // The primary lift still gets its real top set - grid-completion only
  // ever adjusts the backoff count, never drops the top-set stimulus.
  const primaryBlock = w32.lifts.find(l => l.role === 'primary');
  const backoffSets = primaryBlock.sets.filter(s => s.labelKey === 'backoff');
  expect(backoffSets.length).toBeGreaterThanOrEqual(3);
  expect(primaryBlock.warmups.length + primaryBlock.sets.length).toBe(8);

  // Medium work retains a meaningful volume block. A genuinely light
  // tertiary dose may use two work sets: the total session dose, rather
  // than a structural three-set minimum, now defines its intensity.
  const secondaryBlock = w32.lifts.find(l => l.role === 'secondary');
  const tertiaryBlock = w32.lifts.find(l => l.role === 'tertiary');
  [secondaryBlock, tertiaryBlock].forEach(block => {
    expect(block.warmups.length + block.sets.length).toBeGreaterThanOrEqual(4);
    expect((block.warmups.length + block.sets.length) % 4).toBe(0);
  });
  expect(secondaryBlock.sets.length).toBeGreaterThanOrEqual(3);
  expect(tertiaryBlock.sets.length).toBeGreaterThanOrEqual(3);
});
