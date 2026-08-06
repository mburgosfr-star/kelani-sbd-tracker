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

// C3W36 regression boundary:
// 1. Bench was heavy (2x95kg top double) on W33, then heavy again on W36 -
//    three training days later, right after a rest day - while Squat's own
//    last heavy exposure (W30) was about to roll out of the rolling window
//    entirely. The primary-lift ranking used to compare each lift's
//    primary-exposure count against its OWN weekly target (Bench's target
//    of 4 vs Squat's 3), which let Bench "look less loaded" for the same
//    single recent heavy exposure purely because of that denominator, even
//    though its heavy turn was the more recent of the two.
// 2. After fixing (1), Squat became primary/heavy instead - technically
//    more overdue than Bench, but Squat had
//    already used its own single ideal heavy allocation for the week (W30)
//    too, and a near-repeat of that same top double was not progress. With
//    NEITHER lift still due for a heavy
//    exposure this week, the whole day should be light, matching the
//    frequency-score table's default mix (1 heavy exposure/week is enough).
test('neither lift becomes primary/heavy when both have already used their ideal weekly heavy allocation', () => {
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

  expect(w36.lifts.map(({ lift }) => lift).sort()).toEqual(['Bench', 'Squat']);

  const benchBlock = w36.lifts.find(({ lift }) => lift === 'Bench');
  const squatBlock = w36.lifts.find(({ lift }) => lift === 'Squat');

  expect(benchBlock.role).not.toBe('primary');
  expect(squatBlock.role).not.toBe('primary');

  // Every lift block still lands on a complete, non-collapsed grid.
  [benchBlock, squatBlock].forEach(block => {
    expect((block.warmups.length + block.sets.length) % 4).toBe(0);
  });

  // Neither lift's volume block is trimmed down to a token single set (see
  // smartSecondaryVolumeGridFloor.test.js for the isolated unit test of the
  // underlying grid-completion floor).
  [benchBlock, squatBlock].forEach(block => {
    const volumeSets = block.sets.filter(
      set => set.labelKey === 'workSets' || set.labelKey === 'backoff'
    );
    expect(volumeSets.length).toBeGreaterThanOrEqual(3);
  });
});
