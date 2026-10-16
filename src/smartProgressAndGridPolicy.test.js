import {
  completeSmartLiftGrid,
  reshapeSmartTopSetBackoffReps,
  constrainExplicitMediumLiftDose,
  shouldVaryRepeatedSmartPrescription,
} from './smartTrainingEngine';
import { generateWarmups } from './warmupAndPrepGeneration';
import { buildSmartLiftPrescription } from './smartPrescriptionEngine';
import { getSmartIntensityRole } from './smartFrequencyPolicy';

function topDouble(pct = 0.825, weight = 145) {
  return {
    labelKey: 'topDouble', reps: 2, pct, weight,
    originalPct: pct, originalWeight: weight,
  };
}

function volumeSet(labelKey = 'backoff', pct = 0.725, weight = 127.5) {
  return {
    labelKey, reps: 4, pct, weight,
    originalPct: pct, originalWeight: weight,
    groupKey: `Deadlift-${labelKey}`,
  };
}

test.each([
  ['topSingle', 1, 3, 0.70],
  ['topDouble', 2, 4, 0.65],
  ['topTriple', 3, 5, 0.60],
])('%s uses the agreed %s-rep backoff prescription', (labelKey, topReps, expectedReps, expectedPct) => {
  const sets = [
    { labelKey, reps: topReps, pct: 0.9, weight: 90 },
    ...Array.from({ length: 5 }, () => ({
      labelKey: 'backoff', reps: 4, pct: 0.7, weight: 70,
    })),
  ];
  const reshaped = reshapeSmartTopSetBackoffReps({ sets, trainingMax: 100 });

  expect(reshaped.slice(1).every(set => set.reps === expectedReps)).toBe(true);
  expect(reshaped.slice(1).every(set => set.pct === expectedPct)).toBe(true);
});

test('a full C3W43-style medium Squat block reaches a real medium dose near 70%', () => {
  const sets = Array.from({ length: 6 }, () => ({
    labelKey: 'workSets', reps: 4, pct: 0.725, precisePct: 0.725, weight: 105,
  }));
  const reshaped = constrainExplicitMediumLiftDose({ sets, trainingMax: 145 });

  expect(reshaped).toHaveLength(6);
  expect(reshaped.every(set => set.reps === 4)).toBe(true);
  expect(reshaped.every(set => set.weight === 102.5)).toBe(true);
  expect(getSmartIntensityRole({ sets: reshaped })).toBe('medium');
});

test('a short medium block uses the stable 70% target without an aggressive jump', () => {
  const sets = Array.from({ length: 3 }, () => ({
    labelKey: 'workSets', reps: 6, pct: 0.725, precisePct: 0.725, weight: 70,
  }));
  const reshaped = constrainExplicitMediumLiftDose({ sets, trainingMax: 100 });

  expect(reshaped).toHaveLength(3);
  expect(reshaped.every(set => set.reps === 5)).toBe(true);
  expect(reshaped.every(set => set.weight === 70)).toBe(true);
  expect(getSmartIntensityRole({ intensityRole: 'medium', sets: reshaped }))
    .toBe('medium');
});

test('medium volume is capped before its aggregate dose becomes heavy', () => {
  const sets = Array.from({ length: 6 }, () => ({
    labelKey: 'workSets', reps: 6, pct: 0.725, precisePct: 0.725, weight: 70,
  }));
  const reshaped = constrainExplicitMediumLiftDose({ sets, trainingMax: 100 });

  expect(reshaped.reduce((total, set) => total + set.reps, 0)).toBe(24);
  expect(getSmartIntensityRole({ sets: reshaped })).toBe('medium');
});

test('an explicit failed-set recovery keeps its deliberately lower medium-slot dose', () => {
  const sets = Array.from({ length: 3 }, () => ({
    labelKey: 'workSets', reps: 4, pct: 0.60, precisePct: 0.60, weight: 60,
  }));
  const reshaped = constrainExplicitMediumLiftDose({
    sets,
    trainingMax: 100,
    preserveLowerDose: true,
  });

  expect(reshaped.every(set => set.weight === 60)).toBe(true);
  expect(getSmartIntensityRole({ sets: reshaped })).toBe('light');
});

test('fits a primary grid with one back-off set', () => {
  const sets = [
    topDouble(),
    ...Array.from({ length: 3 }, () => volumeSet()),
  ];
  const completed = completeSmartLiftGrid({
    sets,
    warmups: Array.from({ length: 3 }, () => ({})),
    preferMoreVolume: true,
  });

  expect(completed).toHaveLength(2);
  expect(completed.filter(set => set.labelKey === 'backoff')).toHaveLength(1);
  expect((3 + completed.length) % 5).toBe(0);
});

test('uses the lower safe complete option when progression is blocked', () => {
  const sets = [
    topDouble(),
    ...Array.from({ length: 4 }, () => volumeSet()),
  ];
  // One warmup and one top set leave three volume cells in the row.
  const completed = completeSmartLiftGrid({
    sets,
    warmups: Array.from({ length: 1 }, () => ({})),
    preferMoreVolume: false,
  });

  expect(completed.filter(set => set.labelKey === 'backoff')).toHaveLength(3);
  expect((1 + completed.length) % 5).toBe(0);
});

test('fills a secondary grid without unnecessary overload', () => {
  const sets = Array.from({ length: 3 }, () =>
    volumeSet('workSets', 0.75, 75)
  );
  const completed = completeSmartLiftGrid({
    sets,
    warmups: Array.from({ length: 4 }, () => ({})),
  });

  expect(completed).toHaveLength(1);
  expect((4 + completed.length) % 5).toBe(0);
});

test('leaves an already complete five-cell grid unchanged', () => {
  const sets = [
    topDouble(0.85, 150),
    ...Array.from({ length: 1 }, () => volumeSet()),
  ];
  const completed = completeSmartLiftGrid({
    sets,
    warmups: Array.from({ length: 3 }, () => ({})),
    preferMoreVolume: true,
  });

  expect(completed).toEqual(sets);
});

test('treats equal primary stimulus with another set count as a repeat', () => {
  const candidate = {
    type: 'training',
    lift: 'Deadlift',
    lifts: [{
      lift: 'Deadlift',
      role: 'primary',
      sets: [
        topDouble(),
        ...Array.from({ length: 3 }, () => volumeSet()),
      ],
    }],
  };
  const legacyRepeatedSignature = [
    'Deadlift:2:145:0.825',
    ...Array.from({ length: 4 }, () => 'Deadlift:4:127.5:0.725'),
  ].sort().join('|');

  expect(shouldVaryRepeatedSmartPrescription(candidate, {
    recentPrimaryLiftPrescriptionSignaturesByLift: {
      Deadlift: [legacyRepeatedSignature],
    },
    recentFatigueScore: 0,
    recentFailedOrSkippedSetCount: 0,
  })).toBe(true);
});

test('fatigue or failures still block repeated-stimulus progression', () => {
  const candidate = {
    type: 'training',
    lift: 'Deadlift',
    lifts: [{
      lift: 'Deadlift',
      role: 'primary',
      sets: [topDouble(), volumeSet()],
    }],
  };
  const signature = [
    'Deadlift:2:145:0.825',
    'Deadlift:4:127.5:0.725',
  ].sort().join('|');

  expect(shouldVaryRepeatedSmartPrescription(candidate, {
    recentPrimaryLiftPrescriptionSignaturesByLift: {
      Deadlift: [signature],
    },
    recentFatigueScore: 999,
    recentFailedOrSkippedSetCount: 0,
  })).toBe(false);
  expect(shouldVaryRepeatedSmartPrescription(candidate, {
    recentPrimaryLiftPrescriptionSignaturesByLift: {
      Deadlift: [signature],
    },
    recentFatigueScore: 0,
    recentFailedOrSkippedSetCount: 1,
  })).toBe(false);
});

test('progresses the repeated C3W24 Deadlift double to 85% and completes both grids', () => {
  const deadliftPrescription = buildSmartLiftPrescription({
    state: {
      lift: 'Deadlift',
      trainingMax: 180,
      progression: {
        direction: 'hold',
        adjustment: 0,
        reason: 'good-feedback',
      },
      lastSuccessfulTop: { reps: 2, pct: 0.825 },
      lastExposure: { workoutEffort: 'good' },
      highestRecentSuccessfulVolumePct: 0.725,
      recentFailedOrSkippedSetCount: 0,
      meetReadiness: {
        ready: false,
        currentCycleReadinessRatio: 0.968,
      },
    },
    role: 'primary',
    isMixedLiftWorkout: true,
    avoidRecentRepeat: true,
  });

  expect(deadliftPrescription.validation.valid).toBe(true);
  expect(deadliftPrescription.repeatVariationApplied).toBe(true);
  expect(deadliftPrescription.sets[0]).toMatchObject({
    labelKey: 'topDouble',
    reps: 2,
    pct: 0.85,
  });

  const deadliftInitialWarmups = generateWarmups(
    deadliftPrescription.sets,
    'Deadlift'
  );
  const deadliftSets = completeSmartLiftGrid({
    sets: deadliftPrescription.sets,
    warmups: deadliftInitialWarmups,
    preferMoreVolume: true,
  });
  const deadliftWarmups = generateWarmups(deadliftSets, 'Deadlift');

  expect(deadliftSets.filter(set => set.labelKey === 'backoff'))
    .toHaveLength(5);
  expect(deadliftWarmups.length + deadliftSets.length).toBe(10);
  expect((deadliftWarmups.length + deadliftSets.length) % 5).toBe(0);

  const benchInitialSets = Array.from({ length: 3 }, () => ({
    labelKey: 'workSets',
    groupKey: 'Bench-worksets',
    reps: 4,
    pct: 0.75,
    weight: 75,
    originalPct: 0.75,
    originalWeight: 75,
  }));
  const benchInitialWarmups = generateWarmups(benchInitialSets, 'Bench');
  const benchSets = completeSmartLiftGrid({
    sets: benchInitialSets,
    warmups: benchInitialWarmups,
    preferMoreVolume: false,
  });
  const benchWarmups = generateWarmups(benchSets, 'Bench');

  expect(benchSets).toHaveLength(3);
  expect(benchWarmups.length + benchSets.length).toBe(5);
  expect((benchWarmups.length + benchSets.length) % 5).toBe(0);
});
