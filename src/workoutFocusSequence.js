import { generatePrepItems } from './warmupAndPrepGeneration';
import { normalizeWorkoutSetup } from './workoutSetup';

function preparationOwners(workout, workoutSetup, preparationMode) {
  const lifts = (workout?.lifts || []).map(block => block.lift);
  const owners = new Map();

  if (workoutSetup) {
    const setup = normalizeWorkoutSetup(workoutSetup);
    for (const lift of lifts) {
      for (const entry of setup.preparation.byLift[lift] || []) {
        if (!owners.has(entry.key)) owners.set(entry.key, lift);
      }
    }
  }

  // Older workout snapshots have no lift on their preparation items. Infer
  // ownership from the legacy per-lift lists, without changing saved data.
  for (const lift of lifts) {
    for (const item of generatePrepItems(lift, preparationMode)) {
      if (!owners.has(item.labelKey)) owners.set(item.labelKey, lift);
    }
  }

  return (workout?.prepItems || []).map(item =>
    lifts.includes(item?.lift)
      ? item.lift
      : owners.get(item?.labelKey || item?.key) || lifts[0]
  );
}

export function getActiveMultiLiftStep(workout, workoutSetup, preparationMode) {
  const lifts = workout?.lifts || [];
  const prepOwners = preparationOwners(workout, workoutSetup, preparationMode);

  for (let liftIndex = 0; liftIndex < lifts.length; liftIndex += 1) {
    const liftBlock = lifts[liftIndex];
    const prepIndex = (workout.prepItems || []).findIndex((item, index) =>
      prepOwners[index] === liftBlock.lift && !item.done
    );
    if (prepIndex >= 0) return { type: 'prep', liftIndex, index: prepIndex };

    const warmupIndex = (liftBlock.warmups || []).findIndex(item => !item.done);
    if (warmupIndex >= 0) return { type: 'warmup', liftIndex, index: warmupIndex };

    const setIndex = (liftBlock.sets || []).findIndex(item => !item.done);
    if (setIndex >= 0) return { type: 'set', liftIndex, index: setIndex };
  }

  return null;
}
