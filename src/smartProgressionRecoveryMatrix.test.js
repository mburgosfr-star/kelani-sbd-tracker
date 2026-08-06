import {
  buildSmartLiftPrescription,
  buildSmartLiftState,
} from './smartPrescriptionEngine';

function round25(value) {
  return Math.round(Number(value) / 2.5) * 2.5;
}

function makeTrainingEntry({
  workoutNumber,
  lift,
  trainingMax,
  topPct,
  topReps = 3,
  volumePct,
  volumeReps = 5,
  volumeSets = 4,
  workoutEffort = 'good',
  failed = false,
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
      done: !failed,
      failed,
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
    workoutEffort,
    failedOrSkippedSetCount: failed ? 1 : 0,
    workoutSnapshot: {
      number: workoutNumber,
      type: 'training',
      smartDayType: 'training',
      smartCurrentCycle: 1,
      lift,
      lifts: [{ lift, role: 'primary', sets }],
      sets,
      workoutEffort,
    },
  };
}

function makeBenchHistory({
  effort,
  interveningTrainingCount = 0,
  recoveryAfter = false,
  failed = false,
}) {
  const history = [
    makeTrainingEntry({
      workoutNumber: 13,
      lift: 'Bench',
      trainingMax: 32.5,
      topPct: 0.75,
      topReps: 3,
      volumePct: 0.65,
      volumeReps: 6,
      volumeSets: 6,
      workoutEffort: effort,
      failed,
    }),
  ];

  if (interveningTrainingCount >= 1) {
    history.push(makeTrainingEntry({
      workoutNumber: 14,
      lift: 'Deadlift',
      trainingMax: 70,
      topPct: 0.80,
      topReps: 2,
      volumePct: 0.70,
      volumeReps: 4,
    }));
  }

  if (interveningTrainingCount >= 2) {
    history.push(makeTrainingEntry({
      workoutNumber: 15,
      lift: 'Squat',
      trainingMax: 50,
      topPct: 0.775,
      topReps: 3,
      volumePct: 0.675,
      volumeReps: 5,
    }));
  }

  if (recoveryAfter) {
    history.push({
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
    });
  }

  return history;
}

function getBenchResult(options) {
  const state = buildSmartLiftState({
    history: makeBenchHistory(options),
    currentCycle: 1,
    lift: 'Bench',
    trainingMax: 32.5,
  });

  const prescription = buildSmartLiftPrescription({
    state,
    role: 'primary',
    isMixedLiftWorkout: true,
  });

  const top = prescription.sets[0];
  const backoffs = prescription.sets.filter(
    set => set.labelKey === 'backoff'
  );

  return { state, prescription, top, backoffs };
}

test.each([
  {
    name: 'GOOD progresses immediately',
    effort: 'good',
    interveningTrainingCount: 0,
    expectedSpacing: 0,
    expectedDirection: 'progress',
    expectedReason: 'good-progress',
    expectedTopPct: 0.8,
    expectedVolumePct: 0.7,
  },
  {
    name: 'EASY progresses immediately',
    effort: 'easy',
    interveningTrainingCount: 0,
    expectedSpacing: 0,
    expectedDirection: 'progress',
    expectedReason: 'easy-progress',
    expectedTopPct: 0.8,
    expectedVolumePct: 0.7,
  },
  {
    name: 'HARD progresses immediately - workoutEffort is a whole-day rating, not lift-specific, and frequency policy never repeats a lift on consecutive days',
    effort: 'hard',
    interveningTrainingCount: 0,
    expectedSpacing: 0,
    expectedDirection: 'progress',
    expectedReason: 'hard-progress',
    expectedTopPct: 0.8,
    expectedVolumePct: 0.7,
  },
  {
    name: 'HARD progresses after one intervening training workout',
    effort: 'hard',
    interveningTrainingCount: 1,
    expectedSpacing: 1,
    expectedDirection: 'progress',
    expectedReason: 'hard-progress',
    expectedTopPct: 0.8,
    expectedVolumePct: 0.7,
  },
  {
    name: 'HARD progresses after two intervening training workouts',
    effort: 'hard',
    interveningTrainingCount: 2,
    expectedSpacing: 2,
    expectedDirection: 'progress',
    expectedReason: 'hard-progress',
    expectedTopPct: 0.8,
    expectedVolumePct: 0.7,
  },
  {
    name: 'HARD progression remains valid when recovery follows the spacing',
    effort: 'hard',
    interveningTrainingCount: 2,
    recoveryAfter: true,
    expectedSpacing: 2,
    expectedDirection: 'progress',
    expectedReason: 'hard-progress',
    expectedTopPct: 0.8,
    expectedVolumePct: 0.7,
  },
])('$name', ({
  effort,
  interveningTrainingCount,
  recoveryAfter = false,
  expectedSpacing,
  expectedDirection,
  expectedReason,
  expectedTopPct,
  expectedVolumePct,
}) => {
  const { state, prescription, top, backoffs } = getBenchResult({
    effort,
    interveningTrainingCount,
    recoveryAfter,
  });

  expect(state.workoutsSinceExposure).toBe(expectedSpacing);
  expect(state.recentFailedOrSkippedSetCount).toBe(0);
  expect(state.progression).toMatchObject({
    direction: expectedDirection,
    reason: expectedReason,
  });
  expect(prescription.validation.valid).toBe(true);
  expect(top.pct).toBe(expectedTopPct);
  expect(backoffs.length).toBeGreaterThan(0);
  backoffs.forEach(set => expect(set.pct).toBe(expectedVolumePct));
});

test('a recovery day alone does not invent an intervening training exposure, and HARD still progresses', () => {
  const { state, top } = getBenchResult({
    effort: 'hard',
    interveningTrainingCount: 0,
    recoveryAfter: true,
  });

  expect(state.workoutsSinceExposure).toBe(0);
  expect(state.progression).toMatchObject({
    direction: 'progress',
    reason: 'hard-progress',
  });
  expect(top.pct).toBe(0.8);
});

test.each([
  {
    name: 'TOO MUCH regresses even after two intervening workouts',
    effort: 'tooMuch',
    failed: false,
    expectedReason: 'too-much',
  },
  {
    name: 'a failed top set regresses even after two intervening workouts',
    effort: 'good',
    failed: true,
    expectedReason: 'failed-skipped',
  },
])('$name', ({ effort, failed, expectedReason }) => {
  const { state, prescription, top } = getBenchResult({
    effort,
    failed,
    interveningTrainingCount: 2,
    recoveryAfter: true,
  });

  expect(state.workoutsSinceExposure).toBe(2);
  expect(state.progression).toMatchObject({
    adjustment: -0.05,
    direction: 'regress',
    reason: expectedReason,
  });
  expect(prescription.validation.valid).toBe(true);
  expect(top.pct).toBe(0.70);
});
