import {
  applyAccessoryPlanToWorkouts,
  generateAccessoriesForLift,
  generateAccessoriesForWorkout,
} from './accessoryGeneration';
import { generateWorkoutsForTrainingModel } from './smartTrainingEngine';
import { translations } from './translations';

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

function benchWorkout(overrides = {}) {
  return {
    number: 1,
    type: 'training',
    lift: 'Squat',
    lifts: [{ lift: 'Squat', sets: [] }, { lift: 'Bench', sets: [] }],
    ...overrides,
  };
}

test.each(['standard', 'upperBackFriendly', 'lowerBodyFriendly', 'basic', 'full'])(
  '%s always includes exactly one Row for primary, secondary and single-lift Bench', accessoryMode => {
    for (const lifts of [['Bench'], ['Bench', 'Squat'], ['Squat', 'Bench'], ['Deadlift', 'Squat', 'Bench']]) {
      const accessories = generateAccessoriesForWorkout(benchWorkout({
        lifts: lifts.map(lift => ({ lift })),
      }), { accessoryMode, oneRMs, smart: true });
      const rows = accessories.filter(item => item.key === 'row');

      expect(rows).toHaveLength(1);
      expect(rows[0].weights).toHaveLength(4);
      expect(rows[0].done).toEqual([false, false, false, false]);
      if (lifts.length > 1) expect(accessories).toHaveLength(lifts.length);
    }
  }
);

test.each(['standard', 'upperBackFriendly', 'lowerBodyFriendly'])(
  '%s taper includes only a light Row, even with a higher saved Row PR', accessoryMode => {
    const accessories = generateAccessoriesForWorkout(benchWorkout({
      smartIdealRoute: { stage: 'taper' },
    }), { accessoryMode, accessoryPRs: { row: 60 }, oneRMs, smart: true });

    expect(accessories).toHaveLength(1);
    expect(accessories[0]).toMatchObject({
      key: 'row',
      reps: 5,
      weights: [30, 30, 30, 30],
      originalWeights: [30, 30, 30, 30],
    });
  }
);

test.each([10, 20, 50, 122.5, 200, 1000])('light Row keeps valid positive increments at a %s kg source max', deadlift => {
  const options = { accessoryMode: 'standard', oneRMs: { ...oneRMs, Deadlift: deadlift } };
  const regular = generateAccessoriesForWorkout(benchWorkout(), options).find(item => item.key === 'row');
  const light = generateAccessoriesForWorkout(benchWorkout({ accessoryIntensity: 'light' }), options)[0];

  expect(light.reps).toBe(5);
  light.weights.forEach(weight => {
    expect(weight).toBeGreaterThanOrEqual(2.5);
    expect(weight % 2.5).toBe(0);
    expect(weight).toBeLessThanOrEqual(regular.weights[0]);
  });
});

test('deload Bench keeps a light Row without changing the other accessory choices', () => {
  const workout = benchWorkout({ lift: 'Bench', lifts: [{ lift: 'Bench' }] });
  const options = { accessoryMode: 'standard', oneRMs, smart: true };
  const regular = generateAccessoriesForWorkout(workout, options);
  const deload = generateAccessoriesForWorkout({ ...workout, smartDayType: 'deload' }, options);

  expect(deload.map(item => item.key)).toEqual(regular.map(item => item.key));
  expect(deload.find(item => item.key !== 'row')).toEqual(regular.find(item => item.key !== 'row'));
  expect(deload.find(item => item.key === 'row')).toMatchObject({ reps: 5, weights: [15, 15, 15, 15] });
});

test('rest, meet, accessories off and workouts without Bench do not gain Row', () => {
  const options = { accessoryMode: 'standard', oneRMs, smart: true };
  for (const type of ['rest', 'meet']) {
    expect(generateAccessoriesForWorkout(benchWorkout({ type }), options)).toEqual([]);
  }
  expect(generateAccessoriesForWorkout(benchWorkout(), { ...options, accessoryMode: 'off' })).toEqual([]);
  expect(generateAccessoriesForWorkout(benchWorkout({
    lift: 'Deadlift', lifts: [{ lift: 'Deadlift' }],
  }), options).map(item => item.key)).toEqual(['legExtension', 'plank']);
  expect(generateAccessoriesForWorkout(benchWorkout({
    lifts: [{ lift: 'Squat' }], accessoryIntensity: 'light',
  }), options)).toEqual([]);
});

const generationContexts = ['standard', 'upperBackFriendly', 'lowerBodyFriendly', 'off'].flatMap(accessoryMode =>
  [
    { model: 'classic', idealRouteEnabled: false },
    { model: 'smart', idealRouteEnabled: false },
    { model: 'smart', idealRouteEnabled: true },
  ].map(context => ({ ...context, accessoryMode }))
);

test.each(generationContexts)(
  'final $model workouts obey the Bench/Row rule ($accessoryMode, ideal: $idealRouteEnabled)',
  ({ model, idealRouteEnabled, accessoryMode }) => {
    for (const programProfile of ['kelaniSbd', 'kelaniSbdUltra', 'kelaniSbdLower']) {
      const options = {
        programProfile, idealRouteEnabled, accessoryMode,
        squat: oneRMs.Squat, bench: oneRMs.Bench, deadlift: oneRMs.Deadlift,
        preparationMode: 'off', currentCycle: 1, currentIndex: 0, history: [],
        skipMeetProjectionSimulation: true,
      };
      const workouts = generateWorkoutsForTrainingModel(model, options);
      const withoutAccessories = generateWorkoutsForTrainingModel(model, { ...options, accessoryMode: 'off' });

      workouts.forEach((workout, index) => {
        const hasBench = workout.type === 'training' && workout.lifts.some(block => block.lift === 'Bench');
        const rows = (workout.accessories || []).filter(item => item.key === 'row');
        expect(rows).toHaveLength(hasBench && accessoryMode !== 'off' ? 1 : 0);
        if (accessoryMode === 'off' || workout.type !== 'training') expect(workout.accessories).toEqual([]);
        if (workout.accessoryIntensity === 'light') {
          expect(workout.accessories).toEqual(rows);
          rows.forEach(row => expect(row.reps).toBe(5));
        }
        // Accessories must not change the chosen lifts, warmups, work sets or day type.
        expect(workout.type).toBe(withoutAccessories[index].type);
        expect(workout.lifts).toEqual(withoutAccessories[index].lifts);
      });
    }
  }
);

test('regeneration adds a missing Row without replacing started accessories or completed snapshots', () => {
  const generated = benchWorkout();
  generated.accessories = generateAccessoriesForWorkout(generated, { accessoryMode: 'standard', oneRMs, smart: true });
  const started = {
    key: 'hipThrust', reps: 8, weights: [65, 65, 65, 65], originalWeights: [60, 60, 60, 60],
    done: [true, false, false, false], adjustedFromOriginal: [true, true, true, true],
  };
  const saved = { ...generated, accessories: [started] };
  const [merged] = applyAccessoryPlanToWorkouts([saved], [generated], new Set(), 1);

  expect(merged.accessories[0]).toBe(started);
  expect(merged.accessories.map(item => item.key)).toEqual(['hipThrust', 'row']);
  const [again] = applyAccessoryPlanToWorkouts([merged], [generated], new Set(), 1);
  expect(again.accessories).toEqual(merged.accessories);
  const [completed] = applyAccessoryPlanToWorkouts([saved], [generated], new Set([1]), 2);
  expect(completed).toBe(saved);
  expect(saved.accessories).toEqual([started]);
});

test('an untouched cached Row adopts taper load while a manually adjusted Row remains intact', () => {
  const saved = benchWorkout();
  saved.accessories = generateAccessoriesForWorkout(saved, { accessoryMode: 'standard', oneRMs, smart: true });
  const generated = { ...saved, accessoryIntensity: 'light' };
  generated.accessories = generateAccessoriesForWorkout(generated, { accessoryMode: 'standard', oneRMs, smart: true });
  const [merged] = applyAccessoryPlanToWorkouts([saved], [generated], new Set(), 1);
  expect(merged.accessories).toEqual(generated.accessories);

  const adjustedRow = saved.accessories.find(item => item.key === 'row');
  adjustedRow.weights[0] = 25;
  adjustedRow.adjustedFromOriginal[0] = true;
  const [preserved] = applyAccessoryPlanToWorkouts([saved], [generated], new Set(), 1);
  expect(preserved.accessories.find(item => item.key === 'row')).toEqual(adjustedRow);
});

test.each(['nl', 'en', 'ca'])('Row and its accessory-setting descriptions are translated in %s', language => {
  const t = translations[language];
  expect(t.accessoryRow).toBeTruthy();
  expect(t.programAccessoriesGeneralText).toMatch(/Row|rem/);
  expect(t.programAccessoriesUpperBackFriendlyText).toMatch(/Row|rem/);
});
