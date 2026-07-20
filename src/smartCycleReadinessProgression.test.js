import { getSmartModalDetailRows } from './App';
import {
  buildSmartLiftPrescription,
  buildSmartLiftState,
} from './smartPrescriptionEngine';

function makeSmartLiftEntry({
  workoutNumber,
  lift = 'Squat',
  workoutEffort = 'good',
  role = 'primary',
  sets = [],
}) {
  return {
    cycle: 1,
    workoutNumber,
    lift,
    workoutEffort,
    workoutSnapshot: {
      number: workoutNumber,
      type: 'training',
      smartDayType: 'training',
      lift,
      lifts: [{ lift, role, sets }],
      workoutEffort,
    },
  };
}

function makeSet({
  labelKey,
  reps,
  pct,
  trainingMax,
  done = true,
  failed = false,
  skipped = false,
}) {
  const weight = Math.round((trainingMax * pct) / 2.5) * 2.5;
  return {
    labelKey,
    reps,
    pct,
    weight,
    originalPct: pct,
    originalWeight: weight,
    done,
    failed,
    skipped,
  };
}

function makeMeetProgressionHistory(trainingMax) {
  return [
    makeSmartLiftEntry({
      workoutNumber: 1,
      sets: [
        makeSet({
          labelKey: 'topTriple', reps: 3, pct: 0.70, trainingMax,
        }),
        ...Array.from({ length: 4 }, () => makeSet({
          labelKey: 'backoff', reps: 4, pct: 0.65, trainingMax,
        })),
      ],
    }),
    makeSmartLiftEntry({
      workoutNumber: 2,
      sets: [
        makeSet({
          labelKey: 'topSingle', reps: 1, pct: 0.90, trainingMax,
          done: true, failed: true, skipped: true,
        }),
        ...Array.from({ length: 4 }, () => makeSet({
          labelKey: 'backoff', reps: 4, pct: 0.70, trainingMax,
        })),
      ],
    }),
    makeSmartLiftEntry({
      workoutNumber: 3,
      role: 'secondary',
      sets: Array.from({ length: 4 }, () => makeSet({
        labelKey: 'workSets', reps: 4, pct: 0.65, trainingMax,
      })),
    }),
  ];
}

test.each([100, 200])(
  'uses successful volume for meet-specific top and back-off progression at TM %s',
  trainingMax => {
    const state = buildSmartLiftState({
      history: makeMeetProgressionHistory(trainingMax),
      currentCycle: 1,
      lift: 'Squat',
      trainingMax,
      meetPlanReadiness: {
        Squat: {
          ready: false,
          currentCycleReadinessRatio: 0.89,
          currentCycleBestE1RM: trainingMax * 0.89,
          readinessTargetAttempt: trainingMax,
          currentCycleShortfall: trainingMax * 0.11,
        },
      },
    });

    expect(state.highestRecentSuccessfulVolumePct).toBe(0.70);

    const prescription = buildSmartLiftPrescription({
      state,
      role: 'primary',
      isSingleLiftWorkout: false,
    });

    expect(prescription.validation.valid).toBe(true);
    expect(prescription.meetSpecificProgression).toBe(true);
    expect(prescription.topSetAnchorPct).toBe(0.70);
    expect(prescription.volumeAnchorPct).toBe(0.70);
    expect(prescription.plannedVolumePct).toBe(0.675);
    expect(prescription.sets.slice(1)).toHaveLength(3);
    expect(prescription.sets[0]).toMatchObject({
      labelKey: 'topTriple',
      reps: 3,
      pct: 0.775,
    });
    prescription.sets.slice(1).forEach(set => {
      expect(set).toMatchObject({
        labelKey: 'backoff',
        reps: 5,
        pct: 0.675,
      });
    });
  }
);

test('does not force meet-specific intensity after the opener is demonstrated', () => {
  const state = buildSmartLiftState({
    history: makeMeetProgressionHistory(100),
    currentCycle: 1,
    lift: 'Squat',
    trainingMax: 100,
    meetPlanReadiness: {
      Squat: {
        ready: true,
        currentCycleReadinessRatio: 1.01,
        currentCycleBestE1RM: 101,
        readinessTargetAttempt: 100,
      },
    },
  });

  const prescription = buildSmartLiftPrescription({ state, role: 'primary' });
  expect(prescription.validation.valid).toBe(true);
  expect(prescription.meetSpecificProgression).toBe(false);
  expect(prescription.sets[0].pct).toBeLessThan(0.775);
});

test('keeps successful secondary work as an explicit volume anchor', () => {
  const state = buildSmartLiftState({
    history: makeMeetProgressionHistory(100),
    currentCycle: 1,
    lift: 'Squat',
    trainingMax: 100,
  });
  const prescription = buildSmartLiftPrescription({ state, role: 'secondary' });

  expect(prescription.validation.valid).toBe(true);
  expect(prescription.progressionAnchorPct).toBe(0);
  expect(prescription.volumeAnchorPct).toBe(0.70);
  expect(prescription.plannedVolumePct).toBe(0.675);
});

test('names the cycle estimate and opener separately in the Smart modal', () => {
  expect(
    getSmartModalDetailRows({
      smartDecisionSummary: {
        dayType: 'training',
        reason: 'training-fallback',
        readiness: {
          meetPlanReady: false,
          meetPlanWeakestLift: 'Squat',
          meetPlanWeakestBestE1RM: 116.16666666666666,
          meetPlanWeakestTarget: 130,
          meetPlanReadiness: {
            Squat: {
              currentCycleBestE1RM: 116.16666666666666,
              readinessTargetAttempt: 130,
              attempts: { opener: 130 },
            },
          },
          meetdayBlockers: ['meet-plan-not-ready'],
        },
      },
    })
  ).toEqual([
    {
      label: 'Meet status',
      value: 'Squat — opener not yet demonstrated',
    },
    { label: 'Cycle e1RM', value: '116.2 kg', kind: 'metric' },
    { label: 'Meet opener', value: '130 kg', kind: 'metric' },
    { label: 'Gap', value: '13.8 kg', kind: 'metric' },
    {
      label: 'Readiness basis',
      value: 'Only successful sets from the active cycle count.',
      kind: 'note',
    },
  ]);
});


test('keeps four-set secondary Bench volume unchanged', () => {
  const state = buildSmartLiftState({
    history: [],
    currentCycle: 1,
    lift: 'Bench',
    trainingMax: 100,
  });
  const prescription = buildSmartLiftPrescription({
    state,
    role: 'secondary',
    isSingleLiftWorkout: false,
  });

  expect(prescription.validation.valid).toBe(true);
  expect(prescription.sets).toHaveLength(4);
});
