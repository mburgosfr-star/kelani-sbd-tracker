import {
  completeSmartLiftGrid,
  generateWarmups,
  shouldVaryRepeatedSmartPrescription,
} from './App';
import { buildSmartLiftPrescription } from './smartPrescriptionEngine';

const round25 = value => Math.round(Number(value) / 2.5) * 2.5;

function setFor({
  lift,
  labelKey,
  reps,
  pct,
  trainingMax,
}) {
  const weight = round25(trainingMax * pct);

  return {
    lift,
    labelKey,
    groupKey: `${lift}-${labelKey}`,
    groupLabelKey: labelKey,
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

function repeatedCandidate({
  lift,
  trainingMax,
  volumeCount,
}) {
  return {
    type: 'training',
    lift,
    lifts: [{
      lift,
      role: 'primary',
      sets: [
        setFor({
          lift,
          labelKey: 'topTriple',
          reps: 3,
          pct: 0.75,
          trainingMax,
        }),
        ...Array.from({ length: volumeCount }, () =>
          setFor({
            lift,
            labelKey: 'backoff',
            reps: 5,
            pct: 0.65,
            trainingMax,
          })
        ),
      ],
    }],
  };
}

function repeatedSignature({
  lift,
  trainingMax,
  volumeCount,
}) {
  const topWeight = round25(trainingMax * 0.75);
  const volumeWeight = round25(trainingMax * 0.65);

  return [
    `${lift}:3:${topWeight}:0.75`,
    ...Array.from(
      { length: volumeCount },
      () => `${lift}:5:${volumeWeight}:0.65`
    ),
  ].sort().join('|');
}

function progressionState({
  lift,
  trainingMax,
}) {
  return {
    lift,
    trainingMax,
    progression: {
      direction: 'hold',
      adjustment: 0,
      reason: 'good-feedback',
    },
    lastSuccessfulTop: {
      reps: 3,
      pct: 0.75,
    },
    lastExposure: {
      workoutEffort: 'good',
    },
    highestRecentSuccessfulVolumePct: 0.65,
    recentFailedOrSkippedSetCount: 0,
    meetReadiness: {
      ready: false,
      currentCycleReadinessRatio: 0.90,
    },
  };
}

test('Ana exact Squat stimulus progresses beyond C1W11 even when C1W15 has another set count', () => {
  const lift = 'Squat';
  const trainingMax = 42.5;
  const candidate = repeatedCandidate({
    lift,
    trainingMax,
    volumeCount: 5,
  });
  const priorSignature = repeatedSignature({
    lift,
    trainingMax,
    volumeCount: 4,
  });

  expect(shouldVaryRepeatedSmartPrescription(candidate, {
    recentPrimaryLiftPrescriptionSignaturesByLift: {
      Squat: [priorSignature],
    },
    recentFatigueScore: 0,
    recentFailedOrSkippedSetCount: 0,
  })).toBe(true);

  const prescription = buildSmartLiftPrescription({
    state: progressionState({
      lift,
      trainingMax,
    }),
    role: 'primary',
    isSingleLiftWorkout: true,
    avoidRecentRepeat: true,
  });

  expect(prescription.validation.valid).toBe(true);
  expect(prescription.repeatVariationApplied).toBe(true);
  expect(prescription.sets[0]).toMatchObject({
    labelKey: 'topTriple',
    reps: 3,
    pct: 0.775,
    weight: 32.5,
  });

  const initialWarmups = generateWarmups(
    prescription.sets,
    lift
  );
  const completedSets = completeSmartLiftGrid({
    sets: prescription.sets,
    warmups: initialWarmups,
    preferMoreVolume: true,
  });
  const finalWarmups = generateWarmups(
    completedSets,
    lift
  );

  expect(
    (finalWarmups.length + completedSets.length) % 3
  ).toBe(0);
});

test.each([
  ['Squat', 42.5],
  ['Squat', 145],
  ['Bench', 32.5],
  ['Bench', 100],
  ['Deadlift', 60],
  ['Deadlift', 180],
])(
  'treats repeated %s stimulus as equal across strength level %s kg',
  (lift, trainingMax) => {
    [2, 3, 4, 5, 6].forEach(candidateCount => {
      const candidate = repeatedCandidate({
        lift,
        trainingMax,
        volumeCount: candidateCount,
      });
      const priorSignature = repeatedSignature({
        lift,
        trainingMax,
        volumeCount: candidateCount === 6 ? 2 : 6,
      });

      expect(shouldVaryRepeatedSmartPrescription(candidate, {
        recentPrimaryLiftPrescriptionSignaturesByLift: {
          [lift]: [priorSignature],
        },
        recentFatigueScore: 0,
        recentFailedOrSkippedSetCount: 0,
      })).toBe(true);
    });
  }
);

test.each([
  ['Squat', 42.5],
  ['Squat', 145],
  ['Bench', 32.5],
  ['Bench', 100],
  ['Deadlift', 60],
  ['Deadlift', 180],
])(
  'progresses safe repeated primary %s work universally at %s kg',
  (lift, trainingMax) => {
    const base = buildSmartLiftPrescription({
      state: progressionState({
        lift,
        trainingMax,
      }),
      role: 'primary',
      isSingleLiftWorkout: true,
    });
    const progressed = buildSmartLiftPrescription({
      state: progressionState({
        lift,
        trainingMax,
      }),
      role: 'primary',
      isSingleLiftWorkout: true,
      avoidRecentRepeat: true,
    });

    expect(base.validation.valid).toBe(true);
    expect(progressed.validation.valid).toBe(true);
    expect(base.sets[0].pct).toBeGreaterThanOrEqual(0.75);
    expect(progressed.sets[0]).toMatchObject({
      reps: 3,
      pct: 0.775,
    });
    expect(progressed.repeatVariationApplied).toBe(true);
  }
);

test.each([
  ['Squat', 42.5],
  ['Bench', 100],
  ['Deadlift', 180],
])(
  'keeps fatigue and failures as valid blockers for %s',
  (lift, trainingMax) => {
    const candidate = repeatedCandidate({
      lift,
      trainingMax,
      volumeCount: 5,
    });
    const signature = repeatedSignature({
      lift,
      trainingMax,
      volumeCount: 4,
    });

    expect(shouldVaryRepeatedSmartPrescription(candidate, {
      recentPrimaryLiftPrescriptionSignaturesByLift: {
        [lift]: [signature],
      },
      recentFatigueScore: 999,
      recentFailedOrSkippedSetCount: 0,
    })).toBe(false);

    expect(shouldVaryRepeatedSmartPrescription(candidate, {
      recentPrimaryLiftPrescriptionSignaturesByLift: {
        [lift]: [signature],
      },
      recentFatigueScore: 0,
      recentFailedOrSkippedSetCount: 1,
    })).toBe(false);
  }
);
