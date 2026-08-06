import {
  buildSmartLiftState,
  buildSmartLiftPrescription,
} from './smartPrescriptionEngine';

function makeTopDoubleEntry({ workoutNumber, weight, pct, trainingMax }) {
  return {
    cycle: 3,
    workoutNumber,
    lift: 'Deadlift',
    workoutEffort: 'good',
    workoutSnapshot: {
      number: workoutNumber,
      type: 'training',
      smartDayType: 'training',
      lift: 'Deadlift',
      lifts: [{
        lift: 'Deadlift',
        role: 'primary',
        sets: [
          {
            lift: 'Deadlift',
            labelKey: 'topDouble',
            reps: 2,
            pct,
            weight,
            originalPct: pct,
            originalWeight: weight,
            done: true,
            failed: false,
            skipped: false,
          },
          {
            lift: 'Deadlift',
            labelKey: 'backoff',
            reps: 4,
            pct: 0.75,
            weight: Math.round((trainingMax * 0.75) / 2.5) * 2.5,
            done: true,
            failed: false,
            skipped: false,
          },
        ],
      }],
    },
  };
}

const meetPlanReadiness = {
  Deadlift: {
    readinessPhase: 'third-attempt',
    attempts: {
      opener: 167.5,
      secondAttempt: 177.5,
      thirdAttempt: 184.5,
    },
  },
};

test("a third-attempt-phase top set rounds to the nearest barbell weight, not a 5% bucket that can permanently fall short of the target", () => {
  // C3W36+ regression projection: a
  // 180kg training max needs a ~96.1% top double to be e1RM-equivalent to
  // a 184.5kg third attempt. The old code rounded that ceiling to the
  // nearest 5% bucket BEFORE deriving the weight (96.1% -> 95%), landing on
  // 170kg (180*0.95) every single cycle no matter how many successful
  // exposures passed - e1RM stuck at 181.3, forever 3.2kg short of 184.5,
  // so meetPlanFullyDemonstrated could never become true and the projected
  // meet date drifted forward on every single "good" workout.
  const trainingMax = 180;
  const history = [
    makeTopDoubleEntry({ workoutNumber: 30, weight: 160, pct: 160 / trainingMax, trainingMax }),
  ];

  const state = buildSmartLiftState({
    history,
    currentCycle: 3,
    lift: 'Deadlift',
    trainingMax,
    meetPlanReadiness,
  });

  const prescription = buildSmartLiftPrescription({ state, role: 'primary' });
  const topSet = prescription.sets.find(set => set.reps === 2);

  expect(topSet).toBeTruthy();
  // Never permanently capped at the old bucket-rounded 170kg.
  expect(topSet.weight).toBeGreaterThan(160);
  // The displayed percentage must be mathematically consistent with the
  // displayed weight: no more "170kg is shown as 95%" when 170/180 is
  // really 94.4%.
  expect(topSet.pct).toBeCloseTo(topSet.weight / trainingMax, 5);
});

test('repeated successful third-attempt exposures actually converge on the target instead of freezing at the same weight forever', () => {
  const trainingMax = 180;
  let history = [
    makeTopDoubleEntry({ workoutNumber: 30, weight: 160, pct: 160 / trainingMax, trainingMax }),
  ];
  const weightsSeen = [];

  for (let cycle = 0; cycle < 6; cycle += 1) {
    const state = buildSmartLiftState({
      history,
      currentCycle: 3,
      lift: 'Deadlift',
      trainingMax,
      meetPlanReadiness,
    });
    const prescription = buildSmartLiftPrescription({ state, role: 'primary' });
    const topSet = prescription.sets.find(set => set.reps === 2);

    weightsSeen.push(topSet.weight);

    const nextWorkoutNumber = 30 + (cycle + 1) * 2;
    history = [
      ...history,
      makeTopDoubleEntry({
        workoutNumber: nextWorkoutNumber,
        weight: topSet.weight,
        pct: topSet.pct,
        trainingMax,
      }),
    ];
  }

  // Strictly non-decreasing across every cycle - no freeze, no regression.
  for (let i = 1; i < weightsSeen.length; i += 1) {
    expect(weightsSeen[i]).toBeGreaterThanOrEqual(weightsSeen[i - 1]);
  }
  // And it must actually get there, not just creep asymptotically forever.
  const finalE1rm = weightsSeen[weightsSeen.length - 1] * (1 + 2 / 30);
  expect(finalE1rm).toBeGreaterThanOrEqual(184.5);
});
