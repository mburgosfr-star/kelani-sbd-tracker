import { generateWorkoutsForTrainingModel } from './smartTrainingEngine';
import intermediateHistory from './intermediateDeloadFrequencyHistory.json';

const baseOptions = {
  programProfile: 'kelaniSbdUltra',
  squat: 145,
  bench: 101.33333333333333,
  deadlift: 180,
  accessoryMode: 'off',
  preparationMode: 'off',
  cooldownMode: 'off',
  squatVariant: 'standard',
  benchPressVariant: 'standard',
  deadliftVariant: 'standard',
};

// C3W37 regression boundary: Deadlift already had its full weekly allocation
// (a heavy day W32, plus W34 - intended light but overloaded into a real
// TOO_MUCH failure) - 2 of its 2 weekly target exposures. Squat was the
// only lift still genuinely under its own weekly target, but got excluded
// from the day's candidate pool for an unrelated reason (trained the day
// before, on W36). The primary-lift eligibility gate used a WEIGHTED
// exposure count that discounts light/secondary sessions to half value,
// which let Deadlift's already-maxed count look like it still had room and
// get pulled back in via the frequency guard's "anyone but yesterday's
// lift" fallback - even though Bench, still genuinely under its own weekly
// target, was sitting right there as the correct choice.
test("a lift already at its full raw weekly exposure count doesn't get pulled back into contention just because another lift's usual slot is blocked for an unrelated reason", () => {
  const w35Workouts = generateWorkoutsForTrainingModel('smart', {
    ...baseOptions,
    history: intermediateHistory,
    currentIndex: 34,
    currentCycle: 3,
  });
  const w35 = w35Workouts.find(w => Number(w.number) === 35);
  expect(w35.type).toBe('rest');

  const restHistoryEntry = {
    workoutNumber: w35.number,
    cycle: 3,
    smartDayType: 'recovery',
    restDay: true,
    completionOnly: true,
    workoutEffort: 'easy',
    failedOrSkippedSetCount: 0,
    smartDecisionSummary: w35.smartDecisionSummary,
    workoutSnapshot: { ...w35, workoutEffort: 'easy', completed: true },
  };

  const w36Workouts = generateWorkoutsForTrainingModel('smart', {
    ...baseOptions,
    history: [...intermediateHistory, restHistoryEntry],
    currentIndex: 35,
    currentCycle: 3,
  });
  const w36 = w36Workouts.find(w => Number(w.number) === 36);

  const markDone = workout => {
    const snapshot = JSON.parse(JSON.stringify(workout));
    snapshot.completed = true;
    snapshot.workoutEffort = 'good';
    (snapshot.lifts || []).forEach(liftBlock => {
      (liftBlock.warmups || []).forEach(set => { set.done = true; });
      (liftBlock.sets || []).forEach(set => {
        set.done = true;
        set.failed = false;
        set.skipped = false;
      });
    });
    return snapshot;
  };
  const liftEntries = (workout, snapshot) => (snapshot.lifts || []).map(liftBlock => {
    const sets = liftBlock.sets || [];
    const topSet = sets.reduce(
      (best, set) => (!best || Number(set.weight) > Number(best.weight) ? set : best),
      null
    );
    const topWeight = Number(topSet?.weight) || 0;
    const topReps = Number(topSet?.reps) || 0;

    return {
      completionOnly: false,
      workoutNumber: workout.number,
      cycle: snapshot.smartCurrentCycle,
      smartDayType: snapshot.smartDayType,
      smartDecisionSummary: snapshot.smartDecisionSummary,
      failedOrSkippedSetCount: 0,
      lift: liftBlock.lift,
      topWeight,
      topReps,
      e1rm: topWeight * (1 + topReps / 30),
      workoutEffort: 'good',
      workoutSnapshot: snapshot,
    };
  });

  const snapshot36 = markDone(w36);
  const history = [...intermediateHistory, restHistoryEntry, ...liftEntries(w36, snapshot36)];

  const w37Workouts = generateWorkoutsForTrainingModel('smart', {
    ...baseOptions,
    history,
    currentIndex: 36,
    currentCycle: 3,
  });
  const w37 = w37Workouts.find(w => Number(w.number) === 37);

  expect(w37.lifts.map(({ lift }) => lift)).not.toContain('Deadlift');
  expect(w37.lifts.map(({ lift }) => lift)).toContain('Bench');
});
