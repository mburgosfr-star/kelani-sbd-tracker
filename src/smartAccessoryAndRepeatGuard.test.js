import { shouldVaryRepeatedSmartPrescription } from './smartTrainingEngine';
import { selectSmartAccessoriesForWorkout } from './accessoryGeneration';
import {
  buildSmartLiftState,
  buildSmartLiftPrescription,
} from './smartPrescriptionEngine';

function accessory(key) {
  return { key };
}

function trainingSet({ labelKey, reps, pct, trainingMax = 100 }) {
  const weight = Math.round((trainingMax * pct) / 2.5) * 2.5;
  return {
    labelKey,
    reps,
    pct,
    weight,
    originalPct: pct,
    originalWeight: weight,
    done: true,
    failed: false,
    skipped: false,
  };
}

function historyEntry({ workoutNumber, role, sets, effort }) {
  return {
    cycle: 1,
    workoutNumber,
    lift: 'Bench',
    workoutEffort: effort,
    workoutSnapshot: {
      number: workoutNumber,
      type: 'training',
      smartDayType: 'training',
      lift: 'Bench',
      lifts: [{ lift: 'Bench', role, sets }],
      workoutEffort: effort,
    },
  };
}

test('keeps all accessories on a single-big-lift day', () => {
  expect(selectSmartAccessoriesForWorkout([
    [accessory('primary'), accessory('secondary')],
  ])).toEqual([
    accessory('primary'),
    accessory('secondary'),
  ]);
});

test('keeps one important accessory per lift on a two-big-lift day', () => {
  expect(selectSmartAccessoriesForWorkout([
    [accessory('lift-a-main'), accessory('lift-a-extra')],
    [accessory('lift-b-main'), accessory('lift-b-extra')],
  ])).toEqual([
    accessory('lift-a-main'),
    accessory('lift-b-main'),
  ]);
});

test('uses the next unique accessory when both lifts share the same first choice', () => {
  expect(selectSmartAccessoriesForWorkout([
    [accessory('shared'), accessory('lift-a-extra')],
    [accessory('shared'), accessory('lift-b-main')],
  ])).toEqual([
    accessory('shared'),
    accessory('lift-b-main'),
  ]);
});

test('prefers the least recently completed accessory on a multi-lift day', () => {
  const history = [{
    cycle: 1,
    workoutNumber: 4,
    workoutSnapshot: {
      accessories: [{ key: 'lift-a-main', done: [true, true, true] }],
    },
  }];

  expect(selectSmartAccessoriesForWorkout([
    [accessory('lift-a-main'), accessory('lift-a-extra')],
    [accessory('lift-b-main'), accessory('lift-b-extra')],
  ], { history })).toEqual([
    accessory('lift-a-extra'),
    accessory('lift-b-main'),
  ]);
});

test('does not treat an unperformed planned accessory as recent work', () => {
  const history = [{
    cycle: 1,
    workoutNumber: 4,
    workoutSnapshot: {
      accessories: [{ key: 'lift-a-main', done: [false, false, false] }],
    },
  }];

  expect(selectSmartAccessoriesForWorkout([
    [accessory('lift-a-main'), accessory('lift-a-extra')],
    [accessory('lift-b-main'), accessory('lift-b-extra')],
  ], { history })).toEqual([
    accessory('lift-a-main'),
    accessory('lift-b-main'),
  ]);
});

test('Bench keeps Row even when it was the most recently completed accessory', () => {
  const history = [{
    cycle: 1,
    workoutNumber: 3,
    workoutSnapshot: { accessories: [{ key: 'row', done: [true, true, true, true] }] },
  }];
  const benchAccessories = [accessory('hipThrust'), accessory('row')];
  const squatAccessories = [accessory('pulldown'), accessory('legCurl')];

  expect(selectSmartAccessoriesForWorkout([benchAccessories, squatAccessories], { history }))
    .toEqual([accessory('row'), accessory('pulldown')]);
  expect(selectSmartAccessoriesForWorkout([squatAccessories, benchAccessories], { history }))
    .toEqual([accessory('pulldown'), accessory('row')]);
});

test('recognizes a safe exact recent prescription repeat', () => {
  const candidate = {
    type: 'training',
    lift: 'Bench',
    lifts: [{
      lift: 'Bench',
      sets: [
        trainingSet({ labelKey: 'topTriple', reps: 3, pct: 0.70 }),
        ...Array.from({ length: 6 }, () =>
          trainingSet({ labelKey: 'backoff', reps: 6, pct: 0.60 })
        ),
      ],
    }],
  };
  const repeatedSignature = [
    'Bench:3:70:0.7',
    ...Array.from({ length: 6 }, () => 'Bench:6:60:0.6'),
  ].sort().join('|');

  expect(shouldVaryRepeatedSmartPrescription(candidate, {
    recentTrainingPrescriptionSignatures: [repeatedSignature],
    lastWasRecoveryIntervention: true,
    recentFatigueScore: 0,
    recentFailedOrSkippedSetCount: 0,
  })).toBe(true);

  expect(shouldVaryRepeatedSmartPrescription(candidate, {
    recentTrainingPrescriptionSignatures: [repeatedSignature],
    lastWasRecoveryIntervention: false,
    lastWasRestDay: false,
    recentFatigueScore: 0,
    recentFailedOrSkippedSetCount: 0,
  })).toBe(true);
});

test('changes only the top stimulus when a safe repeat must be varied', () => {
  const history = [
    historyEntry({
      workoutNumber: 1,
      role: 'primary',
      effort: 'good',
      sets: [
        trainingSet({ labelKey: 'topTriple', reps: 3, pct: 0.70 }),
        ...Array.from({ length: 6 }, () =>
          trainingSet({ labelKey: 'backoff', reps: 6, pct: 0.60 })
        ),
      ],
    }),
    historyEntry({
      workoutNumber: 2,
      role: 'secondary',
      effort: 'hard',
      sets: Array.from({ length: 4 }, () =>
        trainingSet({ labelKey: 'workSets', reps: 6, pct: 0.625 })
      ),
    }),
  ];

  const state = buildSmartLiftState({
    history,
    currentCycle: 1,
    lift: 'Bench',
    trainingMax: 100,
    meetPlanReadiness: {
      Bench: {
        ready: false,
        currentCycleReadinessRatio: 0.875,
        currentCycleShortfall: 12.5,
        currentCycleBestE1RM: 87.5,
        readinessTargetAttempt: 100,
        plannedTopAttempt: 105,
      },
    },
  });

  const repeated = buildSmartLiftPrescription({
    state,
    role: 'primary',
    isSingleLiftWorkout: true,
  });
  const varied = buildSmartLiftPrescription({
    state,
    role: 'primary',
    isSingleLiftWorkout: true,
    avoidRecentRepeat: true,
  });

  expect(repeated.validation.valid).toBe(true);
  expect(varied.validation.valid).toBe(true);
  // "hard" now still progresses (see getProgressionDecision), so both cases
  // display the same rounded 75% top - the meaningful difference is in the
  // true unrounded pct: repeatVariation adds its own extra step on top of
  // ordinary progression to guarantee a genuinely different prescription.
  expect(repeated.sets[0]).toMatchObject({ reps: 3, precisePct: 0.725 });
  expect(varied.sets[0]).toMatchObject({ reps: 3, precisePct: 0.75 });
  expect(varied.sets.slice(1).map(set => [set.reps, set.pct]))
    .toEqual(repeated.sets.slice(1).map(set => [set.reps, set.pct]));
  expect(varied.repeatVariationApplied).toBe(true);
});

test('recognizes a repeated primary Deadlift block from an earlier mixed workout', () => {
  const candidate = {
    type: 'training',
    lift: 'Deadlift',
    lifts: [{
      lift: 'Deadlift',
      sets: [
        trainingSet({
          labelKey: 'topDouble', reps: 2, pct: 0.80, trainingMax: 60,
        }),
        ...Array.from({ length: 4 }, () =>
          trainingSet({
            labelKey: 'backoff', reps: 4, pct: 0.70, trainingMax: 60,
          })
        ),
      ],
    }],
  };

  const deadliftSignature = [
    'Deadlift:2:47.5:0.8',
    ...Array.from({ length: 4 }, () => 'Deadlift:4:42.5:0.7'),
  ].sort().join('|');

  expect(shouldVaryRepeatedSmartPrescription(candidate, {
    recentPrimaryLiftPrescriptionSignaturesByLift: {
      Deadlift: [deadliftSignature],
    },
    recentFatigueScore: 1,
    recentFailedOrSkippedSetCount: 0,
  })).toBe(true);
});
