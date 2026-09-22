import { getActiveMultiLiftStep } from './workoutFocusSequence';

const workoutSetup = {
  preparation: {
    enabled: true,
    byLift: {
      Squat: [{ key: 'prepHipOpeners', sets: 2, reps: 10 }],
      Bench: [{ key: 'prepBandPullApart', sets: 2, reps: 20 }],
      Deadlift: [],
    },
  },
  accessories: { enabled: false, byLift: {} },
};

function workout({ squatPrep = false, benchPrep = false, squatWarmup = false, squatSet = false } = {}) {
  return {
    prepItems: [
      { labelKey: 'prepHipOpeners', done: squatPrep },
      { labelKey: 'prepBandPullApart', done: benchPrep },
    ],
    lifts: [
      { lift: 'Squat', warmups: [{ done: squatWarmup }], sets: [{ done: squatSet }] },
      { lift: 'Bench', warmups: [{ done: false }], sets: [{ done: false }] },
    ],
  };
}

test('focus alternates preparation and main work by lift while preparation stays in one list', () => {
  expect(getActiveMultiLiftStep(workout(), workoutSetup)).toEqual({ type: 'prep', liftIndex: 0, index: 0 });
  expect(getActiveMultiLiftStep(workout({ squatPrep: true }), workoutSetup))
    .toEqual({ type: 'warmup', liftIndex: 0, index: 0 });
  expect(getActiveMultiLiftStep(workout({ squatPrep: true, squatWarmup: true }), workoutSetup))
    .toEqual({ type: 'set', liftIndex: 0, index: 0 });
  expect(getActiveMultiLiftStep(workout({ squatPrep: true, squatWarmup: true, squatSet: true }), workoutSetup))
    .toEqual({ type: 'prep', liftIndex: 1, index: 1 });
  expect(getActiveMultiLiftStep(workout({ squatPrep: true, benchPrep: true, squatWarmup: true, squatSet: true }), workoutSetup))
    .toEqual({ type: 'warmup', liftIndex: 1, index: 0 });
});

test('older unlinked preparation uses lift-specific fallback without altering the workout', () => {
  const original = workout({ squatPrep: true, squatWarmup: true, squatSet: true });
  expect(getActiveMultiLiftStep(original, null, 'basicFirst'))
    .toEqual({ type: 'prep', liftIndex: 1, index: 1 });
  expect(original.prepItems[1]).toEqual({ labelKey: 'prepBandPullApart', done: false });
});

test('a shared movement selected for both lifts belongs to its first workout lift', () => {
  const sharedSetup = {
    ...workoutSetup,
    preparation: { enabled: true, byLift: {
      Squat: [{ key: 'prepLightRows', sets: 2, reps: 15 }],
      Bench: [{ key: 'prepLightRows', sets: 2, reps: 15 }],
      Deadlift: [],
    } },
  };
  const sharedWorkout = {
    prepItems: [{ labelKey: 'prepLightRows', done: false }],
    lifts: workout().lifts,
  };
  expect(getActiveMultiLiftStep(sharedWorkout, sharedSetup))
    .toEqual({ type: 'prep', liftIndex: 0, index: 0 });
});
