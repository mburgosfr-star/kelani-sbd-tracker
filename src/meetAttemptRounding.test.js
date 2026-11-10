import { ensureStrictMeetAttempts, buildSuggestedMeetPlan } from './App';

// Beginner C1W20 boundary: 90/97.5/102.5% of
// real 1RM rounded to the nearest 2.5kg produces these pre-tiebreak numbers.
// Before the fix, colliding attempts got bumped a full 5kg, which pushed
// Bench's 2nd attempt (35kg) above her actual tested max (32.5kg e1RM).
test('breaks a tied attempt with a 2.5kg nudge instead of a full 5kg jump', () => {
  expect(ensureStrictMeetAttempts({ opener: 30, second: 30, third: 35 }))
    .toMatchObject({ opener: 30, second: 32.5, third: 35 });

  expect(ensureStrictMeetAttempts({ opener: 40, second: 40, third: 45 }))
    .toMatchObject({ opener: 40, second: 42.5, third: 45 });

  expect(ensureStrictMeetAttempts({ opener: 55, second: 60, third: 60 }))
    .toMatchObject({ opener: 55, second: 60, third: 62.5 });
});

test('leaves already-strictly-increasing attempts unchanged', () => {
  expect(ensureStrictMeetAttempts({ opener: 100, second: 110, third: 120 }))
    .toMatchObject({ opener: 100, second: 110, third: 120 });
});

test('still bumps forward (never down) when the third attempt is below the (already-bumped) second', () => {
  expect(ensureStrictMeetAttempts({ opener: 50, second: 50, third: 52 }))
    .toMatchObject({ opener: 50, second: 52.5, third: 55 });
});

test('buildSuggestedMeetPlan produces the expected beginner meet plan from the supplied estimates', () => {
  const { meetPlan, meetTotals } = buildSuggestedMeetPlan({
    Squat: { oneRM: 42.5 },
    Bench: { oneRM: 32.5 },
    Deadlift: { oneRM: 60 },
  });

  expect(meetPlan.find(row => row.lift === 'Squat'))
    .toMatchObject({ opener: 37.5, second: 40, third: 42.5 });
  expect(meetPlan.find(row => row.lift === 'Bench'))
    .toMatchObject({ opener: 27.5, second: 30, third: 32.5 });
  expect(meetPlan.find(row => row.lift === 'Deadlift'))
    .toMatchObject({ opener: 55, second: 57.5, third: 60 });

  expect(meetTotals).toEqual({ opener: 120, second: 127.5, third: 135 });
});

test('buildSuggestedMeetPlan returns zeroed attempts for a lift with no 1RM yet', () => {
  const { meetPlan, meetTotals } = buildSuggestedMeetPlan({
    Squat: { oneRM: 0 },
    Bench: { oneRM: 0 },
    Deadlift: { oneRM: 0 },
  });

  // ensureStrictMeetAttempts only bumps forward from a positive previous
  // attempt - with no 1RM at all yet, every attempt is genuinely 0, not a
  // series of 2.5kg increments from nothing.
  meetPlan.forEach(row => {
    expect(row).toMatchObject({ opener: 0, second: 0, third: 0 });
  });
  expect(meetTotals).toEqual({ opener: 0, second: 0, third: 0 });
});

test('Classic keeps its existing real-1RM attempt percentages', () => {
  const { meetPlan } = buildSuggestedMeetPlan({ Bench: { oneRM: 100, e1RM: 110 } }, {
    trainingModel: 'classic',
  });
  expect(meetPlan.find(row => row.lift === 'Bench')).toMatchObject({
    basis: 'real-1rm', opener: 90, second: 97.5, third: 102.5,
  });
});

test('Smart uses the same exact e1RM as readiness and preserves custom attempts', () => {
  const { meetPlan } = buildSuggestedMeetPlan({
    Squat: { oneRM: 155, e1RM: 147.5 * (1 + 2 / 30) },
    Bench: { oneRM: 102.5, e1RM: 104 },
    Deadlift: { oneRM: 180, e1RM: 184 },
  }, { manualAttempts: { Bench: { opener: 90, secondAttempt: 97.5, thirdAttempt: 107.5 } } });
  expect(meetPlan[0]).toMatchObject({ opener: 142.5, second: 150, third: 157.5 });
  expect(meetPlan[1]).toMatchObject({ opener: 90, second: 97.5, third: 107.5 });
  expect(meetPlan[2]).toMatchObject({ opener: 165, second: 175, third: 185 });
});

test.each([undefined, 'e1rm'])('a started meet freezes saved attempts with basis %s', basis => {
  const startedMeet = {
    type: 'meet', meetAttemptBasis: basis,
    lifts: [{ lift: 'Bench', warmups: [{ weight: 20, reps: 5, done: true }], sets: [
      { labelKey: 'opener', weight: 90 },
      { labelKey: 'secondAttempt', weight: 97.5 },
      { labelKey: 'thirdAttempt', weight: 102.5 },
    ] }],
  };
  const { meetPlan } = buildSuggestedMeetPlan({ Bench: { oneRM: 105, e1RM: 115 } }, {
    startedMeet,
    manualAttempts: { Bench: { opener: 100, secondAttempt: 110, thirdAttempt: 120 } },
  });
  expect(meetPlan.find(row => row.lift === 'Bench')).toMatchObject({
    frozen: true, opener: 90, second: 97.5, third: 102.5,
  });
});

test('estimated attempt rounding stays increasing without inflating the rounded third target', async () => {
  const { buildMeetAttemptsFromE1RM } = await import('./meetAttemptPlanning');
  for (let estimate = 7.5; estimate <= 1000; estimate += 0.25) {
    const plan = buildMeetAttemptsFromE1RM(estimate);
    expect(plan.opener).toBeGreaterThan(0);
    expect(plan.secondAttempt - plan.opener).toBeGreaterThanOrEqual(2.5);
    expect(plan.thirdAttempt - plan.secondAttempt).toBeGreaterThanOrEqual(2.5);
    expect(plan.thirdAttempt).toBe(Math.round(estimate / 2.5) * 2.5);
    Object.values(plan).forEach(weight => expect(weight % 2.5).toBe(0));
  }
  expect(buildMeetAttemptsFromE1RM(0)).toEqual({ opener: 0, secondAttempt: 0, thirdAttempt: 0 });
  expect(buildMeetAttemptsFromE1RM(5)).toEqual({ opener: 2.5, secondAttempt: 5, thirdAttempt: 7.5 });
});
