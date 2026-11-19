import { normalizeWeightRounding } from './weightRounding';

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
    const sets = (block.sets || []).map(set => {
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
    // Preserve the raster and warm-up repetitions. Only lower warm-ups that
    // would reach/exceed their new work target or exceed available equipment.
    const firstWork = sets.find(set => set.labelKey === 'topSet') || sets[0];
    const warmupMaximum = Math.min(maximum, Math.max(20, Math.ceil(Number(firstWork?.weight) / 10) * 10 - 10));
    const warmups = (block.warmups || []).map(set => {
      if (finalized(set) || (!Number.isFinite(maximum) && !set.weightLimitUnavailable)) return set;
      const sourceWeight = set.weightLimitUnavailable ? set.weightLimitWarmupWeight : set.weight;
      const weight = maximum < 20 ? 0 : Math.min(Number(sourceWeight), Math.floor(warmupMaximum / 10) * 10);
      if (weight === set.weight && Boolean(set.weightLimitUnavailable) === (maximum < 20)) return set;
      blockChanged = true;
      return { ...set, weight, originalWeight: weight, weightLimitWarmupWeight: sourceWeight, weightLimitUnavailable: maximum < 20 };
    });
    if (!blockChanged) return block;
    changed = true;
    return { ...block, sets, warmups };
  });
  if (!changed) return workout;
  return { ...workout, ...(workout.lifts?.length ? { lifts } : {}), sets: lifts[0].sets, warmups: lifts[0].warmups };
}

export function applyWeightLimitsToWorkouts(workouts, limits, bodyWeights, rounding) {
  const bodyWeight = latestLimitBodyWeight(bodyWeights);
  const next = workouts.map(workout => applyWorkoutWeightLimits(workout, limits, bodyWeight, rounding));
  return next.every((workout, index) => workout === workouts[index]) ? workouts : next;
}
