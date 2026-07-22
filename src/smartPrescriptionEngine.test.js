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

  expect(lighter.sets.map(set => set.pct))
    .toEqual(stronger.sets.map(set => set.pct));

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

test('uses five-set volume on a single-lift Squat workout', () => {
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

  expect(backoffs).toHaveLength(5);
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

test('keeps Ana C1W10 single-lift Bench back-offs below top work', () => {
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
      pct: 0.60,
      weight: 20,
    });
    expect(set.pct).toBeLessThan(prescription.sets[0].pct);
  });
});

test('holds a hard successful top double without treating hard as failure', () => {
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
  expect(prescription.sets[0].pct).toBe(0.80);
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
    programProfile: 'kelaniSbdUltra',
  });

  expect(priorities[0].lift).toBe('Deadlift');
  expect(priorities[0].exposureDeficit)
    .toBeGreaterThan(0);
  expect(priorities[0].meetShortfall)
    .toBeCloseTo(0.20);
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
