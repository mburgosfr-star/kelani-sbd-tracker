import { getCompletedWorkoutNumbers, getEntryCycle } from './workoutHistoryStats';

export function setHasUserState(set) {
  if (!set) return false;

  return Boolean(
    set.done ||
    set.failed ||
    set.skipped ||
    set.failedAttempts ||
    set.failedWeight != null ||
    set.adjustedWeight != null ||
    set.adjustedFromFailedSet ||
    set.adjustedFromOriginal ||
    set.effort ||
    Number(set.weight) !== Number(set.originalWeight ?? set.weight)
  );
}

// True if the athlete has actually started this workout (a set marked
// done/failed/skipped/adjusted, or a warmup checked off) — as opposed to a
// slot that merely exists in the plan but hasn't been touched yet. Used to
// decide whether a not-yet-completed workout's in-progress data must be
// preserved during a merge, or whether it's safe to replace with a freshly
// generated prescription. Handles both the multi-lift shape (`workout.lifts`)
// and the flat single-lift shape (sets/warmups directly on the workout).
export function workoutHasUserProgress(workout) {
  const liftBlocks = (workout?.lifts && workout.lifts.length > 0)
    ? workout.lifts
    : [workout];

  return liftBlocks.some(block =>
    (block?.sets || []).some(setHasUserState) ||
    (block?.warmups || []).some(warmup => warmup?.done)
  );
}

export function mergeGeneratedWorkoutStructure(workouts, generatedWorkouts, history, cycle) {
  const completedWorkoutNumbers = getCompletedWorkoutNumbers(history, cycle);

  return workouts.map((workout, index) => {
    const generated = generatedWorkouts[index];
    if (!generated) return workout;

    const isCompleted = completedWorkoutNumbers.has(Number(generated.number || workout.number));
    const prepDone = isCompleted;

    if (workout.type === 'meet' || (workout.type === 'training' && (workout.lifts || []).length > 0)) {
      if (!isCompleted) {
        // An untouched slot is stale plan data - adopt the fresh prescription.
        // But if the athlete has already checked off sets/warmups here (this
        // is the workout they're mid-session on), replacing it with a blank
        // generated workout would silently wipe that progress on the next
        // app load. Keep their in-progress data instead.
        if (workoutHasUserProgress(workout)) {
          return workout;
        }

        return generated;
      }

      return {
        ...workout,
        lifts: (workout.lifts || generated.lifts || []).map((liftBlock, liftIndex) => {
          const generatedLiftBlock = (generated.lifts || [])[liftIndex] || {};

          return {
            ...liftBlock,
            prepItems: (liftBlock.prepItems || generatedLiftBlock.prepItems || []).map(item => ({
              ...item,
              done: item.done ?? prepDone,
            })),
          };
        }),
      };
    }

    if (!isCompleted) {
      if (workoutHasUserProgress(workout)) {
        return workout;
      }

      return {
        ...generated,
        prepItems: (generated.prepItems || []).map((item, itemIndex) => ({
          ...item,
          done: workout.prepItems?.[itemIndex]?.done ?? false,
        })),
      };
    }

    return {
      ...workout,
      prepItems: (workout.prepItems || generated.prepItems || []).map(item => ({
        ...item,
        done: item.done ?? prepDone,
      })),
    };
  });
}

export function hydrateWorkoutsWithHistory(workouts, history, cycle) {
  return workouts.map(workout => {
    const savedSnapshot = history.find(
      entry =>
        entry.workoutNumber === workout.number &&
        entry.workoutSnapshot &&
        getEntryCycle(entry) === cycle &&
        (entry.lift === workout.lift || workout.type === 'meet')
    );

    if (savedSnapshot?.workoutSnapshot) {
      if (workout.type === 'meet') {
        return {
          ...savedSnapshot.workoutSnapshot,
          lifts: (savedSnapshot.workoutSnapshot.lifts || workout.lifts || []).map((liftBlock, index) => {
            const generatedLiftBlock = (workout.lifts || [])[index] || {};

            return {
              ...liftBlock,
              prepItems: (liftBlock.prepItems || generatedLiftBlock.prepItems || []).map(item => ({
                ...item,
                done: true,
              })),
            };
          }),
        };
      }

      const snapshot = savedSnapshot.workoutSnapshot;

      if (snapshot.type === 'training' && (snapshot.lifts || []).length > 0) {
        const restoredLifts = (snapshot.lifts || workout.lifts || []).map((liftBlock, index) => {
          const generatedLiftBlock = (workout.lifts || [])[index] || {};

          return {
            ...liftBlock,
            prepItems: (liftBlock.prepItems || generatedLiftBlock.prepItems || []).map(item => ({
              ...item,
              done: item.done ?? true,
            })),
            warmups: (liftBlock.warmups || generatedLiftBlock.warmups || []).map(item => ({
              ...item,
              done: item.done ?? true,
            })),
            sets: (liftBlock.sets || generatedLiftBlock.sets || []).map(item => ({
              ...item,
              done: item.done ?? true,
            })),
          };
        });

        const primaryLiftBlock = restoredLifts[0] || {};

        return {
          ...snapshot,
          lifts: restoredLifts,
          lift: primaryLiftBlock.lift || snapshot.lift,
          prepItems: primaryLiftBlock.prepItems || snapshot.prepItems || [],
          warmups: primaryLiftBlock.warmups || snapshot.warmups || [],
          sets: primaryLiftBlock.sets || snapshot.sets || [],
          accessories: (snapshot.accessories || workout.accessories || []).map(accessory => ({
            ...accessory,
            done: accessory.done || [],
          })),
          cooldownItems: (snapshot.cooldownItems || workout.cooldownItems || []).map(item => ({
            ...item,
            done: true,
          })),
        };
      }

      return {
        ...snapshot,
        prepItems: (snapshot.prepItems || workout.prepItems || []).map(item => ({
          ...item,
          done: item.done ?? true,
        })),
        warmups: (snapshot.warmups || workout.warmups || []).map(item => ({
          ...item,
          done: item.done ?? true,
        })),
        sets: (snapshot.sets || workout.sets || []).map(item => ({
          ...item,
          done: item.done ?? true,
        })),
        accessories: (snapshot.accessories || workout.accessories || []).map(accessory => ({
          ...accessory,
          done: accessory.done || [],
        })),
        cooldownItems: (snapshot.cooldownItems || workout.cooldownItems || []).map(item => ({
          ...item,
          done: true,
        })),
      };
    }

    const saved = history.find(
      entry =>
        entry.workoutNumber === workout.number &&
        getEntryCycle(entry) === cycle &&
        (entry.lift === workout.lift || workout.type === 'meet')
    );

    if (saved) {
      if (workout.type === 'meet') {
        return {
          ...workout,
          lifts: (workout.lifts || []).map(liftBlock => ({
            ...liftBlock,
            prepItems: (liftBlock.prepItems || []).map(item => ({ ...item, done: true })),
            warmups: (liftBlock.warmups || []).map(w => ({ ...w, done: true })),
            sets: (liftBlock.sets || []).map(s => ({ ...s, done: true })),
          })),
        };
      }

      return {
        ...workout,
        prepItems: (workout.prepItems || []).map(item => ({ ...item, done: true })),
        warmups: (workout.warmups || []).map(w => ({ ...w, done: true })),
        sets: (workout.sets || []).map(s => ({ ...s, done: true })),
        accessories: (workout.accessories || []).map(a => ({
          ...a,
          done: (a.done || []).map(() => true),
        })),
      };
    }

    return workout;
  });
}
