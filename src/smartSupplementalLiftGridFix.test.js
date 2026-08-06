import { regenerateSupplementalLiftBlockGrid } from './smartTrainingEngine';

function squatSupplementalBlock(backoffPct, backoffWeight) {
  return {
    lift: 'Squat',
    frequencyRole: 'supplemental-heavy',
    role: 'primary',
    // The buggy hand-rolled warmups this function used to leave in place:
    // a 20kg -> 100kg second warmup, an 80kg jump, way over the 50kg
    // Squat/Deadlift rule.
    warmups: [
      { reps: 5, weight: 20, originalWeight: 20 },
      { reps: 3, weight: 100, originalWeight: 100 },
    ],
    sets: [
      {
        lift: 'Squat', labelKey: 'topTriple', reps: 3, pct: 0.8,
        weight: 115, originalWeight: 115, originalPct: 0.8,
      },
      ...Array.from({ length: 3 }, () => ({
        lift: 'Squat', labelKey: 'backoff', reps: 5, pct: backoffPct,
        weight: backoffWeight, originalWeight: backoffWeight, originalPct: backoffPct,
      })),
    ],
    // 2 warmups + 4 sets = 6 rows, not a multiple of 4.
    smartPrescription: { role: 'primary', gridItemCount: 6 },
  };
}

test('fixes an oversized warmup jump and completes the grid for a frequency-supplemented lift block', () => {
  // Backoff at 60% (87kg on a 145kg training max) is far enough below the
  // 80% top that generateWarmups builds a normal bridging ladder, rather
  // than treating the backoff itself as close enough to skip a rung.
  const fixed = regenerateSupplementalLiftBlockGrid(squatSupplementalBlock(0.60, 87));

  const topSet = fixed.sets.find(set => set.labelKey === 'topTriple');
  const rungs = [...fixed.warmups.map(w => w.weight), topSet.weight];

  for (let i = 1; i < rungs.length; i += 1) {
    expect(rungs[i] - rungs[i - 1]).toBeLessThanOrEqual(50);
  }

  const totalRows = fixed.warmups.length + fixed.sets.length;
  expect(totalRows % 4).toBe(0);
  expect(fixed.smartPrescription.gridItemCount).toBe(totalRows);
});

test('a C3W35 backoff close to the top weight still lands on a complete grid', () => {
  // 110kg/75% backoff so close to the 115kg/80% top that generateWarmups
  // treats it as its own effective bridge and only needs the bar warmup -
  // that's an existing, legitimate generateWarmups behavior (not part of
  // this bug), but the grid must still always land on a multiple of 4.
  const fixed = regenerateSupplementalLiftBlockGrid(squatSupplementalBlock(0.75, 110));

  const totalRows = fixed.warmups.length + fixed.sets.length;
  expect(totalRows % 4).toBe(0);
  expect(fixed.smartPrescription.gridItemCount).toBe(totalRows);
});

test('leaves an ordinary (non-supplemented) lift block untouched', () => {
  const liftBlock = {
    lift: 'Bench',
    role: 'primary',
    warmups: [{ reps: 5, weight: 20 }],
    sets: [{ lift: 'Bench', labelKey: 'topDouble', reps: 2, pct: 0.85, weight: 85 }],
    smartPrescription: { role: 'primary', gridItemCount: 2 },
  };

  expect(regenerateSupplementalLiftBlockGrid(liftBlock)).toBe(liftBlock);
});
