import {
  calculateActualOneRMsFromHistory,
  deriveOneRMs,
  mergeHigherOneRMs,
} from './oneRMState';

const seed = (lift, weight) => ({
  workoutNumber: 0,
  cycle: 0,
  seedMax: true,
  lift,
  topWeight: weight,
  topReps: 1,
  e1rm: weight,
});

test('legacy migration keeps demonstrated work-set weights and never promotes rounded e1RMs', () => {
  const history = [
    seed('Squat', 142.5),
    seed('Bench', 97.5),
    seed('Deadlift', 175),
    { lift: 'Squat', workoutNumber: 10, cycle: 3, topWeight: 135, topReps: 2, e1rm: 145 },
    { lift: 'Bench', workoutNumber: 11, cycle: 3, topWeight: 95, topReps: 2, e1rm: 101.33 },
    { lift: 'Deadlift', workoutNumber: 12, cycle: 3, topWeight: 170, topReps: 2, e1rm: 180 },
  ];

  expect(deriveOneRMs({
    prs: { Squat: 145, Bench: 102.5, Deadlift: 180 },
    history,
  })).toEqual({ Squat: 142.5, Bench: 97.5, Deadlift: 175 });
});

test('legacy migration restores established real 1RMs carried by completed history', () => {
  const establishedMaxSummary = {
    lift: 'Squat',
    workoutNumber: 25,
    cycle: 2,
    topWeight: 100,
    topReps: 4,
    e1rm: 115,
    workoutSnapshot: {
      type: 'training',
      completedSummary: {
        type: 'multiTraining',
        results: [
          {
            lift: 'Squat',
            oneRMToday: 100,
            previousBest1RM: 145,
            best1RM: 145,
            topSet: { weight: 100, reps: 4 },
          },
          {
            lift: 'Bench',
            oneRMToday: 95,
            previousBest1RM: 97.5,
            // A running summary value without set evidence must not invent a
            // 100kg lift when this workout only demonstrates 95kg.
            best1RM: 100,
            topSet: { weight: 95, reps: 2 },
          },
          {
            lift: 'Deadlift',
            oneRMToday: 170,
            previousBest1RM: 180,
            best1RM: 180,
            topSet: { weight: 170, reps: 2 },
          },
        ],
      },
    },
  };
  const history = [
    seed('Squat', 142.5),
    seed('Bench', 97.5),
    seed('Deadlift', 175),
    establishedMaxSummary,
    { lift: 'Squat', workoutNumber: 38, cycle: 3, topWeight: 135, topReps: 2, e1rm: 145 },
    { lift: 'Bench', workoutNumber: 33, cycle: 3, topWeight: 95, topReps: 2, e1rm: 101.33 },
    { lift: 'Deadlift', workoutNumber: 39, cycle: 3, topWeight: 170, topReps: 2, e1rm: 180 },
  ];

  expect(deriveOneRMs({
    savedOneRMs: { Squat: 142.5, Bench: 97.5, Deadlift: 175 },
    stateVersion: 2,
    history,
  })).toEqual({ Squat: 145, Bench: 97.5, Deadlift: 180 });
});

test('versioned confirmed 1RMs may include lifts performed outside recorded history', () => {
  expect(deriveOneRMs({
    stateVersion: 2,
    savedOneRMs: { Squat: 145, Bench: 97.5, Deadlift: 180 },
    history: [seed('Squat', 142.5), seed('Bench', 97.5), seed('Deadlift', 175)],
  })).toEqual({ Squat: 145, Bench: 97.5, Deadlift: 180 });
});

test('every genuine successful work-set weight can raise a persisted established 1RM', () => {
  const double = {
    lift: 'Squat',
    workoutNumber: 1,
    cycle: 2,
    topWeight: 150,
    topReps: 2,
    e1rm: 160,
    workoutSnapshot: {
      lift: 'Squat',
      sets: [{ weight: 150, reps: 2, done: true }],
    },
  };
  const single = {
    lift: 'Squat',
    workoutNumber: 2,
    cycle: 2,
    topWeight: 152.5,
    topReps: 1,
    e1rm: 152.5,
    workoutSnapshot: {
      lift: 'Squat',
      sets: [{ weight: 152.5, reps: 1, done: true }],
    },
  };

  const afterDouble = mergeHigherOneRMs(
    { Squat: 145, Bench: 100, Deadlift: 180 },
    calculateActualOneRMsFromHistory([double])
  );
  expect(afterDouble.Squat).toBe(150);

  expect(mergeHigherOneRMs(
    afterDouble,
    calculateActualOneRMsFromHistory([double, single])
  ).Squat).toBe(152.5);
});
