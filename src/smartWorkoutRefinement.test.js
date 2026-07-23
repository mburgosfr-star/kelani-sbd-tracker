import {
  applyAccessoryPlanToWorkouts,
  generateUltraProgram,
  generateWorkoutsForTrainingModel,
  getSmartMeetdayBlockerDisplayLabels,
  hasEffectiveSmartTrainingStimulus,
  getSmartModalDetailRows,
  isHeavySmartTrainingLift,
  isMaximalSmartTrainingLift,
  isUltraLightSmartTrainingCandidate,
  repeatsHeavyPrimaryLift,
  violatesSmartTrainingSafety,
} from './App';

test('rejects a 90% Bench single with only one double as normal training', () => {
  const workout = {
    type: 'training',
    label: 'Ultra Bench Opener',
    lifts: [{
      lift: 'Bench',
      sets: [
        { labelKey: 'opener', reps: 1, pct: 0.9 },
        { labelKey: 'backoff', reps: 2, pct: 0.65 },
      ],
    }],
  };

  expect(hasEffectiveSmartTrainingStimulus(workout)).toBe(false);
});

test('accepts a prepared Bench single with four real backoff sets', () => {
  const workout = {
    type: 'training',
    lifts: [{
      lift: 'Bench',
      sets: [
        { labelKey: 'topSingle', reps: 1, pct: 0.875 },
        { labelKey: 'backoff', reps: 5, pct: 0.7 },
        { labelKey: 'backoff', reps: 5, pct: 0.7 },
        { labelKey: 'backoff', reps: 5, pct: 0.7 },
        { labelKey: 'backoff', reps: 5, pct: 0.7 },
      ],
    }],
  };

  expect(hasEffectiveSmartTrainingStimulus(workout)).toBe(true);
});

test('classifies two triples at 50% as ultra-light rather than real training', () => {
  const workout = {
    type: 'training',
    lifts: [
      {
        lift: 'Squat',
        sets: [
          { reps: 3, pct: 0.5 },
          { reps: 3, pct: 0.5 },
        ],
      },
      {
        lift: 'Bench',
        sets: [
          { reps: 3, pct: 0.5 },
          { reps: 3, pct: 0.5 },
        ],
      },
    ],
  };

  expect(isUltraLightSmartTrainingCandidate(workout)).toBe(true);
});

test('generates Ana Deadlift 80/70 prescription consistently from a 60 kg max', () => {
  const workouts = generateUltraProgram(42.5, 32.5, 60);
  const workout = workouts.find(
    item => item.label === 'Ultra Deadlift + Bench Volume'
  );

  expect(workout).toBeTruthy();

  const deadlift = workout.lifts.find(item => item.lift === 'Deadlift');

  expect(deadlift.sets[0]).toMatchObject({
    labelKey: 'topDouble',
    reps: 2,
    pct: 0.8,
    weight: 47.5,
    originalPct: 0.8,
    originalWeight: 47.5,
  });

  deadlift.sets.slice(1).forEach(set => {
    expect(set).toMatchObject({
      labelKey: 'backoff',
      reps: 4,
      pct: 0.7,
      weight: 42.5,
      originalPct: 0.7,
      originalWeight: 42.5,
    });
  });
});

test('regenerates future main-lift weights from the current 1RM', () => {
  const staleFutureWorkout = {
    number: 7,
    type: 'training',
    lifts: [{
      lift: 'Deadlift',
      warmups: [],
      sets: [
        {
          labelKey: 'topDouble',
          reps: 2,
          pct: 0.8,
          weight: 57.5,
          originalPct: 0.8,
          originalWeight: 57.5,
          adjustedFromOriginal: true,
          done: false,
        },
        {
          labelKey: 'backoff',
          reps: 3,
          pct: 0.7,
          weight: 42.5,
          originalPct: 0.7,
          originalWeight: 42.5,
          done: false,
        },
      ],
    }],
    accessories: [],
    cooldownItems: [],
  };

  const regeneratedWorkout = {
    number: 7,
    type: 'training',
    lifts: [{
      lift: 'Deadlift',
      warmups: [],
      sets: [
        {
          labelKey: 'topDouble',
          reps: 2,
          pct: 0.8,
          weight: 47.5,
          originalPct: 0.8,
          originalWeight: 47.5,
          done: false,
        },
        {
          labelKey: 'backoff',
          reps: 3,
          pct: 0.7,
          weight: 42.5,
          originalPct: 0.7,
          originalWeight: 42.5,
          done: false,
        },
      ],
    }],
    accessories: [],
    cooldownItems: [],
  };

  const [merged] = applyAccessoryPlanToWorkouts(
    [staleFutureWorkout],
    [regeneratedWorkout],
    new Set(),
    6
  );

  expect(merged.lifts[0].sets[0]).toMatchObject({
    weight: 47.5,
    pct: 0.8,
    originalWeight: 47.5,
    originalPct: 0.8,
  });

  expect(merged.lifts[0].sets[1]).toMatchObject({
    weight: 42.5,
    pct: 0.7,
  });
});

test('preserves begun set progress only for the active workout', () => {
  const currentWorkout = {
    number: 7,
    type: 'training',
    lifts: [{
      lift: 'Deadlift',
      warmups: [],
      sets: [{
        labelKey: 'topDouble',
        reps: 2,
        pct: 0.8,
        weight: 50,
        originalPct: 0.8,
        originalWeight: 47.5,
        adjustedFromOriginal: true,
        done: true,
        effort: 'good',
      }],
    }],
    accessories: [],
    cooldownItems: [],
  };

  const regeneratedWorkout = {
    number: 7,
    type: 'training',
    lifts: [{
      lift: 'Deadlift',
      warmups: [],
      sets: [{
        labelKey: 'topDouble',
        reps: 2,
        pct: 0.8,
        weight: 47.5,
        originalPct: 0.8,
        originalWeight: 47.5,
        done: false,
      }],
    }],
    accessories: [],
    cooldownItems: [],
  };

  const [merged] = applyAccessoryPlanToWorkouts(
    [currentWorkout],
    [regeneratedWorkout],
    new Set(),
    7
  );

  expect(merged.lifts[0].sets[0]).toMatchObject({
    weight: 50,
    originalWeight: 47.5,
    done: true,
    effort: 'good',
  });
});


test('gives Ultra Bench Strength three Deadlift work sets', () => {
  const workouts = generateUltraProgram(145, 100, 180);
  const workout = workouts.find(item => item.label === 'Ultra Bench Strength');
  const deadlift = workout.lifts.find(item => item.lift === 'Deadlift');

  expect(deadlift.sets).toHaveLength(3);

  deadlift.sets.forEach(set => {
    expect(set).toMatchObject({
      labelKey: 'workSets',
      reps: 3,
      pct: 0.625,
      weight: 112.5,
    });
  });
});

test('uses four-rep volume work at 70% after the Deadlift top double', () => {
  const workouts = generateUltraProgram(145, 100, 180);
  const workout = workouts.find(
    item => item.label === 'Ultra Deadlift + Bench Volume'
  );

  expect(workout).toBeTruthy();

  const deadlift = workout.lifts.find(item => item.lift === 'Deadlift');
  const bench = workout.lifts.find(item => item.lift === 'Bench');

  expect(deadlift.sets).toHaveLength(5);
  expect(deadlift.sets[0]).toMatchObject({
    labelKey: 'topDouble',
    reps: 2,
    pct: 0.8,
  });

  expect(deadlift.sets.slice(1)).toHaveLength(4);
  deadlift.sets.slice(1).forEach(set => {
    expect(set).toMatchObject({
      labelKey: 'backoff',
      reps: 4,
      pct: 0.7,
    });
  });

  expect(bench.sets).toHaveLength(4);
  bench.sets.forEach(set => {
    expect(set).toMatchObject({
      labelKey: 'workSets',
      reps: 4,
      pct: 0.7,
    });
  });
});


test('gives the Ultra Squat Opener a full four-by-four backoff block', () => {
  const workouts = generateUltraProgram(145, 100, 180);
  const workout = workouts.find(item => item.label === 'Ultra Squat Opener');

  expect(workout).toBeTruthy();

  const squat = workout.lifts.find(item => item.lift === 'Squat');

  expect(squat.sets).toHaveLength(5);
  expect(squat.sets[0]).toMatchObject({
    labelKey: 'opener',
    reps: 1,
    pct: 0.9,
  });

  squat.sets.slice(1).forEach(set => {
    expect(set).toMatchObject({
      labelKey: 'backoff',
      reps: 4,
      pct: 0.7,
    });
  });
});


test('blocks the previous HARD primary lift only when it is heavy again', () => {
  const readiness = {
    lastWorkoutEffort: 'hard',
    lastWorkoutPrimaryLift: 'Deadlift',
  };

  const repeatedHeavyDeadlift = {
    type: 'training',
    lifts: [{
      lift: 'Deadlift',
      sets: [{ labelKey: 'topDouble', reps: 2, pct: 0.8 }],
    }],
  };
  const lightDeadlift = {
    type: 'training',
    lifts: [{
      lift: 'Deadlift',
      sets: [{ labelKey: 'workSets', reps: 4, pct: 0.7 }],
    }],
  };
  const heavySquat = {
    type: 'training',
    lifts: [{
      lift: 'Squat',
      sets: [{ labelKey: 'topSingle', reps: 1, pct: 0.9 }],
    }],
  };

  expect(repeatsHeavyPrimaryLift(repeatedHeavyDeadlift, readiness)).toBe(true);
  expect(repeatsHeavyPrimaryLift(lightDeadlift, readiness)).toBe(false);
  expect(repeatsHeavyPrimaryLift(heavySquat, readiness)).toBe(false);
});


test('recognizes a 90% squat opener as maximal squat training', () => {
  const workout = {
    type: 'training',
    lifts: [{
      lift: 'Squat',
      sets: [{ labelKey: 'opener', reps: 1, pct: 0.9 }],
    }],
  };

  expect(isMaximalSmartTrainingLift(workout, 'Squat')).toBe(true);
});

test('blocks heavy Deadlift directly after a heavy Deadlift training day', () => {
  const candidate = {
    type: 'training',
    lifts: [{
      lift: 'Deadlift',
      sets: [{ labelKey: 'topDouble', reps: 2, pct: 0.8 }],
    }],
  };

  expect(
    violatesSmartTrainingSafety(candidate, {
      lastTrainingDayHeavyDeadlift: true,
      recentHeavyDeadliftDayCount: 1,
    })
  ).toBe(true);
});

test('treats a HARD sub-80% Deadlift top set as a heavy Deadlift exposure', () => {
  const candidate = {
    type: 'training',
    lifts: [{
      lift: 'Deadlift',
      sets: [{ labelKey: 'topDouble', reps: 2, pct: 0.775, effort: 'hard' }],
    }],
  };

  expect(
    violatesSmartTrainingSafety(candidate, {
      lastTrainingDayHeavyDeadlift: true,
      recentHeavyDeadliftDayCount: 1,
    })
  ).toBe(true);
});

test('blocks maximal Squat after two recent heavy Deadlift days', () => {
  const candidate = {
    type: 'training',
    lifts: [{
      lift: 'Squat',
      sets: [{ labelKey: 'opener', reps: 1, pct: 0.9 }],
    }],
  };

  expect(
    violatesSmartTrainingSafety(candidate, {
      recentHeavyDeadliftDayCount: 2,
      recentSquatMaxPct: 0.85,
    })
  ).toBe(true);
});

test('blocks an unprepared maximal Squat jump from sub-80% recent work', () => {
  const candidate = {
    type: 'training',
    lifts: [{
      lift: 'Squat',
      sets: [{ labelKey: 'topSingle', reps: 1, pct: 0.9 }],
    }],
  };

  expect(
    violatesSmartTrainingSafety(candidate, {
      recentHeavyDeadliftDayCount: 0,
      recentSquatMaxPct: 0.675,
    })
  ).toBe(true);
});

test('allows maximal Squat when preparation and recovery are sufficient', () => {
  const candidate = {
    type: 'training',
    lifts: [{
      lift: 'Squat',
      sets: [{ labelKey: 'topSingle', reps: 1, pct: 0.9 }],
    }],
  };

  expect(
    violatesSmartTrainingSafety(candidate, {
      recentHeavyDeadliftDayCount: 0,
      recentSquatMaxPct: 0.85,
      lastTrainingDayHeavyDeadlift: false,
    })
  ).toBe(false);
});

test('avoids the C3W15 maximal Squat choice after two heavy Deadlift days', () => {
  const makeLiftSnapshot = ({
    number,
    lift,
    sets,
    workoutEffort = 'good',
    smartDayType = 'training',
  }) => ({
    number,
    type: 'training',
    smartDayType,
    lift,
    lifts: [{
      lift,
      prepItems: [],
      warmups: [],
      sets,
    }],
    prepItems: [],
    warmups: [],
    sets,
    accessories: [],
    workoutEffort,
  });

  const history = [
    {
      cycle: 3,
      workoutNumber: 10,
      lift: 'Squat',
      workoutEffort: 'good',
      workoutSnapshot: makeLiftSnapshot({
        number: 10,
        lift: 'Squat',
        sets: [
          { labelKey: 'workSets', reps: 4, pct: 0.675, weight: 97.5, done: true },
          { labelKey: 'workSets', reps: 4, pct: 0.675, weight: 97.5, done: true },
          { labelKey: 'workSets', reps: 4, pct: 0.675, weight: 97.5, done: true },
          { labelKey: 'workSets', reps: 4, pct: 0.675, weight: 97.5, done: true },
        ],
      }),
    },
    {
      cycle: 3,
      workoutNumber: 11,
      lift: 'Deadlift',
      workoutEffort: 'hard',
      workoutSnapshot: makeLiftSnapshot({
        number: 11,
        lift: 'Deadlift',
        workoutEffort: 'hard',
        sets: [
          { labelKey: 'topSet', reps: 5, pct: 0.721, weight: 130, done: true, effort: 'hard' },
          { labelKey: 'backoff', reps: 6, pct: 0.639, weight: 115, done: true },
          { labelKey: 'backoff', reps: 6, pct: 0.639, weight: 115, done: true },
        ],
      }),
    },
    {
      cycle: 3,
      workoutNumber: 12,
      restDay: true,
      workoutEffort: 'easy',
      smartDayType: 'recovery',
      workoutSnapshot: {
        number: 12,
        type: 'rest',
        smartDayType: 'recovery',
        lifts: [],
        sets: [],
        workoutEffort: 'easy',
      },
    },
    {
      cycle: 3,
      workoutNumber: 13,
      lift: 'Deadlift',
      workoutEffort: 'good',
      workoutSnapshot: {
        number: 13,
        type: 'training',
        smartDayType: 'training',
        lift: 'Deadlift',
        lifts: [
          {
            lift: 'Deadlift',
            prepItems: [],
            warmups: [],
            sets: [
              {
                labelKey: 'topDouble',
                reps: 2,
                pct: 0.775,
                weight: 140,
                done: true,
                effort: 'hard',
              },
              { labelKey: 'backoff', reps: 3, pct: 0.70, weight: 125, done: true },
              { labelKey: 'backoff', reps: 3, pct: 0.70, weight: 125, done: true },
            ],
          },
          {
            lift: 'Squat',
            prepItems: [],
            warmups: [],
            sets: [
              { labelKey: 'workSets', reps: 4, pct: 0.625, weight: 90, done: true },
              { labelKey: 'workSets', reps: 4, pct: 0.625, weight: 90, done: true },
              { labelKey: 'workSets', reps: 4, pct: 0.625, weight: 90, done: true },
            ],
          },
        ],
        prepItems: [],
        warmups: [],
        sets: [],
        accessories: [],
        workoutEffort: 'good',
      },
    },
    {
      cycle: 3,
      workoutNumber: 14,
      lift: 'Deadlift',
      workoutEffort: 'hard',
      workoutSnapshot: {
        number: 14,
        type: 'training',
        smartDayType: 'training',
        lift: 'Deadlift',
        lifts: [
          {
            lift: 'Deadlift',
            prepItems: [],
            warmups: [],
            sets: [
              {
                labelKey: 'topDouble',
                reps: 2,
                pct: 0.80,
                weight: 145,
                done: true,
                effort: 'hard',
              },
              { labelKey: 'backoff', reps: 4, pct: 0.70, weight: 125, done: true },
              { labelKey: 'backoff', reps: 4, pct: 0.70, weight: 125, done: true },
              { labelKey: 'backoff', reps: 4, pct: 0.70, weight: 125, done: true },
              { labelKey: 'backoff', reps: 4, pct: 0.70, weight: 125, done: true },
            ],
          },
          {
            lift: 'Bench',
            prepItems: [],
            warmups: [],
            sets: [
              { labelKey: 'workSets', reps: 4, pct: 0.70, weight: 70, done: true },
              { labelKey: 'workSets', reps: 4, pct: 0.70, weight: 70, done: true },
              { labelKey: 'workSets', reps: 4, pct: 0.70, weight: 70, done: true },
              { labelKey: 'workSets', reps: 4, pct: 0.70, weight: 70, done: true },
            ],
          },
        ],
        prepItems: [],
        warmups: [],
        sets: [],
        accessories: [],
        workoutEffort: 'hard',
      },
    },
  ];

  const workouts = generateWorkoutsForTrainingModel('smart', {
    programProfile: 'kelaniSbdUltra',
    squat: 145,
    bench: 100,
    deadlift: 180,
    history,
    currentIndex: 14,
    currentCycle: 3,
    meetPlannerAttempts: {
      Squat: [132.5, 140, 147.5],
      Bench: [90, 95, 100],
      Deadlift: [167.5, 177.5, 185],
    },
  });

  const decisionWorkout = workouts.find(workout =>
    workout?.smartDecisionSummary
  );

  expect(decisionWorkout).toBeTruthy();
  expect(decisionWorkout.smartDecisionSummary.dayType).toBe('training');
  expect(isMaximalSmartTrainingLift(decisionWorkout, 'Squat')).toBe(false);
  expect(isHeavySmartTrainingLift(decisionWorkout, 'Deadlift')).toBe(false);

  expect(
    decisionWorkout.smartDecisionSummary.readiness.recentHeavyDeadliftDayCount
  ).toBeGreaterThanOrEqual(2);

  expect(
    decisionWorkout.smartDecisionSummary.readiness.recentSquatMaxPct
  ).toBeCloseTo(0.675);
});


test('does not repeat the last training prescription after Rest & recovery', () => {
  const previousTraining = {
    number: 14,
    type: 'training',
    smartDayType: 'training',
    lift: 'Deadlift',
    lifts: [
      {
        lift: 'Deadlift',
        prepItems: [],
        warmups: [],
        sets: [
          {
            labelKey: 'topDouble',
            reps: 2,
            pct: 0.80,
            weight: 145,
            done: true,
            effort: 'good',
          },
          { labelKey: 'backoff', reps: 4, pct: 0.70, weight: 125, done: true },
          { labelKey: 'backoff', reps: 4, pct: 0.70, weight: 125, done: true },
          { labelKey: 'backoff', reps: 4, pct: 0.70, weight: 125, done: true },
          { labelKey: 'backoff', reps: 4, pct: 0.70, weight: 125, done: true },
        ],
      },
      {
        lift: 'Bench',
        prepItems: [],
        warmups: [],
        sets: [
          { labelKey: 'workSets', reps: 4, pct: 0.70, weight: 70, done: true },
          { labelKey: 'workSets', reps: 4, pct: 0.70, weight: 70, done: true },
          { labelKey: 'workSets', reps: 4, pct: 0.70, weight: 70, done: true },
          { labelKey: 'workSets', reps: 4, pct: 0.70, weight: 70, done: true },
        ],
      },
    ],
    prepItems: [],
    warmups: [],
    sets: [],
    accessories: [],
    workoutEffort: 'good',
  };

  const history = [
    {
      cycle: 3,
      workoutNumber: 14,
      lift: 'Deadlift',
      workoutEffort: 'good',
      workoutSnapshot: previousTraining,
    },
    {
      cycle: 3,
      workoutNumber: 15,
      restDay: true,
      workoutEffort: 'easy',
      smartDayType: 'recovery',
      workoutSnapshot: {
        number: 15,
        type: 'rest',
        smartDayType: 'recovery',
        lifts: [],
        sets: [],
        workoutEffort: 'easy',
      },
    },
  ];

  const workouts = generateWorkoutsForTrainingModel('smart', {
    programProfile: 'kelaniSbdUltra',
    squat: 145,
    bench: 100,
    deadlift: 180,
    history,
    currentIndex: 15,
    currentCycle: 3,
    meetPlannerAttempts: {
      Squat: [132.5, 140, 147.5],
      Bench: [90, 95, 100],
      Deadlift: [167.5, 177.5, 185],
    },
  });

  const decisionWorkout = workouts.find(workout =>
    workout?.smartDecisionSummary
  );

  const prescriptionSignature = workout =>
    (workout?.lifts || [])
      .flatMap(liftBlock =>
        (liftBlock.sets || [])
          .filter(set => !set.warmup && !set.isWarmup)
          .map(set => [
            liftBlock.lift,
            set.labelKey || set.label || set.type || '',
            Number(set.reps) || 0,
            Number(set.weight ?? set.originalWeight) || 0,
            Number(set.pct ?? set.originalPct) || 0,
          ].join(':'))
      )
      .filter(Boolean)
      .sort()
      .join('|');

  expect(decisionWorkout).toBeTruthy();
  expect(decisionWorkout.smartDecisionSummary.dayType).toBe('training');
  expect(decisionWorkout.smartDecisionSummary.readiness.lastWasRecoveryIntervention).toBe(true);
  expect(decisionWorkout.smartDecisionSummary.readiness.lastWorkoutLifts).toEqual([
    'Deadlift',
    'Bench',
  ]);
  expect(
    decisionWorkout.smartDecisionSummary.readiness.lastWorkoutPrescriptionSignature
  ).not.toBe('');

  expect(prescriptionSignature(decisionWorkout))
    .not.toBe(prescriptionSignature(previousTraining));
});


test('does not repeat a recent training prescription after another workout and recovery', () => {
  const makeSnapshot = (number, lifts, workoutEffort = 'good') => ({
    number,
    type: 'training',
    smartDayType: 'training',
    lift: lifts[0]?.lift,
    lifts,
    prepItems: [],
    warmups: [],
    sets: [],
    accessories: [],
    workoutEffort,
  });

  const deadliftBench = makeSnapshot(14, [
    {
      lift: 'Deadlift',
      prepItems: [],
      warmups: [],
      sets: [
        { labelKey: 'topDouble', reps: 2, pct: 0.80, weight: 145, done: true },
        { labelKey: 'backoff', reps: 4, pct: 0.70, weight: 125, done: true },
        { labelKey: 'backoff', reps: 4, pct: 0.70, weight: 125, done: true },
        { labelKey: 'backoff', reps: 4, pct: 0.70, weight: 125, done: true },
        { labelKey: 'backoff', reps: 4, pct: 0.70, weight: 125, done: true },
      ],
    },
    {
      lift: 'Bench',
      prepItems: [],
      warmups: [],
      sets: [
        { labelKey: 'workSets', reps: 4, pct: 0.70, weight: 67.5, done: true },
        { labelKey: 'workSets', reps: 4, pct: 0.70, weight: 67.5, done: true },
        { labelKey: 'workSets', reps: 4, pct: 0.70, weight: 67.5, done: true },
        { labelKey: 'workSets', reps: 4, pct: 0.70, weight: 67.5, done: true },
      ],
    },
  ]);

  const squatBench = makeSnapshot(15, [
    {
      lift: 'Squat',
      prepItems: [],
      warmups: [],
      sets: [
        {
          labelKey: 'topTriple',
          reps: 3,
          pct: 0.775,
          weight: 112.5,
          done: false,
          skipped: true,
        },
        { labelKey: 'backoff', reps: 5, pct: 0.675, weight: 97.5, done: true },
        { labelKey: 'backoff', reps: 5, pct: 0.675, weight: 97.5, done: true },
      ],
    },
    {
      lift: 'Bench',
      prepItems: [],
      warmups: [],
      sets: [
        { labelKey: 'workSets', reps: 4, pct: 0.65, weight: 62.5, done: true },
        { labelKey: 'workSets', reps: 4, pct: 0.65, weight: 62.5, done: true },
        { labelKey: 'workSets', reps: 4, pct: 0.65, weight: 62.5, done: true },
        { labelKey: 'workSets', reps: 4, pct: 0.65, weight: 62.5, done: true },
      ],
    },
  ], 'tooMuch');

  const history = [
    {
      cycle: 3,
      workoutNumber: 14,
      lift: 'Deadlift',
      workoutEffort: 'good',
      workoutSnapshot: deadliftBench,
    },
    {
      cycle: 3,
      workoutNumber: 15,
      lift: 'Squat',
      workoutEffort: 'tooMuch',
      failedOrSkippedSetCount: 1,
      workoutSnapshot: squatBench,
    },
    {
      cycle: 3,
      workoutNumber: 16,
      restDay: true,
      workoutEffort: 'easy',
      smartDayType: 'recovery',
      workoutSnapshot: {
        number: 16,
        type: 'rest',
        smartDayType: 'recovery',
        lifts: [],
        sets: [],
        workoutEffort: 'easy',
      },
    },
  ];

  const workouts = generateWorkoutsForTrainingModel('smart', {
    programProfile: 'kelaniSbdUltra',
    squat: 145,
    bench: 100,
    deadlift: 180,
    history,
    currentIndex: 16,
    currentCycle: 3,
    meetPlannerAttempts: {
      Squat: [132.5, 140, 147.5],
      Bench: [90, 95, 100],
      Deadlift: [167.5, 177.5, 185],
    },
  });

  const decisionWorkout = workouts.find(workout =>
    workout?.smartDecisionSummary
  );

  const signature = workout =>
    (workout?.lifts || [])
      .flatMap(liftBlock =>
        (liftBlock.sets || [])
          .filter(set => !set.warmup && !set.isWarmup)
          .map(set => [
            liftBlock.lift,
            set.labelKey || set.label || set.type || '',
            Number(set.reps) || 0,
            Number(set.weight ?? set.originalWeight) || 0,
            Number(set.pct ?? set.originalPct) || 0,
          ].join(':'))
      )
      .sort()
      .join('|');

  expect(decisionWorkout).toBeTruthy();
  expect(
    decisionWorkout.smartDecisionSummary.readiness
      .recentTrainingPrescriptionSignatures
  ).toHaveLength(2);

  if (decisionWorkout.smartDecisionSummary.dayType === 'training') {
    expect(signature(decisionWorkout)).not.toBe(signature(deadliftBench));
  } else {
    expect(decisionWorkout.smartDecisionSummary.dayType).toBe('recovery');
  }
});

test('explains fatigue with score and previous workout effort', () => {
  expect(
    getSmartMeetdayBlockerDisplayLabels(
      ['fatigue', 'meet-plan-not-ready'],
      {},
      {
        recentFatigueScore: 1,
        lastWorkoutEffort: 'hard',
      }
    )
  ).toEqual([
    'fatigue 1/2 (previous workout HARD)',
    'meet plan',
  ]);
});


test('splits training fallback details into separate modal rows', () => {
  expect(
    getSmartModalDetailRows({
      smartDecisionSummary: {
        dayType: 'training',
        reason: 'training-fallback',
        readiness: {
          meetPlanReady: false,
          meetdayBlockers: ['meet-plan-not-ready', 'fatigue'],
          recentFatigueScore: 1,
          recentFailedOrSkippedSetCount: 0,
          lastWorkoutEffort: 'hard',
        },
      },
    })
  ).toEqual([
    {
      label: 'Current blocker',
      value: 'Meet plan not ready',
    },
    {
      label: 'Fatigue',
      value: '1 — below recovery threshold',
    },
    {
      label: 'Cause',
      value: 'Previous workout HARD',
    },
    {
      label: 'Failed',
      value: '0/2 — below deload threshold',
    },
  ]);
});

test('shows structured recovery details without a combined Reason row', () => {
  expect(
    getSmartModalDetailRows({
      smartDecisionSummary: {
        dayType: 'recovery',
        reason: 'fatigue-recovery',
        readiness: {
          recentFatigueScore: 4,
          recentFailedOrSkippedSetCount: 1,
          lastWorkoutEffort: 'tooMuch',
        },
      },
    })
  ).toEqual([
    {
      label: 'Fatigue',
      value: '4 — recovery required',
    },
    {
      label: 'Cause',
      value: 'Previous workout TOOMUCH',
    },
    {
      label: 'Failed',
      value: '1/2 — below deload threshold',
    },
  ]);
});

test('generates progressive C3W18 training without template prescriptions', () => {
  const makeSnapshot = ({
    number,
    lifts,
    workoutEffort = 'good',
  }) => ({
    number,
    type: 'training',
    smartDayType: 'training',
    lift: lifts[0]?.lift || null,
    lifts,
    sets: [],
    warmups: [],
    prepItems: [],
    accessories: [],
    workoutEffort,
  });

  const history = [
    {
      cycle: 3,
      workoutNumber: 13,
      lift: 'Deadlift',
      topWeight: 140,
      topReps: 2,
      e1rm: 149,
      workoutEffort: 'good',
      workoutSnapshot: makeSnapshot({
        number: 13,
        lifts: [
          {
            lift: 'Deadlift',
            sets: [
              {
                labelKey: 'topDouble',
                reps: 2,
                pct: 0.775,
                weight: 140,
                done: true,
              },
              {
                labelKey: 'backoff',
                reps: 3,
                pct: 0.70,
                weight: 125,
                done: true,
              },
              {
                labelKey: 'backoff',
                reps: 3,
                pct: 0.70,
                weight: 125,
                done: true,
              },
            ],
          },
          {
            lift: 'Squat',
            sets: [
              {
                labelKey: 'workSets',
                reps: 4,
                pct: 0.625,
                weight: 90,
                done: true,
              },
              {
                labelKey: 'workSets',
                reps: 4,
                pct: 0.625,
                weight: 90,
                done: true,
              },
              {
                labelKey: 'workSets',
                reps: 4,
                pct: 0.625,
                weight: 90,
                done: true,
              },
            ],
          },
        ],
      }),
    },
    {
      cycle: 3,
      workoutNumber: 14,
      lift: 'Deadlift',
      topWeight: 145,
      topReps: 2,
      e1rm: 155,
      workoutEffort: 'hard',
      workoutSnapshot: makeSnapshot({
        number: 14,
        workoutEffort: 'hard',
        lifts: [
          {
            lift: 'Deadlift',
            sets: [
              {
                labelKey: 'topDouble',
                reps: 2,
                pct: 0.80,
                weight: 145,
                done: true,
              },
              ...Array.from({ length: 4 }, () => ({
                labelKey: 'backoff',
                reps: 4,
                pct: 0.70,
                weight: 125,
                done: true,
              })),
            ],
          },
          {
            lift: 'Bench',
            sets: Array.from({ length: 4 }, () => ({
              labelKey: 'workSets',
              reps: 4,
              pct: 0.70,
              weight: 70,
              done: true,
            })),
          },
        ],
      }),
    },
    {
      cycle: 3,
      workoutNumber: 15,
      lift: 'Squat',
      topWeight: 112.5,
      topReps: 3,
      e1rm: 124,
      workoutEffort: 'tooMuch',
      failedOrSkippedSetCount: 1,
      workoutSnapshot: makeSnapshot({
        number: 15,
        workoutEffort: 'tooMuch',
        lifts: [
          {
            lift: 'Squat',
            sets: [
              {
                labelKey: 'topTriple',
                reps: 3,
                pct: 0.775,
                weight: 112.5,
                done: false,
                skipped: true,
              },
              {
                labelKey: 'backoff',
                reps: 5,
                pct: 0.675,
                weight: 97.5,
                done: true,
              },
              {
                labelKey: 'backoff',
                reps: 5,
                pct: 0.675,
                weight: 97.5,
                done: true,
              },
            ],
          },
        ],
      }),
    },
    {
      cycle: 3,
      workoutNumber: 16,
      restDay: true,
      workoutEffort: 'easy',
      smartDayType: 'recovery',
      workoutSnapshot: {
        number: 16,
        type: 'rest',
        smartDayType: 'recovery',
        lifts: [],
        sets: [],
        workoutEffort: 'easy',
      },
    },
    {
      cycle: 3,
      workoutNumber: 17,
      lift: 'Bench',
      topWeight: 82.5,
      topReps: 2,
      e1rm: 88,
      workoutEffort: 'good',
      workoutSnapshot: makeSnapshot({
        number: 17,
        lifts: [
          {
            lift: 'Bench',
            sets: [
              {
                labelKey: 'topDouble',
                reps: 2,
                pct: 0.825,
                weight: 82.5,
                done: true,
              },
              ...Array.from({ length: 3 }, () => ({
                labelKey: 'backoff',
                reps: 4,
                pct: 0.725,
                weight: 72.5,
                done: true,
              })),
            ],
          },
          {
            lift: 'Deadlift',
            sets: Array.from({ length: 3 }, () => ({
              labelKey: 'workSets',
              reps: 3,
              pct: 0.625,
              weight: 112.5,
              done: true,
            })),
          },
        ],
      }),
    },
  ];

  const workouts = generateWorkoutsForTrainingModel('smart', {
    programProfile: 'kelaniSbdUltra',
    squat: 145,
    bench: 100,
    deadlift: 180,
    history,
    currentIndex: 17,
    currentCycle: 3,
    meetPlannerAttempts: {
      Squat: [132.5, 140, 147.5],
      Bench: [90, 95, 100],
      Deadlift: [167.5, 177.5, 185],
    },
  });

  const decisionWorkout = workouts.find(workout =>
    workout?.smartDecisionSummary
  );

  expect(decisionWorkout).toBeTruthy();
  expect(decisionWorkout.smartDecisionSummary.dayType)
    .toBe('training');
  expect(decisionWorkout.smartGeneratedPrescription)
    .toBe(true);
  expect(decisionWorkout.smartSourceWorkoutNumber)
    .toBeNull();
  expect(
    decisionWorkout.smartTrainingSelectionSummary
      .templateIndependent
  ).toBe(true);

  expect(
    decisionWorkout.smartTrainingSelectionSummary
      .reasonFlags
  ).toContain('projected-frequency-guard');
  expect(
    decisionWorkout.smartTrainingSelectionSummary
      .frequencyExposureCounts
  ).toEqual({
    Squat: 2,
    Bench: 2,
    Deadlift: 3,
  });
  expect(
    decisionWorkout.smartTrainingSelectionSummary
      .frequencyEligibleLifts
  ).toEqual(['Squat', 'Bench']);
  expect(
    decisionWorkout.lifts.map(liftBlock => liftBlock.lift)
  ).toEqual(['Squat', 'Bench']);
  expect(
    decisionWorkout.smartDecisionSummary.readiness
      .meetPlanWeakestLift
  ).toBe('Squat');

  decisionWorkout.lifts.forEach(liftBlock => {
    const volumeSets = liftBlock.sets.filter(set =>
      ['backoff', 'workSets'].includes(set.labelKey)
    );

    expect(volumeSets.length).toBeGreaterThanOrEqual(2);
    expect(volumeSets.length).toBeLessThanOrEqual(6);
    expect(
      ((liftBlock.warmups || []).length + (liftBlock.sets || []).length) % 3
    ).toBe(0);
    volumeSets.forEach(set => {
      expect(set.reps).toBeGreaterThanOrEqual(4);
      expect(set.reps).toBeLessThanOrEqual(6);
    });
  });

  const c3w18Snapshot = makeSnapshot({
    number: 18,
    workoutEffort: 'hard',
    lifts: [
      {
        lift: 'Deadlift',
        role: 'primary',
        sets: [
          {
            labelKey: 'topDouble',
            reps: 2,
            pct: 0.825,
            weight: 147.5,
            done: true,
          },
          ...Array.from({ length: 4 }, () => ({
            labelKey: 'backoff',
            reps: 4,
            pct: 0.725,
            weight: 130,
            done: true,
          })),
        ],
      },
      {
        lift: 'Squat',
        role: 'secondary',
        sets: Array.from({ length: 4 }, () => ({
          labelKey: 'workSets',
          reps: 4,
          pct: 0.65,
          weight: 95,
          done: true,
        })),
      },
    ],
  });

  const c3w19Workouts = generateWorkoutsForTrainingModel(
    'smart',
    {
      programProfile: 'kelaniSbdUltra',
      squat: 145,
      bench: 100,
      deadlift: 180,
      history: [
        ...history,
        {
          cycle: 3,
          workoutNumber: 18,
          lift: 'Deadlift',
          topWeight: 147.5,
          topReps: 2,
          e1rm: 157.33,
          workoutEffort: 'hard',
          workoutSnapshot: c3w18Snapshot,
        },
        {
          cycle: 3,
          workoutNumber: 18,
          lift: 'Squat',
          topWeight: 95,
          topReps: 4,
          e1rm: 107.67,
          workoutEffort: 'hard',
          workoutSnapshot: c3w18Snapshot,
        },
      ],
      currentIndex: 18,
      currentCycle: 3,
      meetPlannerAttempts: {
        Squat: [132.5, 140, 147.5],
        Bench: [90, 95, 100],
        Deadlift: [167.5, 177.5, 185],
      },
    }
  );

  const c3w19 = c3w19Workouts.find(workout =>
    workout?.smartDecisionSummary
  );

  expect(c3w19).toBeTruthy();
  expect(c3w19.lifts.map(liftBlock => liftBlock.lift))
    .toEqual(['Bench']);
  expect(c3w19.smartTrainingSelectionSummary.primaryLift)
    .toBe('Bench');
  expect(c3w19.smartTrainingSelectionSummary.secondaryLift)
    .toBeNull();
  const c3w19BenchBackoffs = c3w19.lifts[0].sets.filter(
    set => set.labelKey === 'backoff'
  );

  expect(c3w19BenchBackoffs).toHaveLength(6);
  c3w19BenchBackoffs.forEach(set => {
    expect(set).toMatchObject({
      reps: 6,
      pct: 0.70,
      weight: 70,
    });
  });
  expect(
    c3w19.smartTrainingSelectionSummary
      .frequencyExposureCounts
  ).toEqual({
    Squat: 3,
    Bench: 2,
    Deadlift: 4,
  });
  expect(
    c3w19.smartTrainingSelectionSummary
      .frequencyEligibleLifts
  ).toEqual(['Squat', 'Bench']);
  expect(
    c3w19.smartTrainingSelectionSummary.reasonFlags
  ).toContain('projected-frequency-guard');
});
