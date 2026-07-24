import {
  constrainSmartWorkoutByFrequency,
  getSmartFrequencyPolicyDecision,
  isHeavySmartLiftBlock,
  roundBarbellWeight,
} from './smartFrequencyPolicy';

function makeLiftBlock(lift, heavy = false, setCount = 1) {
  return {
    lift,
    role: heavy ? 'primary' : 'secondary',
    sets: Array.from({ length: setCount }, (_, index) => ({
      id: `${lift}-${heavy ? 'heavy' : 'light'}-${index + 1}`,
      labelKey: heavy ? 'topDouble' : 'workSets',
      pct: heavy ? 0.825 : 0.725,
      reps: heavy ? 2 : 4,
    })),
  };
}

function addWorkout(history, cycle, workoutNumber, lifts = []) {
  if (lifts.length === 0) {
    history.push({
      cycle,
      workoutNumber,
      restDay: true,
      workoutSnapshot: { type: 'rest' },
    });
    return;
  }

  lifts.forEach(({ lift, heavy }) => {
    history.push({
      cycle,
      workoutNumber,
      lift,
      workoutSnapshot: {
        type: 'training',
        lifts: [makeLiftBlock(lift, heavy)],
      },
    });
  });
}

describe('barbell and meet rounding', () => {
  test.each([
    [100, 100],
    [101.2, 100],
    [102.4, 100],
    [102.5, 105],
    [107.4, 105],
    [107.5, 110],
  ])('rounds %s kg to %s kg for gym prescriptions', (input, expected) => {
    expect(roundBarbellWeight(input)).toBe(expected);
  });

  test('rounds upward to the next available 5 kg load', () => {
    expect(roundBarbellWeight(100.1, 'up')).toBe(105);
    expect(roundBarbellWeight(105, 'up')).toBe(105);
  });

  test('treats a top triple as heavy but 4x4 at 72.5% as light', () => {
    expect(isHeavySmartLiftBlock(makeLiftBlock('Squat', true))).toBe(true);
    expect(isHeavySmartLiftBlock(makeLiftBlock('Bench', false))).toBe(false);
  });
});

describe('Smart rolling seven-workout frequency policy', () => {
  test('C3W25 becomes recovery when Squat and Deadlift are both blocked', () => {
    const history = [];
    addWorkout(history, 3, 19, [{ lift: 'Bench', heavy: false }]);
    addWorkout(history, 3, 20, [
      { lift: 'Bench', heavy: true },
      { lift: 'Deadlift', heavy: false },
    ]);
    addWorkout(history, 3, 21);
    addWorkout(history, 3, 22, [
      { lift: 'Squat', heavy: false },
      { lift: 'Bench', heavy: false },
    ]);
    addWorkout(history, 3, 23, [{ lift: 'Squat', heavy: true }]);
    addWorkout(history, 3, 24, [
      { lift: 'Squat', heavy: true },
      { lift: 'Deadlift', heavy: true },
    ]);

    const result = constrainSmartWorkoutByFrequency({
      history,
      currentCycle: 3,
      workoutNumber: 25,
      candidateWorkout: {
        number: 25,
        type: 'training',
        lift: 'Squat',
        lifts: [
          makeLiftBlock('Squat', false),
          makeLiftBlock('Deadlift', false),
        ],
      },
      availableWorkouts: [],
      currentIndex: 0,
    });

    expect(result.changed).toBe(true);
    expect(result.workout.type).toBe('rest');
    expect(result.workout.lifts).toEqual([]);
    expect(result.decision.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        lift: 'Squat',
        reasons: expect.arrayContaining(['rolling-window-maximum', 'consecutive-lift']),
      }),
      expect.objectContaining({
        lift: 'Deadlift',
        reasons: expect.arrayContaining(['rolling-window-maximum', 'consecutive-lift']),
      }),
    ]));
  });

  test('C3W26 builds complete heavy Bench beside light Deadlift', () => {
    const history = [];
    addWorkout(history, 3, 20, [
      { lift: 'Bench', heavy: true },
    ]);
    addWorkout(history, 3, 21);
    addWorkout(history, 3, 22, [
      { lift: 'Squat', heavy: false },
      { lift: 'Bench', heavy: false },
    ]);
    addWorkout(history, 3, 23, [
      { lift: 'Squat', heavy: true },
      { lift: 'Bench', heavy: false },
    ]);
    addWorkout(history, 3, 24, [
      { lift: 'Squat', heavy: true },
      { lift: 'Deadlift', heavy: true },
    ]);
    addWorkout(history, 3, 25);

    const lightDeadlift = {
      ...makeLiftBlock('Deadlift', false, 3),
      warmups: [
        { id: 'deadlift-warmup-1', reps: 5, weight: 20, pct: 0.10 },
        { id: 'deadlift-warmup-2', reps: 5, weight: 70, pct: 0.40 },
        { id: 'deadlift-warmup-3', reps: 4, weight: 120, pct: 0.65 },
      ],
      smartPrescription: {
        role: 'secondary',
        volumeAnchorPct: 0.725,
        plannedVolumePct: 0.725,
        gridItemCount: 6,
      },
    };
    const supplementalBench = {
      lift: 'Bench',
      warmups: [
        { id: 'bench-warmup-1', reps: 5, weight: 20, pct: 0.20 },
        { id: 'bench-warmup-2', reps: 2, weight: 60, pct: 0.60 },
      ],
      sets: [
        {
          id: 'bench-top-single',
          labelKey: 'topSingle',
          reps: 1,
          weight: 90,
          originalWeight: 90,
          pct: 0.90,
          originalPct: 0.90,
        },
        {
          id: 'bench-old-backoff',
          labelKey: 'backoff',
          reps: 2,
          weight: 65,
          originalWeight: 65,
          pct: 0.65,
          originalPct: 0.65,
        },
      ],
    };
    const candidateWorkout = {
      number: 26,
      type: 'training',
      lift: 'Squat',
      lifts: [
        makeLiftBlock('Squat', false, 4),
        lightDeadlift,
      ],
      smartTrainingSelectionSummary: {
        primaryLift: 'Squat',
        secondaryLift: 'Deadlift',
      },
    };
    const availableWorkouts = [
      candidateWorkout,
      {
        number: 27,
        type: 'training',
        lift: 'Bench',
        lifts: [supplementalBench],
      },
    ];

    const result = constrainSmartWorkoutByFrequency({
      history,
      currentCycle: 3,
      workoutNumber: 26,
      candidateWorkout,
      availableWorkouts,
      currentIndex: 0,
    });

    expect(result.workout.type).toBe('training');
    expect(result.workout.lifts.map(({ lift }) => lift))
      .toEqual(['Bench', 'Deadlift']);
    expect(result.workout.lift).toBe('Bench');

    const bench = result.workout.lifts[0];
    expect(bench.role).toBe('primary');
    expect(bench.warmups.map(({ weight, reps }) => [weight, reps]))
      .toEqual([[20, 5], [70, 3]]);
    expect(bench.sets.map(({ weight, reps }) => [weight, reps]))
      .toEqual([
        [90, 1],
        [75, 5],
        [75, 5],
        [75, 5],
      ]);
    expect(bench.smartPrescription).toMatchObject({
      role: 'primary',
      topSetAnchorPct: 0.90,
      volumeAnchorPct: 0.75,
      plannedVolumePct: 0.75,
      gridItemCount: 6,
    });

    const deadlift = result.workout.lifts[1];
    expect(deadlift.role).toBe('secondary');
    expect(deadlift.sets).toHaveLength(3);
    expect(deadlift.warmups[2]).toMatchObject({
      weight: 120,
      reps: 5,
    });

    expect(result.summary.supplementedLifts).toEqual(['Bench']);
    expect(result.summary.countsAfter.Bench).toEqual({
      total: 4,
      heavy: 2,
      light: 2,
    });
    expect(result.summary.countsAfter.Deadlift).toEqual({
      total: 2,
      heavy: 1,
      light: 1,
    });
    expect(result.workout.smartTrainingSelectionSummary.primaryLift)
      .toBe('Bench');
    expect(result.workout.smartTrainingSelectionSummary.secondaryLift)
      .toBe('Deadlift');
  });

  test('a fallback single light Deadlift receives six real work sets', () => {
    const history = [];
    addWorkout(history, 3, 20, [
      { lift: 'Bench', heavy: true },
    ]);
    addWorkout(history, 3, 21);
    addWorkout(history, 3, 22, [
      { lift: 'Squat', heavy: false },
      { lift: 'Bench', heavy: false },
    ]);
    addWorkout(history, 3, 23, [
      { lift: 'Squat', heavy: true },
      { lift: 'Bench', heavy: false },
    ]);
    addWorkout(history, 3, 24, [
      { lift: 'Squat', heavy: true },
      { lift: 'Deadlift', heavy: true },
    ]);
    addWorkout(history, 3, 25);

    const result = constrainSmartWorkoutByFrequency({
      history,
      currentCycle: 3,
      workoutNumber: 26,
      candidateWorkout: {
        number: 26,
        type: 'training',
        lift: 'Squat',
        lifts: [
          makeLiftBlock('Squat', false, 4),
          {
            ...makeLiftBlock('Deadlift', false, 3),
            reason: 'Lower volume for the secondary lift.',
          },
        ],
      },
      availableWorkouts: [],
      currentIndex: 0,
    });

    expect(result.workout.lifts.map(({ lift }) => lift)).toEqual(['Deadlift']);
    expect(result.workout.lifts[0].sets).toHaveLength(6);
    expect(result.workout.sets).toHaveLength(6);
    expect(result.workout.lifts[0].reason)
      .toBe('Full volume for single-lift training.');
    expect(result.summary.singleLiftVolumeExpanded).toBe(true);
  });

  test('never permits consecutive Squat or Deadlift', () => {
    const history = [];
    addWorkout(history, 1, 1, [
      { lift: 'Squat', heavy: false },
      { lift: 'Deadlift', heavy: false },
    ]);

    const decision = getSmartFrequencyPolicyDecision({
      history,
      currentCycle: 1,
      workoutNumber: 2,
      candidateWorkout: {
        type: 'training',
        lifts: [
          makeLiftBlock('Squat', true),
          makeLiftBlock('Deadlift', true),
        ],
      },
    });

    expect(decision.validLiftBlocks).toHaveLength(0);
    expect(decision.blockers.every(({ reasons }) => reasons.includes('consecutive-lift'))).toBe(true);
  });

  test('permits consecutive Bench only when the second exposure is light', () => {
    const history = [];
    addWorkout(history, 1, 1, [{ lift: 'Bench', heavy: true }]);

    const heavyDecision = getSmartFrequencyPolicyDecision({
      history,
      currentCycle: 1,
      workoutNumber: 2,
      candidateWorkout: {
        type: 'training',
        lifts: [makeLiftBlock('Bench', true)],
      },
    });
    const lightDecision = getSmartFrequencyPolicyDecision({
      history,
      currentCycle: 1,
      workoutNumber: 2,
      candidateWorkout: {
        type: 'training',
        lifts: [makeLiftBlock('Bench', false)],
      },
    });

    expect(heavyDecision.validLiftBlocks).toHaveLength(0);
    expect(heavyDecision.blockers[0].reasons).toContain('consecutive-heavy-lift');
    expect(lightDecision.validLiftBlocks).toHaveLength(1);
  });

  test('enforces 3/4/2 totals and heavy-light caps', () => {
    const history = [];
    addWorkout(history, 1, 1, [
      { lift: 'Squat', heavy: true },
      { lift: 'Bench', heavy: true },
    ]);
    addWorkout(history, 1, 2, [
      { lift: 'Bench', heavy: false },
      { lift: 'Deadlift', heavy: true },
    ]);
    addWorkout(history, 1, 3);
    addWorkout(history, 1, 4, [
      { lift: 'Squat', heavy: false },
      { lift: 'Deadlift', heavy: false },
    ]);
    addWorkout(history, 1, 5, [{ lift: 'Bench', heavy: true }]);
    addWorkout(history, 1, 6, [
      { lift: 'Squat', heavy: true },
      { lift: 'Bench', heavy: false },
    ]);

    const decision = getSmartFrequencyPolicyDecision({
      history,
      currentCycle: 1,
      workoutNumber: 7,
      candidateWorkout: {
        type: 'training',
        lifts: [
          makeLiftBlock('Squat', false),
          makeLiftBlock('Bench', false),
          makeLiftBlock('Deadlift', false),
        ],
      },
    });

    expect(decision.validLiftBlocks).toHaveLength(0);
    expect(decision.blockers.map(({ lift }) => lift).sort()).toEqual(
      ['Bench', 'Deadlift', 'Squat'],
    );
  });

  test('filters an invalid lift but keeps a valid lift from the same workout', () => {
    const history = [];
    addWorkout(history, 1, 1, [{ lift: 'Squat', heavy: false }]);

    const result = constrainSmartWorkoutByFrequency({
      history,
      currentCycle: 1,
      workoutNumber: 2,
      candidateWorkout: {
        type: 'training',
        lift: 'Squat',
        lifts: [
          makeLiftBlock('Squat', true),
          makeLiftBlock('Bench', false, 3),
        ],
        accessories: [{ name: 'example' }],
      },
      availableWorkouts: [],
      currentIndex: 0,
    });

    expect(result.workout.type).toBe('training');
    expect(result.workout.lift).toBe('Bench');
    expect(result.workout.lifts.map(({ lift }) => lift)).toEqual(['Bench']);
    expect(result.workout.lifts[0].sets).toHaveLength(6);
    expect(result.workout.accessories).toEqual([]);
  });

  test('a rest workout breaks the consecutive restriction', () => {
    const history = [];
    addWorkout(history, 1, 1, [{ lift: 'Squat', heavy: true }]);
    addWorkout(history, 1, 2);

    const decision = getSmartFrequencyPolicyDecision({
      history,
      currentCycle: 1,
      workoutNumber: 3,
      candidateWorkout: {
        type: 'training',
        lifts: [makeLiftBlock('Squat', false)],
      },
    });

    expect(decision.validLiftBlocks).toHaveLength(1);
  });

  test('keeps rolling order correct across cycle boundaries', () => {
    const history = [];
    addWorkout(history, 1, 31, [{ lift: 'Deadlift', heavy: true }]);
    addWorkout(history, 2, 1);

    const decision = getSmartFrequencyPolicyDecision({
      history,
      currentCycle: 2,
      workoutNumber: 2,
      candidateWorkout: {
        type: 'training',
        lifts: [makeLiftBlock('Deadlift', false)],
      },
    });

    expect(decision.validLiftBlocks).toHaveLength(1);
  });
});
