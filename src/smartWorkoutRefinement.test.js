import { generateUltraProgram } from './App';

test('uses four-rep volume work at 70% after the Deadlift top double', () => {
  const workouts = generateUltraProgram(145, 100, 180);
  const workout = workouts.find(
    item => item.label === 'Ultra Deadlift + Bench Volume'
  );

  expect(workout).toBeTruthy();

  const deadlift = workout.lifts.find(item => item.lift === 'Deadlift');
  const bench = workout.lifts.find(item => item.lift === 'Bench');

  expect(deadlift.sets).toHaveLength(5);
  expect(deadlift.sets[0]).toMatchObject({
    labelKey: 'topDouble',
    reps: 2,
    pct: 0.8,
  });

  expect(deadlift.sets.slice(1)).toHaveLength(4);
  deadlift.sets.slice(1).forEach(set => {
    expect(set).toMatchObject({
      labelKey: 'backoff',
      reps: 4,
      pct: 0.7,
    });
  });

  expect(bench.sets).toHaveLength(4);
  bench.sets.forEach(set => {
    expect(set).toMatchObject({
      labelKey: 'workSets',
      reps: 4,
      pct: 0.7,
    });
  });
});
