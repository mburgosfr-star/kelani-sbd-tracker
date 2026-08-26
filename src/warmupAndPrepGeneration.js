import { roundBarbellWeight } from './smartFrequencyPolicy';
import { isTopSetLabel, isMainOrAttemptLabelKey } from './workoutHistoryStats';
import { normalizePreparationMode } from './programProfiles';

const DEPRECATED_PREP_LABEL_KEYS = new Set([
  'prepThoracicRotationSideLying',
]);

const WARMUP_REBALANCE_STEP_KG = 10;
const MIN_FINAL_WARMUP_GAP_KG = 7.5;

export function warmupLoadJumpsNeverIncrease(warmupWeights = [], targetWeight = 0) {
  const weights = (warmupWeights || [])
    .map(weight => Number(weight) || 0)
    .filter(weight => weight > 0)
    // Repeated empty-bar sets added to complete a visual grid are not load
    // changes and therefore do not start a zero-kilo "jump" sequence.
    .filter((weight, index, values) => index === 0 || weight !== values[index - 1]);
  const target = Number(targetWeight) || 0;
  if (!weights.length || target <= weights.at(-1)) return true;

  const ladder = [...weights, target];
  for (let index = 2; index < ladder.length; index += 1) {
    const previousJump = ladder[index - 1] - ladder[index - 2];
    const nextJump = ladder[index] - ladder[index - 1];
    if (nextJump > previousJump + 0.0001) return false;
  }

  return true;
}

function insertDesiredWarmupBridge(weights = [], targetWeight = 0) {
  const ladder = [...weights, targetWeight];
  let largestJumpIndex = 0;

  for (let index = 1; index < ladder.length - 1; index += 1) {
    if (
      ladder[index + 1] - ladder[index] >
      ladder[largestJumpIndex + 1] - ladder[largestJumpIndex]
    ) {
      largestJumpIndex = index;
    }
  }

  const lower = ladder[largestJumpIndex];
  const upper = ladder[largestJumpIndex + 1];
  const midpoint = Math.round(
    ((lower + upper) / 2) / WARMUP_REBALANCE_STEP_KG
  ) * WARMUP_REBALANCE_STEP_KG;
  const bridge = Math.min(
    upper - MIN_FINAL_WARMUP_GAP_KG,
    Math.max(lower + WARMUP_REBALANCE_STEP_KG, midpoint)
  );

  const nextWeights = [...weights];
  nextWeights.splice(largestJumpIndex + 1, 0, bridge);
  return nextWeights;
}

/**
 * Rebalance an already-selected warm-up ladder without changing its length
 * when possible. Every warm-up rung remains a strict multiple of 10kg, and
 * a later jump may never exceed the jump immediately before it.
 */
export function rebalanceWarmupLoadJumps(
  warmupWeights = [],
  targetWeight = 0,
  maxFirstJumpKg = 55,
  doNotExceedDesiredWeights = false
) {
  const target = Number(targetWeight) || 0;
  const originalWeights = (warmupWeights || [])
    .map(weight => Number(weight) || 0)
    .filter(weight => weight > 0 && weight < target);

  if (
    originalWeights.length < 2 ||
    (
      warmupLoadJumpsNeverIncrease(originalWeights, target) &&
      originalWeights.every(weight => weight % WARMUP_REBALANCE_STEP_KG === 0)
    )
  ) {
    return originalWeights;
  }

  const startWeight = originalWeights[0];
  const firstExistingJump = originalWeights.length > 1
    ? originalWeights[1] - startWeight
    : 0;
  const firstJumpLimit = Math.max(
    Number(maxFirstJumpKg) || 0,
    firstExistingJump
  );

  function findClosestValidLadder(desiredWeights) {
    const finalIndex = desiredWeights.length;
    const memo = new Map();

    function search(index, previousWeight, previousJump) {
      const memoKey = `${index}|${previousWeight}|${previousJump}`;
      if (memo.has(memoKey)) return memo.get(memoKey);

      if (index === finalIndex) {
        const finalJump = target - previousWeight;
        const result =
          finalJump >= MIN_FINAL_WARMUP_GAP_KG - 0.0001 &&
          finalJump <= previousJump + 0.0001
            ? { score: 0, weights: [] }
            : null;
        memo.set(memoKey, result);
        return result;
      }

      const remainingJumps = finalIndex - index + 1;
      const maximumCandidate = Math.min(
        target - MIN_FINAL_WARMUP_GAP_KG,
        previousWeight + previousJump,
        doNotExceedDesiredWeights
          ? Number(desiredWeights[index]) || Number.POSITIVE_INFINITY
          : Number.POSITIVE_INFINITY
      );
      let best = null;

      for (
        let candidate = previousWeight + WARMUP_REBALANCE_STEP_KG;
        candidate <= maximumCandidate + 0.0001;
        candidate += WARMUP_REBALANCE_STEP_KG
      ) {
        const jump = candidate - previousWeight;
        const remainingWeight = target - candidate;
        if (remainingWeight > jump * remainingJumps + 0.0001) continue;

        const tail = search(index + 1, candidate, jump);
        if (!tail) continue;

        const positionWeight = finalIndex - index + 1;
        const score =
          Math.abs(candidate - Number(desiredWeights[index] || candidate)) *
            positionWeight +
          tail.score;
        const option = {
          score,
          weights: [candidate, ...tail.weights],
        };

        if (!best || option.score < best.score - 0.0001) best = option;
      }

      memo.set(memoKey, best);
      return best;
    }

    const result = search(1, startWeight, firstJumpLimit);
    return result ? [startWeight, ...result.weights] : null;
  }

  let desiredWeights = [...originalWeights];
  for (let extraWarmupCount = 0; extraWarmupCount <= 4; extraWarmupCount += 1) {
    const balanced = findClosestValidLadder(desiredWeights);
    if (balanced) return balanced;
    desiredWeights = insertDesiredWarmupBridge(desiredWeights, target);
  }

  return originalWeights;
}

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

const UNIVERSAL_WARMUP_START_KG = 20;
const UNIVERSAL_WARMUP_ANCHOR_STEP_KG = 50;
const UNIVERSAL_WARMUP_MAX_JUMP_KG = 50;

function buildDesiredUniversalWarmupWeights(targetWeight = 0) {
  const target = Number(targetWeight) || 0;
  if (target < 30) return [];

  const finalWarmup = Math.floor(target / 10) * 10 - 10;
  const weights = [UNIVERSAL_WARMUP_START_KG];

  for (
    let anchor = UNIVERSAL_WARMUP_START_KG + UNIVERSAL_WARMUP_ANCHOR_STEP_KG;
    anchor < finalWarmup;
    anchor += UNIVERSAL_WARMUP_ANCHOR_STEP_KG
  ) {
    weights.push(anchor);
  }

  if (
    finalWarmup > UNIVERSAL_WARMUP_START_KG &&
    finalWarmup < target &&
    !weights.includes(finalWarmup)
  ) {
    weights.push(finalWarmup);
  }

  return weights;
}

function universalWarmupLadderIsValid(weights = [], targetWeight = 0) {
  const target = Number(targetWeight) || 0;
  if (target < 30) return weights.length === 0;
  if (!weights.length || weights[0] !== UNIVERSAL_WARMUP_START_KG) return false;
  if (weights.some(weight => weight % 10 !== 0 || weight >= target)) return false;

  const ladder = [...weights, target];
  let previousJump = UNIVERSAL_WARMUP_MAX_JUMP_KG;

  for (let index = 1; index < ladder.length; index += 1) {
    const jump = ladder[index] - ladder[index - 1];
    if (jump <= 0 || jump > previousJump + 0.0001) return false;
    previousJump = jump;
  }

  return true;
}

export function generateUniversalWarmupWeights(targetWeight = 0) {
  const target = Number(targetWeight) || 0;
  let desiredWeights = buildDesiredUniversalWarmupWeights(target);

  while (desiredWeights.length) {
    const balancedWeights = rebalanceWarmupLoadJumps(
      desiredWeights,
      target,
      UNIVERSAL_WARMUP_MAX_JUMP_KG,
      true
    );

    if (universalWarmupLadderIsValid(balancedWeights, target)) {
      return balancedWeights;
    }

    desiredWeights = desiredWeights.slice(0, -1);
  }

  return [];
}

export function distributeUniversalWarmupReps(warmupCount = 0, targetReps = 1) {
  const count = Math.max(Math.floor(Number(warmupCount) || 0), 0);
  if (count === 0) return [];

  const repetitionFloor = Math.min(
    Math.max(Math.floor(Number(targetReps) || 1), 1),
    5
  );
  const allowedReps = [5, 3, 1].filter(reps => reps >= repetitionFloor);
  const baseCount = Math.floor(count / allowedReps.length);
  const remainder = count % allowedReps.length;

  return allowedReps.flatMap((reps, index) =>
    Array.from({
      length: baseCount + (index < remainder ? 1 : 0),
    }, () => reps)
  );
}

export function generateWarmups(workPlan, lift = '', isSingleLiftWorkout = false) {
  const workSets = Array.isArray(workPlan)
    ? workPlan.filter(set => Number(set?.weight) > 0)
    : [{ weight: Number(workPlan) || 0, reps: null }];

  if (!workSets.length) return [];

  function isFirstMainSet(set = {}) {
    return (
      isTopSetLabel(set.labelKey) ||
      set.labelKey === 'opener' ||
      set.labelKey === 'secondAttempt' ||
      set.labelKey === 'thirdAttempt'
    );
  }

  // Top-set and attempt plans identify their first main set explicitly.
  // Every other prescription warms up for its first displayed work set.
  const targetSet = workSets.find(isFirstMainSet) || workSets[0];
  const targetWeight = Number(targetSet?.weight) || 0;
  const targetReps = Math.max(Number(targetSet?.reps) || 1, 1);
  const weights = generateUniversalWarmupWeights(targetWeight);
  const reps = distributeUniversalWarmupReps(weights.length, targetReps);

  return weights.map((weight, index) => ({
    reps: reps[index],
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
