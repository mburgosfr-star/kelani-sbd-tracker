import { generateWorkoutsForTrainingModel } from './smartTrainingEngine';

test('fresh beginner Smart workout describes its actual route day', () => {
  const workouts = generateWorkoutsForTrainingModel('smart', {
    programProfile: 'kelaniSbd',
    athleteLevel: 'beginner',
    squat: 50,
    bench: 30,
    deadlift: 65,
    accessoryMode: 'off',
    preparationMode: 'off',
    history: [],
    currentCycle: 1,
    currentIndex: 0,
  });
  const first = workouts[0];
  expect(first.type).toBe('training');
  expect(first.smartIdealRoute?.workoutNumber).toBe(1);
  expect(first.smartDayType).toBe('training');
  expect(first.smartDecisionSummary?.dayType).toBe('training');
});
