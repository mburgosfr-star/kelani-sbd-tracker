import { mergeGeneratedWorkoutStructure } from './workoutStateMerge';

function multiLiftWorkout({ done }) {
  return {
    number: 5,
    type: 'training',
    lift: 'Squat',
    lifts: [
      {
        lift: 'Squat',
        warmups: [{ reps: 5, weight: 20, done }],
        sets: [
          { labelKey: 'topTriple', reps: 3, pct: 0.725, weight: 90, originalWeight: 90, done },
          { labelKey: 'backoff', reps: 5, pct: 0.625, weight: 80, originalWeight: 80, done: false },
        ],
        prepItems: [],
      },
    ],
    prepItems: [],
    accessories: [],
  };
}

test('preserves a checked-off in-progress workout across a reload merge instead of wiping it', () => {
  const restoredWorkout = multiLiftWorkout({ done: true });
  const generatedWorkout = multiLiftWorkout({ done: false });

  // No history entry for workout 5 - it hasn't been completed yet, only
  // partially checked off in the athlete's current session.
  const result = mergeGeneratedWorkoutStructure(
    [restoredWorkout],
    [generatedWorkout],
    [],
    1
  );

  expect(result[0].lifts[0].warmups[0].done).toBe(true);
  expect(result[0].lifts[0].sets[0].done).toBe(true);
});

test('still adopts the freshly generated workout when the slot has never been touched', () => {
  const staleWorkout = multiLiftWorkout({ done: false });
  const freshWorkout = {
    ...multiLiftWorkout({ done: false }),
    label: 'Freshly Regenerated',
  };

  const result = mergeGeneratedWorkoutStructure(
    [staleWorkout],
    [freshWorkout],
    [],
    1
  );

  expect(result[0].label).toBe('Freshly Regenerated');
});

test('preserves in-progress data for a flat (non-multi-lift) workout too', () => {
  const restoredWorkout = {
    number: 3,
    type: 'training',
    lift: 'Bench',
    lifts: [],
    warmups: [{ reps: 5, weight: 20, done: true }],
    sets: [
      { labelKey: 'topTriple', reps: 3, pct: 0.7, weight: 70, originalWeight: 70, done: true },
    ],
    prepItems: [],
  };
  const generatedWorkout = {
    number: 3,
    type: 'training',
    lift: 'Bench',
    lifts: [],
    warmups: [{ reps: 5, weight: 20, done: false }],
    sets: [
      { labelKey: 'topTriple', reps: 3, pct: 0.7, weight: 70, originalWeight: 70, done: false },
    ],
    prepItems: [],
  };

  const result = mergeGeneratedWorkoutStructure(
    [restoredWorkout],
    [generatedWorkout],
    [],
    1
  );

  expect(result[0].sets[0].done).toBe(true);
  expect(result[0].warmups[0].done).toBe(true);
});

test('does not touch an already-completed workout, regardless of user progress', () => {
  const completedWorkout = multiLiftWorkout({ done: true });
  const freshWorkout = {
    ...multiLiftWorkout({ done: false }),
    label: 'Freshly Regenerated',
  };
  const history = [{ cycle: 1, workoutNumber: 5, workoutSnapshot: completedWorkout }];

  const result = mergeGeneratedWorkoutStructure(
    [completedWorkout],
    [freshWorkout],
    history,
    1
  );

  expect(result[0].label).not.toBe('Freshly Regenerated');
  expect(result[0].lifts[0].sets[0].done).toBe(true);
});
