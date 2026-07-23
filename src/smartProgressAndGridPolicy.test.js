import {
  completeSmartLiftGrid,
  generateWarmups,
  shouldVaryRepeatedSmartPrescription,
} from './App';
import { buildSmartLiftPrescription } from './smartPrescriptionEngine';

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

test('fills a progressive primary grid with five back-off sets', () => {
  const sets = [
    topDouble(),
    ...Array.from({ length: 3 }, () => volumeSet()),
  ];
  const completed = completeSmartLiftGrid({
    sets,
    warmups: Array.from({ length: 3 }, () => ({})),
    preferMoreVolume: true,
  });

  expect(completed).toHaveLength(6);
  expect(completed.filter(set => set.labelKey === 'backoff')).toHaveLength(5);
  expect((3 + completed.length) % 3).toBe(0);
});

test('uses the lower safe complete option when progression is blocked', () => {
  const sets = [
    topDouble(),
    ...Array.from({ length: 4 }, () => volumeSet()),
  ];
  const completed = completeSmartLiftGrid({
    sets,
    warmups: Array.from({ length: 3 }, () => ({})),
    preferMoreVolume: false,
  });

  expect(completed.filter(set => set.labelKey === 'backoff')).toHaveLength(2);
  expect((3 + completed.length) % 3).toBe(0);
});

test('fills a secondary grid without unnecessary overload', () => {
  const sets = Array.from({ length: 3 }, () =>
    volumeSet('workSets', 0.75, 75)
  );
  const completed = completeSmartLiftGrid({
    sets,
    warmups: Array.from({ length: 4 }, () => ({})),
  });

  expect(completed).toHaveLength(2);
  expect((4 + completed.length) % 3).toBe(0);
});

test('leaves an already complete Smart lift grid unchanged', () => {
  const sets = [
    topDouble(0.85, 150),
    ...Array.from({ length: 2 }, () => volumeSet()),
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
  expect(deadliftWarmups.length + deadliftSets.length).toBe(9);
  expect((deadliftWarmups.length + deadliftSets.length) % 3).toBe(0);

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

  expect(benchSets).toHaveLength(4);
  expect(benchWarmups.length + benchSets.length).toBe(6);
  expect((benchWarmups.length + benchSets.length) % 3).toBe(0);
});

