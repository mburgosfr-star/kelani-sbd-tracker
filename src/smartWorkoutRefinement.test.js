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
      label: 'Meet status',
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
      label: 'Failed/skipped',
      value: '0/2 — deload threshold',
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
      label: 'Failed/skipped',
      value: '1/2 — deload threshold',
    },
  ]);
});
