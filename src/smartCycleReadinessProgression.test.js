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
          meetPlanOpenerReadyCount: 0,
          meetPlanSecondAttemptReadyCount: 0,
          meetPlanThirdAttemptPotentialCount: 0,
          meetPlanWeakestLift: 'Squat',
          meetPlanWeakestPhase: 'opener',
          meetPlanWeakestBestE1RM: 116.16666666666666,
          meetPlanWeakestTarget: 130,
          meetPlanReadiness: {
            Squat: {
              currentCycleBestE1RM: 116.16666666666666,
              readinessTargetAttempt: 130,
              readinessPhase: 'opener',
              openerReady: false,
              attempts: { opener: 130 },
            },
          },
          meetProjection: {
            available: true,
            label: 'C3W27–C3W29',
            limitingLift: 'Squat',
            limitingPhase: 'opener',
          },
          meetdayBlockers: ['opener-readiness'],
        },
      },
    })
  ).toEqual([
    {
      label: 'Meet status',
      value: 'Squat — opener not yet demonstrated',
    },
    { label: 'Openers', value: '0/3', kind: 'metric' },
    { label: '2nd attempts', value: '0/3', kind: 'metric' },
    { label: '3rd potential', value: '0/3', kind: 'metric' },
    { label: 'Cycle e1RM', value: '116.2 kg', kind: 'metric' },
    { label: 'Meet opener', value: '130 kg', kind: 'metric' },
    { label: 'Gap', value: '13.8 kg', kind: 'metric' },
    { label: 'Projected meet', value: 'C3W27–C3W29' },
    { label: 'Limiting lift', value: 'Squat — opener' },
    {
      label: 'Readiness basis',
      value: 'Only successful sets from the active cycle count.',
      kind: 'note',
    },
    {
      label: 'Projection assumption',
      value: 'Assumes normal progress, successful workouts and unchanged meet attempts.',
      kind: 'note',
    },
  ]);
});



test('shows the second-attempt support phase in the Smart modal', () => {
  const rows = getSmartModalDetailRows({
    smartDecisionSummary: {
      dayType: 'training',
      reason: 'training-fallback',
      readiness: {
        meetPlanReady: false,
        meetPlanOpenerReadyCount: 3,
        meetPlanSecondAttemptReadyCount: 2,
        meetPlanThirdAttemptPotentialCount: 0,
        meetPlanWeakestLift: 'Deadlift',
        meetPlanWeakestPhase: 'second-attempt',
        meetPlanWeakestBestE1RM: 167.5,
        meetPlanWeakestTarget: 170.625,
        meetPlanReadiness: {
          Deadlift: {
            currentCycleBestE1RM: 167.5,
            readinessTargetAttempt: 170.625,
            readinessPhase: 'second-attempt',
            openerReady: true,
          },
        },
        meetProjection: {
          available: true,
          label: 'C3W29–C3W31',
          limitingLift: 'Deadlift',
          limitingPhase: 'second-attempt',
        },
      },
    },
  });

  expect(rows[0]).toEqual({
    label: 'Meet status',
    value: 'Deadlift — second attempt not yet supported',
  });
  expect(rows).toContainEqual({
    label: '2nd support',
    value: '170.6 kg',
    kind: 'metric',
  });
  expect(rows).toContainEqual({
    label: 'Projected meet',
    value: 'C3W29–C3W31',
  });
  expect(rows).toContainEqual({
    label: 'Limiting lift',
    value: 'Deadlift — 2nd attempt',
  });
});

test('uses three-set secondary Bench volume on a mixed Smart day', () => {
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
    isMixedLiftWorkout: true,
  });

  expect(prescription.validation.valid).toBe(true);
  expect(prescription.sets).toHaveLength(3);
});
