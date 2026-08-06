import { generateWorkoutsForTrainingModel } from './smartTrainingEngine';
import { hydrateWorkoutsWithHistory, mergeGeneratedWorkoutStructure } from './workoutStateMerge';
import { applyAccessoryPlanToWorkouts } from './accessoryGeneration';
import { removeDeprecatedPrepItemsFromWorkouts } from './warmupAndPrepGeneration';
import { getCompletedWorkoutCount, getCompletedWorkoutNumbers } from './workoutHistoryStats';

const baseArgs = {
  programProfile: 'kelaniSbd',
  squat: 50,
  bench: 32.5,
  deadlift: 70,
  accessoryMode: 'standard',
  preparationMode: 'basicFirst',
};

function markWorkoutDone(workout) {
  const markLift = liftBlock => ({
    ...liftBlock,
    sets: (liftBlock.sets || []).map(set => ({ ...set, done: true })),
  });

  return {
    ...workout,
    lifts: (workout.lifts || []).map(markLift),
    sets: (workout.sets || []).map(set => ({ ...set, done: true })),
  };
}

// Simulates real usage: complete workouts one at a time (each completion is
// generated against the history accumulated so far, exactly like the app
// does), so the resulting history's workoutSnapshot entries have the same
// shape (`lift`, `lifts`, `smartVisible`, ...) hydrateWorkoutsWithHistory
// expects - instead of a hand-guessed shape that may not match on `lift`.
function simulateCompletedHistory(completedCount, currentCycle = 1) {
  const history = [];

  for (let i = 0; i < completedCount; i++) {
    const generated = generateWorkoutsForTrainingModel('smart', {
      ...baseArgs,
      history,
      currentCycle,
      currentIndex: i,
    });
    const completedWorkout = markWorkoutDone(generated[i]);

    history.push({
      cycle: currentCycle,
      workoutNumber: completedWorkout.number,
      lift: completedWorkout.lift,
      workoutEffort: 'good',
      workoutSnapshot: completedWorkout,
    });
  }

  return history;
}

// Mirrors the two generate/merge passes App.js runs on startup: the mount
// effect (no persisted `inProgress`) followed by the settings-driven refresh
// effect, merged through applyAccessoryPlanToWorkouts.
function runMountThenRefreshPipeline(history, currentCycle, mountCurrentIndex) {
  const mountGenerated = generateWorkoutsForTrainingModel('smart', {
    ...baseArgs,
    history,
    currentCycle,
    currentIndex: mountCurrentIndex,
  });

  const restoredWorkouts = hydrateWorkoutsWithHistory(mountGenerated, history, currentCycle);
  const cleanedWorkouts = removeDeprecatedPrepItemsFromWorkouts(
    mergeGeneratedWorkoutStructure(restoredWorkouts, mountGenerated, history, currentCycle)
  );

  const completedWorkoutCount = getCompletedWorkoutCount(history, currentCycle);
  const refreshGenerated = generateWorkoutsForTrainingModel('smart', {
    ...baseArgs,
    history,
    currentCycle,
    currentIndex: completedWorkoutCount,
  });

  return removeDeprecatedPrepItemsFromWorkouts(
    applyAccessoryPlanToWorkouts(
      cleanedWorkouts,
      refreshGenerated,
      getCompletedWorkoutNumbers(history, currentCycle),
      completedWorkoutCount + 1
    )
  );
}

describe('Smart Training program list visibility on restore with no persisted inProgress', () => {
  test.each([2, 3, 5])(
    'keeps every already-completed workout visible when completedCount=%i',
    completedCount => {
      const history = simulateCompletedHistory(completedCount);
      const completedWorkoutCount = getCompletedWorkoutCount(history, 1);

      expect(completedWorkoutCount).toBe(completedCount);

      // The mount effect must seed its first generation pass with the real
      // completed-history count, not a hardcoded 0 - otherwise the stale
      // low-visibility pass wins for every already-completed workout number
      // (see applyAccessoryPlanToWorkouts's completedWorkoutNumbers.has
      // branch), and the correct visibility the refresh pass computes gets
      // silently discarded for the whole list.
      const merged = runMountThenRefreshPipeline(history, 1, completedWorkoutCount);

      const completedNumbers = getCompletedWorkoutNumbers(history, 1);
      const completedEntriesAllVisible = merged
        .filter(w => completedNumbers.has(Number(w.number)))
        .every(w => w.smartVisible === true);

      expect(completedEntriesAllVisible).toBe(true);
      expect(merged.filter(w => w.smartVisible).length).toBeGreaterThanOrEqual(completedCount);
    }
  );

  test('loses visibility on already-completed workouts if the mount pass hardcodes currentIndex to 0', () => {
    const completedCount = 5;
    const history = simulateCompletedHistory(completedCount);
    const completedNumbers = getCompletedWorkoutNumbers(history, 1);

    const merged = runMountThenRefreshPipeline(history, 1, 0);

    const completedEntriesAllVisible = merged
      .filter(w => completedNumbers.has(Number(w.number)))
      .every(w => w.smartVisible === true);

    expect(completedEntriesAllVisible).toBe(false);
  });
});
