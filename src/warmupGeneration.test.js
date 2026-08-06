import { generateWarmups } from './warmupAndPrepGeneration';
import { completeSmartLiftGrid } from './smartTrainingEngine';

test('builds the C3W52 tapered squat bridge without a jump of 60kg or more', () => {
  const sets = [
    { labelKey: 'topTriple', reps: 3, weight: 135 },
    ...Array.from({ length: 5 }, () => ({
      labelKey: 'backoff', reps: 4, weight: 105,
    })),
  ];
  const warmups = generateWarmups(sets, 'Squat');
  const completedSets = completeSmartLiftGrid({
    sets,
    warmups,
    minimumVolumeSets: 2,
  });

  expect(warmups.map(({ reps, weight }) => ({ reps, weight }))).toEqual([
    { reps: 5, weight: 20 },
    { reps: 5, weight: 70 },
    { reps: 3, weight: 100 },
  ]);
  expect(completedSets.filter(set => set.labelKey === 'topTriple')).toHaveLength(1);
  expect(completedSets.filter(set => set.labelKey === 'backoff')).toHaveLength(4);
  expect(warmups.length + completedSets.length).toBe(8);

  const ladder = [...warmups.map(item => item.weight), 135];
  for (let index = 1; index < ladder.length; index += 1) {
    expect(ladder[index] - ladder[index - 1]).toBeLessThan(60);
  }
});

test('removes the C3W53 160kg warmup because 120 to 175 is an allowed 55kg jump', () => {
  const sets = [
    { labelKey: 'topDouble', reps: 2, weight: 175 },
    ...Array.from({ length: 3 }, () => ({
      labelKey: 'backoff', reps: 4, weight: 145,
    })),
  ];
  const warmups = generateWarmups(sets, 'Deadlift');
  const completedSets = completeSmartLiftGrid({
    sets,
    warmups,
    minimumVolumeSets: 2,
  });

  expect(warmups.map(({ reps, weight }) => ({ reps, weight }))).toEqual([
    { reps: 5, weight: 20 },
    { reps: 5, weight: 70 },
    { reps: 3, weight: 120 },
  ]);
  expect(completedSets.filter(set => set.labelKey === 'topDouble')).toHaveLength(1);
  expect(completedSets.filter(set => set.labelKey === 'backoff')).toHaveLength(4);
  expect(warmups.length + completedSets.length).toBe(8);
  expect(175 - warmups.at(-1).weight).toBe(55);
});

test('builds the C3W46 deadlift bridge and trades one backoff for the third warmup', () => {
  const sets = [
    { labelKey: 'topDouble', reps: 2, weight: 170 },
    ...Array.from({ length: 5 }, () => ({
      labelKey: 'backoff', reps: 4, weight: 145,
    })),
  ];
  const warmups = generateWarmups(sets, 'Deadlift');
  const completedSets = completeSmartLiftGrid({
    sets,
    warmups,
    minimumVolumeSets: 2,
  });

  expect(warmups.map(({ reps, weight }) => ({ reps, weight }))).toEqual([
    { reps: 5, weight: 20 },
    { reps: 5, weight: 70 },
    { reps: 3, weight: 120 },
  ]);
  expect(completedSets).toHaveLength(5);
  expect(completedSets.filter(set => set.labelKey === 'topDouble')).toHaveLength(1);
  expect(completedSets.filter(set => set.labelKey === 'backoff')).toHaveLength(4);
  expect(warmups.length + completedSets.length).toBe(8);
});

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

test('drops the redundant middle bridge warmup on a single-lift day', () => {
  const sets = [
    { labelKey: 'topSingle', reps: 1, weight: 90 },
    ...Array.from({ length: 5 }, () => ({ labelKey: 'backoff', reps: 4, weight: 75 })),
  ];

  expect(
    generateWarmups(sets, 'Bench', false).map(({ reps, weight }) => ({ reps, weight }))
  ).toEqual([
    { reps: 5, weight: 20 },
    { reps: 3, weight: 60 },
    { reps: 3, weight: 70 },
  ]);

  expect(
    generateWarmups(sets, 'Bench', true).map(({ reps, weight }) => ({ reps, weight }))
  ).toEqual([
    { reps: 5, weight: 20 },
    { reps: 3, weight: 70 },
  ]);
});

test('keeps the mandatory bridge warmup for Squat/Deadlift on a single-lift day (their 55kg base jump is not widened)', () => {
  const sets = [
    { labelKey: 'topDouble', reps: 2, weight: 130 },
    ...Array.from({ length: 5 }, () => ({ labelKey: 'backoff', reps: 4, weight: 115 })),
  ];

  expect(
    generateWarmups(sets, 'Squat', true).map(({ reps, weight }) => ({ reps, weight }))
  ).toEqual([
    { reps: 5, weight: 20 },
    { reps: 5, weight: 70 },
    { reps: 3, weight: 110 },
  ]);
});

test('warmup reps never increase toward the top set, and never sit at exactly 2', () => {
  const sets = [
    { labelKey: 'topDouble', reps: 2, weight: 200 },
    ...Array.from({ length: 5 }, () => ({ labelKey: 'backoff', reps: 4, weight: 175 })),
  ];

  const warmups = generateWarmups(sets, 'Squat', false);

  expect(warmups.length).toBeGreaterThan(2);
  warmups.forEach(w => expect(w.reps).not.toBe(2));
  for (let i = 1; i < warmups.length; i += 1) {
    expect(warmups[i].reps).toBeLessThanOrEqual(warmups[i - 1].reps);
  }
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

test('bridges straight to a submaximal (no top set) work weight without an extra close rung', () => {
  // C3W36 boundary: a light/secondary Squat block (110kg work
  // weight) got a 3rd warm-up rung at 100kg, 10kg below the work weight,
  // reduced to 3-4 reps. The expected sequence goes straight from the
  // initial warmups into the work sets, with no rung
  // padded in right next to a submaximal target. A no-top-set block never
  // has a genuine near-max attempt to bridge into, so it just closes the
  // gap to the work weight in <60kg (lower body) steps, at a flat 5 reps -
  // it never inherits the work sets' own rep count either.
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
  ]);
});

test('does not add a 120kg warm-up immediately before submaximal 125kg work', () => {
  const sets = Array.from({ length: 6 }, () => ({
    labelKey: 'workSets', reps: 4, weight: 125,
  }));

  expect(
    generateWarmups(sets, 'Deadlift').map(({ reps, weight }) => ({ reps, weight }))
  ).toEqual([
    { reps: 5, weight: 20 },
    { reps: 5, weight: 70 },
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
