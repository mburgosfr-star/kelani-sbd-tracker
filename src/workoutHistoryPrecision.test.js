import {
  calculateAchievedMaxesFromHistory,
  calculateBestMaxesFromHistory,
  getActualOneRMFromSets,
  getTopWeightFromSets,
} from './workoutHistoryStats';
import { buildSmartMeetPlanReadiness } from './smartTrainingEngine';

function trainingEntry(sets) {
  const successfulSets = sets.filter(set => set.done && !set.failed && !set.skipped);
  const topSet = successfulSets.reduce((best, set) => (
    set.weight * (1 + set.reps / 30) > best.weight * (1 + best.reps / 30)
      ? set
      : best
  ), successfulSets[0]);

  return {
    cycle: 1,
    workoutNumber: 1,
    lift: 'Squat',
    topWeight: topSet.weight,
    topReps: topSet.reps,
    e1rm: topSet.weight * (1 + topSet.reps / 30),
    workoutSnapshot: {
      type: 'training',
      lifts: [{ lift: 'Squat', sets }],
    },
  };
}

test('only a successful single counts as an actually achieved 1RM', () => {
  const sets = [
    { weight: 105, reps: 2, done: true, failed: false, skipped: false },
    { weight: 102.5, reps: 1, done: true, failed: false, skipped: false },
    { weight: 110, reps: 1, done: true, failed: true, skipped: false },
  ];

  expect(getActualOneRMFromSets(sets)).toBe(102.5);
  expect(calculateAchievedMaxesFromHistory([trainingEntry(sets)]).Squat)
    .toMatchObject({ oneRM: 102.5 });
});

test('workout-complete "1RM today" shows the heaviest weight lifted, not just a literal single', () => {
  const sets = [
    { weight: 120, reps: 3, done: true, failed: false, skipped: false },
    { weight: 100, reps: 5, done: true, failed: false, skipped: false },
  ];

  // A normal training day rarely includes a literal single. The demonstrated
  // (meet-readiness) 1RM correctly stays 0 here, but the workout-complete
  // screen's "1RM today" must still show today's top weight, not 0 kg.
  expect(getActualOneRMFromSets(sets)).toBe(0);
  expect(getTopWeightFromSets(sets)).toBe(120);
});

test('a heavier double raises e1RM without moving meet attempts based on real 1RM', () => {
  const seed = {
    cycle: 0,
    workoutNumber: 0,
    seedMax: true,
    lift: 'Squat',
    topWeight: 100,
    topReps: 1,
    e1rm: 100,
  };
  const heavierDouble = trainingEntry([
    { weight: 105, reps: 2, done: true, failed: false, skipped: false },
  ]);
  const history = [seed, heavierDouble];

  expect(calculateBestMaxesFromHistory(history).Squat.oneRM).toBe(100);
  expect(calculateBestMaxesFromHistory(history).Squat.e1rm).toBeGreaterThan(100);
  expect(buildSmartMeetPlanReadiness({
    history,
    prs: { Squat: 112.5, Bench: 75, Deadlift: 125 },
    currentCycle: 1,
  }).byLift.Squat.attempts).toEqual({
    opener: 90,
    secondAttempt: 97.5,
    thirdAttempt: 102.5,
  });
});

test('a genuinely heavier single immediately updates automatic meet attempts', () => {
  const history = [
    {
      cycle: 0,
      workoutNumber: 0,
      seedMax: true,
      lift: 'Squat',
      topWeight: 100,
      topReps: 1,
      e1rm: 100,
    },
    trainingEntry([
      { weight: 105, reps: 1, done: true, failed: false, skipped: false },
    ]),
  ];

  expect(buildSmartMeetPlanReadiness({
    history,
    prs: { Squat: 105, Bench: 75, Deadlift: 125 },
    currentCycle: 1,
  }).byLift.Squat.attempts).toEqual({
    opener: 95,
    secondAttempt: 102.5,
    thirdAttempt: 107.5,
  });
});
