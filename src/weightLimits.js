import { normalizeWeightRounding } from './weightRounding';
import { generateWarmups } from './warmupAndPrepGeneration';
import { isTopSetLabel } from './workoutHistoryStats';
import { setHasUserState } from './workoutStateMerge';
import { completeWorkoutVolumeGrid, WORKOUT_GRID_COLUMNS } from './workoutGridPolicy';

const KEYS = ['Squat', 'Bench', 'Deadlift', 'benchCapacity'];
export const EMPTY_WEIGHT_LIMITS = { Squat: null, Bench: null, Deadlift: null, benchCapacity: null };

export function isValidWeightLimits(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every(key => KEYS.includes(key)) && KEYS.every(key =>
      value[key] == null || (typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 20)));
}

export function normalizeWeightLimits(value) {
  return isValidWeightLimits(value) ? { ...EMPTY_WEIGHT_LIMITS, ...value } : { ...EMPTY_WEIGHT_LIMITS };
}

export function latestLimitBodyWeight(bodyWeights = []) {
  return [...bodyWeights].reverse().find(entry => Number(entry?.bodyWeight) > 0)?.bodyWeight ?? null;
}

export function getLiftWeightLimit(lift, limits, bodyWeight) {
  const settings = normalizeWeightLimits(limits);
  let maximum = settings[lift] ?? Infinity;
  if (lift === 'Bench' && settings.benchCapacity != null) {
    // Without body weight the remaining bench capacity cannot be established.
    maximum = Math.min(maximum, Number(bodyWeight) > 0 ? settings.benchCapacity - Number(bodyWeight) : 0);
  }
  return Math.max(0, maximum);
}

const finalized = set => set.done || set.failed || set.skipped;

export function applyWorkoutWeightLimits(workout, limits, bodyWeight, rounding) {
  if (!workout || workout.completed || workout.type !== 'training') return workout;
  const step = normalizeWeightRounding(rounding || workout.weightRounding).training;
  let changed = false;
  const blocks = workout.lifts?.length ? workout.lifts : [workout];
  const lifts = blocks.map(block => {
    const lift = block.lift || workout.lift;
    const maximum = getLiftWeightLimit(lift, limits, bodyWeight);
    const trainingMax = Number(workout.smartLoadMaxes?.[lift]) || 0;
    const cappedWeight = Math.floor(maximum / step) * step;
    let blockChanged = false;
    let sets = (block.sets || []).map(set => {
      if (finalized(set)) return set;
      const unavailable = maximum < 20;
      const metadata = Number.isFinite(maximum) ? maximum : undefined;
      if (Number(set.weight) <= maximum && !set.weightLimitUnavailable) {
        if (set.equipmentMaxWeight === metadata) return set;
        blockChanged = true;
        return { ...set, equipmentMaxWeight: metadata };
      }
      // Store the original prescription, not a repeatedly rounded conversion.
      const source = set.weightLimitPrescription || { weight: set.weight, reps: set.reps, pct: set.pct };
      const target = unavailable ? 0 : Math.min(Number(source.weight), cappedWeight);
      // Same Epley load/repetition relationship used for prescription changes.
      // This approximates effort, not heavy-load specificity. No repetition cap.
      const reps = target > 0 ? Math.max(Number(source.reps), Math.round(
        30 * (Number(source.weight) * (1 + Number(source.reps) / 30) / target - 1)
      )) : Number(source.reps);
      const pct = target > 0 && trainingMax > 0 ? target / trainingMax
        : target > 0 && source.weight > 0 ? Number(source.pct || 0) * target / source.weight : 0;
      if (set.weight === target && set.reps === reps && set.equipmentMaxWeight === metadata &&
          Boolean(set.weightLimitUnavailable) === unavailable) return set;
      blockChanged = true;
      return { ...set, weight: target, reps, pct, originalWeight: target, originalPct: pct,
        equipmentMaxWeight: metadata, weightLimitUnavailable: unavailable,
        weightLimitPrescription: source };
    });
    const firstWork = sets.find(set => isTopSetLabel(set.labelKey)) || sets[0];
    const previousWarmups = block.warmups || [];
    let warmups = previousWarmups;
    if (maximum < 20) {
      warmups = previousWarmups.map(set => finalized(set) || set.weightLimitUnavailable ? set : {
        ...set, weight: 0, originalWeight: 0, weightLimitWarmupWeight: set.weight, weightLimitUnavailable: true,
      });
    } else if ((firstWork?.weightLimitPrescription || previousWarmups.some(set => set.weightLimitUnavailable)) &&
        !sets.some(finalized)) {
      // Use the effective load and rep count, even if the cap was applied
      // earlier and this workout is now being restored from storage.
      const recorded = previousWarmups.filter(finalized);
      const lastRecordedWeight = Number(recorded.at(-1)?.weight) || 0;
      const open = generateWarmups(sets).filter(set => set.weight > lastRecordedWeight);
      warmups = [...recorded, ...open.map(set => previousWarmups.find(previous =>
        !finalized(previous) && !previous.weightLimitUnavailable &&
        previous.weight === set.weight && previous.reps === set.reps
      ) || set)];

      if (!block.smartPrescription?.fixedBackoffCount && block.smartPrescription?.completeGrid && !sets.some(setHasUserState) &&
          (sets.length + warmups.length) % WORKOUT_GRID_COLUMNS !== 0) {
        sets = completeWorkoutVolumeGrid({ sets, warmups });
        blockChanged = true;
      }
    }
    if (warmups.length !== previousWarmups.length || warmups.some((set, index) => set !== previousWarmups[index])) {
      blockChanged = true;
    } else {
      warmups = previousWarmups;
    }
    if (!blockChanged) return block;
    changed = true;
    const gridItemCount = sets.length + warmups.length;
    return { ...block, sets, warmups, ...(block.smartPrescription && {
      smartPrescription: {
        ...block.smartPrescription, gridItemCount,
        completeGrid: gridItemCount % WORKOUT_GRID_COLUMNS === 0,
      },
    }) };
  });
  if (!changed) return workout;
  if (!workout.lifts?.length) return lifts[0];
  return { ...workout, lifts, sets: lifts[0].sets, warmups: lifts[0].warmups };
}

export function applyWeightLimitsToWorkouts(workouts, limits, bodyWeights, rounding) {
  const bodyWeight = latestLimitBodyWeight(bodyWeights);
  const next = workouts.map(workout => applyWorkoutWeightLimits(workout, limits, bodyWeight, rounding));
  return next.every((workout, index) => workout === workouts[index]) ? workouts : next;
}

// A set edit replaces one workout. Reuse results for the other immutable workouts
// until the limiter inputs change and the caller creates a fresh limiter.
export function createWorkoutWeightLimiter(limits, bodyWeights, rounding) {
  const bodyWeight = latestLimitBodyWeight(bodyWeights);
  const cache = new WeakMap();
  return workouts => {
    const next = workouts.map(workout => {
      if (!workout) return workout;
      if (!cache.has(workout)) {
        cache.set(workout, applyWorkoutWeightLimits(workout, limits, bodyWeight, rounding));
      }
      return cache.get(workout);
    });
    return next.every((workout, index) => workout === workouts[index]) ? workouts : next;
  };
}
