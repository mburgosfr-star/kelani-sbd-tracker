const LIFTS = Object.freeze(['Squat', 'Bench', 'Deadlift']);

export const SMART_FREQUENCY_POLICY = Object.freeze({
  windowSize: 7,
  maxLiftsPerWorkout: 2,
  Squat: Object.freeze({
    maxTotal: 3,
    targetTotal: 3,
    maxHeavy: 2,
    maxLight: 2,
    noConsecutive: true,
    noConsecutiveHeavy: false,
  }),
  Bench: Object.freeze({
    maxTotal: 4,
    targetTotal: 4,
    maxHeavy: 2,
    maxLight: 2,
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
});

export const SMART_FREQUENCY_RECOVERY_REASON = 'frequency-recovery';

export function roundBarbellWeight(weight, mode = 'nearest', incrementKg = 5) {
  const numericWeight = Number(weight) || 0;
  const numericIncrement = Number(incrementKg) || 5;
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
  const role = [
    liftBlock.intensityRole,
    liftBlock.trainingRole,
    liftBlock.smartRole,
    liftBlock.loadType,
    liftBlock.role,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (role.includes('heavy') || role.includes('primary')) return 'heavy';
  if (role.includes('light') || role.includes('secondary')) return 'light';
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

function getLiftPolicyReasons(liftBlock, counts, lastSlot) {
  const lift = liftBlock?.lift;
  const policy = SMART_FREQUENCY_POLICY[lift];
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
} = {}) {
  const previousSlots = buildWorkoutSlots(history)
    .filter((slot) => isBeforeWorkout(slot, currentCycle, workoutNumber))
    .slice(-(SMART_FREQUENCY_POLICY.windowSize - 1));
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
    const reasons = getLiftPolicyReasons(liftBlock, countsAfter, lastSlot);

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

function preferredHeavyState(lift, counts) {
  const policy = SMART_FREQUENCY_POLICY[lift];
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
}) {
  const selectedLifts = new Set(selectedLiftBlocks.map(({ lift }) => lift));
  const supplementalLiftBlocks = [];

  while (
    selectedLiftBlocks.length + supplementalLiftBlocks.length
    < SMART_FREQUENCY_POLICY.maxLiftsPerWorkout
  ) {
    const rankedLifts = LIFTS
      .filter(lift => !selectedLifts.has(lift))
      .map((lift) => {
        const policy = SMART_FREQUENCY_POLICY[lift];
        return {
          lift,
          totalGap: Math.max(0, policy.targetTotal - countsAfter[lift].total),
          preferredHeavy: preferredHeavyState(lift, countsAfter),
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
        getLiftPolicyReasons(block, countsAfter, lastSlot).length === 0
      ));

      if (validCandidate) {
        selected = normalizeSupplementalHeavyBenchBlock(
          validCandidate.block,
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

function normalizeSupplementalHeavyBenchBlock(liftBlock) {
  if (liftBlock?.lift !== 'Bench' || !isHeavySmartLiftBlock(liftBlock)) {
    return liftBlock;
  }

  const originalSets = Array.isArray(liftBlock.sets)
    ? liftBlock.sets.map(set => ({ ...set }))
    : [];
  const topSingle = originalSets.find(set => (
    Number(set.reps) === 1
    && (
      Number(set.pct) >= 0.85
      || String(set.labelKey || '').toLowerCase().includes('top')
      || String(set.labelKey || '').toLowerCase().includes('single')
    )
  ));

  if (!topSingle) return liftBlock;

  const trainingMax = getTrainingMaxFromSet(topSingle);
  const topWeight = Number(topSingle.weight) || 0;
  const topPct = Number(topSingle.pct) || 0;

  if (!trainingMax || !topWeight || !topPct) return liftBlock;

  const warmupTemplate = Array.isArray(liftBlock.warmups)
    ? liftBlock.warmups
    : [];
  const firstWarmup = resetGeneratedItem(
    warmupTemplate[0] || {},
    'bench-warmup-1',
  );
  const secondWarmup = resetGeneratedItem(
    warmupTemplate[1] || warmupTemplate[0] || {},
    'bench-warmup-2',
  );
  const secondWarmupWeight = Math.max(
    20,
    Math.min(topWeight - 5, roundBarbellWeight(trainingMax * 0.70)),
  );
  const volumePct = 0.75;
  const volumeWeight = roundBarbellWeight(trainingMax * volumePct);
  const volumeTemplate = originalSets.find(set => set !== topSingle)
    || topSingle;

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
    resetGeneratedItem(topSingle, 'bench-top-single'),
    ...Array.from({ length: 3 }, (_, index) => createGeneratedSet(
      volumeTemplate,
      {
        suffix: `bench-volume-${index + 1}`,
        labelKey: 'backoff',
        groupKey: 'bench-frequency-backoff',
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
    windowSize: SMART_FREQUENCY_POLICY.windowSize,
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
} = {}) {
  const decision = getSmartFrequencyPolicyDecision({
    history,
    currentCycle,
    workoutNumber,
    candidateWorkout,
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
