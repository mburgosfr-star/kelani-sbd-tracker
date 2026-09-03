import {
  changeOpenAccessorySetWeight,
  changeOpenMeetAttemptWeights,
  changeOpenWorkoutSetWeight,
  markOpenAccessorySetFailed,
  markOpenWorkoutSetFailed,
  restoreOpenAccessorySetWeight,
  restoreOpenMeetAttemptWeights,
  restoreOpenWorkoutSetWeight,
} from './workoutSetActions';

function openSet(weight = 100, pct = 0.75) {
  return {
    weight,
    originalWeight: weight,
    pct,
    originalPct: pct,
    reps: 3,
    done: false,
    failed: false,
    skipped: false,
  };
}

test('an open work set can be adjusted, restored and marked missed', () => {
  const adjusted = changeOpenWorkoutSetWeight(openSet(), 95);

  expect(adjusted).toMatchObject({
    weight: 95,
    originalWeight: 100,
    adjustedFromOriginal: true,
    done: false,
  });
  expect(adjusted.pct).toBeCloseTo(0.7125);

  expect(restoreOpenWorkoutSetWeight(adjusted)).toMatchObject({
    weight: 100,
    pct: 0.75,
    adjustedFromOriginal: false,
    done: false,
  });

  expect(markOpenWorkoutSetFailed(adjusted)).toMatchObject({
    weight: 95,
    originalWeight: 100,
    done: true,
    failed: true,
    skipped: true,
    failedWeight: 95,
    adjustedFromOriginal: true,
  });
});

test('set actions never rewrite a completed or missed performance', () => {
  const completed = { ...openSet(), done: true };
  const missed = { ...openSet(), done: true, failed: true, skipped: true };

  expect(changeOpenWorkoutSetWeight(completed, 90)).toBe(completed);
  expect(restoreOpenWorkoutSetWeight(completed)).toBe(completed);
  expect(markOpenWorkoutSetFailed(completed)).toBe(completed);
  expect(changeOpenWorkoutSetWeight(missed, 90)).toBe(missed);
  expect(restoreOpenWorkoutSetWeight(missed)).toBe(missed);
});

test('meet attempt adjustment stays available after warmups and preserves earlier attempts', () => {
  const attempts = [
    { ...openSet(100, 0.9), labelKey: 'opener', reps: 1, done: true },
    { ...openSet(110, 0.975), labelKey: 'secondAttempt', reps: 1 },
    { ...openSet(115, 1.025), labelKey: 'thirdAttempt', reps: 1 },
  ];

  const adjusted = changeOpenMeetAttemptWeights(attempts, 1, 115);

  expect(adjusted.map(set => set.weight)).toEqual([100, 115, 117.5]);
  expect(adjusted[0]).toBe(attempts[0]);
  expect(adjusted[0].done).toBe(true);
  expect(adjusted[1]).toMatchObject({
    done: false,
    adjustedFromOriginal: true,
  });
  expect(adjusted[2]).toMatchObject({
    done: false,
    adjustedFromOriginal: true,
  });
});

test('meet attempt adjustment keeps every open future attempt strictly higher', () => {
  const attempts = [
    { ...openSet(90, 0.9), labelKey: 'opener', reps: 1 },
    { ...openSet(97.5, 0.975), labelKey: 'secondAttempt', reps: 1 },
    { ...openSet(102.5, 1.025), labelKey: 'thirdAttempt', reps: 1 },
  ];

  expect(changeOpenMeetAttemptWeights(attempts, 0, 102.5).map(set => set.weight))
    .toEqual([102.5, 105, 107.5]);

  const afterMissedOpener = [
    { ...attempts[0], done: true, failed: true, skipped: true },
    attempts[1],
    attempts[2],
  ];
  expect(changeOpenMeetAttemptWeights(afterMissedOpener, 1, 85).map(set => set.weight))
    .toEqual([90, 92.5, 102.5]);
});

test('restoring a meet attempt cannot make it lower than a completed earlier attempt', () => {
  const attempts = [
    { ...openSet(100, 0.9), originalWeight: 90, labelKey: 'opener', reps: 1, done: true },
    { ...openSet(102.5, 0.975), originalWeight: 97.5, labelKey: 'secondAttempt', reps: 1,
      adjustedFromOriginal: true },
    { ...openSet(105, 1.025), originalWeight: 102.5, labelKey: 'thirdAttempt', reps: 1,
      adjustedFromOriginal: true },
  ];

  const restored = restoreOpenMeetAttemptWeights(attempts, 1);
  expect(restored.map(set => set.weight)).toEqual([100, 102.5, 105]);
  expect(restored[0]).toBe(attempts[0]);
  expect(restored[1].adjustedFromOriginal).toBe(true);
});

test('weighted accessory actions affect only an open set', () => {
  const accessory = {
    weights: [40, 40, 40],
    originalWeights: [40, 40, 40],
    done: [true, false, false],
    failed: [false, false, false],
    skipped: [false, false, false],
  };

  expect(changeOpenAccessorySetWeight(accessory, 0, 35)).toBe(accessory);

  const adjusted = changeOpenAccessorySetWeight(accessory, 1, 35);
  expect(adjusted.weights).toEqual([40, 35, 40]);
  expect(adjusted.adjustedFromOriginal).toEqual([false, true, false]);

  const restored = restoreOpenAccessorySetWeight(adjusted, 1);
  expect(restored.weights).toEqual([40, 40, 40]);
  expect(restored.adjustedFromOriginal).toEqual([false, false, false]);

  const missed = markOpenAccessorySetFailed(adjusted, 1);
  expect(missed).toMatchObject({
    done: [true, true, false],
    failed: [false, true, false],
    skipped: [false, true, false],
    failedWeights: [null, 35, null],
  });
});
