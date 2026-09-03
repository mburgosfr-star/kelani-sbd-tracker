import { mergeGeneratedWorkoutStructure } from './workoutStateMerge';
import { applyAccessoryPlanToWorkouts, generateAccessoriesForWorkout } from './accessoryGeneration';

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

test.each(['training', 'meet'])('preserves preparation-only progress across a %s reload', type => {
  const saved = multiLiftWorkout({ done: false });
  saved.type = type;
  saved.lifts[0].prepItems = [{ labelKey: 'prepHipOpeners', done: true }];
  const generated = multiLiftWorkout({ done: false });
  generated.type = type;
  generated.lifts[0].prepItems = [{ labelKey: 'prepHipOpeners', done: false }];

  const [restored] = mergeGeneratedWorkoutStructure(
    JSON.parse(JSON.stringify([saved])), [generated], [], 1
  );

  expect(restored.lifts[0].prepItems[0].done).toBe(true);
  expect(restored.lifts[0].warmups[0].done).toBe(false);
  expect(restored.lifts[0].sets[0].done).toBe(false);
});

test.each(['adjusted', 'done', 'failed', 'skipped'])(
  'preserves a Row that was %s before the main work, across reload and accessory regeneration', state => {
    const generated = multiLiftWorkout({ done: false });
    generated.lift = 'Bench';
    generated.lifts[0].lift = 'Bench';
    generated.accessories = generateAccessoriesForWorkout(generated, {
      accessoryMode: 'standard', oneRMs: { Squat: 100, Bench: 70, Deadlift: 120 }, smart: true,
    });
    const saved = JSON.parse(JSON.stringify(generated));
    const savedRow = saved.accessories.find(item => item.key === 'row');
    if (state === 'adjusted') {
      savedRow.weights[0] = 25;
      savedRow.adjustedFromOriginal[0] = true;
    } else {
      savedRow[state] = [true, false, false, false];
    }

    const reloaded = mergeGeneratedWorkoutStructure(JSON.parse(JSON.stringify([saved])), [generated], [], 1);
    const [restored] = applyAccessoryPlanToWorkouts(reloaded, [generated], new Set(), generated.number);
    expect(restored.accessories.find(item => item.key === 'row')).toEqual(savedRow);
    expect(restored.lifts[0].sets[0].done).toBe(false);
  }
);

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

test('repairs duplicated meet warmup padding while preserving checked progress', () => {
  const attempt = weight => ({
    reps: 1,
    weight,
    originalWeight: weight,
    done: false,
    failed: false,
    skipped: false,
  });
  const restoredWorkout = {
    number: 46,
    type: 'meet',
    lifts: [{
      lift: 'Squat',
      warmups: [20, 20, 20, 20, 30].map((weight, index) => ({
        reps: weight === 30 ? 3 : 5,
        weight,
        originalWeight: weight,
        done: index === 0,
      })),
      sets: [37.5, 42.5, 45].map(attempt),
    }],
    warmups: [],
    sets: [37.5, 42.5, 45].map(attempt),
  };
  const generatedWorkout = {
    ...restoredWorkout,
    lifts: [{
      ...restoredWorkout.lifts[0],
      warmups: [
        { reps: 5, weight: 20, originalWeight: 20, done: false },
        { reps: 3, weight: 30, originalWeight: 30, done: false },
      ],
    }],
  };

  const [result] = mergeGeneratedWorkoutStructure(
    [restoredWorkout],
    [generatedWorkout],
    [],
    1
  );

  expect(result.lifts[0].warmups).toEqual([
    { reps: 5, weight: 20, originalWeight: 20, done: true },
    { reps: 3, weight: 30, originalWeight: 30, done: false },
  ]);
  expect(result.lifts[0].sets).toEqual(restoredWorkout.lifts[0].sets);
});
