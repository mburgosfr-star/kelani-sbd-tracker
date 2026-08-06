import {
  buildSmartLiftPrescription,
  buildSmartLiftState,
} from './smartPrescriptionEngine';

const LIFTS = [
  { lift: 'Squat', trainingMax: 100, otherLifts: ['Bench', 'Deadlift'] },
  { lift: 'Bench', trainingMax: 80, otherLifts: ['Squat', 'Deadlift'] },
  { lift: 'Deadlift', trainingMax: 140, otherLifts: ['Squat', 'Bench'] },
];

function round25(value) {
  return Math.round(Number(value) / 2.5) * 2.5;
}

function makeTrainingEntry({
  workoutNumber,
  lift,
  trainingMax,
  topPct = 0.75,
  topReps = 3,
  volumePct = 0.65,
  volumeReps = 5,
  workoutEffort = 'good',
  failed = false,
}) {
  const topWeight = round25(trainingMax * topPct);
  const volumeWeight = round25(trainingMax * volumePct);
  const sets = [
    {
      lift,
      labelKey: 'topTriple',
      reps: topReps,
      pct: topPct,
      weight: topWeight,
      originalPct: topPct,
      originalWeight: topWeight,
      done: !failed,
      failed,
      skipped: false,
    },
    ...Array.from({ length: 4 }, () => ({
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

function makeHistory({
  lift,
  trainingMax,
  otherLifts,
  effort = 'hard',
  failed = false,
  interveningTrainingCount = 2,
}) {
  const history = [
    makeTrainingEntry({
      workoutNumber: 10,
      lift,
      trainingMax,
      workoutEffort: effort,
      failed,
    }),
  ];

  otherLifts.slice(0, interveningTrainingCount).forEach(
    (otherLift, index) => {
      history.push(makeTrainingEntry({
        workoutNumber: 11 + index,
        lift: otherLift,
        trainingMax:
          otherLift === 'Squat'
            ? 100
            : otherLift === 'Bench'
              ? 80
              : 140,
      }));
    }
  );

  return history;
}

function buildResult({
  lift,
  trainingMax,
  otherLifts,
  effort = 'hard',
  failed = false,
  interveningTrainingCount = 2,
  role = 'primary',
}) {
  const state = buildSmartLiftState({
    history: makeHistory({
      lift,
      trainingMax,
      otherLifts,
      effort,
      failed,
      interveningTrainingCount,
    }),
    currentCycle: 1,
    lift,
    trainingMax,
  });

  const prescription = buildSmartLiftPrescription({
    state,
    role,
    isMixedLiftWorkout: true,
  });

  return {
    state,
    prescription,
    top: prescription.sets[0],
    volume: prescription.sets.filter(
      set => set.labelKey === 'backoff' ||
        set.labelKey === 'workSets'
    ),
  };
}

test.each(LIFTS)(
  '$lift HARD progresses immediately, even before extra spacing - workoutEffort is a whole-day rating, not lift-specific',
  config => {
    const { state, top, volume } = buildResult({
      ...config,
      interveningTrainingCount: 1,
    });

    expect(state.workoutsSinceExposure).toBe(1);
    expect(state.progression).toMatchObject({
      adjustment: 0.025,
      direction: 'progress',
      reason: 'hard-progress',
    });
    expect(top.pct).toBe(0.8);
    expect(volume.length).toBeGreaterThan(0);
    volume.forEach(set => expect(set.pct).toBe(0.7));
  }
);

test.each(LIFTS)(
  '$lift HARD progresses as a primary lift after two other workouts',
  config => {
    const { state, prescription, top, volume } = buildResult(config);

    expect(state.workoutsSinceExposure).toBe(2);
    expect(state.recentFailedOrSkippedSetCount).toBe(0);
    expect(state.progression).toMatchObject({
      adjustment: 0.025,
      direction: 'progress',
      reason: 'hard-progress',
    });
    expect(prescription.validation.valid).toBe(true);
    expect(top.pct).toBe(0.8);
    expect(volume.length).toBeGreaterThan(0);
    volume.forEach(set => expect(set.pct).toBe(0.7));
  }
);

test.each(LIFTS)(
  '$lift HARD progresses as a secondary lift after two other workouts',
  config => {
    const { state, prescription, volume } = buildResult({
      ...config,
      role: 'secondary',
    });

    expect(state.workoutsSinceExposure).toBe(2);
    expect(state.progression).toMatchObject({
      adjustment: 0.025,
      direction: 'progress',
      reason: 'hard-progress',
    });
    expect(prescription.validation.valid).toBe(true);
    expect(volume).toHaveLength(3);
    volume.forEach(set => expect(set.pct).toBe(0.7));
  }
);

test.each([
  ...LIFTS.map(config => ({
    ...config,
    caseName: `${config.lift} TOO MUCH`,
    effort: 'tooMuch',
    failed: false,
    reason: 'too-much',
  })),
  ...LIFTS.map(config => ({
    ...config,
    caseName: `${config.lift} failed top set`,
    effort: 'good',
    failed: true,
    reason: 'failed-skipped',
  })),
])('$caseName still regresses after spacing', ({
  reason,
  ...config
}) => {
  const { state, prescription, top, volume } = buildResult(config);

  expect(state.workoutsSinceExposure).toBe(2);
  expect(state.progression).toMatchObject({
    adjustment: -0.05,
    direction: 'regress',
    reason,
  });
  expect(prescription.validation.valid).toBe(true);
  expect(top.pct).toBe(0.70);
  expect(volume.length).toBeGreaterThan(0);
  volume.forEach(set => expect(set.pct).toBe(0.60));
});
