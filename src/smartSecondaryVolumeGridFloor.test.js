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

// C3W36 regression boundary: a secondary Squat block (3 warmups + the day's
// own 3-set volume target = 6 rows, remainder 2 against the 4-column grid)
// got trimmed all the way down to a single 4-rep work set instead of padded
// up. minimumVolumeSets used to default to 1 for non-primary roles,
// which let the grid-completion step prefer removing 2 of the 3 volume sets
// (3-2=1 still satisfies a floor of 1) over adding 2 more.
test('a secondary/tertiary volume block is padded up to fill the grid, never trimmed down to a single set', () => {
  const warmups = [{ weight: 20 }, { weight: 70 }, { weight: 100 }];
  const sets = [volumeSet(1), volumeSet(2), volumeSet(3)];

  const completed = completeSmartLiftGrid({
    sets,
    warmups,
    minimumVolumeSets: 3,
  });

  expect((warmups.length + completed.length) % 4).toBe(0);
  expect(completed.length).toBeGreaterThanOrEqual(3);
});
