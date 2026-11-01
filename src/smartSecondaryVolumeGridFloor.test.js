import { completeSmartLiftGrid } from './smartTrainingEngine';

function volumeSet(index) {
  return {
    lift: 'Squat',
    labelKey: 'workSets',
    reps: 4,
    pct: 0.75,
    weight: 110,
    id: `volume-${index}`,
  };
}

// The universal 2–6 range replaces the former secondary three-set floor.
test('secondary volume uses the universal 2–6 set range to fill five columns', () => {
  const warmups = [{ weight: 20 }, { weight: 70 }, { weight: 100 }];
  const sets = [volumeSet(1), volumeSet(2), volumeSet(3)];

  const completed = completeSmartLiftGrid({
    sets,
    warmups,
    minimumVolumeSets: 2,
  });

  expect((warmups.length + completed.length) % 5).toBe(0);
  expect(completed).toHaveLength(2);
});
