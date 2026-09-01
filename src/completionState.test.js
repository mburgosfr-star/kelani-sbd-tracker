import {
  matchesCompletedSmartGeneration,
  mergeAccessoryPrsFromWorkout,
} from './completionState';

test('merges all accessory records once and preserves the old reference when nothing improved', () => {
  const current = { rows: 30, curls: 15 };

  expect(mergeAccessoryPrsFromWorkout(current, {
    accessories: [
      { key: 'rows', weights: [25, 32.5, 30] },
      { key: 'curls', weights: [12.5, 15] },
    ],
  })).toEqual({ rows: 32.5, curls: 15 });
  expect(mergeAccessoryPrsFromWorkout(current, {
    accessories: [{ key: 'rows', weights: [25, 30] }],
  })).toBe(current);
});

test('recognizes the exact completion state whose workouts were already generated', () => {
  const state = {
    history: [],
    prs: {},
    oneRMs: {},
    accessoryPRs: {},
    currentIndex: 12,
    currentCycle: 4,
  };

  expect(matchesCompletedSmartGeneration({ ...state }, state)).toBe(true);
  expect(matchesCompletedSmartGeneration({
    ...state,
    history: [...state.history],
  }, state)).toBe(false);
  expect(matchesCompletedSmartGeneration({
    ...state,
    currentIndex: 13,
  }, state)).toBe(false);
});
