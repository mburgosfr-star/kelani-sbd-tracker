import { generateWorkoutsForTrainingModel } from './smartTrainingEngine';

function round25(value) {
  return Math.round(Number(value) / 2.5) * 2.5;
}

function makeTrainingEntry({
  workoutNumber,
  lift,
  trainingMax,
  topPct,
  topReps,
  volumePct,
  volumeReps,
  volumeSets = 4,
  workoutEffort = 'good',
}) {
  const topWeight = round25(trainingMax * topPct);
  const volumeWeight = round25(trainingMax * volumePct);
  const topLabel =
    topReps === 1
      ? 'topSingle'
      : topReps === 2
        ? 'topDouble'
        : 'topTriple';

  const sets = [
    {
      lift,
      labelKey: topLabel,
      reps: topReps,
      pct: topPct,
      weight: topWeight,
      originalPct: topPct,
      originalWeight: topWeight,
      done: true,
      failed: false,
      skipped: false,
    },
    ...Array.from({ length: volumeSets }, () => ({
      lift,
      labelKey: 'backoff',
      reps: volumeReps,
      pct: volumePct,
      weight: volumeWeight,
      originalPct: volumePct,
      originalWeight: volumeWeight,
      done: true,
      failed: false,
      skipped: false,
    })),
  ];

  return {
    cycle: 1,
    workoutNumber,
    lift,
    topWeight,
    topReps,
    e1rm: topWeight * (1 + topReps / 30),
    workoutEffort,
    failedOrSkippedSetCount: 0,
    workoutSnapshot: {
      number: workoutNumber,
      type: 'training',
      smartDayType: 'training',
      smartCurrentCycle: 1,
      lift,
      lifts: [{
        lift,
        role: 'primary',
        sets,
      }],
      sets,
      workoutEffort,
    },
  };
}

test('generates a correctly light beginner C1W17 through the full Smart app generator when Bench already used its weekly heavy slot', () => {
  // Mirrors the app's onboarding seedMax history entries (App.js
  // handleStart) for the starting maxes - meet attempts and the real-1RM
  // basis now come from these, kept separate from whatever a sub-maximal
  // training set (e.g. a triple) would otherwise imply as her heaviest
  // weight touched.
  const seedMax = (lift, weight) => ({
    workoutNumber: 0,
    cycle: 0,
    seedMax: true,
    lift,
    topWeight: weight,
    topReps: 1,
    e1rm: weight,
  });

  const history = [
    seedMax('Squat', 50),
    seedMax('Bench', 32.5),
    seedMax('Deadlift', 70),
    makeTrainingEntry({
      workoutNumber: 11,
      lift: 'Squat',
      trainingMax: 50,
      topPct: 0.75,
      topReps: 3,
      volumePct: 0.65,
      volumeReps: 5,
    }),
    makeTrainingEntry({
      workoutNumber: 12,
      lift: 'Deadlift',
      trainingMax: 70,
      topPct: 0.80,
      topReps: 2,
      volumePct: 0.70,
      volumeReps: 4,
    }),
    makeTrainingEntry({
      workoutNumber: 13,
      lift: 'Bench',
      trainingMax: 32.5,
      topPct: 0.75,
      topReps: 3,
      volumePct: 0.65,
      volumeReps: 6,
      volumeSets: 6,
      workoutEffort: 'hard',
    }),
    makeTrainingEntry({
      workoutNumber: 14,
      lift: 'Deadlift',
      trainingMax: 70,
      topPct: 0.80,
      topReps: 2,
      volumePct: 0.70,
      volumeReps: 4,
    }),
    makeTrainingEntry({
      workoutNumber: 15,
      lift: 'Squat',
      trainingMax: 50,
      topPct: 0.775,
      topReps: 3,
      volumePct: 0.675,
      volumeReps: 5,
    }),
    {
      cycle: 1,
      workoutNumber: 16,
      restDay: true,
      completionOnly: true,
      smartDayType: 'recovery',
      workoutEffort: 'easy',
      workoutSnapshot: {
        number: 16,
        type: 'rest',
        restDay: true,
        completionOnly: true,
        smartDayType: 'recovery',
        smartCurrentCycle: 1,
        lifts: [],
        sets: [],
        workoutEffort: 'easy',
      },
    },
  ];

  const workouts = generateWorkoutsForTrainingModel('smart', {
    programProfile: 'kelaniSbd',
    squat: 50,
    bench: 32.5,
    deadlift: 70,
    history,
    currentIndex: 16,
    currentCycle: 1,
  });

  const c1w17 = workouts.find(
    workout => workout?.smartDecisionSummary
  );

  expect(c1w17).toBeTruthy();
  expect(c1w17.number).toBe(17);
  expect(c1w17.smartDecisionSummary.dayType).toBe('training');
  // Bench's only exposure so far (W13) was already heavy, and Bench's
  // weekly heavy allocation is exactly 1 - a repeat heavy Bench day this
  // soon is correctly blocked (see the real C3W36/37 report this same
  // rule was fixed for), so the day falls back to Squat, which still has
  // genuine remaining weekly capacity but isn't itself due for another
  // heavy exposure (2 already, at its own weekly target) - hence light.
  expect(c1w17.smartTrainingSelectionSummary.primaryLift).toBe('Squat');

  const squat = c1w17.lifts.find(
    liftBlock => liftBlock.lift === 'Squat'
  );

  expect(squat).toBeTruthy();
  expect(squat.role).toBe('secondary');

  const workSets = squat.sets.filter(
    set => set.labelKey === 'workSets'
  );

  expect(workSets.length).toBeGreaterThan(0);

  workSets.forEach(set => {
    expect(set).toMatchObject({
      reps: 5,
      pct: 0.7,
      weight: 35,
    });
  });
});
