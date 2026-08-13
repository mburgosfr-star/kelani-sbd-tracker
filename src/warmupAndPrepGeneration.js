import { roundBarbellWeight } from './smartFrequencyPolicy';
import { isTopSetLabel, isMainOrAttemptLabelKey } from './workoutHistoryStats';
import { normalizePreparationMode } from './programProfiles';

const DEPRECATED_PREP_LABEL_KEYS = new Set([
  'prepThoracicRotationSideLying',
]);

export function removeDeprecatedPrepItemsFromWorkout(workout) {
  if (!workout) return workout;

  const cleanPrepItems = items => Array.isArray(items)
    ? items.filter(item => !DEPRECATED_PREP_LABEL_KEYS.has(item?.labelKey))
    : items;

  const cleanLiftBlock = liftBlock => liftBlock
    ? {
        ...liftBlock,
        prepItems: cleanPrepItems(liftBlock.prepItems),
      }
    : liftBlock;

  return {
    ...workout,
    prepItems: cleanPrepItems(workout.prepItems),
    liftBlocks: Array.isArray(workout.liftBlocks)
      ? workout.liftBlocks.map(cleanLiftBlock)
      : workout.liftBlocks,
  };
}

export function removeDeprecatedPrepItemsFromWorkouts(workouts) {
  return Array.isArray(workouts)
    ? workouts.map(removeDeprecatedPrepItemsFromWorkout)
    : workouts;
}

export function generatePrepItems(lift, preparationMode = 'basicFirst') {
  const normalizedPreparationMode = normalizePreparationMode(preparationMode);

  if (normalizedPreparationMode === 'off') return [];

  if (normalizedPreparationMode === 'shoulderThoracic') {
    return [
      { labelKey: 'prepBeachStretch', prescription: '2×8', perSide: true },
      { labelKey: 'prepThoracicFoamRoller', prescription: '2×8' },
      { labelKey: 'prepWallRollsExternalRotation', prescription: '3×8' },
      { labelKey: 'prepClosedChainScapulaWall', prescription: '2×8' },
      { labelKey: 'prepScapPushupPosition', prescription: '2×10' },
    ].map(item => ({
      ...item,
      done: false,
    }));
  }

  const itemsByLift = {
    Bench: [
      { labelKey: 'prepBandPullApart', prescription: '2×20' },
      { labelKey: 'prepBandExternalRotation', prescription: '2×15', perSide: true },
      { labelKey: 'prepLightRows', prescription: '2×15' },
      { labelKey: 'prepScapPushups', prescription: '2×10' },
    ],
    Squat: [
      { labelKey: 'prepHipOpeners', prescription: '2×10', perSide: true },
      { labelKey: 'prepBodyweightSquats', prescription: '2×10' },
      { labelKey: 'prepGluteBridges', prescription: '2×12' },
      { labelKey: 'prepBracingBreaths', prescription: '2×5' },
    ],
    Deadlift: [
      { labelKey: 'prepHipHinges', prescription: '2×10' },
      { labelKey: 'prepLatPulldowns', prescription: '2×15' },
      { labelKey: 'prepHamstringSweeps', prescription: '2×10', perSide: true },
      { labelKey: 'prepEmptyBarRows', prescription: '2×10' },
    ],
  };

  return (itemsByLift[lift] || []).map(item => ({
    ...item,
    done: false,
  }));
}

export function generateWarmups(workPlan, lift = '', isSingleLiftWorkout = false) {
  const workSets = Array.isArray(workPlan)
    ? workPlan.filter(set => Number(set?.weight) > 0)
    : [{ weight: Number(workPlan) || 0, reps: null }];

  if (!workSets.length) return [];

  const targetWeight = Math.max(...workSets.map(set => Number(set.weight) || 0));
  const lowestWorkWeight = Math.min(...workSets.map(set => Number(set.weight) || 0));
  const normalizedLift = String(lift || '');
  const isLowerBodyLift = ['Squat', 'Deadlift'].includes(normalizedLift);
  // Squat/Deadlift may add at most 55kg (one 25kg + one 2.5kg plate per
  // side): a jump of 60kg or more is forbidden. The single-lift-day
  // widening was calibrated for Bench/OHP's narrower 40kg base and, applied
  // to Squat/Deadlift too, skips a genuinely necessary bridge step (see the
  // C3W30 Squat report: missing 70kg bridge between 20kg and a 125kg top).
  const MAX_WARMUP_JUMP_KG = isLowerBodyLift
    ? 55
    : 40 + (isSingleLiftWorkout ? 20 : 0);
  const WARMUP_BRIDGE_STEP_KG = isLowerBodyLift
    ? 50
    : MAX_WARMUP_JUMP_KG;

  if (targetWeight < 30) return [];

  function roundTo10(weight) {
    return Math.round((Number(weight) || 0) / 10) * 10;
  }

  function roundDown10(weight) {
    return Math.floor((Number(weight) || 0) / 10) * 10;
  }

  function isTopWarmupTarget(set = {}) {
    return (
      isTopSetLabel(set.labelKey) ||
      set.labelKey === 'opener' ||
      set.labelKey === 'secondAttempt' ||
      set.labelKey === 'thirdAttempt'
    );
  }

  const topSet = workSets.find(isTopWarmupTarget);
  const targetSet = topSet || workSets.find(set => Number(set.weight) === targetWeight) || workSets[0];
  const targetReps = Math.max(Number(targetSet?.reps) || 1, 1);
  const hasTopSet = Boolean(topSet);

  const highestNonTopWorkSet = workSets
    .filter(set => !isTopWarmupTarget(set))
    .filter(set => Number(set.weight) >= 40 && Number(set.weight) < targetWeight)
    .sort((a, b) => Number(b.weight) - Number(a.weight))[0] || null;
  const highestNonTopWorkWeight = Number(highestNonTopWorkSet?.weight) || null;

  const hasCloseBackoff =
    hasTopSet &&
    highestNonTopWorkWeight &&
    targetWeight - highestNonTopWorkWeight <= 25 &&
    targetReps > 1;

  const reusableBackoffWarmupWeight =
    highestNonTopWorkWeight > 20
      ? roundDown10(highestNonTopWorkWeight)
      : 0;
  const usesReusableRoundBackoffWarmup =
    hasTopSet &&
    targetReps <= 1 &&
    reusableBackoffWarmupWeight > 20 &&
    reusableBackoffWarmupWeight < targetWeight &&
    reusableBackoffWarmupWeight <= highestNonTopWorkWeight &&
    targetWeight - reusableBackoffWarmupWeight <= MAX_WARMUP_JUMP_KG;
  const usesReusableTaperBackoffWarmup =
    hasTopSet &&
    targetReps >= 3 &&
    reusableBackoffWarmupWeight > 20 &&
    reusableBackoffWarmupWeight < targetWeight &&
    targetWeight - reusableBackoffWarmupWeight <= MAX_WARMUP_JUMP_KG;

  function finalWarmupWeight() {
    if (hasTopSet) {
      if (
        normalizedLift === 'Bench' &&
        targetReps >= 3 &&
        highestNonTopWorkWeight > 20 &&
        targetWeight - highestNonTopWorkWeight <= MAX_WARMUP_JUMP_KG
      ) {
        return highestNonTopWorkWeight;
      }

      if (usesReusableRoundBackoffWarmup || usesReusableTaperBackoffWarmup) {
        return reusableBackoffWarmupWeight;
      }

      if (hasCloseBackoff) {
        return roundDown10(highestNonTopWorkWeight);
      }

      if (targetReps <= 1) return roundTo10(targetWeight * 0.92);
      if (targetReps === 2) return roundTo10(targetWeight * 0.88);
      return roundTo10(targetWeight * 0.82);
    }

    return roundDown10(targetWeight - 10);
  }

  function cleanWarmupWeight(weight) {
    const rounded = roundTo10(weight);
    const reusesBenchBackoff =
      normalizedLift === 'Bench' &&
      hasTopSet &&
      targetReps >= 3 &&
      rounded === roundTo10(highestNonTopWorkWeight);

    if (rounded <= 20) return null;

    if (
      !hasCloseBackoff &&
      !usesReusableRoundBackoffWarmup &&
      !usesReusableTaperBackoffWarmup &&
      !reusesBenchBackoff &&
      normalizedLift !== 'Bench' &&
      rounded >= lowestWorkWeight
    ) {
      const belowLowestWorkWeight = roundDown10(lowestWorkWeight - 0.001);
      return belowLowestWorkWeight > 20 ? belowLowestWorkWeight : null;
    }

    if (rounded >= targetWeight) return null;
    if (targetWeight - rounded < 7.5) return null;

    // On top set + close backoff days, do not insert a warm-up above the later backoff.
    // Example: Bench top 77.5, backoff 67.5 must not create 70.
    if (hasCloseBackoff && rounded > highestNonTopWorkWeight) return null;

    return rounded;
  }

  function repsForWarmup(weight, isFinalWarmup) {
    if (weight === 20) return 5;
    if (isLowerBodyLift && weight <= 70 && !isFinalWarmup) return 5;
    // A secondary/tertiary (no top set) block's own work-set reps don't
    // belong on its warm-ups - a warm-up is never the actual working
    // stimulus, so it stays at a full 5 reps regardless of whether the work
    // sets themselves are 4, 5 or 6 reps.
    if (!hasTopSet) return 5;

    if (
      (hasCloseBackoff || usesReusableRoundBackoffWarmup || usesReusableTaperBackoffWarmup) &&
      isFinalWarmup
    ) {
      return Math.min(3, Math.max(Number(highestNonTopWorkSet?.reps) || targetReps, 1));
    }

    const distanceToTarget = targetWeight - weight;

    if (targetReps <= 1) {
      if (isFinalWarmup || distanceToTarget <= 20) return 1;
      if (distanceToTarget <= 50) return 3;
      return 5;
    }

    if (targetReps === 2) {
      // A top double needs enough rehearsal to establish the movement and
      // brace without turning its final warm-up into a competing single.
      // Keep the whole ladder at 5/3 reps; never prescribe 1 or 2 reps.
      if (distanceToTarget <= 60) return 3;
      return 5;
    }

    if (isFinalWarmup) return Math.min(3, targetReps);
    if (distanceToTarget <= 60) return 3;
    return 5;
  }

  const warmupWeights = [20];

  if (hasTopSet) {
    const finalWeight = cleanWarmupWeight(finalWarmupWeight());

    if (finalWeight) {
      let last = 20;
      const bridgeJumpLimit =
        normalizedLift === 'Bench' &&
        (usesReusableTaperBackoffWarmup || targetReps >= 3)
          ? 50
          : MAX_WARMUP_JUMP_KG;

      while (finalWeight - last > bridgeJumpLimit) {
        const bridge = cleanWarmupWeight(last + WARMUP_BRIDGE_STEP_KG);
        if (!bridge || bridge <= last || bridge >= finalWeight) break;

        warmupWeights.push(bridge);
        last = bridge;
      }

      if (!warmupWeights.includes(finalWeight)) {
        warmupWeights.push(finalWeight);
      }
    }
  } else {
    // No top/attempt set to bridge into - just close the gap to the actual
    // work weight in <= MAX_WARMUP_JUMP_KG steps, without an extra rung
    // padded in right next to the target. Regression boundary: a 100kg
    // warm-up 10kg under a 110kg *light* work set added nothing - "5x20,
    // 5x70" straight into the work sets was what he actually wanted.
    let last = 20;

    while (targetWeight - last > MAX_WARMUP_JUMP_KG) {
      const bridge = cleanWarmupWeight(last + WARMUP_BRIDGE_STEP_KG);
      if (!bridge || bridge <= last || bridge >= targetWeight) break;

      warmupWeights.push(bridge);
      last = bridge;
    }
  }

  const sortedWarmupWeights = warmupWeights
    .filter((weight, index, weights) => weight > 0 && weights.indexOf(weight) === index)
    .sort((a, b) => a - b);

  // A close backoff can nominate a final warm-up only 5kg below the later
  // volume work. Prefer the preceding bridge when that bridge already sits
  // within the lower-body max jump of the top set. C3W46 Deadlift: the
  // useful ladder into 170 is 20 -> 70 -> 120; 140 adds fatigue immediately
  // before both the top double and 145kg backoffs.
  if (hasCloseBackoff && sortedWarmupWeights.length >= 3) {
    const finalIndex = sortedWarmupWeights.length - 1;
    const finalWeight = sortedWarmupWeights[finalIndex];
    const previousWeight = sortedWarmupWeights[finalIndex - 1];
    const sitsRightBelowBackoff =
      highestNonTopWorkWeight - finalWeight < 7.5;
    const previousAlreadyBridgesTop =
      targetWeight - previousWeight <= MAX_WARMUP_JUMP_KG;

    if (
      sitsRightBelowBackoff &&
      previousAlreadyBridgesTop &&
      !usesReusableTaperBackoffWarmup
    ) {
      sortedWarmupWeights.pop();
    }
  }

  const prunedWarmupWeights = sortedWarmupWeights
    .filter((weight, index, weights) => {
      if (index <= 1) return true;

      const previousWeight = Number(weights[index - 1]) || 0;
      const currentWeight = Number(weight) || 0;
      const target = Number(targetWeight) || 0;

      if (!previousWeight || !currentWeight || !target) return true;

      const distanceFromPrevious = currentWeight - previousWeight;
      const distanceToWork = target - currentWeight;

      if (
        (usesReusableRoundBackoffWarmup || usesReusableTaperBackoffWarmup) &&
        currentWeight === reusableBackoffWarmupWeight
      ) {
        return true;
      }

      if (
        normalizedLift === 'Bench' &&
        hasTopSet &&
        targetReps >= 3 &&
        currentWeight === roundTo10(targetWeight * 0.82)
      ) {
        return true;
      }

      return distanceToWork <= distanceFromPrevious;
    });

  // Pruning against lighter backoffs must never reopen an unsafe jump into
  // a heavier top set. A warm-up above the later backoff is valid because
  // the top set happens first. Enforce the lower-body <60kg ceiling after
  // every pruning decision (C3W52 Squat: 20 -> 70 -> 120 -> 135).
  if (hasTopSet && isLowerBodyLift) {
    let lastWarmupWeight = prunedWarmupWeights.at(-1) || 20;

    while (targetWeight - lastWarmupWeight > MAX_WARMUP_JUMP_KG) {
      const bridge = roundDown10(Math.min(
        lastWarmupWeight + WARMUP_BRIDGE_STEP_KG,
        targetWeight - 7.5
      ));
      if (bridge <= lastWarmupWeight || bridge >= targetWeight) break;

      prunedWarmupWeights.push(bridge);
      lastWarmupWeight = bridge;
    }
  }

  const computedReps = prunedWarmupWeights.map((weight, index, weights) => {
    const isFinalWarmup = index === weights.length - 1 && weight !== 20;
    return repsForWarmup(weight, isFinalWarmup);
  });

  // Invariants enforced here regardless of which branch above computed each
  // step: a warm-up is never exactly 2 reps, every warm-up before a top
  // double is at least 3 reps, and reps never increase as weight climbs.
  const normalizedReps = computedReps.reduce((result, rawReps, index) => {
    const withoutTwo = rawReps === 2 ? 3 : rawReps;
    const withTopDoubleMinimum = targetReps === 2
      ? Math.max(withoutTwo, 3)
      : withoutTwo;
    const capped = index > 0
      ? Math.min(withTopDoubleMinimum, result[index - 1])
      : withTopDoubleMinimum;

    result.push(capped);
    return result;
  }, []);

  return prunedWarmupWeights.map((weight, index) => ({
    reps: normalizedReps[index],
    weight,
    originalWeight: weight,
    done: false,
  }));
}

export function roundMeetWeight(weight) {
  return roundBarbellWeight(weight, 'nearest', 2.5);
}

export function getSetTrainingMax(set) {
  const originalWeight = Number(set?.originalWeight ?? set?.failedWeight ?? set?.weight) || 0;
  const originalPct = Number(set?.originalPct ?? set?.pct) || 0;

  return originalWeight > 0 && originalPct > 0
    ? originalWeight / originalPct
    : 0;
}

export function getSetPctForWeight(set, weight) {
  const trainingMax = getSetTrainingMax(set);
  if (!trainingMax) return Number(set?.pct) || null;

  return Number(weight) / trainingMax;
}

export function getBackoffGroupLabelForSets(sets = [], t) {
  const hasMainOrAttemptSet = sets.some(set => isMainOrAttemptLabelKey(set.labelKey));

  return hasMainOrAttemptSet
    ? t.backoff
    : (t.workSets || t.set);
}

export function isGroupedWorkoutSet(set = {}) {
  return Boolean(set.groupKey) || ['backoff', 'workSets'].includes(set.labelKey);
}

export function getWorkoutSetGroupEntries(sets = [], currentSet = {}) {
  if (currentSet.groupKey) {
    return sets
      .map((groupSet, groupIndex) => ({ set: groupSet, index: groupIndex }))
      .filter(({ set }) => set.groupKey === currentSet.groupKey);
  }

  return sets
    .map((groupSet, groupIndex) => ({ set: groupSet, index: groupIndex }))
    .filter(({ set }) => ['backoff', 'workSets'].includes(set.labelKey));
}

export function getWorkoutSetGroupLabel(currentSet = {}, sets = [], t) {
  if (currentSet.groupLabelKey) {
    return t[currentSet.groupLabelKey] || currentSet.groupLabelKey;
  }

  if (currentSet.groupKey && currentSet.labelKey) {
    return t[currentSet.labelKey] || currentSet.label || currentSet.groupKey;
  }

  if (currentSet.groupKey) {
    return currentSet.label || currentSet.groupKey;
  }

  return getBackoffGroupLabelForSets(sets, t);
}
