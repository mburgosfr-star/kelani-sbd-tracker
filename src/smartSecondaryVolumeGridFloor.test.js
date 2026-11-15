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

// The shared 3–7 range keeps secondary volume aligned with the five-column grid.
test('secondary volume uses the universal 3–7 set range to fill five columns', () => {
  const warmups = [{ weight: 20 }, { weight: 70 }, { weight: 100 }];
  const sets = [volumeSet(1), volumeSet(2), volumeSet(3)];

  const completed = completeSmartLiftGrid({
    sets,
    warmups,
    minimumVolumeSets: 3,
  });

  expect((warmups.length + completed.length) % 5).toBe(0);
  expect(completed).toHaveLength(7);
});
