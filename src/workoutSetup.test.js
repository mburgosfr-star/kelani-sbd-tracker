import { generateAccessoriesForWorkout } from './accessoryGeneration';
import { generateSmartWorkoutPrepItems } from './warmupAndPrepGeneration';
import {
  ACCESSORY_CATALOG,
  PREPARATION_CATALOG,
  createWorkoutSetup,
  normalizeWorkoutSetup,
} from './workoutSetup';

describe('user workout setup', () => {
  it('migrates the former choices into an editable starting setup', () => {
    const setup = createWorkoutSetup({ preparationMode: 'basicFirst', accessoryMode: 'standard' });
    expect(setup.preparation.byLift.Bench.map(item => item.key)).toEqual([
      'prepBandPullApart', 'prepBandExternalRotation',
    ]);
    expect(setup.accessories.byLift.Bench.map(item => item.key)).toEqual(['hipThrust', 'row']);
  });

  it('offers the complete exercise catalog for every big lift', () => {
    expect(PREPARATION_CATALOG.Squat.map(item => item.key)).toEqual(
      PREPARATION_CATALOG.Bench.map(item => item.key)
    );
    expect(PREPARATION_CATALOG.Deadlift.map(item => item.key)).toContain('prepBeachStretch');
    expect(ACCESSORY_CATALOG.Squat.map(item => item.key)).toEqual(
      ACCESSORY_CATALOG.Deadlift.map(item => item.key)
    );
    expect(ACCESSORY_CATALOG.Bench.map(item => item.key)).toContain('seatedCalfRaise');
  });

  it('uses only chosen preparation movements once for a combined workout', () => {
    const setup = normalizeWorkoutSetup({
      preparation: { enabled: true, byLift: {
        Squat: [{ key: 'prepHipOpeners', sets: 3, reps: 8 }],
        Bench: [{ key: 'prepBandPullApart', sets: 2, reps: 15 }],
        Deadlift: [],
      } },
      accessories: { enabled: false, byLift: {} },
    });
    expect(generateSmartWorkoutPrepItems(['Squat', 'Bench'], 'basicFirst', setup)).toEqual([
      expect.objectContaining({ labelKey: 'prepHipOpeners', prescription: '3×8' }),
      expect.objectContaining({ labelKey: 'prepBandPullApart', prescription: '2×15' }),
    ]);
  });

  it('uses only the user-selected accessories, including during a taper', () => {
    const setup = normalizeWorkoutSetup({
      preparation: { enabled: false, byLift: {} },
      accessories: { enabled: true, byLift: {
        Squat: [],
        Bench: [{ key: 'lateralRaise', sets: 3, reps: 15 }],
        Deadlift: [],
      } },
    });
    const accessories = generateAccessoriesForWorkout({
      type: 'training', lift: 'Bench', accessoryIntensity: 'light',
    }, { workoutSetup: setup, oneRMs: { Bench: 100 } });
    expect(accessories).toHaveLength(1);
    expect(accessories[0]).toMatchObject({ key: 'lateralRaise', reps: 15 });
    expect(accessories[0].weights).toHaveLength(3);
  });
});
