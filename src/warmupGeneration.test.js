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
