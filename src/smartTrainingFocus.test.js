import { applyAccessoryPlanToWorkouts } from './accessoryGeneration';

const workout = (lift, done = false) => ({
  number: 3,
  type: 'training',
  lifts: [{
    lift: 'Deadlift',
    warmups: [],
    sets: [{ reps: 3, weight: 50, done: false }],
  }, {
    lift,
    warmups: [],
    sets: [{ reps: 4, weight: 30, done }],
  }],
  accessories: [],
  prepItems: [],
});

test('switching focus never maps in-progress Bench sets onto Squat', () => {
  const started = workout('Bench', true);
  const focused = workout('Squat');
  expect(applyAccessoryPlanToWorkouts([started], [focused], new Set(), 3)[0])
    .toBe(started);
  expect(applyAccessoryPlanToWorkouts([workout('Bench')], [focused], new Set(), 3)[0]
    .lifts.map(block => block.lift)).toEqual(['Deadlift', 'Squat']);
});

test('completed workouts retain their recorded lift even after focus changes', () => {
  const completed = workout('Bench', true);
  expect(applyAccessoryPlanToWorkouts([completed], [workout('Squat')], new Set([3]), 4)[0])
    .toBe(completed);
});
