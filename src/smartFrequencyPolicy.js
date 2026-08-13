import { roundPercent } from './smartPrescriptionEngine';
import {
  SMART_INTENSITY_POINTS,
  SMART_INTENSITY_LOAD_THRESHOLDS,
  SMART_PRIMARY_BACKOFF_MAX_PCT,
  SMART_FREQUENCY_SCORE_TARGETS_BY_LEVEL,
  getSmartFrequencyScoreTargets,
  getSmartMaxConsecutiveTrainingDays,
} from './smartTrainingConstants';

export { SMART_INTENSITY_POINTS, SMART_FREQUENCY_SCORE_TARGETS_BY_LEVEL, getSmartFrequencyScoreTargets };

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

const LIFTS = Object.freeze(['Squat', 'Bench', 'Deadlift']);

export const SMART_FREQUENCY_WINDOW_SIZE = 7;
export const SMART_FREQUENCY_MAX_LIFTS_PER_WORKOUT = 2;

// Per-lift frequency caps, keyed by athlete experience level (auto-derived
// from eStrength - see classifyAthleteLevel in workoutHistoryStats.js).
// "intermediate" is the default fallback and is intentionally decoupled
// from the legacy Classic programProfile - Smart Training owns its own
// frequency targets.
// maxHeavy/maxLight below are kept in sync with SMART_FREQUENCY_SCORE_
// TARGETS_BY_LEVEL's defaultMix in smartTrainingConstants.js (maxHeavy =
// mix.heavy, maxLight = mix.medium + mix.light, since this older policy is
// binary heavy/light with no medium tier) - this table predates that newer
// weighted-intensity design and had drifted out of sync with it (real
// report: Bench's stale maxLight:2 here blocked a 3rd light Bench session
// that the newer table's 1H+1M+2L mix explicitly allows, while every
// maxHeavy above 1 here allowed a 2nd+ heavy session per week that the
// newer table's "1 heavy exposure/week at every level" design no longer
// intends). Only maxHeavy/maxLight are reconciled here - noConsecutive/
// noConsecutiveHeavy are a separate, coarser mechanism than the newer
// table's consecutiveAllowancePerWeek and are deliberately left alone.
export const SMART_FREQUENCY_POLICY_BY_LEVEL = Object.freeze({
  beginner: Object.freeze({
    Squat: Object.freeze({
      maxTotal: 2,
      targetTotal: 2,
      maxHeavy: 1,
      maxLight: 1,
      noConsecutive: true,
      noConsecutiveHeavy: false,
    }),
    Bench: Object.freeze({
      maxTotal: 3,
      targetTotal: 3,
      maxHeavy: 1,
      maxLight: 2,
      noConsecutive: false,
      noConsecutiveHeavy: true,
    }),
    Deadlift: Object.freeze({
      maxTotal: 1,
      targetTotal: 1,
      maxHeavy: 1,
      maxLight: 0,
      noConsecutive: true,
      noConsecutiveHeavy: false,
    }),
  }),
  intermediate: Object.freeze({
    Squat: Object.freeze({
      maxTotal: 3,
      targetTotal: 3,
      maxHeavy: 1,
      maxLight: 2,
      noConsecutive: true,
      noConsecutiveHeavy: false,
    }),
    Bench: Object.freeze({
      maxTotal: 4,
      targetTotal: 4,
      maxHeavy: 1,
      maxLight: 3,
      noConsecutive: false,
      noConsecutiveHeavy: true,
    }),
    Deadlift: Object.freeze({
      maxTotal: 2,
      targetTotal: 2,
      maxHeavy: 1,
      maxLight: 1,
      noConsecutive: true,
      noConsecutiveHeavy: false,
    }),
  }),
  advanced: Object.freeze({
    Squat: Object.freeze({
      maxTotal: 4,
      targetTotal: 4,
      maxHeavy: 1,
      maxLight: 3,
      noConsecutive: true,
      noConsecutiveHeavy: false,
    }),
    Bench: Object.freeze({
      maxTotal: 5,
      targetTotal: 5,
      maxHeavy: 1,
      maxLight: 4,
      noConsecutive: false,
      noConsecutiveHeavy: true,
    }),
    Deadlift: Object.freeze({
      maxTotal: 3,
      targetTotal: 3,
      maxHeavy: 1,
      maxLight: 2,
      noConsecutive: true,
      noConsecutiveHeavy: false,
    }),
  }),
  elite: Object.freeze({
    Squat: Object.freeze({
      maxTotal: 5,
      targetTotal: 5,
      maxHeavy: 1,
      maxLight: 4,
      noConsecutive: true,
      noConsecutiveHeavy: false,
    }),
    Bench: Object.freeze({
      maxTotal: 6,
      targetTotal: 6,
      maxHeavy: 1,
      maxLight: 5,
      noConsecutive: false,
      noConsecutiveHeavy: true,
    }),
    Deadlift: Object.freeze({
      maxTotal: 4,
      targetTotal: 4,
      maxHeavy: 1,
      maxLight: 3,
      noConsecutive: true,
      noConsecutiveHeavy: false,
    }),
  }),
});

const VALID_ATHLETE_LEVELS = new Set(['beginner', 'intermediate', 'advanced', 'elite']);

export function normalizeAthleteLevel(athleteLevel) {
  return VALID_ATHLETE_LEVELS.has(athleteLevel) ? athleteLevel : 'intermediate';
}

export function getSmartFrequencyPolicy(athleteLevel = 'intermediate') {
  return (
    SMART_FREQUENCY_POLICY_BY_LEVEL[athleteLevel] ||
    SMART_FREQUENCY_POLICY_BY_LEVEL.intermediate
  );
}

// Back-compat alias for any direct consumers of the old flat shape.
export const SMART_FREQUENCY_POLICY = Object.freeze({
  windowSize: SMART_FREQUENCY_WINDOW_SIZE,
  maxLiftsPerWorkout: SMART_FREQUENCY_MAX_LIFTS_PER_WORKOUT,
  ...SMART_FREQUENCY_POLICY_BY_LEVEL.intermediate,
});

export const SMART_FREQUENCY_RECOVERY_REASON = 'frequency-recovery';

export function roundBarbellWeight(weight, mode = 'nearest', incrementKg = 2.5) {
  const numericWeight = Number(weight) || 0;
  const numericIncrement = Number(incrementKg) || 2.5;
  const scaledWeight = numericWeight / numericIncrement;

  if (mode === 'up') {
    return Math.ceil(scaledWeight) * numericIncrement;
  }

  return Math.round(scaledWeight) * numericIncrement;
}

function compareWorkoutCoordinates(a, b) {
  const cycleDifference = (Number(a.cycle) || 1) - (Number(b.cycle) || 1);
  if (cycleDifference !== 0) return cycleDifference;
  return (Number(a.workoutNumber) || 0) - (Number(b.workoutNumber) || 0);
}

function isBeforeWorkout(slot, currentCycle, workoutNumber) {
  return compareWorkoutCoordinates(
    slot,
    { cycle: currentCycle, workoutNumber },
  ) < 0;
}

function getLiftBlocks(workout = {}) {
  if (Array.isArray(workout.lifts) && workout.lifts.length > 0) {
    return workout.lifts.filter((liftBlock) => LIFTS.includes(liftBlock?.lift));
  }

  if (LIFTS.includes(workout.lift)) {
    return [{
      lift: workout.lift,
      sets: Array.isArray(workout.sets) ? workout.sets : [],
      prepItems: Array.isArray(workout.prepItems) ? workout.prepItems : [],
      warmups: Array.isArray(workout.warmups) ? workout.warmups : [],
    }];
  }

  return [];
}

function explicitIntensityRole(liftBlock = {}) {
  const explicitRole = String(liftBlock.intensityRole || '').toLowerCase();
  if (explicitRole.includes('heavy')) return 'heavy';
  if (explicitRole.includes('medium')) return 'light';
  if (explicitRole.includes('light')) return 'light';

  const role = [
    liftBlock.trainingRole,
    liftBlock.smartRole,
    liftBlock.loadType,
    liftBlock.role,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (role.includes('heavy') || role.includes('primary')) return 'heavy';
  if (role.includes('light') || role.includes('secondary') || role.includes('tertiary')) return 'light';
  return null;
}

export function isHeavySmartLiftBlock(liftBlock = {}) {
  const explicitRole = explicitIntensityRole(liftBlock);
  if (explicitRole) return explicitRole === 'heavy';

  const sets = Array.isArray(liftBlock.sets) ? liftBlock.sets : [];

  return sets.some((set) => {
    const labelKey = String(set?.labelKey || '').toLowerCase();
    const percentage = Number(set?.pct);
    const reps = Number(set?.reps);

    if (
      labelKey.includes('top')
      || labelKey.includes('opener')
      || labelKey.includes('attempt')
    ) {
      return true;
    }

    return (
      Number.isFinite(percentage)
      && percentage >= 0.75
      && Number.isFinite(reps)
      && reps <= 3
    );
  });
}

function buildWorkoutSlots(history = []) {
  const slotsByKey = new Map();

  (Array.isArray(history) ? history : []).forEach((entry) => {
    const workoutNumber = Number(entry?.workoutNumber);
    if (!Number.isFinite(workoutNumber) || workoutNumber <= 0) return;
    if (entry?.seedMax || entry?.manualMax) return;

    const cycle = Math.max(1, Number(entry?.cycle) || 1);
    const key = `${cycle}:${workoutNumber}`;
    const workoutSnapshot = entry?.workoutSnapshot || {};

    if (!slotsByKey.has(key)) {
      slotsByKey.set(key, {
        cycle,
        workoutNumber,
        rest: false,
        lifts: {},
      });
    }

    const slot = slotsByKey.get(key);
    slot.rest = slot.rest || Boolean(
      entry?.restDay
      || workoutSnapshot?.type === 'rest'
      || workoutSnapshot?.smartDayType === 'recovery'
    );

    let liftBlocks = getLiftBlocks(workoutSnapshot);
    if (liftBlocks.length === 0 && LIFTS.includes(entry?.lift)) {
      liftBlocks = [{
        lift: entry.lift,
        sets: Array.isArray(workoutSnapshot?.sets) ? workoutSnapshot.sets : [],
      }];
    }

    liftBlocks.forEach((liftBlock) => {
      const lift = liftBlock?.lift;
      if (!LIFTS.includes(lift)) return;

      const heavy = isHeavySmartLiftBlock(liftBlock);
      slot.lifts[lift] = {
        heavy: Boolean(slot.lifts[lift]?.heavy || heavy),
      };
    });
  });

  return [...slotsByKey.values()].sort(compareWorkoutCoordinates);
}

function createCounts() {
  return LIFTS.reduce((result, lift) => {
    result[lift] = { total: 0, heavy: 0, light: 0 };
    return result;
  }, {});
}

function copyCounts(counts) {
  return LIFTS.reduce((result, lift) => {
    result[lift] = { ...counts[lift] };
    return result;
  }, {});
}

function getLiftPolicyReasons(
  liftBlock,
  counts,
  lastSlot,
  policyMap = SMART_FREQUENCY_POLICY_BY_LEVEL.intermediate,
) {
  const lift = liftBlock?.lift;
  const policy = policyMap[lift];
  if (!policy) return ['unknown-lift'];

  const heavy = isHeavySmartLiftBlock(liftBlock);
  const reasons = [];

  if (counts[lift].total >= policy.maxTotal) {
    reasons.push('rolling-window-maximum');
  }

  if (policy.noConsecutive && lastSlot?.lifts?.[lift]) {
    reasons.push('consecutive-lift');
  }

  if (policy.noConsecutiveHeavy && heavy && lastSlot?.lifts?.[lift]?.heavy) {
    reasons.push('consecutive-heavy-lift');
  }

  if (heavy && counts[lift].heavy >= policy.maxHeavy) {
    reasons.push('heavy-maximum');
  }

  if (!heavy && counts[lift].light >= policy.maxLight) {
    reasons.push('light-maximum');
  }

  return reasons;
}

function addLiftToCounts(counts, liftBlock) {
  const lift = liftBlock.lift;
  const heavy = isHeavySmartLiftBlock(liftBlock);
  counts[lift].total += 1;
  counts[lift][heavy ? 'heavy' : 'light'] += 1;
}

export function getSmartFrequencyPolicyDecision({
  history = [],
  currentCycle = 1,
  workoutNumber = 1,
  candidateWorkout = {},
  athleteLevel = 'intermediate',
} = {}) {
  const policyMap = getSmartFrequencyPolicy(athleteLevel);
  const previousSlots = buildWorkoutSlots(history)
    .filter((slot) => isBeforeWorkout(slot, currentCycle, workoutNumber))
    .slice(-(SMART_FREQUENCY_WINDOW_SIZE - 1));
  const lastSlot = previousSlots[previousSlots.length - 1] || null;
  const countsBefore = createCounts();

  previousSlots.forEach((slot) => {
    LIFTS.forEach((lift) => {
      const exposure = slot.lifts[lift];
      if (!exposure) return;

      countsBefore[lift].total += 1;
      countsBefore[lift][exposure.heavy ? 'heavy' : 'light'] += 1;
    });
  });

  const countsAfter = copyCounts(countsBefore);
  const validLiftBlocks = [];
  const blockers = [];

  getLiftBlocks(candidateWorkout).forEach((liftBlock) => {
    const heavy = isHeavySmartLiftBlock(liftBlock);
    const reasons = getLiftPolicyReasons(liftBlock, countsAfter, lastSlot, policyMap);
    const maximumConsecutiveDays = getSmartMaxConsecutiveTrainingDays(
      athleteLevel,
      liftBlock.lift
    );
    let consecutiveDays = 0;
    let expectedWorkoutNumber = Number(workoutNumber) - 1;

    for (let index = previousSlots.length - 1; index >= 0; index -= 1) {
      const slot = previousSlots[index];
      if (Number(slot.workoutNumber) !== expectedWorkoutNumber) break;
      if (!slot.lifts?.[liftBlock.lift]) break;
      consecutiveDays += 1;
      expectedWorkoutNumber -= 1;
    }

    if (consecutiveDays >= maximumConsecutiveDays) {
      reasons.push('consecutive-streak-maximum');
    }

    if (reasons.length > 0) {
      blockers.push({ lift: liftBlock.lift, heavy, reasons });
      return;
    }

    validLiftBlocks.push(liftBlock);
    addLiftToCounts(countsAfter, liftBlock);
  });

  return {
    valid: blockers.length === 0,
    validLiftBlocks,
    blockers,
    countsBefore,
    countsAfter,
    previousSlots,
    lastSlot,
    policyMap,
  };
}

function cloneLiftBlock(liftBlock) {
  return {
    ...liftBlock,
    prepItems: Array.isArray(liftBlock?.prepItems)
      ? liftBlock.prepItems.map(item => ({ ...item }))
      : [],
    warmups: Array.isArray(liftBlock?.warmups)
      ? liftBlock.warmups.map(item => ({ ...item }))
      : [],
    sets: Array.isArray(liftBlock?.sets)
      ? liftBlock.sets.map(item => ({ ...item }))
      : [],
  };
}

function preferredHeavyState(
  lift,
  counts,
  policyMap = SMART_FREQUENCY_POLICY_BY_LEVEL.intermediate,
) {
  const policy = policyMap[lift];
  const heavyGap = Math.max(0, policy.maxHeavy - counts[lift].heavy);
  const lightGap = Math.max(0, policy.maxLight - counts[lift].light);

  if (heavyGap === 0 && lightGap === 0) return null;
  if (heavyGap > lightGap) return true;
  if (lightGap > heavyGap) return false;
  return heavyGap > 0;
}

function getSupplementalLiftCandidates({
  availableWorkouts = [],
  currentIndex = 0,
  lift,
  preferredHeavy,
}) {
  const candidates = [];

  (Array.isArray(availableWorkouts) ? availableWorkouts : []).forEach(
    (workout, workoutIndex) => {
      if (workoutIndex === currentIndex || workout?.type !== 'training') return;

      getLiftBlocks(workout).forEach((liftBlock) => {
        if (liftBlock.lift !== lift) return;

        const heavy = isHeavySmartLiftBlock(liftBlock);
        const futurePenalty = workoutIndex >= currentIndex ? 0 : 1;
        const intensityPenalty = preferredHeavy === null || heavy === preferredHeavy ? 0 : 1;

        candidates.push({
          block: cloneLiftBlock(liftBlock),
          heavy,
          intensityPenalty,
          futurePenalty,
          distance: Math.abs(workoutIndex - currentIndex),
        });
      });
    },
  );

  return candidates.sort((a, b) => (
    a.intensityPenalty - b.intensityPenalty
    || a.futurePenalty - b.futurePenalty
    || a.distance - b.distance
  ));
}

function selectSupplementalLiftBlocks({
  selectedLiftBlocks,
  countsAfter,
  lastSlot,
  availableWorkouts,
  currentIndex,
  trainingMaxes = {},
  policyMap = SMART_FREQUENCY_POLICY_BY_LEVEL.intermediate,
}) {
  const selectedLifts = new Set(selectedLiftBlocks.map(({ lift }) => lift));
  const supplementalLiftBlocks = [];

  while (
    selectedLiftBlocks.length + supplementalLiftBlocks.length
    < SMART_FREQUENCY_MAX_LIFTS_PER_WORKOUT
  ) {
    const rankedLifts = LIFTS
      .filter(lift => !selectedLifts.has(lift))
      .map((lift) => {
        const policy = policyMap[lift];
        return {
          lift,
          totalGap: Math.max(0, policy.targetTotal - countsAfter[lift].total),
          preferredHeavy: preferredHeavyState(lift, countsAfter, policyMap),
        };
      })
      .filter(({ totalGap }) => totalGap > 0)
      .sort((a, b) => (
        b.totalGap - a.totalGap
        || LIFTS.indexOf(a.lift) - LIFTS.indexOf(b.lift)
      ));

    let selected = null;

    for (const rankedLift of rankedLifts) {
      const candidates = getSupplementalLiftCandidates({
        availableWorkouts,
        currentIndex,
        lift: rankedLift.lift,
        preferredHeavy: rankedLift.preferredHeavy,
      });

      const validCandidate = candidates.find(({ block }) => (
        getLiftPolicyReasons(block, countsAfter, lastSlot, policyMap).length === 0
      ));

      if (validCandidate) {
        selected = normalizeSupplementalHeavyLiftBlock(
          validCandidate.block,
          trainingMaxes[rankedLift.lift],
        );
        break;
      }
    }

    if (!selected) break;

    supplementalLiftBlocks.push(selected);
    selectedLifts.add(selected.lift);
    addLiftToCounts(countsAfter, selected);
  }

  return supplementalLiftBlocks;
}

function cloneGeneratedSet(set, suffix) {
  const cloned = { ...set };

  ['id', 'setId', 'key'].forEach((field) => {
    if (cloned[field] !== undefined && cloned[field] !== null) {
      cloned[field] = `${cloned[field]}-frequency-${suffix}`;
    }
  });

  if ('completed' in cloned) cloned.completed = false;
  if ('done' in cloned) cloned.done = false;
  if ('actualReps' in cloned) cloned.actualReps = '';
  if ('rpe' in cloned) cloned.rpe = '';

  return cloned;
}

function resetGeneratedItem(item = {}, suffix = 'reset') {
  const reset = cloneGeneratedSet(item, suffix);

  if ('failed' in reset) reset.failed = false;
  if ('skipped' in reset) reset.skipped = false;
  if ('effort' in reset) reset.effort = null;
  if ('failedAttempts' in reset) reset.failedAttempts = 0;
  if ('failedWeight' in reset) reset.failedWeight = null;
  if ('adjustedWeight' in reset) reset.adjustedWeight = null;
  if ('adjustedFromFailedSet' in reset) reset.adjustedFromFailedSet = false;
  if ('adjustedFromOriginal' in reset) reset.adjustedFromOriginal = false;

  return reset;
}

function getTrainingMaxFromSet(set = {}) {
  const weight = Number(set.originalWeight ?? set.weight) || 0;
  const pct = Number(set.originalPct ?? set.pct) || 0;

  return weight > 0 && pct > 0 ? weight / pct : 0;
}

function createGeneratedSet(template = {}, {
  suffix,
  labelKey,
  groupKey,
  reps,
  pct,
  weight,
}) {
  const generated = resetGeneratedItem(template, suffix);

  return {
    ...generated,
    labelKey: labelKey || generated.labelKey || 'backoff',
    groupLabelKey:
      generated.groupLabelKey
      || labelKey
      || generated.labelKey
      || 'backoff',
    groupKey:
      groupKey
      || generated.groupKey
      || labelKey
      || generated.labelKey
      || 'backoff',
    reps,
    pct,
    originalPct: pct,
    weight,
    originalWeight: weight,
  };
}

function findSupplementalTopSet(sets = []) {
  // Mirrors isHeavySmartLiftBlock's own definition of "heavy" so a set is
  // recognized as the block's top set regardless of whether it's a 1-rep
  // single, a 2-rep double, or a 3-rep triple - static templates use all
  // three depending on the lift/day, not just literal singles.
  const candidates = sets.filter(set => {
    const reps = Number(set.reps);
    const pct = Number(set.pct);
    const labelKey = String(set.labelKey || '').toLowerCase();

    if (!(reps >= 1 && reps <= 3)) return false;

    return (
      labelKey.includes('top')
      || labelKey.includes('opener')
      || labelKey.includes('attempt')
      || (Number.isFinite(pct) && pct >= 0.75)
    );
  });

  return candidates.sort((a, b) => (Number(b.pct) || 0) - (Number(a.pct) || 0))[0] || null;
}

function normalizeSupplementalHeavyLiftBlock(liftBlock, realTrainingMax = 0) {
  if (!isHeavySmartLiftBlock(liftBlock)) {
    return liftBlock;
  }

  const originalSets = Array.isArray(liftBlock.sets)
    ? liftBlock.sets.map(set => ({ ...set }))
    : [];
  const topSingle = findSupplementalTopSet(originalSets);

  if (!topSingle) return liftBlock;

  // When the athlete's real training max is known, use it directly instead
  // of back-deriving a training max from the static template's own top
  // single. Either way, the displayed percentage lands on a 2.5% step
  // (matching every other Smart Training prescription) while the template's
  // own exact percentage is kept as `precisePct` so a future top-set
  // exposure that chains off this one anchors at full precision.
  const precisePct = Number(topSingle.pct) || 0;
  const usesRealTrainingMax = Number(realTrainingMax) > 0;
  const trainingMax = usesRealTrainingMax
    ? Number(realTrainingMax)
    : getTrainingMaxFromSet(topSingle);
  const topPct = roundPercent(precisePct);
  const topWeight = roundBarbellWeight(trainingMax * topPct);

  if (!trainingMax || !topWeight || !topPct) return liftBlock;

  const liftSlug = String(liftBlock.lift || 'lift').toLowerCase();
  const warmupTemplate = Array.isArray(liftBlock.warmups)
    ? liftBlock.warmups
    : [];
  const firstWarmup = resetGeneratedItem(
    warmupTemplate[0] || {},
    `${liftSlug}-warmup-1`,
  );
  const secondWarmup = resetGeneratedItem(
    warmupTemplate[1] || warmupTemplate[0] || {},
    `${liftSlug}-warmup-2`,
  );
  const secondWarmupWeight = Math.max(
    20,
    Math.min(topWeight - 5, roundBarbellWeight(trainingMax * 0.70)),
  );
  // Mirrors the primary-role backoff formula in smartPrescriptionEngine.js
  // (buildSmartLiftPrescription: topPct - 10%, capped at the shared primary
  // backoff ceiling)
  // instead of a flat 75% - the old flat value meant a light 70% top single
  // still got a 75% backoff (heavier than the top itself, post-rounding
  // collision), while a genuinely heavy 90% top single got the exact same
  // 75% backoff as everyone else, hiding real intensity differences between
  // supplemented sessions. Lower top sets still scale below the ceiling.
  const volumePct = roundPercent(clamp(
    topPct - 0.10,
    0.60,
    SMART_PRIMARY_BACKOFF_MAX_PCT,
  ));
  const volumeWeight = roundBarbellWeight(trainingMax * volumePct);
  const volumeTemplate = originalSets.find(set => set !== topSingle)
    || topSingle;
  const normalizedTopSingle = {
    ...resetGeneratedItem(topSingle, `${liftSlug}-top-single`),
    weight: topWeight,
    originalWeight: topWeight,
    pct: topPct,
    originalPct: topPct,
    precisePct,
  };

  const warmups = [
    {
      ...firstWarmup,
      reps: 5,
      weight: 20,
      originalWeight: 20,
      pct: 20 / trainingMax,
      originalPct: 20 / trainingMax,
    },
    {
      ...secondWarmup,
      reps: 3,
      weight: secondWarmupWeight,
      originalWeight: secondWarmupWeight,
      pct: secondWarmupWeight / trainingMax,
      originalPct: secondWarmupWeight / trainingMax,
    },
  ];
  const sets = [
    normalizedTopSingle,
    ...Array.from({ length: 3 }, (_, index) => createGeneratedSet(
      volumeTemplate,
      {
        suffix: `${liftSlug}-volume-${index + 1}`,
        labelKey: 'backoff',
        groupKey: `${liftSlug}-frequency-backoff`,
        reps: 5,
        pct: volumePct,
        weight: volumeWeight,
      },
    )),
  ];
  const smartPrescription = {
    ...(liftBlock.smartPrescription || {}),
    role: 'primary',
    progressionAnchorPct: topPct,
    topSetAnchorPct: topPct,
    volumeAnchorPct: volumePct,
    plannedVolumePct: volumePct,
    completeGrid: true,
    gridItemCount: warmups.length + sets.length,
    supplementedByFrequencyPolicy: true,
  };

  return {
    ...liftBlock,
    role: 'primary',
    trainingRole: 'primary',
    frequencyRole: 'supplemental-heavy',
    warmups,
    sets,
    smartPrescription,
  };
}

function normalizeLightDeadliftWarmups(liftBlock) {
  if (
    liftBlock?.lift !== 'Deadlift'
    || isHeavySmartLiftBlock(liftBlock)
  ) {
    return liftBlock;
  }

  const sets = Array.isArray(liftBlock.sets) ? liftBlock.sets : [];
  const isFourRepVolumeDay = sets.some(set => (
    isVolumeWorkSet(set) && Number(set.reps) === 4
  ));
  const warmups = Array.isArray(liftBlock.warmups)
    ? liftBlock.warmups.map(item => ({ ...item }))
    : [];

  if (!isFourRepVolumeDay || warmups.length < 3) {
    return liftBlock;
  }

  const lastIndex = warmups.length - 1;
  warmups[lastIndex] = {
    ...resetGeneratedItem(warmups[lastIndex], 'deadlift-final-warmup'),
    reps: 5,
  };

  return {
    ...liftBlock,
    warmups,
    smartPrescription: {
      ...(liftBlock.smartPrescription || {}),
      gridItemCount: warmups.length + sets.length,
    },
  };
}

function normalizeSelectedLiftRoles(liftBlocks = []) {
  return liftBlocks.map((liftBlock, index) => {
    const role = index === 0 ? 'primary' : 'secondary';
    const normalized = normalizeLightDeadliftWarmups(liftBlock);

    return {
      ...normalized,
      role,
      trainingRole: role,
      smartPrescription: {
        ...(normalized.smartPrescription || {}),
        role,
        completeGrid: true,
        gridItemCount:
          (Array.isArray(normalized.warmups) ? normalized.warmups.length : 0)
          + (Array.isArray(normalized.sets) ? normalized.sets.length : 0),
      },
    };
  });
}

function isVolumeWorkSet(set = {}) {
  const label = String(set.labelKey || set.type || '').toLowerCase();

  if (
    label.includes('top')
    || label.includes('opener')
    || label.includes('attempt')
    || label.includes('warmup')
  ) {
    return false;
  }

  return Number(set.reps) >= 3;
}

function replaceSingleLiftExplanation(value) {
  if (typeof value === 'string') {
    return value
      .replace(
        'Lower volume for the secondary lift.',
        'Full volume for single-lift training.',
      )
      .replace(
        'Lower volume for the secondary lift',
        'Full volume for single-lift training',
      );
  }

  if (Array.isArray(value)) {
    return value.map(replaceSingleLiftExplanation);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        replaceSingleLiftExplanation(nestedValue),
      ]),
    );
  }

  return value;
}

function promoteSingleLightLiftVolume(liftBlock, targetVolumeSets = 6) {
  if (isHeavySmartLiftBlock(liftBlock)) {
    return { liftBlock, changed: false };
  }

  const sets = Array.isArray(liftBlock.sets)
    ? liftBlock.sets.map(set => ({ ...set }))
    : [];
  const volumeSets = sets.filter(isVolumeWorkSet);

  if (volumeSets.length === 0 || volumeSets.length >= targetVolumeSets) {
    return { liftBlock, changed: false };
  }

  const template = volumeSets[volumeSets.length - 1];

  while (sets.filter(isVolumeWorkSet).length < targetVolumeSets) {
    sets.push(cloneGeneratedSet(
      template,
      sets.filter(isVolumeWorkSet).length + 1,
    ));
  }

  const promoted = replaceSingleLiftExplanation({
    ...liftBlock,
    sets,
    singleLiftFullVolume: true,
    frequencyRole: 'single-light',
  });

  ['role', 'trainingRole', 'smartRole', 'intensityRole'].forEach((field) => {
    if (String(promoted[field] || '').toLowerCase() === 'secondary') {
      promoted[field] = 'light';
    }
  });

  return { liftBlock: promoted, changed: true };
}

function orderSelectedLiftBlocks(entries) {
  return [...entries]
    .sort((a, b) => (
      Number(isHeavySmartLiftBlock(b.block))
      - Number(isHeavySmartLiftBlock(a.block))
      || a.order - b.order
    ))
    .map(({ block }) => block);
}

function rewriteSelectionSummary(summary, liftBlocks) {
  const primaryLift = liftBlocks[0]?.lift || null;
  const secondaryLift = liftBlocks[1]?.lift || null;
  const updated = {
    ...(summary || {}),
    primaryLift,
    secondaryLift,
    selectedPrimaryLift: primaryLift,
    selectedSecondaryLift: secondaryLift,
    frequencyPolicySelection: {
      primary: primaryLift,
      secondary: secondaryLift,
    },
  };

  if (typeof updated.primary === 'string' || updated.primary === null) {
    updated.primary = primaryLift;
  }
  if (typeof updated.secondary === 'string' || updated.secondary === null) {
    updated.secondary = secondaryLift;
  }
  if (updated.selection && typeof updated.selection === 'object') {
    updated.selection = {
      ...updated.selection,
      primary: primaryLift,
      secondary: secondaryLift,
      primaryLift,
      secondaryLift,
    };
  }

  return updated;
}

function createRecoveryWorkout(candidateWorkout) {
  return {
    ...candidateWorkout,
    type: 'rest',
    lift: null,
    labelKey: 'restAndRecovery',
    workoutEffort: 'easy',
    lifts: [],
    prepItems: [],
    warmups: [],
    sets: [],
    accessories: [],
    cooldownItems: [],
  };
}

function createConstrainedWorkout(candidateWorkout, liftBlocks) {
  const primaryLiftBlock = liftBlocks[0];
  const primaryChanged = primaryLiftBlock.lift !== candidateWorkout.lift;

  return {
    ...candidateWorkout,
    lift: primaryLiftBlock.lift,
    lifts: liftBlocks,
    prepItems: primaryLiftBlock.prepItems || [],
    warmups: primaryLiftBlock.warmups || [],
    sets: primaryLiftBlock.sets || [],
    accessories: primaryChanged ? [] : (candidateWorkout.accessories || []),
    smartDecisionSummary: rewriteSelectionSummary(
      candidateWorkout.smartDecisionSummary,
      liftBlocks,
    ),
    smartTrainingSelectionSummary: rewriteSelectionSummary(
      candidateWorkout.smartTrainingSelectionSummary,
      liftBlocks,
    ),
  };
}

export function summarizeSmartFrequencyDecision(decision = {}) {
  const selectedLiftBlocks = decision.selectedLiftBlocks
    || decision.validLiftBlocks
    || [];

  return {
    windowSize: SMART_FREQUENCY_WINDOW_SIZE,
    validLifts: selectedLiftBlocks.map((liftBlock) => liftBlock.lift),
    blockers: decision.blockers || [],
    countsBefore: decision.countsBefore || createCounts(),
    countsAfter: decision.countsAfter || createCounts(),
    supplementedLifts: (decision.supplementalLiftBlocks || [])
      .map(liftBlock => liftBlock.lift),
    singleLiftVolumeExpanded: Boolean(decision.singleLiftVolumeExpanded),
    recentWorkouts: (decision.previousSlots || []).map((slot) => ({
      cycle: slot.cycle,
      workoutNumber: slot.workoutNumber,
      rest: slot.rest,
      lifts: slot.lifts,
    })),
  };
}

export function constrainSmartWorkoutByFrequency({
  history = [],
  currentCycle = 1,
  workoutNumber = 1,
  candidateWorkout = {},
  availableWorkouts = [],
  currentIndex = 0,
  trainingMaxes = {},
  athleteLevel = 'intermediate',
} = {}) {
  const policyMap = getSmartFrequencyPolicy(athleteLevel);
  const decision = getSmartFrequencyPolicyDecision({
    history,
    currentCycle,
    workoutNumber,
    candidateWorkout,
    athleteLevel,
  });
  const countsAfter = copyCounts(decision.countsAfter);
  const candidateEntries = decision.validLiftBlocks.map((block, order) => ({
    block: cloneLiftBlock(block),
    order,
    source: 'candidate',
  }));
  const supplementalLiftBlocks = selectSupplementalLiftBlocks({
    selectedLiftBlocks: candidateEntries.map(({ block }) => block),
    countsAfter,
    lastSlot: decision.lastSlot,
    availableWorkouts,
    currentIndex,
    trainingMaxes,
    policyMap,
  });
  const supplementalEntries = supplementalLiftBlocks.map((block, index) => ({
    block,
    order: candidateEntries.length + index,
    source: 'supplemental',
  }));
  let selectedLiftBlocks = orderSelectedLiftBlocks([
    ...candidateEntries,
    ...supplementalEntries,
  ]);
  let singleLiftVolumeExpanded = false;

  if (selectedLiftBlocks.length === 1) {
    const promoted = promoteSingleLightLiftVolume(selectedLiftBlocks[0]);
    selectedLiftBlocks = normalizeSelectedLiftRoles([
      promoted.liftBlock,
    ]);
    singleLiftVolumeExpanded = promoted.changed;
  } else {
    selectedLiftBlocks = normalizeSelectedLiftRoles(
      selectedLiftBlocks,
    );
  }

  const enrichedDecision = {
    ...decision,
    countsAfter,
    selectedLiftBlocks,
    supplementalLiftBlocks,
    singleLiftVolumeExpanded,
  };
  const changed = (
    decision.blockers.length > 0
    || supplementalLiftBlocks.length > 0
    || singleLiftVolumeExpanded
    || selectedLiftBlocks.map(({ lift }) => lift).join(',')
      !== getLiftBlocks(candidateWorkout).map(({ lift }) => lift).join(',')
  );

  if (!changed) {
    return {
      changed: false,
      workout: candidateWorkout,
      decision: enrichedDecision,
      summary: summarizeSmartFrequencyDecision(enrichedDecision),
    };
  }

  const workout = selectedLiftBlocks.length > 0
    ? createConstrainedWorkout(candidateWorkout, selectedLiftBlocks)
    : createRecoveryWorkout(candidateWorkout);

  return {
    changed: true,
    workout,
    decision: enrichedDecision,
    summary: summarizeSmartFrequencyDecision(enrichedDecision),
  };
}

// ---------------------------------------------------------------------------
// Weighted intensity-score frequency model (constants live in
// smartTrainingConstants.js to avoid a circular import with
// smartPrescriptionEngine.js, which this file already imports from). Phase
// 2 wires the score gap into lift selection (rankSmartLiftPriorities,
// getProjectedSmartLiftEligibility) via EXPOSURE_TARGETS_BY_LEVEL, now
// derived from SMART_FREQUENCY_SCORE_TARGETS_BY_LEVEL's `days` field - the
// maxTotal/maxHeavy/maxLight hard-cap system above is untouched until a
// later phase.
// ---------------------------------------------------------------------------

// Three-way intensity classification (heavy/medium/light), extending the
// existing role-based heavy/light split (explicitIntensityRole above) with
// a medium tier for the secondary slot - primary->heavy, secondary->medium,
// tertiary->light, matching how a 3-lift day is already structured
// (buildGeneratedSmartTrainingWorkout's tertiary gate). Kept fully separate
// from isHeavySmartLiftBlock/isHeavySmartTrainingLift (both stay binary and
// keep being used exactly as before) so nothing existing changes behavior.
export function getSmartIntensityRole(liftBlock = {}) {
  const explicitRole = String(liftBlock.intensityRole || '').toLowerCase();
  const intendedIntensity = explicitRole.includes('heavy')
    ? 'heavy'
    : explicitRole.includes('medium')
      ? 'medium'
      : explicitRole.includes('light')
        ? 'light'
        : null;
  const preserveIntendedFloor = measuredIntensity => (
    intendedIntensity &&
    SMART_INTENSITY_POINTS[intendedIntensity] >
      SMART_INTENSITY_POINTS[measuredIntensity]
      ? intendedIntensity
      : measuredIntensity
  );
  const role = [
    liftBlock.trainingRole,
    liftBlock.smartRole,
    liftBlock.loadType,
    liftBlock.role,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const sets = Array.isArray(liftBlock.sets) ? liftBlock.sets : [];
  const isRecordedWorkout = Boolean(
    liftBlock.completed ||
    sets.some(set => set?.done || set?.failed || set?.skipped)
  );

  // Completed snapshots keep the label under which the workout was
  // prescribed. Reinterpreting history whenever the dose model evolves is
  // technically consistent but confusing to the athlete.
  if (isRecordedWorkout) {
    if (explicitRole.includes('heavy')) return 'heavy';
    if (explicitRole.includes('medium')) return 'medium';
    if (explicitRole.includes('light')) return 'light';
  }
  let hasTopSet = false;
  let highestWorkPct = 0;
  const totalLoad = sets.reduce((total, set) => {
    if (set?.warmup || set?.skipped) return total;
    const percentage = Number(set?.pct ?? set?.originalPct);
    const reps = Number(set?.reps);
    if (!Number.isFinite(percentage) || percentage <= 0 || !Number.isFinite(reps) || reps <= 0) {
      return total;
    }
    const label = String(set?.labelKey || '').toLowerCase();
    if (label.includes('top') || label.includes('single') || label.includes('attempt') || label === 'opener') {
      hasTopSet = true;
    }
    highestWorkPct = Math.max(highestWorkPct, percentage);
    const percentValue = Math.min(percentage * 100, 99);
    return total + reps / Math.max(100 - percentValue, 1);
  }, 0);

  if (totalLoad > 0) {
    if (
      hasTopSet ||
      highestWorkPct >= 0.80 ||
      totalLoad >= SMART_INTENSITY_LOAD_THRESHOLDS.heavy
    ) return preserveIntendedFloor('heavy');
    if (
      highestWorkPct >= 0.75 ||
      totalLoad >= SMART_INTENSITY_LOAD_THRESHOLDS.medium
    ) return preserveIntendedFloor('medium');
    // Generated prescriptions deliberately attach an intended three-way
    // intensity role before their concrete sets are built. Keep that role
    // as a floor: the ordinary medium prescription is capped at 4 reps and
    // 65%, so 6x4 can sit just below the generic dose threshold even though
    // it is the lift's scheduled medium exposure. Measured dose can still
    // upgrade an accidentally overloaded light/medium block.
    return preserveIntendedFloor('light');
  }

  if (explicitRole.includes('heavy')) return 'heavy';
  if (explicitRole.includes('medium')) return 'medium';
  if (explicitRole.includes('light')) return 'light';

  if (role.includes('heavy') || role.includes('primary')) return 'heavy';
  if (role.includes('medium')) return 'medium';
  if (role.includes('light') || role.includes('tertiary')) return 'light';

  if (role.includes('secondary')) return 'medium';
  return 'light';
}

function buildIntensityWorkoutSlots(history = []) {
  const slotsByKey = new Map();

  (Array.isArray(history) ? history : []).forEach((entry) => {
    const workoutNumber = Number(entry?.workoutNumber);
    if (!Number.isFinite(workoutNumber) || workoutNumber <= 0) return;
    if (entry?.seedMax || entry?.manualMax) return;

    const cycle = Math.max(1, Number(entry?.cycle) || 1);
    const key = `${cycle}:${workoutNumber}`;
    const workoutSnapshot = entry?.workoutSnapshot || {};

    if (!slotsByKey.has(key)) {
      slotsByKey.set(key, { cycle, workoutNumber, lifts: {} });
    }

    const slot = slotsByKey.get(key);
    let liftBlocks = getLiftBlocks(workoutSnapshot);
    if (liftBlocks.length === 0 && LIFTS.includes(entry?.lift)) {
      liftBlocks = [{
        lift: entry.lift,
        sets: Array.isArray(workoutSnapshot?.sets) ? workoutSnapshot.sets : [],
      }];
    }

    liftBlocks.forEach((liftBlock) => {
      const lift = liftBlock?.lift;
      if (!LIFTS.includes(lift)) return;

      // Defensive: if a lift somehow appears twice in the same slot, keep
      // whichever exposure scores higher rather than the last one seen.
      const intensity = getSmartIntensityRole(liftBlock);
      const existing = slot.lifts[lift];

      if (!existing || SMART_INTENSITY_POINTS[intensity] > SMART_INTENSITY_POINTS[existing]) {
        slot.lifts[lift] = intensity;
      }
    });
  });

  return [...slotsByKey.values()].sort(compareWorkoutCoordinates);
}

// Per-lift weekly frequency-score state: how many intensity points a lift
// has accumulated in the rolling window before this workout, its target
// from the score table, and how much of the *default* heavy/medium/light mix
// remains. remainingScore (not remainingMix) is the real budget - remaining
// Mix is a starting suggestion for a future phase, not a requirement. Purely
// informational for now - not read by any live decision path yet.
export function computeSmartFrequencyScoreState({
  history = [],
  currentCycle = 1,
  workoutNumber = 1,
  athleteLevel = 'intermediate',
} = {}) {
  const targets = getSmartFrequencyScoreTargets(athleteLevel);
  const previousSlots = buildIntensityWorkoutSlots(history)
    .filter((slot) => isBeforeWorkout(slot, currentCycle, workoutNumber))
    .slice(-(SMART_FREQUENCY_WINDOW_SIZE - 1));

  return LIFTS.reduce((result, lift) => {
    const target = targets[lift] || {
      score: 0,
      defaultMix: { heavy: 0, medium: 0, light: 0 },
    };
    const exposures = { heavy: 0, medium: 0, light: 0 };

    previousSlots.forEach((slot) => {
      const intensity = slot.lifts[lift];
      if (intensity) exposures[intensity] += 1;
    });

    const scoreSoFar =
      exposures.heavy * SMART_INTENSITY_POINTS.heavy +
      exposures.medium * SMART_INTENSITY_POINTS.medium +
      exposures.light * SMART_INTENSITY_POINTS.light;

    result[lift] = {
      exposures,
      scoreSoFar,
      targetScore: target.score,
      remainingScore: Math.max(0, target.score - scoreSoFar),
      remainingMix: {
        heavy: Math.max(0, (target.defaultMix?.heavy || 0) - exposures.heavy),
        medium: Math.max(0, (target.defaultMix?.medium || 0) - exposures.medium),
        light: Math.max(0, (target.defaultMix?.light || 0) - exposures.light),
      },
    };

    return result;
  }, {});
}
