import {
  getSetPctForWeight,
  roundMeetWeight,
} from './warmupAndPrepGeneration';

export function isWorkoutSetFinalized(set = {}) {
  return Boolean(set.done || set.skipped);
}

function hasWorkoutSetRestoreTarget(set = {}) {
  return Boolean(
    set.adjustedFromFailedSet ||
    set.adjustedFromOriginal ||
    set.adjustedWeight ||
    set.failedWeight ||
    Number(set.weight) !== Number(set.originalWeight ?? set.weight)
  );
}

export function changeOpenWorkoutSetWeight(set = {}, requestedWeight) {
  if (isWorkoutSetFinalized(set)) return set;

  const nextWeight = Number(requestedWeight);
  if (!Number.isFinite(nextWeight) || nextWeight <= 0) return set;

  const originalWeight = Number(set.originalWeight ?? set.weight) || nextWeight;
  const originalPct = Number(set.originalPct ?? set.pct) || 0;
  const nextPct = getSetPctForWeight(
    { ...set, originalWeight, originalPct },
    nextWeight
  );

  return {
    ...set,
    weight: nextWeight,
    pct: nextPct || set.pct,
    done: false,
    failed: false,
    skipped: false,
    failedAttempts: 0,
    failedWeight: null,
    adjustedWeight: null,
    originalWeight,
    originalPct,
    adjustedFromFailedSet: false,
    adjustedFromOriginal: nextWeight !== originalWeight,
  };
}

export function restoreOpenWorkoutSetWeight(set = {}) {
  if (isWorkoutSetFinalized(set) || !hasWorkoutSetRestoreTarget(set)) return set;

  const restoredWeight = Number(set.originalWeight ?? set.weight) || Number(set.weight) || 0;
  const restoredPct = Number(
    set.originalPct ?? getSetPctForWeight(set, restoredWeight)
  ) || set.pct;

  return {
    ...set,
    weight: restoredWeight,
    pct: restoredPct,
    done: false,
    failed: false,
    skipped: false,
    failedAttempts: 0,
    failedWeight: null,
    adjustedWeight: null,
    adjustedFromFailedSet: false,
    adjustedFromOriginal: false,
  };
}

export function markOpenWorkoutSetFailed(set = {}) {
  if (isWorkoutSetFinalized(set)) return set;

  const originalWeight = Number(set.originalWeight ?? set.weight) || 0;
  const originalPct = Number(set.originalPct ?? set.pct) || 0;

  return {
    ...set,
    done: true,
    failed: true,
    skipped: true,
    failedAttempts: (Number(set.failedAttempts) || 0) + 1,
    failedWeight: Number(set.weight) || originalWeight,
    originalWeight,
    originalPct,
    adjustedWeight: null,
    adjustedFromFailedSet: false,
    adjustedFromOriginal: Number(set.weight) !== originalWeight,
    effort: null,
  };
}

export function changeOpenMeetAttemptWeights(sets = [], setIndex, requestedWeight) {
  if (!Array.isArray(sets) || !sets[setIndex] || isWorkoutSetFinalized(sets[setIndex])) {
    return sets;
  }

  const roundedRequestedWeight = roundMeetWeight(requestedWeight);
  if (!Number.isFinite(roundedRequestedWeight) || roundedRequestedWeight <= 0) {
    return sets;
  }

  const nextSets = [...sets];
  let previousWeight = setIndex > 0
    ? Number(sets[setIndex - 1]?.weight) || 0
    : 0;

  for (let index = setIndex; index < sets.length; index += 1) {
    const set = sets[index];

    // A recorded attempt is historical fact. Never rewrite it while changing
    // the current or a later attempt, even for an unusual imported state.
    if (isWorkoutSetFinalized(set)) {
      previousWeight = Number(set.weight) || previousWeight;
      continue;
    }

    const currentWeight = roundMeetWeight(set.weight);
    const requested = index === setIndex
      ? roundedRequestedWeight
      : currentWeight;
    const minimumWeight = index === 0 ? 2.5 : previousWeight + 2.5;
    const nextWeight = Math.max(requested, minimumWeight);

    if (index === setIndex || nextWeight !== currentWeight) {
      nextSets[index] = changeOpenWorkoutSetWeight(set, nextWeight);
    }

    previousWeight = nextWeight;
  }

  return nextSets;
}

export function restoreOpenMeetAttemptWeights(sets = [], setIndex) {
  const set = sets?.[setIndex];
  if (!set || isWorkoutSetFinalized(set)) return sets;

  const originalWeight = Number(set.originalWeight ?? set.weight);
  if (!Number.isFinite(originalWeight) || originalWeight <= 0) return sets;

  return changeOpenMeetAttemptWeights(sets, setIndex, originalWeight);
}

function isAccessorySetFinalized(accessory = {}, setIndex) {
  return Boolean(
    accessory.done?.[setIndex] ||
    accessory.skipped?.[setIndex]
  );
}

export function changeOpenAccessorySetWeight(accessory = {}, setIndex, requestedWeight) {
  if (isAccessorySetFinalized(accessory, setIndex)) return accessory;

  const nextWeight = Number(requestedWeight);
  if (!Number.isFinite(nextWeight) || nextWeight <= 0) return accessory;

  const weights = [...(accessory.weights || [])];
  if (setIndex < 0 || setIndex >= weights.length) return accessory;

  const originalWeights = accessory.originalWeights
    ? [...accessory.originalWeights]
    : [...weights];
  const adjustedFromOriginal = accessory.adjustedFromOriginal
    ? [...accessory.adjustedFromOriginal]
    : (accessory.done || weights).map(() => false);

  weights[setIndex] = nextWeight;
  adjustedFromOriginal[setIndex] = nextWeight !== Number(originalWeights[setIndex]);

  return {
    ...accessory,
    weights,
    originalWeights,
    adjustedFromOriginal,
  };
}

export function restoreOpenAccessorySetWeight(accessory = {}, setIndex) {
  if (isAccessorySetFinalized(accessory, setIndex)) return accessory;

  const weights = [...(accessory.weights || [])];
  if (setIndex < 0 || setIndex >= weights.length) return accessory;

  const originalWeight = Number(
    accessory.originalWeights?.[setIndex] ??
    accessory.failedWeights?.[setIndex] ??
    weights[setIndex]
  );
  if (!Number.isFinite(originalWeight) || originalWeight <= 0) return accessory;

  const adjustedFromOriginal = accessory.adjustedFromOriginal
    ? [...accessory.adjustedFromOriginal]
    : (accessory.done || weights).map(() => false);
  const adjustedFromFailedSet = accessory.adjustedFromFailedSet
    ? [...accessory.adjustedFromFailedSet]
    : (accessory.done || weights).map(() => false);
  const failed = accessory.failed
    ? [...accessory.failed]
    : (accessory.done || weights).map(() => false);
  const skipped = accessory.skipped
    ? [...accessory.skipped]
    : (accessory.done || weights).map(() => false);
  const failedWeights = accessory.failedWeights
    ? [...accessory.failedWeights]
    : (accessory.done || weights).map(() => null);

  weights[setIndex] = originalWeight;
  adjustedFromOriginal[setIndex] = false;
  adjustedFromFailedSet[setIndex] = false;
  failed[setIndex] = false;
  skipped[setIndex] = false;
  failedWeights[setIndex] = null;

  return {
    ...accessory,
    weights,
    adjustedFromOriginal,
    adjustedFromFailedSet,
    failed,
    skipped,
    failedWeights,
  };
}

export function markOpenAccessorySetFailed(accessory = {}, setIndex) {
  if (isAccessorySetFinalized(accessory, setIndex)) return accessory;

  const done = [...(accessory.done || [])];
  if (setIndex < 0 || setIndex >= done.length) return accessory;

  const defaults = done.map(() => false);
  const failed = accessory.failed ? [...accessory.failed] : [...defaults];
  const skipped = accessory.skipped ? [...accessory.skipped] : [...defaults];
  const failedWeights = accessory.failedWeights
    ? [...accessory.failedWeights]
    : done.map(() => null);
  const originalWeights = accessory.originalWeights
    ? [...accessory.originalWeights]
    : [...(accessory.weights || [])];
  const adjustedFromFailedSet = accessory.adjustedFromFailedSet
    ? [...accessory.adjustedFromFailedSet]
    : [...defaults];
  const adjustedWeights = accessory.adjustedWeights
    ? [...accessory.adjustedWeights]
    : [...(accessory.weights || [])];

  done[setIndex] = true;
  failed[setIndex] = true;
  skipped[setIndex] = true;
  failedWeights[setIndex] = Number(accessory.weights?.[setIndex]) || 0;
  adjustedFromFailedSet[setIndex] = false;
  adjustedWeights[setIndex] = accessory.weights?.[setIndex];

  return {
    ...accessory,
    done,
    failed,
    skipped,
    failedWeights,
    originalWeights,
    adjustedFromFailedSet,
    adjustedWeights,
  };
}
