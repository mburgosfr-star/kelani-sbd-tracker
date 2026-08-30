import { normalizeBodyWeights } from './workoutHistoryStats';

test('canonical body data cannot be replaced by older compatibility values on reload', () => {
  const normalized = normalizeBodyWeights({
    bodyWeightToday: 79,
    history: [{
      cycle: 4,
      workoutNumber: 9,
      date: '15-1-2030',
      lift: 'Deadlift',
      bodyWeight: 80,
      bodyFat: 20,
    }],
    bodyWeights: [{
      cycle: 4,
      workoutNumber: 9,
      date: '15-1-2030',
      timestamp: '2030-01-15T12:00:00.000Z',
      bodyWeight: 84.6,
      bodyFat: 18,
    }],
  });

  expect(normalized.at(-1)).toMatchObject({
    cycle: 4,
    workoutNumber: 9,
    date: '15-1-2030',
    bodyWeight: 84.6,
    bodyFat: 18,
  });
});

test('daily body data remains distinct while the current workout stays unchanged', () => {
  const normalized = normalizeBodyWeights({
    history: [],
    bodyWeights: [
      {
        cycle: 4,
        workoutNumber: 9,
        date: '15-1-2030',
        timestamp: '2030-01-15T08:00:00.000Z',
        bodyWeight: 84.6,
      },
      {
        cycle: 4,
        workoutNumber: 9,
        date: '16-1-2030',
        timestamp: '2030-01-16T08:00:00.000Z',
        bodyWeight: 84.2,
      },
    ],
  });

  expect(normalized).toHaveLength(2);
  expect(normalized.map(entry => entry.bodyWeight)).toEqual([84.6, 84.2]);
});

test('generic workout weight is never interpreted as body weight', () => {
  const normalized = normalizeBodyWeights({
    history: [{
      cycle: 2,
      workoutNumber: 3,
      lift: 'Squat',
      weight: 140,
    }],
  });

  expect(normalized).toEqual([]);
});

test('repeated reload normalization is stable and never restores an older value', () => {
  const legacyHistory = [{
    cycle: 4,
    workoutNumber: 9,
    date: '15-1-2030',
    lift: 'Bench',
    bodyWeight: 80,
    bodyWater: 50,
  }];
  const firstReload = normalizeBodyWeights({
    bodyWeightToday: 79,
    history: legacyHistory,
    bodyWeights: [{
      cycle: 4,
      workoutNumber: 9,
      date: '15-1-2030',
      timestamp: '2030-01-15T12:00:00.000Z',
      bodyWeight: 84.6,
      bodyWater: 54,
    }],
  });
  const secondReload = normalizeBodyWeights({
    bodyWeightToday: 79,
    history: legacyHistory,
    bodyWeights: firstReload,
  });

  expect(secondReload).toEqual(firstReload);
  expect(secondReload.at(-1)).toMatchObject({
    bodyWeight: 84.6,
    bodyWater: 54,
  });
});
