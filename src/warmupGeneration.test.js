import { generateWarmups } from './App';

test('generates complete deadlift warmups below a close backoff', () => {
  const sets = [
    { labelKey: 'topDouble', reps: 2, weight: 140 },
    { labelKey: 'backoff', reps: 3, weight: 125 },
    { labelKey: 'backoff', reps: 3, weight: 125 },
  ];

  expect(
    generateWarmups(sets, 'Deadlift').map(({ reps, weight }) => ({ reps, weight }))
  ).toEqual([
    { reps: 5, weight: 20 },
    { reps: 5, weight: 70 },
    { reps: 3, weight: 120 },
  ]);
});

test('keeps close-backoff warmups below the backoff weight', () => {
  const sets = [
    { labelKey: 'topDouble', reps: 2, weight: 77.5 },
    { labelKey: 'backoff', reps: 3, weight: 67.5 },
  ];

  expect(
    generateWarmups(sets, 'Bench').map(({ reps, weight }) => ({ reps, weight }))
  ).toEqual([
    { reps: 5, weight: 20 },
    { reps: 3, weight: 60 },
  ]);
});



test('keeps the final Bench warmup below the 70 kg backoffs', () => {
  const sets = [
    { labelKey: 'topDouble', reps: 2, weight: 80 },
    { labelKey: 'backoff', reps: 4, weight: 70 },
    { labelKey: 'backoff', reps: 4, weight: 70 },
    { labelKey: 'backoff', reps: 4, weight: 70 },
  ];

  expect(
    generateWarmups(sets, 'Bench').map(({ reps, weight }) => ({ reps, weight }))
  ).toEqual([
    { reps: 5, weight: 20 },
    { reps: 3, weight: 60 },
  ]);
});

test('keeps the 70 kg Deadlift warmup at five reps before 100 kg', () => {
  const sets = [
    { labelKey: 'workSets', reps: 3, weight: 112.5 },
    { labelKey: 'workSets', reps: 3, weight: 112.5 },
    { labelKey: 'workSets', reps: 3, weight: 112.5 },
  ];

  expect(
    generateWarmups(sets, 'Deadlift').map(({ reps, weight }) => ({ reps, weight }))
  ).toEqual([
    { reps: 5, weight: 20 },
    { reps: 5, weight: 70 },
    { reps: 3, weight: 100 },
  ]);
});

test('reuses a round squat backoff as the final warmup before a topsingle', () => {
  const sets = [
    { labelKey: 'opener', reps: 1, weight: 130 },
    ...Array.from({ length: 4 }, () => ({
      labelKey: 'backoff',
      reps: 4,
      weight: 100,
    })),
  ];

  expect(
    generateWarmups(sets, 'Squat').map(({ reps, weight }) => ({ reps, weight }))
  ).toEqual([
    { reps: 5, weight: 20 },
    { reps: 5, weight: 70 },
    { reps: 3, weight: 100 },
  ]);
});


test('rounds a decimal squat backoff down for a reusable final warmup', () => {
  const sets = [
    { labelKey: 'opener', reps: 1, weight: 130 },
    ...Array.from({ length: 4 }, () => ({
      labelKey: 'backoff',
      reps: 4,
      weight: 102.5,
    })),
  ];

  expect(
    generateWarmups(sets, 'Squat').map(({ reps, weight }) => ({ reps, weight }))
  ).toEqual([
    { reps: 5, weight: 20 },
    { reps: 5, weight: 70 },
    { reps: 3, weight: 100 },
  ]);
});
