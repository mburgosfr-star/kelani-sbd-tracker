import {
  buildNextCycleE1RMs,
  deriveCycleE1RMs,
  hasCompleteCycleE1RMs,
  normalizeCycleE1RMs,
} from './smartCycleBasis';

const seedHistory = [
  { cycle: 0, workoutNumber: 0, seedMax: true, lift: 'Squat', topWeight: 100, topReps: 1, e1rm: 100 },
  { cycle: 0, workoutNumber: 0, seedMax: true, lift: 'Bench', topWeight: 75, topReps: 1, e1rm: 75 },
  { cycle: 0, workoutNumber: 0, seedMax: true, lift: 'Deadlift', topWeight: 125, topReps: 1, e1rm: 125 },
];

function completedLift({ lift, weight, reps, cycle = 1, workoutNumber = 1 }) {
  return {
    cycle,
    workoutNumber,
    lift,
    topWeight: weight,
    topReps: reps,
    e1rm: weight * (1 + reps / 30),
    workoutSnapshot: {
      type: 'training',
      lifts: [{
        lift,
        sets: [{ weight, reps, done: true, failed: false, skipped: false }],
      }],
    },
  };
}

test('normalizes every cycle e1RM to a 2.5kg barbell step', () => {
  expect(normalizeCycleE1RMs({
    Squat: 101.3,
    Bench: 97.6,
    Deadlift: 181.3,
  })).toEqual({
    Squat: 102.5,
    Bench: 97.5,
    Deadlift: 182.5,
  });
});

test('a persisted cycle basis stays authoritative when live PRs improve', () => {
  const result = deriveCycleE1RMs({
    savedCycleE1RMs: { Squat: 100, Bench: 75, Deadlift: 125 },
    prs: { Squat: 112.5, Bench: 82.5, Deadlift: 140 },
    history: [
      ...seedHistory,
      completedLift({ lift: 'Squat', weight: 105, reps: 2 }),
    ],
    currentCycle: 1,
  });

  expect(result).toEqual({ Squat: 100, Bench: 75, Deadlift: 125 });
});

test('legacy migration reconstructs cycle start without current-cycle results', () => {
  const result = deriveCycleE1RMs({
    prs: { Squat: 112.5, Bench: 75, Deadlift: 125 },
    history: [
      ...seedHistory,
      completedLift({ lift: 'Squat', weight: 105, reps: 2 }),
    ],
    currentCycle: 1,
  });

  expect(result).toEqual({ Squat: 100, Bench: 75, Deadlift: 125 });
});

test('the next cycle adopts genuinely achieved progress from the prior cycle', () => {
  const result = buildNextCycleE1RMs({
    prs: { Squat: 112.5, Bench: 75, Deadlift: 125 },
    history: [
      ...seedHistory,
      completedLift({ lift: 'Squat', weight: 105, reps: 2 }),
    ],
    nextCycle: 2,
  });

  expect(result).toEqual({ Squat: 112.5, Bench: 75, Deadlift: 125 });
  expect(hasCompleteCycleE1RMs(result)).toBe(true);
});

test('an incomplete saved object is repaired per lift without changing valid values', () => {
  const result = deriveCycleE1RMs({
    savedCycleE1RMs: { Squat: 102.5 },
    prs: { Squat: 115, Bench: 80, Deadlift: 130 },
    history: seedHistory,
    currentCycle: 1,
  });

  expect(result).toEqual({ Squat: 102.5, Bench: 75, Deadlift: 125 });
});
