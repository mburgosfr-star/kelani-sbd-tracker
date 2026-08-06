import { ensureStrictMeetAttempts, buildSuggestedMeetPlan } from './App';

// Beginner C1W20 boundary: 90/97.5/102.5% of
// e1RM rounded to the nearest 5kg produces these pre-tiebreak numbers.
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

test('buildSuggestedMeetPlan produces the expected beginner meet plan from the supplied 1RMs', () => {
  const { meetPlan, meetTotals } = buildSuggestedMeetPlan({
    Squat: { oneRM: 42.5 },
    Bench: { oneRM: 32.5 },
    Deadlift: { oneRM: 60 },
  });

  expect(meetPlan.find(row => row.lift === 'Squat'))
    .toMatchObject({ opener: 40, second: 42.5, third: 45 });
  expect(meetPlan.find(row => row.lift === 'Bench'))
    .toMatchObject({ opener: 30, second: 32.5, third: 35 });
  expect(meetPlan.find(row => row.lift === 'Deadlift'))
    .toMatchObject({ opener: 55, second: 60, third: 62.5 });

  expect(meetTotals).toEqual({ opener: 125, second: 135, third: 142.5 });
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
