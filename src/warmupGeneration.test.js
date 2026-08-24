import {
  generateWarmups,
  rebalanceWarmupLoadJumps,
  warmupLoadJumpsNeverIncrease,
} from './warmupAndPrepGeneration';
import { completeSmartLiftGrid } from './smartTrainingEngine';

test('reuses the C3W41 70kg bench backoff as the final warm-up', () => {
  const sets = [
    { labelKey: 'topTriple', reps: 3, weight: 90 },
    ...Array.from({ length: 5 }, () => ({ labelKey: 'backoff', reps: 4, weight: 70 })),
  ];

  expect(
    generateWarmups(sets, 'Bench', false).map(({ reps, weight }) => ({ reps, weight }))
  ).toEqual([
    { reps: 5, weight: 20 },
    { reps: 3, weight: 70 },
  ]);
});

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
    { reps: 3, weight: 110 },
  ]);
  expect(completedSets.filter(set => set.labelKey === 'topTriple')).toHaveLength(1);
  expect(completedSets.filter(set => set.labelKey === 'backoff')).toHaveLength(4);
  expect(warmups.length + completedSets.length).toBe(8);

  expect(warmupLoadJumpsNeverIncrease(
    warmups.map(item => item.weight),
    135
  )).toBe(true);
});

test('adds a round warmup for C3W53 instead of allowing a larger final jump', () => {
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
    { reps: 3, weight: 150 },
  ]);
  expect(completedSets.filter(set => set.labelKey === 'topDouble')).toHaveLength(1);
  expect(completedSets.filter(set => set.labelKey === 'backoff')).toHaveLength(3);
  expect(warmups.length + completedSets.length).toBe(8);
  expect(warmupLoadJumpsNeverIncrease(
    warmups.map(item => item.weight),
    175
  )).toBe(true);
});

test('prioritizes a smooth C4W6 top-triple ladder over reusing 110kg backoffs', () => {
  const sets = [
    { labelKey: 'topTriple', reps: 3, weight: 165 },
    ...Array.from({ length: 4 }, () => ({
      labelKey: 'backoff', reps: 6, weight: 110,
    })),
  ];

  const warmups = generateWarmups(sets, 'Deadlift');

  expect(warmups.map(({ reps, weight }) => ({ reps, weight }))).toEqual([
    { reps: 5, weight: 20 },
    { reps: 5, weight: 70 },
    { reps: 3, weight: 120 },
  ]);
  expect(warmupLoadJumpsNeverIncrease(
    warmups.map(item => item.weight),
    165
  )).toBe(true);
});

test('adds a warmup only when the existing number of rungs cannot satisfy the jump rule', () => {
  const warmups = rebalanceWarmupLoadJumps([20, 70], 140, 55);

  expect(warmups).toEqual([20, 70, 110]);
  expect(warmupLoadJumpsNeverIncrease(warmups, 140)).toBe(true);
});

test('classic meet warmups prepare the opener instead of a later attempt', () => {
  const attempts = [
    { labelKey: 'opener', reps: 1, weight: 135 },
    { labelKey: 'secondAttempt', reps: 1, weight: 147.5 },
    { labelKey: 'thirdAttempt', reps: 1, weight: 155 },
  ];

  const warmups = generateWarmups(attempts, 'Squat');

  expect(warmups.map(({ reps, weight }) => ({ reps, weight }))).toEqual([
    { reps: 5, weight: 20 },
    { reps: 5, weight: 70 },
    { reps: 1, weight: 120 },
  ]);
  expect(warmupLoadJumpsNeverIncrease(
    warmups.map(item => item.weight),
    attempts[0].weight
  )).toBe(true);
  expect(warmups.every(warmup => warmup.weight < attempts[0].weight)).toBe(true);
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

test('C3W45 squat keeps the final warmup at 3 reps before its top double', () => {
  const sets = [
    { labelKey: 'topDouble', reps: 2, weight: 140 },
    ...Array.from({ length: 4 }, () => ({
      labelKey: 'backoff', reps: 5, weight: 95,
    })),
  ];

  const warmups = generateWarmups(sets, 'Squat');

  expect(warmups.map(({ reps, weight }) => ({ reps, weight }))).toEqual([
    { reps: 5, weight: 20 },
    { reps: 5, weight: 70 },
    { reps: 3, weight: 120 },
  ]);
  expect(warmups.every(warmup => warmup.reps >= 3)).toBe(true);
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
    { reps: 1, weight: 80 },
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
    { reps: 5, weight: 100 },
  ]);
});

test('C4W9 balances submaximal warm-ups consistently without changing work volume', () => {
  const deadliftSets = Array.from({ length: 5 }, () => ({
    labelKey: 'workSets', reps: 4, weight: 127.5,
  }));
  const benchSets = Array.from({ length: 6 }, () => ({
    labelKey: 'workSets', reps: 4, weight: 72.5,
  }));

  const deadliftWarmups = generateWarmups(deadliftSets, 'Deadlift');
  const benchWarmups = generateWarmups(benchSets, 'Bench');
  const completedDeadliftSets = completeSmartLiftGrid({
    sets: deadliftSets,
    warmups: deadliftWarmups,
    preferMoreVolume: true,
  });

  expect(deadliftWarmups.map(({ reps, weight }) => ({ reps, weight }))).toEqual([
    { reps: 5, weight: 20 },
    { reps: 5, weight: 70 },
    { reps: 5, weight: 100 },
  ]);
  expect(benchWarmups.map(({ reps, weight }) => ({ reps, weight }))).toEqual([
    { reps: 5, weight: 20 },
    { reps: 5, weight: 50 },
  ]);
  expect(completedDeadliftSets).toHaveLength(5);
  expect(deadliftWarmups.length + completedDeadliftSets.length).toBe(8);
  expect(warmupLoadJumpsNeverIncrease(
    deadliftWarmups.map(item => item.weight),
    deadliftSets[0].weight
  )).toBe(true);
  expect(warmupLoadJumpsNeverIncrease(
    benchWarmups.map(item => item.weight),
    benchSets[0].weight
  )).toBe(true);
});

test('balances repeated submaximal work ladders across Squat, Bench and Deadlift', () => {
  const cases = [
    ['Squat', 100, [20, 60]],
    ['Bench', 72.5, [20, 50]],
    ['Deadlift', 127.5, [20, 70, 100]],
  ];

  cases.forEach(([lift, weight, expectedWeights]) => {
    const sets = Array.from({ length: 4 }, () => ({
      labelKey: 'workSets', reps: 4, weight,
    }));
    const warmups = generateWarmups(sets, lift);

    expect(warmups.map(warmup => warmup.weight)).toEqual(expectedWeights);
    expect(warmups.every(warmup => warmup.reps === 5)).toBe(true);
    expect(warmups.every(warmup => warmup.weight % 10 === 0)).toBe(true);
    expect(warmupLoadJumpsNeverIncrease(expectedWeights, weight)).toBe(true);
  });
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
