import {
  buildSmartDiagnosticText,
  buildSmartMeetPlanReadiness,
  getSmartPrescriptionDetailRows,
  normalizeSmartMeetWorkoutWeights,
} from './App';

function makeBenchWorkout() {
  return {
    number: 26,
    smartCurrentCycle: 3,
    type: 'training',
    smartDayType: 'training',
    smartDecisionSummary: {
      dayType: 'training',
      readiness: {},
    },
    smartTrainingSelectionSummary: {
      primaryLift: 'Bench',
      secondaryLift: 'Deadlift',
    },
    lifts: [
      {
        lift: 'Bench',
        role: 'primary',
        warmups: [
          { reps: 5, weight: 20, pct: 0.20 },
          { reps: 3, weight: 70, pct: 0.70 },
        ],
        sets: [
          {
            labelKey: 'topSingle',
            reps: 1,
            weight: 90,
            pct: 0.90,
          },
          ...Array.from({ length: 3 }, () => ({
            labelKey: 'backoff',
            reps: 5,
            weight: 75,
            pct: 0.75,
          })),
        ],
        smartPrescription: {
          role: 'primary',
          topSetAnchorPct: 0.90,
          volumeAnchorPct: 0.75,
          plannedVolumePct: 0.75,
          completeGrid: true,
          gridItemCount: 6,
        },
      },
    ],
  };
}

test('supplemented heavy Bench has a visible complete plan and technical diagnosis', () => {
  const workout = makeBenchWorkout();
  const rows = getSmartPrescriptionDetailRows(workout, {});

  expect(rows).toHaveLength(1);
  expect(rows[0].label).toContain('Bench');
  expect(rows[0].value).toContain(
    'Top single: 90% · 3×5×75%',
  );
  expect(rows[0].value).not.toContain('Opener');
  expect(rows[0].value).not.toContain('90% → 90%');

  const diagnosis = buildSmartDiagnosticText(workout, {});
  expect(diagnosis).toContain(
    'Bench — Plan: Top single: 90% · 3×5×75%',
  );
  expect(diagnosis).toContain(
    'Selection: primary=Bench, secondary=Deadlift',
  );
  expect(diagnosis).toContain(
    'Bench technical: role=primary, topAnchor=0.9, ' +
    'volumeAnchor=0.75, plannedVolume=0.75',
  );
  expect(diagnosis).toContain('gridItems=6');
});

test('generated meet-day weights start on five-kilogram increments', () => {
  const [workout] = normalizeSmartMeetWorkoutWeights([
    {
      type: 'meet',
      smartDayType: 'meet',
      sets: [{ weight: 102.5, originalWeight: 102.5 }],
      lifts: [
        {
          lift: 'Squat',
          sets: [
            { weight: 102.5, originalWeight: 102.5 },
            { weight: 108, originalWeight: 108 },
          ],
        },
      ],
    },
  ]);

  expect(workout.sets[0]).toMatchObject({
    weight: 105,
    originalWeight: 105,
  });
  expect(workout.lifts[0].sets.map(({ weight }) => weight))
    .toEqual([105, 110]);
});
