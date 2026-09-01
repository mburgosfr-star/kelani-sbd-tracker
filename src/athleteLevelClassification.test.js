import { ATHLETE_LEVEL_THRESHOLDS, calculateBestMaxesFromHistory, calculateEStrengthRatio, calculateStrengthRatioMaxes, classifyAthleteLevel, getAthleteLevel, getCelebratedStrengthRatioMaxes, mergeStrengthRatioMaxes, roundE1RM } from './workoutHistoryStats';

test('preserves raw historical graph values while current e1RM can be rounded separately', () => {
  const seedHistory = [
    { cycle: 0, workoutNumber: 0, seedMax: true, lift: 'Squat', topWeight: 142.5, e1rm: 142.5 },
    { cycle: 0, workoutNumber: 0, seedMax: true, lift: 'Bench', topWeight: 97.5, e1rm: 97.5 },
    { cycle: 0, workoutNumber: 0, seedMax: true, lift: 'Deadlift', topWeight: 180, e1rm: 180 },
  ];
  const baseline = calculateBestMaxesFromHistory(seedHistory);
  const current = calculateBestMaxesFromHistory([
    ...seedHistory,
    { cycle: 3, workoutNumber: 45, lift: 'Squat', e1rm: 148 },
    { cycle: 3, workoutNumber: 41, lift: 'Bench', e1rm: 99 },
    { cycle: 3, workoutNumber: 46, lift: 'Deadlift', e1rm: 182.49 },
  ]);

  expect(baseline.Squat.e1rm).toBe(142.5);
  expect(baseline.Bench.e1rm).toBe(97.5);
  expect(current.Squat.e1rm).toBe(148);
  expect(current.Bench.e1rm).toBe(99);
  expect(current.Deadlift.e1rm).toBe(182.49);
  expect(roundE1RM(current.Squat.e1rm)).toBe(147.5);
  expect(roundE1RM(current.Bench.e1rm)).toBe(100);
  expect(roundE1RM(current.Deadlift.e1rm)).toBe(182.5);
});

describe('classifyAthleteLevel', () => {
  test.each([
    [0, 'beginner'],
    [2.99, 'beginner'],
    [3, 'intermediate'],
    [5.99, 'intermediate'],
    [6, 'advanced'],
    [8.99, 'advanced'],
    [9, 'elite'],
    [15, 'elite'],
  ])('classifies an eStrength ratio of %s as %s', (ratio, expectedLevel) => {
    expect(classifyAthleteLevel(ratio)).toBe(expectedLevel);
  });

  test('treats a missing/non-finite ratio as beginner (safe default for no demonstrated data)', () => {
    expect(classifyAthleteLevel(null)).toBe('beginner');
    expect(classifyAthleteLevel(undefined)).toBe('beginner');
    expect(classifyAthleteLevel(NaN)).toBe('beginner');
  });

  test('never differs by any input other than the ratio itself (no sex/gender split)', () => {
    // classifyAthleteLevel takes only a ratio - there is no parameter through
    // which sex/gender could influence the result, by design.
    expect(classifyAthleteLevel.length).toBe(1);
  });
});

describe('ATHLETE_LEVEL_THRESHOLDS', () => {
  test('tiers are contiguous with no gaps or overlaps', () => {
    expect(ATHLETE_LEVEL_THRESHOLDS.beginner).toEqual({ min: 0, max: 3 });
    expect(ATHLETE_LEVEL_THRESHOLDS.intermediate).toEqual({ min: 3, max: 6 });
    expect(ATHLETE_LEVEL_THRESHOLDS.advanced).toEqual({ min: 6, max: 9 });
    expect(ATHLETE_LEVEL_THRESHOLDS.elite).toEqual({ min: 9, max: Infinity });
  });
});

describe('calculateEStrengthRatio / getAthleteLevel', () => {
  test('derives the ratio from best e1RM across prs and history, divided by latest body weight', () => {
    const ratio = calculateEStrengthRatio({
      prs: { Squat: 150, Bench: 100, Deadlift: 180 },
      history: [],
      bodyWeights: [{ bodyWeight: 80 }],
    });

    expect(ratio).toBeCloseTo(5.38, 2);
    expect(getAthleteLevel({
      prs: { Squat: 150, Bench: 100, Deadlift: 180 },
      history: [],
      bodyWeights: [{ bodyWeight: 80 }],
    })).toBe('intermediate');
  });

  test('returns null/beginner when no body weight has been logged yet', () => {
    expect(calculateEStrengthRatio({ prs: { Squat: 150, Bench: 100, Deadlift: 180 }, history: [], bodyWeights: [] })).toBeNull();
    expect(getAthleteLevel({ prs: { Squat: 150, Bench: 100, Deadlift: 180 }, history: [], bodyWeights: [] })).toBe('beginner');
  });

  test('uses eStrength Max for a stable level when a later weigh-in is heavier', () => {
    const input = {
      prs: { Squat: 150, Bench: 100, Deadlift: 180 },
      history: [
        { cycle: 1, workoutNumber: 0, seedMax: true, lift: 'Squat', topWeight: 150, e1rm: 150 },
        { cycle: 1, workoutNumber: 0, seedMax: true, lift: 'Bench', topWeight: 100, e1rm: 100 },
        { cycle: 1, workoutNumber: 0, seedMax: true, lift: 'Deadlift', topWeight: 180, e1rm: 180 },
      ],
      bodyWeights: [
        { cycle: 1, workoutNumber: 0, bodyWeight: 70 },
        { cycle: 1, workoutNumber: 1, bodyWeight: 80 },
      ],
    };

    expect(calculateEStrengthRatio(input)).toBeCloseTo(5.38, 2);
    expect(calculateStrengthRatioMaxes(input)).toEqual({
      strengthMax: 6.14,
      eStrengthMax: 6.14,
    });
    expect(getAthleteLevel(input)).toBe('advanced');
  });

  test('an e1RM-only PR raises eStrength Max without inventing a Strength Max record', () => {
    const history = [
      { cycle: 0, workoutNumber: 0, seedMax: true, lift: 'Squat', topWeight: 100, e1rm: 100 },
      { cycle: 0, workoutNumber: 0, seedMax: true, lift: 'Bench', topWeight: 75, e1rm: 75 },
      { cycle: 0, workoutNumber: 0, seedMax: true, lift: 'Deadlift', topWeight: 125, e1rm: 125 },
      { cycle: 1, workoutNumber: 1, lift: 'Squat', topWeight: 100, topReps: 2, e1rm: 107.5 },
    ];
    const result = calculateStrengthRatioMaxes({
      prs: { Squat: 107.5, Bench: 75, Deadlift: 125 },
      oneRMs: { Squat: 100, Bench: 75, Deadlift: 125 },
      history,
      bodyWeights: [{ cycle: 1, workoutNumber: 0, bodyWeight: 80 }],
    });

    expect(result).toEqual({
      strengthMax: 3.75,
      eStrengthMax: 3.84,
    });
  });

  test('never substitutes e1RMs for missing real 1RMs at a historical weigh-in', () => {
    const before = calculateStrengthRatioMaxes({
      prs: { Squat: 100, Bench: 75, Deadlift: 125 },
      oneRMs: { Squat: 95, Bench: 70, Deadlift: 120 },
      history: [],
      bodyWeights: [{ cycle: 1, workoutNumber: 0, bodyWeight: 80 }],
    });
    const after = calculateStrengthRatioMaxes({
      prs: { Squat: 107.5, Bench: 75, Deadlift: 125 },
      oneRMs: { Squat: 95, Bench: 70, Deadlift: 120 },
      history: [{
        cycle: 1,
        workoutNumber: 1,
        lift: 'Squat',
        topWeight: 100,
        topReps: 2,
        e1rm: 107.5,
      }],
      bodyWeights: [{ cycle: 1, workoutNumber: 0, bodyWeight: 80 }],
    });

    expect(before).toEqual({ strengthMax: 3.56, eStrengthMax: 3.75 });
    expect(after).toEqual({ strengthMax: 3.56, eStrengthMax: 3.84 });
  });

  test('can record historical eStrength when complete e1RMs exist without complete real 1RMs', () => {
    const result = calculateStrengthRatioMaxes({
      history: [
        { cycle: 1, workoutNumber: 1, lift: 'Squat', topWeight: 90, topReps: 3, e1rm: 100 },
        { cycle: 1, workoutNumber: 2, lift: 'Bench', topWeight: 65, topReps: 3, e1rm: 75 },
        { cycle: 1, workoutNumber: 3, lift: 'Deadlift', topWeight: 112.5, topReps: 3, e1rm: 125 },
      ],
      bodyWeights: [{ cycle: 1, workoutNumber: 0, bodyWeight: 80 }],
    });

    expect(result).toEqual({ strengthMax: null, eStrengthMax: 3.75 });
  });

  test('recovers established historical real 1RMs at the bodyweight recorded then', () => {
    const sharedSnapshot = {
      completedSummary: {
        type: 'multiTraining',
        results: [
          {
            lift: 'Squat',
            previousBest1RM: 145,
            previousBestE1RM: 145,
            oneRMToday: 97.5,
            e1RMToday: 110.5,
            topSet: { weight: 97.5, reps: 4 },
          },
          {
            lift: 'Bench',
            previousBest1RM: 97.5,
            previousBestE1RM: 97.5,
            oneRMToday: 60,
            e1RMToday: 68,
            topSet: { weight: 60, reps: 4 },
          },
        ],
      },
    };
    const history = [
      { cycle: 1, workoutNumber: 0, seedMax: true, lift: 'Squat', topWeight: 100, e1rm: 100 },
      { cycle: 1, workoutNumber: 0, seedMax: true, lift: 'Bench', topWeight: 70, e1rm: 70 },
      { cycle: 1, workoutNumber: 0, seedMax: true, lift: 'Deadlift', topWeight: 180, e1rm: 180 },
      {
        cycle: 3,
        workoutNumber: 10,
        lift: 'Squat',
        topWeight: 97.5,
        topReps: 4,
        e1rm: 110.5,
        workoutSnapshot: sharedSnapshot,
      },
      {
        cycle: 3,
        workoutNumber: 10,
        lift: 'Bench',
        topWeight: 60,
        topReps: 4,
        e1rm: 68,
        workoutSnapshot: sharedSnapshot,
      },
    ];

    expect(calculateStrengthRatioMaxes({
      history,
      bodyWeights: [{ cycle: 3, workoutNumber: 10, bodyWeight: 79.3 }],
    })).toEqual({
      strengthMax: 5.33,
      eStrengthMax: 5.33,
    });
  });

  test('persisted Strength Max records can only increase', () => {
    const records = mergeStrengthRatioMaxes(
      { strengthMax: 5.24, eStrengthMax: 5.36 },
      { strengthMax: 5.1, eStrengthMax: 5.2 }
    );

    expect(records).toEqual({ strengthMax: 5.24, eStrengthMax: 5.36 });
    expect(mergeStrengthRatioMaxes(records, {
      strengthMax: 5.3,
      eStrengthMax: 5.4,
    })).toEqual({ strengthMax: 5.3, eStrengthMax: 5.4 });
  });

  test('a saved eStrength Max prevents the athlete level from moving backwards', () => {
    expect(getAthleteLevel({
      prs: { Squat: 150, Bench: 100, Deadlift: 180 },
      history: [],
      bodyWeights: [{ bodyWeight: 80 }],
      strengthRatioMaxes: { eStrengthMax: 6.1 },
    })).toBe('advanced');
  });

  test('recovers ratio records that older versions already celebrated', () => {
    const sharedSnapshot = {
      milestoneCelebration: {
        achievements: [
          { type: 'strengthMax', previous: 5.2, value: 5.24 },
          { type: 'eStrengthMax', previous: 5.3, value: 5.36 },
        ],
      },
    };

    expect(getCelebratedStrengthRatioMaxes([
      { lift: 'Squat', workoutSnapshot: sharedSnapshot },
      { lift: 'Bench', workoutSnapshot: sharedSnapshot },
    ])).toEqual({ strengthMax: 5.24, eStrengthMax: 5.36 });
  });

  test('keeps long strength and body-data histories fast enough for workout completion', () => {
    const entryCount = 5000;
    const history = Array.from({ length: entryCount }, (_, index) => ({
      cycle: Math.floor(index / 48) + 1,
      workoutNumber: (index % 48) + 1,
      lift: ['Squat', 'Bench', 'Deadlift'][index % 3],
      topWeight: [150, 100, 180][index % 3],
      topReps: 1,
      e1rm: [150, 100, 180][index % 3],
    }));
    const bodyWeights = Array.from({ length: entryCount }, (_, index) => ({
      cycle: Math.floor(index / 48) + 1,
      workoutNumber: (index % 48) + 1,
      bodyWeight: 80 + ((index % 5) / 10),
    }));
    const startedAt = Date.now();

    const result = calculateStrengthRatioMaxes({
      prs: { Squat: 150, Bench: 100, Deadlift: 180 },
      oneRMs: { Squat: 150, Bench: 100, Deadlift: 180 },
      history,
      bodyWeights,
    });

    expect(result.eStrengthMax).toBeGreaterThan(5);
    expect(Date.now() - startedAt).toBeLessThan(2000);
  }, 5000);
});
