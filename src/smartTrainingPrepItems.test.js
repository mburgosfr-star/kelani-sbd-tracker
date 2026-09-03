import { buildSmartIdealTrainingWorkout, generateWorkoutsForTrainingModel } from './smartTrainingEngine';
import { generatePrepItems, generateSmartPrepItems } from './warmupAndPrepGeneration';
import { getSmartIdealRouteWorkout } from './smartIdealRoute';
import { applyAccessoryPlanToWorkouts } from './accessoryGeneration';
import { translations } from './translations';

const baseOptions = {
  programProfile: 'kelaniSbd',
  squat: 100,
  bench: 70,
  deadlift: 120,
  history: [],
  currentIndex: 0,
  currentCycle: 1,
  skipMeetProjectionSimulation: true,
};

test('Bench preparation uses four compactly named exercises', () => {
  expect(generatePrepItems('Bench', 'basicFirst')).toHaveLength(4);
  expect(translations.en.prepBandPullApart).toBe('Pull-aparts');
  expect(translations.en.prepBandExternalRotation).toBe('External rotations');
});

function findFirstSmartTrainingWorkout(workouts) {
  return workouts.find(workout => workout?.smartGeneratedPrescription);
}

test.each([false, true])('Smart Training prepares every main lift by default (ideal route: %s)', idealRouteEnabled => {
  const workouts = generateWorkoutsForTrainingModel('smart', { ...baseOptions, idealRouteEnabled });

  const workout = findFirstSmartTrainingWorkout(workouts);
  expect(workout).toBeTruthy();

  expect(workout.lifts.length).toBeGreaterThan(1);
  workout.lifts.forEach(block => {
    expect(block.prepItems).toEqual(generatePrepItems(block.lift));
    expect(block.prepItems).toHaveLength(4);
  });
  expect(workout.prepItems).toEqual(workout.lifts[0].prepItems);
});

test.each(['basic', 'basicFirst', 'basicAll'])(
  '%s prepares every big lift in training and meet templates, including three-lift days', preparationMode => {
    const workouts = generateWorkoutsForTrainingModel('smart', {
      ...baseOptions,
      programProfile: 'kelaniSbdUltra',
      preparationMode,
    });

    expect(workouts.some(workout => workout.type === 'meet')).toBe(true);
    expect(workouts.some(workout => workout.type === 'training' && workout.lifts.length === 3)).toBe(true);

    workouts.filter(workout => ['training', 'meet'].includes(workout.type)).forEach(workout => {
      workout.lifts.forEach(block => {
        expect(block.prepItems).toEqual(generatePrepItems(block.lift));
        expect(block.prepItems.every(item => item.done === false)).toBe(true);
      });
      const keys = workout.lifts.flatMap(block => block.prepItems.map(item => item.labelKey));
      expect(new Set(keys).size).toBe(keys.length);
    });
    workouts.filter(workout => workout.type === 'rest').forEach(workout => {
      expect(workout.prepItems || []).toEqual([]);
      expect(workout.lifts).toEqual([]);
    });
  }
);

test('Smart Training omits prep items everywhere when preparationMode is off', () => {
  const workouts = generateWorkoutsForTrainingModel('smart', {
    ...baseOptions,
    preparationMode: 'off',
  });

  workouts.forEach(workout => {
    expect(workout.prepItems || []).toEqual([]);
    workout.lifts.forEach(block => expect(block.prepItems).toEqual([]));
  });
});

test('the shared shoulder routine is offered once per day, not repeated for each lift', () => {
  const workouts = generateWorkoutsForTrainingModel('smart', {
    ...baseOptions,
    preparationMode: 'shoulderThoracic',
  });

  workouts.filter(workout => ['training', 'meet'].includes(workout.type)).forEach(workout => {
    expect(workout.lifts[0].prepItems).toEqual(generatePrepItems(workout.lifts[0].lift, 'shoulderThoracic'));
    workout.lifts.slice(1).forEach(block => expect(block.prepItems).toEqual([]));
  });
});

test.each([22, 24, 25])('taper workout %s includes preparation for every lift without altering warmups or dose', workoutNumber => {
  const options = {
    ...baseOptions,
    routeWorkout: getSmartIdealRouteWorkout({ workoutNumber, athleteLevel: 'intermediate' }),
  };
  const withPrep = buildSmartIdealTrainingWorkout(options);
  const withoutPrep = buildSmartIdealTrainingWorkout({ ...options, preparationMode: 'off' });

  expect(withPrep).toBeTruthy();
  withPrep.lifts.forEach((block, index) => {
    expect(block.prepItems).toEqual(generatePrepItems(block.lift));
    expect(block.sets).toEqual(withoutPrep.lifts[index].sets);
    expect(block.warmups).toEqual(withoutPrep.lifts[index].warmups);
  });
});

test('preparation covers only the lifts selected for that day and never changes their prescription', () => {
  const enabled = generateWorkoutsForTrainingModel('smart', baseOptions);
  const disabled = generateWorkoutsForTrainingModel('smart', { ...baseOptions, preparationMode: 'off' });

  enabled.forEach((workout, index) => {
    expect(workout.type).toBe(disabled[index].type);
    expect(workout.lifts.map(block => block.lift)).toEqual(disabled[index].lifts.map(block => block.lift));
    workout.lifts.forEach((block, liftIndex) => {
      expect(block.sets).toEqual(disabled[index].lifts[liftIndex].sets);
      expect(block.warmups).toEqual(disabled[index].lifts[liftIndex].warmups);
    });
  });
});

test('regeneration adds secondary preparation while preserving existing checkmarks and completed snapshots', () => {
  const [generated] = generateWorkoutsForTrainingModel('smart', baseOptions);
  const saved = JSON.parse(JSON.stringify(generated));
  saved.lifts[0].prepItems[0].done = true;
  saved.lifts[1].prepItems = [];
  const [merged] = applyAccessoryPlanToWorkouts([saved], [generated], new Set(), 1);

  expect(merged.lifts[0].prepItems[0].done).toBe(true);
  expect(merged.lifts[1].prepItems).toEqual(generatePrepItems(merged.lifts[1].lift));
  expect(merged.lifts[0].sets).toEqual(saved.lifts[0].sets);
  expect(saved.lifts[1].prepItems).toEqual([]);

  const [completed] = applyAccessoryPlanToWorkouts([saved], [generated], new Set([1]), 2);
  expect(completed).toBe(saved);
});

test('Classic retains its existing first-lift-only preparation', () => {
  const [workout] = generateWorkoutsForTrainingModel('classic', baseOptions);
  expect(workout.lifts[0].prepItems).toHaveLength(4);
  expect(workout.lifts[1].prepItems).toEqual([]);
});

test.each(['nl', 'en', 'ca'])('all lift-specific and shared preparation has translated labels in %s', language => {
  for (const lift of ['Squat', 'Bench', 'Deadlift']) {
    for (const mode of ['basicFirst', 'shoulderThoracic']) {
      for (const item of generateSmartPrepItems(lift, mode)) {
        expect(translations[language][item.labelKey]).toEqual(expect.any(String));
        expect(translations[language][item.labelKey].trim()).not.toBe('');
      }
    }
  }
});
