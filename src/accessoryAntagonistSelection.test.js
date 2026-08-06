import { generateAccessoriesForLift } from './accessoryGeneration';

const oneRMs = { Squat: 100, Bench: 70, Deadlift: 120 };

function keysFor(lift) {
  return generateAccessoriesForLift(lift, 'standard', {}, oneRMs).map(item => item.key);
}

test('default accessories favor the opposite muscle group/pattern instead of duplicating the main lift', () => {
  expect(keysFor('Squat')).toEqual(['legCurl', 'machineCrunch']);
  expect(keysFor('Bench')).toEqual(['row', 'shoulderRotations']);
  expect(keysFor('Deadlift')).toEqual(['legExtension', 'hipAbduction']);
});
