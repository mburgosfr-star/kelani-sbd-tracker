import { buildSmartIdealTrainingWorkout, generateWorkoutsForTrainingModel } from './smartTrainingEngine';
import {
  generatePrepItems,
  generateSmartWorkoutPrepItems,
} from './warmupAndPrepGeneration';
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

test('shared preparation gives every selected lift coverage before adding a second item', () => {
  expect(generateSmartWorkoutPrepItems(['Squat']).map(item => item.labelKey)).toEqual([
    'prepHipOpeners',
    'prepBodyweightSquats',
    'prepGluteBridges',
    'prepBracingBreaths',
  ]);
  expect(generateSmartWorkoutPrepItems(['Squat', 'Bench']).map(item => item.labelKey)).toEqual([
    'prepHipOpeners',
    'prepBandPullApart',
    'prepBodyweightSquats',
    'prepBandExternalRotation',
  ]);
  expect(generateSmartWorkoutPrepItems(['Squat', 'Bench', 'Deadlift']).map(item => item.labelKey)).toEqual([
    'prepHipOpeners',
    'prepBandPullApart',
    'prepHipHinges',
    'prepBodyweightSquats',
  ]);
});

function findFirstSmartTrainingWorkout(workouts) {
  return workouts.find(workout => workout?.smartGeneratedPrescription);
}

test.each([false, true])('Smart Training puts one shared preparation section before all main lifts (ideal route: %s)', idealRouteEnabled => {
  const workouts = generateWorkoutsForTrainingModel('smart', { ...baseOptions, idealRouteEnabled });

  const workout = findFirstSmartTrainingWorkout(workouts);
  expect(workout).toBeTruthy();
  expect(workout.lifts.length).toBeGreaterThan(1);
  expect(workout.prepItems).toEqual(generateSmartWorkoutPrepItems(workout.lifts));
  expect(workout.prepItems).toHaveLength(4);
  workout.lifts.forEach(block => expect(block.prepItems).toEqual([]));
});

test.each(['basic', 'basicFirst', 'basicAll'])(
  '%s creates one four-item preparation section for training and meet days', preparationMode => {
    const workouts = generateWorkoutsForTrainingModel('smart', {
      ...baseOptions,
      programProfile: 'kelaniSbdUltra',
      preparationMode,
    });

    expect(workouts.some(workout => workout.type === 'meet')).toBe(true);
    expect(workouts.some(workout => workout.type === 'training' && workout.lifts.length === 3)).toBe(true);

    workouts.filter(workout => ['training', 'meet'].includes(workout.type)).forEach(workout => {
      expect(workout.prepItems).toEqual(
        generateSmartWorkoutPrepItems(workout.lifts, preparationMode)
      );
      expect(workout.prepItems).toHaveLength(4);
      expect(workout.prepItems.every(item => item.done === false)).toBe(true);
      workout.lifts.forEach(block => expect(block.prepItems).toEqual([]));
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

test('the complete five-item shoulder routine remains one shared section', () => {
  const workouts = generateWorkoutsForTrainingModel('smart', {
    ...baseOptions,
    preparationMode: 'shoulderThoracic',
  });

  workouts.filter(workout => ['training', 'meet'].includes(workout.type)).forEach(workout => {
    expect(workout.prepItems).toEqual(
      generatePrepItems(workout.lifts[0].lift, 'shoulderThoracic')
    );
    expect(workout.prepItems).toHaveLength(5);
    workout.lifts.forEach(block => expect(block.prepItems).toEqual([]));
  });
});

test.each([22, 24, 25])('taper workout %s shares preparation without altering warmups or dose', workoutNumber => {
  const options = {
    ...baseOptions,
    routeWorkout: getSmartIdealRouteWorkout({ workoutNumber, athleteLevel: 'intermediate' }),
  };
  const withPrep = buildSmartIdealTrainingWorkout(options);
  const withoutPrep = buildSmartIdealTrainingWorkout({ ...options, preparationMode: 'off' });

  expect(withPrep).toBeTruthy();
  expect(withPrep.prepItems).toEqual(generateSmartWorkoutPrepItems(withPrep.lifts));
  withPrep.lifts.forEach((block, index) => {
    expect(block.prepItems).toEqual([]);
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

test('regeneration migrates per-lift preparation progress into the shared section', () => {
  const [generated] = generateWorkoutsForTrainingModel('smart', baseOptions);
  const saved = JSON.parse(JSON.stringify(generated));
  const completedKey = generated.prepItems[1].labelKey;
  saved.prepItems = [];
  saved.lifts = saved.lifts.map(block => ({
    ...block,
    prepItems: generatePrepItems(block.lift),
  }));
  const completedLegacyItem = saved.lifts
    .flatMap(block => block.prepItems)
    .find(item => item.labelKey === completedKey);
  completedLegacyItem.done = true;

  const [merged] = applyAccessoryPlanToWorkouts([saved], [generated], new Set(), 1);

  expect(merged.prepItems.find(item => item.labelKey === completedKey).done).toBe(true);
  expect(merged.lifts.every(block => block.prepItems.length === 0)).toBe(true);
  expect(merged.lifts[0].sets).toEqual(saved.lifts[0].sets);

  const [completed] = applyAccessoryPlanToWorkouts([saved], [generated], new Set([1]), 2);
  expect(completed).toBe(saved);
});

test('Classic retains its existing first-lift-only preparation', () => {
  const [workout] = generateWorkoutsForTrainingModel('classic', baseOptions);
  expect(workout.lifts[0].prepItems).toHaveLength(4);
  expect(workout.lifts[1].prepItems).toEqual([]);
  expect(workout.prepItems).toEqual(workout.lifts[0].prepItems);
});

test.each(['nl', 'en', 'ca'])('all shared preparation has translated labels in %s', language => {
  for (const mode of ['basicFirst', 'shoulderThoracic']) {
    for (const item of generateSmartWorkoutPrepItems(['Squat', 'Bench', 'Deadlift'], mode)) {
      expect(translations[language][item.labelKey]).toEqual(expect.any(String));
      expect(translations[language][item.labelKey].trim()).not.toBe('');
    }
  }
});
