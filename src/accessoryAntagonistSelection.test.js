import { generateAccessoriesForLift } from './accessoryGeneration';

const oneRMs = { Squat: 100, Bench: 70, Deadlift: 120 };

function keysFor(lift) {
  return generateAccessoriesForLift(lift, 'standard', {}, oneRMs).map(item => item.key);
}

test('default accessories provide a balanced hypertrophy complement to the main lifts', () => {
  expect(keysFor('Squat')).toEqual(['pulldown', 'legCurl']);
  expect(keysFor('Bench')).toEqual(['hipThrust', 'row']);
  expect(keysFor('Deadlift')).toEqual(['legExtension', 'plank']);
});

test.each(['standard', 'upperBackFriendly', 'lowerBodyFriendly'])(
  '%s accessories fill all four workout-grid columns',
  mode => {
    ['Squat', 'Bench', 'Deadlift'].forEach(lift => {
      generateAccessoriesForLift(lift, mode, {}, oneRMs).forEach(accessory => {
        expect(accessory.weights).toHaveLength(4);
        expect(accessory.done).toHaveLength(4);
      });
    });
  }
);

test('planks are generated as timed bodyweight work instead of weighted repetitions', () => {
  const plank = generateAccessoriesForLift('Deadlift', 'standard', {}, oneRMs)
    .find(item => item.key === 'plank');

  expect(plank).toMatchObject({
    nameKey: 'accessoryPlank',
    bodyweight: true,
    durationSeconds: 30,
    weights: [0, 0, 0, 0],
    done: [false, false, false, false],
  });
  expect(plank.reps).toBeUndefined();
});
