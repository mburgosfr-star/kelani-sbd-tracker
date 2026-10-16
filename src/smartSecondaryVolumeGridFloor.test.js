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

// The universal 1–5 range replaces the former secondary three-set floor.
test('secondary volume uses the universal 1–5 set range to fill five columns', () => {
  const warmups = [{ weight: 20 }, { weight: 70 }, { weight: 100 }];
  const sets = [volumeSet(1), volumeSet(2), volumeSet(3)];

  const completed = completeSmartLiftGrid({
    sets,
    warmups,
    minimumVolumeSets: 1,
  });

  expect((warmups.length + completed.length) % 5).toBe(0);
  expect(completed).toHaveLength(2);
});
