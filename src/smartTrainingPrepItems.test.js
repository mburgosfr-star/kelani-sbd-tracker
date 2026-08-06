import { generateWorkoutsForTrainingModel } from './smartTrainingEngine';

function findFirstSmartTrainingWorkout(workouts) {
  return workouts.find(workout => workout?.smartGeneratedPrescription);
}

test('Smart Training includes prep items for the primary lift by default', () => {
  const workouts = generateWorkoutsForTrainingModel('smart', {
    programProfile: 'kelaniSbd',
    squat: 100,
    bench: 70,
    deadlift: 120,
    history: [],
    currentIndex: 0,
    currentCycle: 1,
  });

  const workout = findFirstSmartTrainingWorkout(workouts);
  expect(workout).toBeTruthy();

  const primaryBlock = workout.lifts.find(
    liftBlock => liftBlock.lift === workout.smartTrainingSelectionSummary.primaryLift
  );

  expect(primaryBlock.prepItems.length).toBeGreaterThan(0);
  expect(workout.prepItems.length).toBeGreaterThan(0);
});

test('Smart Training omits prep items when preparationMode is off', () => {
  const workouts = generateWorkoutsForTrainingModel('smart', {
    programProfile: 'kelaniSbd',
    squat: 100,
    bench: 70,
    deadlift: 120,
    preparationMode: 'off',
    history: [],
    currentIndex: 0,
    currentCycle: 1,
  });

  const workout = findFirstSmartTrainingWorkout(workouts);
  expect(workout).toBeTruthy();

  workout.lifts.forEach(liftBlock => {
    expect(liftBlock.prepItems).toEqual([]);
  });
});
