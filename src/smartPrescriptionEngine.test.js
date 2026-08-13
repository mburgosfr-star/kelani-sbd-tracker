import {
  buildSmartLiftPrescription,
  buildSmartLiftState,
  buildSmartLiftStates,
  rankSmartLiftPriorities,
  validateSmartLiftPrescription,
} from './smartPrescriptionEngine';

function makeLiftHistory({
  lift,
  trainingMax,
  pct,
  topReps = 2,
  volumePct = 0.70,
  volumeReps = 4,
  volumeSets = 4,
  workoutEffort = 'good',
  failed = false,
  workoutNumber = 1,
}) {
  const topWeight =
    Math.round((trainingMax * pct) / 2.5) * 2.5;
  const volumeWeight =
    Math.round((trainingMax * volumePct) / 2.5) * 2.5;

  return [{
    cycle: 1,
    workoutNumber,
    lift,
    workoutEffort,
    workoutSnapshot: {
      number: workoutNumber,
      type: 'training',
      smartDayType: 'training',
      lift,
      lifts: [{
        lift,
        sets: [
          {
            labelKey:
              topReps === 1
                ? 'topSingle'
                : topReps === 2
                  ? 'topDouble'
                  : 'topTriple',
            reps: topReps,
            pct,
            weight: topWeight,
            originalPct: pct,
            originalWeight: topWeight,
            done: !failed,
            failed,
            skipped: false,
          },
          ...Array.from(
            { length: volumeSets },
            () => ({
              labelKey: 'backoff',
              reps: volumeReps,
              pct: volumePct,
              weight: volumeWeight,
              originalPct: volumePct,
              originalWeight: volumeWeight,
              done: true,
              failed: false,
              skipped: false,
            })
          ),
        ],
      }],
      workoutEffort,
    },
  }];
}

test('generates the same relative beginner prescription at different strength levels', () => {
  const lighterState = buildSmartLiftState({
    history: [],
    currentCycle: 1,
    lift: 'Deadlift',
    trainingMax: 60,
  });

  const strongerState = buildSmartLiftState({
    history: [],
    currentCycle: 1,
    lift: 'Deadlift',
    trainingMax: 180,
  });

  const lighter =
    buildSmartLiftPrescription({
      state: lighterState,
      role: 'primary',
    });

  const stronger =
    buildSmartLiftPrescription({
      state: strongerState,
      role: 'primary',
    });

  expect(lighter.validation.valid).toBe(true);
  expect(stronger.validation.valid).toBe(true);

  expect(lighter.sets.map(set => set.precisePct))
    .toEqual(stronger.sets.map(set => set.precisePct));

  expect(lighter.sets[0]).toMatchObject({
    labelKey: 'topTriple',
    reps: 3,
    pct: 0.70,
    weight: 42.5,
  });

  expect(stronger.sets[0]).toMatchObject({
    labelKey: 'topTriple',
    reps: 3,
    pct: 0.70,
    weight: 125,
  });
  expect(lighter.sets.slice(1).every(set => set.pct === 0.575)).toBe(true);
  expect(stronger.sets.slice(1).every(set => set.pct === 0.6)).toBe(true);
});

test('progresses a successful good top double instead of moving backwards', () => {
  const history = makeLiftHistory({
    lift: 'Deadlift',
    trainingMax: 180,
    pct: 0.80,
    workoutEffort: 'good',
  });

  const state = buildSmartLiftState({
    history,
    currentCycle: 1,
    lift: 'Deadlift',
    trainingMax: 180,
  });

  const prescription =
    buildSmartLiftPrescription({
      state,
      role: 'primary',
    });

  expect(prescription.validation.valid).toBe(true);

  expect(prescription.sets[0]).toMatchObject({
    labelKey: 'topDouble',
    reps: 2,
    pct: 0.825,
    weight: 147.5,
  });

  const backoffs = prescription.sets.slice(1);

  expect(backoffs).toHaveLength(4);

  backoffs.forEach(set => {
    expect(set).toMatchObject({
      labelKey: 'backoff',
      reps: 4,
      pct: 0.725,
    });
  });
});

test('converting from a maxed top triple to a top double is a genuine e1RM step forward, not a near-breakeven move', () => {
  const history = makeLiftHistory({
    lift: 'Squat',
    trainingMax: 100,
    pct: 0.825,
    topReps: 3,
    workoutEffort: 'good',
  });

  const state = buildSmartLiftState({
    history,
    currentCycle: 1,
    lift: 'Squat',
    trainingMax: 100,
  });

  const prescription = buildSmartLiftPrescription({
    state,
    role: 'primary',
  });

  expect(prescription.validation.valid).toBe(true);
  // 0.825 * (1 + 3/30) / (1 + 2/30) + 0.025 = ~0.8758, clamped to the
  // double's 0.875 ceiling - a real ~2.6pp e1RM gain over the 82.5% triple
  // (was landing on a near-breakeven 0.85 before this fix).
  expect(prescription.sets[0]).toMatchObject({
    labelKey: 'topDouble',
    reps: 2,
    precisePct: 0.875,
  });
});

test('a top single past the old flat 90% cap keeps climbing while backoffs stay at the recoverable ceiling', () => {
  const history = makeLiftHistory({
    lift: 'Bench',
    trainingMax: 100,
    pct: 0.90,
    topReps: 1,
    volumePct: 0.75,
    volumeReps: 4,
    volumeSets: 5,
    workoutEffort: 'good',
  });

  const state = buildSmartLiftState({
    history,
    currentCycle: 1,
    lift: 'Bench',
    trainingMax: 100,
  });

  const prescription = buildSmartLiftPrescription({
    state,
    role: 'primary',
  });

  expect(prescription.validation.valid).toBe(true);
  expect(prescription.sets[0]).toMatchObject({
    labelKey: 'topSingle',
    reps: 1,
    pct: 0.925,
  });

  const backoffs = prescription.sets.slice(1);
  backoffs.forEach(set => {
    expect(set).toMatchObject({
      labelKey: 'backoff',
      pct: 0.75,
    });
  });
});

test('a meet-specific 95% Deadlift double never pulls its four-rep backoffs above 75%', () => {
  const history = makeLiftHistory({
    lift: 'Deadlift',
    trainingMax: 180,
    pct: 0.925,
    topReps: 2,
    volumePct: 0.80,
    volumeReps: 4,
    volumeSets: 4,
    workoutEffort: 'good',
  });

  const state = buildSmartLiftState({
    history,
    currentCycle: 1,
    lift: 'Deadlift',
    trainingMax: 180,
    meetPlanReadiness: {
      Deadlift: {
        readinessPhase: 'third-attempt',
        readinessTargetAttempt: 185,
        attempts: { thirdAttempt: 185 },
      },
    },
  });

  const prescription = buildSmartLiftPrescription({
    state,
    role: 'primary',
    isMixedLiftWorkout: true,
  });

  expect(prescription.sets[0]).toMatchObject({
    labelKey: 'topDouble',
    reps: 2,
  });
  expect(prescription.sets[0].pct).toBeGreaterThanOrEqual(0.925);
  prescription.sets.slice(1).forEach(set => {
    expect(set).toMatchObject({
      labelKey: 'backoff',
      reps: 4,
      pct: 0.75,
    });
  });
});

test('a top single clamps at the second-attempt target instead of repeating a flat 90%', () => {
  const history = makeLiftHistory({
    lift: 'Bench',
    trainingMax: 100,
    pct: 0.975,
    topReps: 1,
    volumePct: 0.80,
    volumeReps: 4,
    volumeSets: 5,
    workoutEffort: 'good',
  });

  const state = buildSmartLiftState({
    history,
    currentCycle: 1,
    lift: 'Bench',
    trainingMax: 100,
  });

  const prescription = buildSmartLiftPrescription({
    state,
    role: 'primary',
  });

  expect(prescription.validation.valid).toBe(true);
  // 0.975 is exactly the second-attempt target - progression (+2.5%) would
  // overshoot to 1.0 without the clamp. Checked via precisePct (the true
  // unrounded progression anchor) since 0.975 itself rounds up to a clean
  // 100% for display at the app's 5% display-rounding step, which is an
  // unrelated, already-covered concern.
  expect(prescription.sets[0]).toMatchObject({
    labelKey: 'topSingle',
    reps: 1,
    precisePct: 0.975,
  });
});

test('uses six-set volume on a single-lift Squat workout', () => {
  const state = buildSmartLiftState({
    history: [],
    currentCycle: 1,
    lift: 'Squat',
    trainingMax: 150,
  });

  const prescription = buildSmartLiftPrescription({
    state,
    role: 'primary',
    isSingleLiftWorkout: true,
  });

  const backoffs = prescription.sets.filter(
    set => set.labelKey === 'backoff'
  );

  expect(backoffs).toHaveLength(6);
});

test('adds six-by-six Bench volume to a safe single-lift workout', () => {
  const history = makeLiftHistory({
    lift: 'Bench',
    trainingMax: 100,
    pct: 0.825,
    workoutEffort: 'good',
  });

  const state = buildSmartLiftState({
    history,
    currentCycle: 1,
    lift: 'Bench',
    trainingMax: 100,
  });

  const prescription = buildSmartLiftPrescription({
    state,
    role: 'primary',
    isSingleLiftWorkout: true,
  });

  expect(prescription.validation.valid).toBe(true);
  expect(prescription.sets[0]).toMatchObject({
    labelKey: 'topDouble',
    reps: 2,
    pct: 0.85,
    weight: 85,
  });

  const backoffs = prescription.sets.slice(1);

  expect(backoffs).toHaveLength(6);
  backoffs.forEach(set => {
    expect(set).toMatchObject({
      labelKey: 'backoff',
      reps: 6,
      pct: 0.70,
      weight: 70,
    });
  });
});

test('keeps beginner C1W10 single-lift Bench back-offs below top work', () => {
  const volumeExposure = ({
    workoutNumber,
    workoutEffort,
    sets,
  }) => ({
    cycle: 1,
    workoutNumber,
    lift: 'Bench',
    workoutEffort,
    workoutSnapshot: {
      number: workoutNumber,
      type: 'training',
      smartDayType: 'training',
      lift: 'Bench',
      lifts: [{
        lift: 'Bench',
        sets: sets.map(({ reps, pct, weight }) => ({
          labelKey: 'workSets',
          reps,
          pct,
          weight,
          originalPct: pct,
          originalWeight: weight,
          done: true,
          failed: false,
          skipped: false,
        })),
      }],
      workoutEffort,
    },
  });

  const history = [
    volumeExposure({
      workoutNumber: 1,
      workoutEffort: 'easy',
      sets: Array.from(
        { length: 3 },
        () => ({ reps: 5, pct: 0.60, weight: 20 })
      ),
    }),
    volumeExposure({
      workoutNumber: 3,
      workoutEffort: 'good',
      sets: [
        { reps: 5, pct: 0.72, weight: 22.5 },
        ...Array.from(
          { length: 3 },
          () => ({ reps: 6, pct: 0.64, weight: 20 })
        ),
      ],
    }),
    volumeExposure({
      workoutNumber: 6,
      workoutEffort: 'hard',
      sets: Array.from(
        { length: 4 },
        () => ({ reps: 5, pct: 0.675, weight: 22.5 })
      ),
    }),
  ];

  const state = buildSmartLiftState({
    history,
    currentCycle: 1,
    lift: 'Bench',
    trainingMax: 32.5,
  });
  const prescription = buildSmartLiftPrescription({
    state,
    role: 'primary',
    isSingleLiftWorkout: true,
  });

  expect(state.lastSuccessfulTop).toBeNull();
  expect(prescription.validation.valid).toBe(true);
  expect(prescription.sets[0]).toMatchObject({
    labelKey: 'topTriple',
    reps: 3,
    pct: 0.70,
    weight: 22.5,
  });

  const backoffs = prescription.sets.slice(1);
  expect(backoffs).toHaveLength(6);
  backoffs.forEach(set => {
    expect(set).toMatchObject({
      labelKey: 'backoff',
      reps: 6,
      pct: 0.625,
      weight: 20,
    });
    expect(set.pct).toBeLessThan(prescription.sets[0].pct);
  });
});

test('progresses a hard successful top double without treating hard as failure', () => {
  const history = makeLiftHistory({
    lift: 'Deadlift',
    trainingMax: 180,
    pct: 0.80,
    workoutEffort: 'hard',
  });

  const state = buildSmartLiftState({
    history,
    currentCycle: 1,
    lift: 'Deadlift',
    trainingMax: 180,
  });

  const prescription =
    buildSmartLiftPrescription({
      state,
      role: 'primary',
    });

  expect(prescription.validation.valid).toBe(true);
  // Raw progression lands on the exact 2.5% display step.
  expect(prescription.sets[0].precisePct).toBe(0.825);
  expect(prescription.sets[0].pct).toBe(0.825);
  expect(prescription.regressionReason).toBeNull();
});

test('allows regression only after a concrete lift-specific failure', () => {
  const history = makeLiftHistory({
    lift: 'Squat',
    trainingMax: 150,
    pct: 0.825,
    workoutEffort: 'good',
    failed: true,
  });

  const state = buildSmartLiftState({
    history,
    currentCycle: 1,
    lift: 'Squat',
    trainingMax: 150,
  });

  const prescription =
    buildSmartLiftPrescription({
      state,
      role: 'primary',
    });

  expect(prescription.validation.valid).toBe(true);
  expect(prescription.sets[0].pct).toBe(0.775);
  expect(prescription.regressionReason)
    .toBe('failed-skipped');
});

test('C3W36 failure causes recovery without regressing the successful lift or failed light-volume lift', () => {
  const snapshot = {
    number: 36,
    type: 'training',
    smartDayType: 'training',
    workoutEffort: 'tooMuch',
    lifts: [
      {
        lift: 'Squat',
        role: 'secondary',
        sets: Array.from({ length: 6 }, () => ({
          labelKey: 'workSets', reps: 4, pct: 0.75, weight: 110,
          done: true, failed: false, skipped: false,
        })),
      },
      {
        lift: 'Bench',
        role: 'secondary',
        sets: Array.from({ length: 6 }, (_, index) => ({
          labelKey: 'workSets', reps: 6, pct: 0.75, weight: 75,
          done: true,
          failed: index === 5,
          skipped: index === 5,
        })),
      },
    ],
  };
  const history = [
    ...makeLiftHistory({
      lift: 'Squat', trainingMax: 145, pct: 0.875,
      workoutEffort: 'hard', workoutNumber: 30,
    }),
    ...['Squat', 'Bench'].map(lift => ({
      cycle: 1,
      workoutNumber: 36,
      lift,
      workoutEffort: 'tooMuch',
      failedOrSkippedSetCount: 1,
      workoutSnapshot: snapshot,
    })),
  ];

  const squat = buildSmartLiftState({
    history, currentCycle: 1, lift: 'Squat', trainingMax: 145,
  });
  const bench = buildSmartLiftState({
    history, currentCycle: 1, lift: 'Bench', trainingMax: 101.33333333333333,
  });

  expect(squat.progression).toMatchObject({
    adjustment: 0.025,
    direction: 'progress',
    reason: 'other-lift-failed-progress',
  });
  expect(bench.progression).toMatchObject({
    adjustment: 0,
    direction: 'hold',
    reason: 'light-volume-failure-recovery',
  });

  const recoveredBench = buildSmartLiftState({
    history: [...history, {
      cycle: 1,
      workoutNumber: 37,
      restDay: true,
      smartDayType: 'recovery',
      workoutEffort: 'easy',
      workoutSnapshot: { type: 'rest', smartDayType: 'recovery', lifts: [] },
    }],
    currentCycle: 1,
    lift: 'Bench',
    trainingMax: 101.33333333333333,
  });
  expect(recoveredBench.progression).toMatchObject({
    adjustment: 0.025,
    direction: 'progress',
    reason: 'recovered-light-volume-failure-progress',
  });
});

test('creates a normal secondary lift with four to six work sets and reps', () => {
  const history = makeLiftHistory({
    lift: 'Bench',
    trainingMax: 100,
    pct: 0.775,
    topReps: 3,
    volumePct: 0.65,
    volumeReps: 5,
    workoutEffort: 'good',
  });

  const state = buildSmartLiftState({
    history,
    currentCycle: 1,
    lift: 'Bench',
    trainingMax: 100,
  });

  const prescription =
    buildSmartLiftPrescription({
      state,
      role: 'secondary',
    });

  expect(prescription.validation.valid).toBe(true);
  expect(prescription.sets).toHaveLength(4);

  prescription.sets.forEach(set => {
    expect(set).toMatchObject({
      labelKey: 'workSets',
      reps: 5,
      pct: 0.675,
      weight: 67.5,
    });
  });
});

test('rejects an invalid low-volume normal training block', () => {
  const validation = validateSmartLiftPrescription({
    lift: 'Squat',
    role: 'secondary',
    sets: [
      {
        labelKey: 'workSets',
        groupKey: 'Squat-worksets',
        reps: 4,
        pct: 0.625,
      },
      {
        labelKey: 'workSets',
        groupKey: 'Squat-worksets',
        reps: 4,
        pct: 0.625,
      },
      {
        labelKey: 'workSets',
        groupKey: 'Squat-worksets',
        reps: 4,
        pct: 0.625,
      },
    ],
  });

  expect(validation.valid).toBe(false);
  expect(validation.errors).toContain(
    'Back-off and work-set blocks require 4–6 sets.'
  );
});

test('rejects back-off work at the same intensity as top work', () => {
  const validation = validateSmartLiftPrescription({
    lift: 'Bench',
    role: 'primary',
    sets: [
      {
        labelKey: 'topTriple',
        groupKey: 'Bench-top',
        reps: 3,
        pct: 0.70,
      },
      ...Array.from({ length: 6 }, () => ({
        labelKey: 'backoff',
        groupKey: 'Bench-backoff',
        reps: 6,
        pct: 0.70,
      })),
    ],
  });

  expect(validation.valid).toBe(false);
  expect(validation.errors).toContain(
    'Back-off work must be lighter than top work.'
  );
});

test('ranks lift priorities from generic exposure and meet-readiness signals', () => {
  const states = buildSmartLiftStates({
    history: [
      ...makeLiftHistory({
        lift: 'Bench',
        trainingMax: 100,
        pct: 0.80,
        workoutNumber: 1,
      }),
      ...makeLiftHistory({
        lift: 'Bench',
        trainingMax: 100,
        pct: 0.825,
        workoutNumber: 2,
      }),
      ...makeLiftHistory({
        lift: 'Squat',
        trainingMax: 150,
        pct: 0.75,
        workoutNumber: 3,
      }),
    ],
    currentCycle: 1,
    trainingMaxes: {
      Squat: 150,
      Bench: 100,
      Deadlift: 190,
    },
    meetPlanReadiness: {
      Squat: {
        currentCycleReadinessRatio: 0.95,
      },
      Bench: {
        currentCycleReadinessRatio: 1,
      },
      Deadlift: {
        currentCycleReadinessRatio: 0.80,
      },
    },
  });

  const priorities = rankSmartLiftPriorities(states, {
    athleteLevel: 'intermediate',
  });

  expect(priorities[0].lift).toBe('Deadlift');
  expect(priorities[0].exposureDeficit)
    .toBeGreaterThan(0);
  expect(priorities[0].meetShortfall)
    .toBeCloseTo(0.20);
});

test('exposure targets are decoupled from programProfile and vary by athleteLevel', () => {
  const states = buildSmartLiftStates({
    history: makeLiftHistory({
      lift: 'Deadlift',
      trainingMax: 150,
      pct: 0.75,
      workoutNumber: 1,
    }),
    currentCycle: 1,
    trainingMaxes: { Squat: 100, Bench: 70, Deadlift: 150 },
  });

  const intermediate = rankSmartLiftPriorities(states, { athleteLevel: 'intermediate' })
    .find(item => item.lift === 'Deadlift');
  const beginner = rankSmartLiftPriorities(states, { athleteLevel: 'beginner' })
    .find(item => item.lift === 'Deadlift');
  const defaulted = rankSmartLiftPriorities(states)
    .find(item => item.lift === 'Deadlift');

  // Intermediate target is 2 - one completed exposure still leaves a deficit.
  expect(intermediate.exposureDeficit).toBeGreaterThan(0);
  // Beginner target is 1 (always heavy) - already met, no deficit.
  expect(beginner.exposureDeficit).toBe(0);
  // No athleteLevel specified defaults to intermediate.
  expect(defaulted.exposureDeficit).toBe(intermediate.exposureDeficit);
});

test('generated prescriptions contain no template source identity', () => {
  const history = makeLiftHistory({
    lift: 'Deadlift',
    trainingMax: 180,
    pct: 0.80,
    workoutEffort: 'good',
  });

  const state = buildSmartLiftState({
    history,
    currentCycle: 1,
    lift: 'Deadlift',
    trainingMax: 180,
  });

  const prescription = buildSmartLiftPrescription({
    state,
    role: 'primary',
  });

  expect(prescription.validation.valid).toBe(true);
  expect(prescription).not.toHaveProperty('sourceWorkoutNumber');
  expect(prescription).not.toHaveProperty('template');
  expect(prescription).not.toHaveProperty('templateNumber');
});

test.each(['good', 'easy', 'hard'])(
  'progresses beginner C1W13 Bench after intervening training and recovery with %s feedback',
  workoutEffort => {
    const history = [
      ...makeLiftHistory({
        lift: 'Bench',
        trainingMax: 32.5,
        pct: 0.75,
        topReps: 3,
        volumePct: 0.65,
        volumeReps: 6,
        volumeSets: 6,
        workoutEffort,
        workoutNumber: 13,
      }),
      ...makeLiftHistory({
        lift: 'Deadlift',
        trainingMax: 60,
        pct: 0.80,
        topReps: 2,
        volumePct: 0.70,
        volumeReps: 4,
        workoutEffort: 'good',
        workoutNumber: 14,
      }),
      ...makeLiftHistory({
        lift: 'Squat',
        trainingMax: 42.5,
        pct: 0.775,
        topReps: 3,
        volumePct: 0.65,
        volumeReps: 5,
        workoutEffort: 'good',
        workoutNumber: 15,
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
          smartDayType: 'recovery',
          lifts: [],
          sets: [],
          workoutEffort: 'easy',
        },
      },
    ];

    const state = buildSmartLiftState({
      history,
      currentCycle: 1,
      lift: 'Bench',
      trainingMax: 32.5,
    });

    const prescription = buildSmartLiftPrescription({
      state,
      role: 'primary',
      isMixedLiftWorkout: true,
    });

    const backoffs = prescription.sets.filter(
      set => set.labelKey === 'backoff'
    );

    expect(state.workoutsSinceExposure).toBe(2);
    expect(state.recentFailedOrSkippedSetCount).toBe(0);
    expect(state.progression).toMatchObject({
      adjustment: 0.025,
      direction: 'progress',
      reason: `${workoutEffort}-progress`,
    });
    expect(prescription.validation.valid).toBe(true);

    expect(prescription.sets[0]).toMatchObject({
      labelKey: 'topTriple',
      reps: 3,
      pct: 0.775,
      weight: 25,
    });

    expect(backoffs.length).toBeGreaterThan(0);

    backoffs.forEach(set => {
      expect(set).toMatchObject({
        reps: 5,
        pct: 0.7,
        weight: 22.5,
      });
    });
  }
);
