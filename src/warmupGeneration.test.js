import {
  distributeUniversalWarmupReps,
  generateUniversalWarmupWeights,
  generateWarmups,
  warmupLoadJumpsNeverIncrease,
} from './warmupAndPrepGeneration';
import { completeSmartLiftGrid } from './smartTrainingEngine';

function expectUniversalWeightInvariants(targetWeight, weights) {
  if (targetWeight < 30) {
    expect(weights).toEqual([]);
    return;
  }

  expect(weights[0]).toBe(20);
  expect(weights.every(weight => weight % 10 === 0)).toBe(true);
  expect(weights.every(weight => weight < targetWeight)).toBe(true);
  expect(warmupLoadJumpsNeverIncrease(weights, targetWeight)).toBe(true);

  const ladder = [...weights, targetWeight];
  const jumps = ladder.slice(1).map((weight, index) => weight - ladder[index]);
  expect(jumps[0]).toBeLessThanOrEqual(50);
  jumps.slice(1).forEach((jump, index) => {
    expect(jump).toBeLessThanOrEqual(jumps[index]);
  });
}

test('follows the universal target-weight ladder at representative boundaries', () => {
  const cases = [
    [10, []],
    [27.5, []],
    [30, [20]],
    [37.5, [20]],
    [40, [20, 30]],
    [42.5, [20]],
    [50, [20, 40]],
    [90, [20, 70, 80]],
    [92.5, [20, 60, 80]],
    [97.5, [20, 60, 80]],
    [100, [20, 70, 90]],
    [102.5, [20, 70, 90]],
    [127.5, [20, 70, 110]],
    [135, [20, 70, 120]],
    [142.5, [20, 70, 110, 130]],
    [175, [20, 70, 120, 160]],
    [300, [20, 70, 120, 170, 220, 270, 290]],
  ];

  cases.forEach(([targetWeight, expectedWeights]) => {
    expect(generateUniversalWarmupWeights(targetWeight)).toEqual(expectedWeights);
  });
});

test('scales the universal weight rules from 10kg through 1000kg', () => {
  for (let targetWeight = 10; targetWeight <= 1000; targetWeight += 2.5) {
    const weights = generateUniversalWarmupWeights(targetWeight);
    expectUniversalWeightInvariants(targetWeight, weights);
  }

  const thousandKgWarmups = generateUniversalWarmupWeights(1000);
  expect(thousandKgWarmups.at(-1)).toBe(990);
  expect(thousandKgWarmups.length).toBeGreaterThan(10);
});

test('distributes seven warmups across only the rep zones allowed by the main set', () => {
  expect(distributeUniversalWarmupReps(7, 6)).toEqual([5, 5, 5, 5, 5, 5, 5]);
  expect(distributeUniversalWarmupReps(7, 4)).toEqual([5, 5, 5, 5, 5, 5, 5]);
  expect(distributeUniversalWarmupReps(7, 3)).toEqual([5, 5, 5, 5, 3, 3, 3]);
  expect(distributeUniversalWarmupReps(7, 2)).toEqual([5, 5, 5, 5, 3, 3, 3]);
  expect(distributeUniversalWarmupReps(7, 1)).toEqual([5, 5, 5, 3, 3, 1, 1]);
});

test('applies the confirmed rep distribution to the reported 97.5kg and 102.5kg targets', () => {
  const benchWarmups = generateWarmups([
    { labelKey: 'topDouble', reps: 2, weight: 97.5 },
  ], 'Bench');
  const squatWarmups = generateWarmups([
    { labelKey: 'workSets', reps: 4, weight: 102.5 },
  ], 'Squat');

  expect(benchWarmups.map(({ reps, weight }) => [reps, weight])).toEqual([
    [5, 20],
    [5, 60],
    [3, 80],
  ]);
  expect(squatWarmups.map(({ reps, weight }) => [reps, weight])).toEqual([
    [5, 20],
    [5, 70],
    [5, 90],
  ]);
});

test('never assigns more low-rep warmups than the higher-rep zone before it', () => {
  [1, 2, 3, 4, 5, 6].forEach(targetReps => {
    for (let count = 1; count <= 30; count += 1) {
      const reps = distributeUniversalWarmupReps(count, targetReps);
      const counts = [5, 3, 1].map(value => reps.filter(rep => rep === value).length);
      const usedCounts = counts.filter(value => value > 0);

      expect(reps).toHaveLength(count);
      expect(reps.every(rep => rep >= Math.min(targetReps, 5))).toBe(true);
      for (let index = 1; index < reps.length; index += 1) {
        expect(reps[index]).toBeLessThanOrEqual(reps[index - 1]);
      }
      for (let index = 1; index < usedCounts.length; index += 1) {
        expect(usedCounts[index]).toBeLessThanOrEqual(usedCounts[index - 1]);
      }
    }
  });
});

test('uses the first main, attempt or work set and ignores lift-specific exceptions', () => {
  const workSets = [
    { labelKey: 'workSets', reps: 3, weight: 142.5 },
    { labelKey: 'workSets', reps: 3, weight: 160 },
  ];
  const attempts = [
    { labelKey: 'opener', reps: 1, weight: 142.5 },
    { labelKey: 'secondAttempt', reps: 1, weight: 155 },
    { labelKey: 'thirdAttempt', reps: 1, weight: 165 },
  ];

  const expectedWeights = [20, 70, 110, 130];
  ['Squat', 'Bench', 'Deadlift'].forEach(lift => {
    expect(generateWarmups(workSets, lift).map(item => item.weight))
      .toEqual(expectedWeights);
  });
  expect(generateWarmups(attempts, 'Squat').map(item => item.weight))
    .toEqual(expectedWeights);
  expect(generateWarmups(attempts, 'Squat').map(item => item.reps))
    .toEqual([5, 5, 3, 1]);
});

test('lets universal warmup counts determine normal workout-grid volume', () => {
  const sets = Array.from({ length: 3 }, () => ({
    labelKey: 'workSets',
    reps: 4,
    weight: 250,
  }));
  const warmups = generateWarmups(sets, 'Bench');
  const completedSets = completeSmartLiftGrid({
    sets,
    warmups,
    minimumVolumeSets: 3,
  });

  expect(warmups).toHaveLength(6);
  expect(completedSets).toHaveLength(6);
  expect(warmups.length + completedSets.length).toBe(12);
});
