import { ATHLETE_LEVEL_THRESHOLDS, calculateBestMaxesFromHistory, calculateEStrengthRatio, classifyAthleteLevel, getAthleteLevel, roundE1RM } from './workoutHistoryStats';

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
  expect(roundE1RM(current.Squat.e1rm)).toBe(150);
  expect(roundE1RM(current.Bench.e1rm)).toBe(100);
  expect(roundE1RM(current.Deadlift.e1rm)).toBe(180);
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
});
