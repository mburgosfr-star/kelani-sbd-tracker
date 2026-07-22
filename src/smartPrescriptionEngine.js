export const SMART_LIFTS = Object.freeze([
  'Squat',
  'Bench',
  'Deadlift',
]);

const TOP_LABEL_KEYS = new Set([
  'topsingle',
  'topdouble',
  'toptriple',
  'topset',
  'opener',
]);

const VOLUME_LABEL_KEYS = new Set([
  'backoff',
  'worksets',
]);

export const PROFILE_EXPOSURE_TARGETS = Object.freeze({
  kelaniSbdUltra: {
    Squat: 3,
    Bench: 4,
    Deadlift: 2,
  },
  kelaniSbd: {
    Squat: 2,
    Bench: 3,
    Deadlift: 2,
  },
  kelaniSbdLower: {
    Squat: 2,
    Bench: 3,
    Deadlift: 2,
  },
  kelaniSbdLowerPlus: {
    Squat: 2,
    Bench: 3,
    Deadlift: 2,
  },
});

const TOP_PCT_LIMITS = Object.freeze({
  1: {
    min: 0.75,
    max: 0.90,
  },
  2: {
    min: 0.70,
    max: 0.875,
  },
  3: {
    min: 0.65,
    max: 0.825,
  },
});

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function roundPct(value) {
  return Math.round(value * 1000) / 1000;
}

export function roundSmartWeight(weight, increment = 2.5) {
  const numericWeight = Number(weight);
  const numericIncrement = Number(increment);

  if (
    !Number.isFinite(numericWeight) ||
    numericWeight <= 0 ||
    !Number.isFinite(numericIncrement) ||
    numericIncrement <= 0
  ) {
    return 0;
  }

  return Math.round(numericWeight / numericIncrement) * numericIncrement;
}

function normalizeEffort(effort) {
  const normalized = String(effort || '')
    .trim()
    .toLowerCase();

  if (normalized === 'normal') return 'good';
  if (normalized === 'toomuch') return 'tooMuch';
  if (normalized === 'veryhard' || normalized === 'max') return 'tooMuch';

  return normalized || null;
}

function normalizeLabelKey(set = {}) {
  return String(set.labelKey || set.label || '')
    .trim()
    .toLowerCase();
}

function getEntryCycle(entry = {}, fallbackCycle = 1) {
  return (
    Number(entry.cycle) ||
    Number(entry.workoutSnapshot?.smartCurrentCycle) ||
    Number(fallbackCycle) ||
    1
  );
}

function getSnapshotType(entry = {}, snapshot = {}) {
  return String(
    snapshot.smartDayType ||
    snapshot.type ||
    entry.smartDayType ||
    entry.type ||
    ''
  ).toLowerCase();
}

function getSnapshotLiftBlocks(entry = {}) {
  const snapshot = entry.workoutSnapshot || entry;

  if (Array.isArray(snapshot.lifts) && snapshot.lifts.length > 0) {
    return snapshot.lifts
      .filter(block => SMART_LIFTS.includes(block?.lift))
      .map(block => ({
        lift: block.lift,
        sets: Array.isArray(block.sets) ? block.sets : [],
      }));
  }

  const lift = SMART_LIFTS.includes(snapshot.lift)
    ? snapshot.lift
    : SMART_LIFTS.includes(entry.lift)
      ? entry.lift
      : null;

  if (!lift) return [];

  return [{
    lift,
    sets: Array.isArray(snapshot.sets) ? snapshot.sets : [],
  }];
}

function isUsableCompletedSet(set = {}) {
  const reps = Number(set.reps) || 0;
  const weight = Number(set.originalWeight ?? set.weight) || 0;
  const pct = Number(set.originalPct ?? set.pct) || 0;

  return (
    !set.warmup &&
    !set.isWarmup &&
    set.done !== false &&
    !set.failed &&
    !set.skipped &&
    reps > 0 &&
    (weight > 0 || pct > 0)
  );
}

function getSetPct(set = {}, trainingMax = 0) {
  const explicitPct = Number(set.originalPct ?? set.pct) || 0;

  if (explicitPct > 0) return explicitPct;

  const weight = Number(set.originalWeight ?? set.weight) || 0;
  const max = Number(trainingMax) || 0;

  return weight > 0 && max > 0 ? weight / max : 0;
}

function getSetWeight(set = {}, trainingMax = 0) {
  const explicitWeight = Number(set.originalWeight ?? set.weight) || 0;

  if (explicitWeight > 0) return explicitWeight;

  const pct = getSetPct(set, trainingMax);
  const max = Number(trainingMax) || 0;

  return pct > 0 && max > 0
    ? roundSmartWeight(max * pct)
    : 0;
}

function findSuccessfulTopSet(sets = [], trainingMax = 0) {
  const successfulSets = sets.filter(isUsableCompletedSet);

  const explicitlyLabeled = successfulSets.filter(set =>
    TOP_LABEL_KEYS.has(normalizeLabelKey(set))
  );

  const lowRepCandidates = successfulSets.filter(set => {
    const reps = Number(set.reps) || 0;
    const labelKey = normalizeLabelKey(set);

    return (
      reps >= 1 &&
      reps <= 3 &&
      !VOLUME_LABEL_KEYS.has(labelKey)
    );
  });

  const candidates = explicitlyLabeled.length > 0
    ? explicitlyLabeled
    : lowRepCandidates;

  return candidates
    .map(set => ({
      labelKey: normalizeLabelKey(set) || null,
      reps: Number(set.reps) || 0,
      pct: getSetPct(set, trainingMax),
      weight: getSetWeight(set, trainingMax),
      effort: normalizeEffort(set.effort),
    }))
    .filter(set => set.reps >= 1 && set.reps <= 3 && set.pct > 0)
    .sort((a, b) =>
      b.pct - a.pct ||
      b.weight - a.weight ||
      a.reps - b.reps
    )[0] || null;
}

function findAttemptedTopSet(sets = [], trainingMax = 0) {
  const candidates = sets
    .filter(set => {
      if (set?.warmup || set?.isWarmup) return false;

      const labelKey = normalizeLabelKey(set);
      const reps = Number(set.reps) || 0;
      const weight = Number(set.originalWeight ?? set.weight) || 0;
      const pct = Number(set.originalPct ?? set.pct) || 0;

      return (
        reps >= 1 &&
        reps <= 3 &&
        !VOLUME_LABEL_KEYS.has(labelKey) &&
        (TOP_LABEL_KEYS.has(labelKey) || labelKey === '') &&
        (weight > 0 || pct > 0)
      );
    })
    .map(set => ({
      labelKey: normalizeLabelKey(set) || null,
      reps: Number(set.reps) || 0,
      pct: getSetPct(set, trainingMax),
      weight: getSetWeight(set, trainingMax),
      effort: normalizeEffort(set.effort),
      failed: Boolean(set.failed),
      skipped: Boolean(set.skipped),
    }))
    .filter(set => set.pct > 0)
    .sort((a, b) =>
      Number(b.failed || b.skipped) -
        Number(a.failed || a.skipped) ||
      b.pct - a.pct ||
      b.weight - a.weight ||
      a.reps - b.reps
    );

  return candidates[0] || null;
}

function findSuccessfulVolumeBlock(sets = [], trainingMax = 0) {
  const groups = new Map();

  sets
    .filter(isUsableCompletedSet)
    .forEach(set => {
      const labelKey = normalizeLabelKey(set);
      const reps = Number(set.reps) || 0;
      const pct = getSetPct(set, trainingMax);
      const weight = getSetWeight(set, trainingMax);
      const isExplicitVolumeSet = VOLUME_LABEL_KEYS.has(labelKey);
      const isUnlabeledVolumeSet =
        !TOP_LABEL_KEYS.has(labelKey) &&
        reps >= 4;

      if (
        !isExplicitVolumeSet &&
        !isUnlabeledVolumeSet
      ) {
        return;
      }

      if (reps <= 0 || pct <= 0) return;

      const key = [
        labelKey || 'volume',
        reps,
        roundPct(pct),
        weight,
      ].join(':');

      const current = groups.get(key) || {
        labelKey: labelKey || 'worksets',
        setCount: 0,
        reps,
        pct,
        weight,
      };

      current.setCount += 1;
      groups.set(key, current);
    });

  return [...groups.values()]
    .sort((a, b) =>
      b.setCount - a.setCount ||
      b.pct - a.pct ||
      b.reps - a.reps
    )[0] || null;
}

export function collectSmartLiftExposures({
  history = [],
  currentCycle = 1,
} = {}) {
  const targetCycle = Number(currentCycle) || 1;
  const exposureMap = new Map();

  history.forEach((entry, historyIndex) => {
    const cycle = getEntryCycle(entry, targetCycle);
    const workoutNumber = Number(entry?.workoutNumber) || 0;
    const snapshot = entry?.workoutSnapshot || entry;
    const snapshotType = getSnapshotType(entry, snapshot);

    if (
      cycle !== targetCycle ||
      workoutNumber <= 0 ||
      entry?.manualMax ||
      entry?.seedMax ||
      entry?.restDay ||
      snapshotType === 'rest' ||
      snapshotType === 'recovery' ||
      snapshotType === 'meet'
    ) {
      return;
    }

    getSnapshotLiftBlocks(entry).forEach(block => {
      const key = `${cycle}:${workoutNumber}:${block.lift}`;

      exposureMap.set(key, {
        cycle,
        workoutNumber,
        historyIndex,
        lift: block.lift,
        sets: block.sets,
        workoutEffort: normalizeEffort(
          entry?.workoutEffort ||
          snapshot?.workoutEffort
        ),
        smartDayType: String(
          snapshot?.smartDayType ||
          entry?.smartDayType ||
          ''
        ).toLowerCase() || null,
        failedOrSkippedSetCount: block.sets.filter(set =>
          set?.failed || set?.skipped
        ).length,
      });
    });
  });

  return [...exposureMap.values()]
    .sort((a, b) =>
      a.workoutNumber - b.workoutNumber ||
      a.historyIndex - b.historyIndex
    );
}

function getProgressionDecision(state = {}) {
  const lastExposure = state.lastExposure;
  const effort = normalizeEffort(lastExposure?.workoutEffort);
  const failedCount =
    Number(lastExposure?.failedOrSkippedSetCount) || 0;

  if (failedCount > 0) {
    return {
      adjustment: -0.05,
      direction: 'regress',
      reason: 'failed-skipped',
    };
  }

  if (effort === 'tooMuch') {
    return {
      adjustment: -0.05,
      direction: 'regress',
      reason: 'too-much',
    };
  }

  if (effort === 'hard') {
    return {
      adjustment: 0,
      direction: 'hold',
      reason: 'hard-hold',
    };
  }

  if (effort === 'easy' || effort === 'good') {
    return {
      adjustment: 0.025,
      direction: 'progress',
      reason: `${effort}-progress`,
    };
  }

  return {
    adjustment: 0,
    direction: 'hold',
    reason: 'insufficient-feedback',
  };
}

export function buildSmartLiftState({
  history = [],
  currentCycle = 1,
  lift,
  trainingMax = 0,
  meetPlanReadiness = {},
  rollingWindow = 6,
} = {}) {
  if (!SMART_LIFTS.includes(lift)) {
    throw new Error(`Unsupported Smart lift: ${lift}`);
  }

  const allExposures = collectSmartLiftExposures({
    history,
    currentCycle,
  });

  const exposures = allExposures
    .filter(exposure => exposure.lift === lift);

  const recentExposures = exposures.slice(
    -Math.max(Number(rollingWindow) || 1, 1)
  );

  const currentWorkoutNumber = Math.max(
    0,
    ...allExposures.map(exposure =>
      Number(exposure.workoutNumber) || 0
    )
  );

  const lastExposure =
    exposures[exposures.length - 1] || null;

  let lastSuccessfulTop = null;

  for (let index = exposures.length - 1; index >= 0; index -= 1) {
    const exposure = exposures[index];

    if (exposure.smartDayType === 'deload') continue;

    const topSet = findSuccessfulTopSet(
      exposure.sets,
      trainingMax
    );

    if (topSet) {
      lastSuccessfulTop = {
        ...topSet,
        workoutNumber: exposure.workoutNumber,
        workoutEffort: exposure.workoutEffort,
      };
      break;
    }
  }

  let lastAttemptedTop = null;

  for (let index = exposures.length - 1; index >= 0; index -= 1) {
    const exposure = exposures[index];

    if (exposure.smartDayType === 'deload') continue;

    const attemptedTop = findAttemptedTopSet(
      exposure.sets,
      trainingMax
    );

    if (attemptedTop) {
      lastAttemptedTop = {
        ...attemptedTop,
        workoutNumber: exposure.workoutNumber,
        workoutEffort: exposure.workoutEffort,
      };
      break;
    }
  }

  let lastSuccessfulVolume = null;

  for (let index = exposures.length - 1; index >= 0; index -= 1) {
    const exposure = exposures[index];

    if (exposure.smartDayType === 'deload') continue;

    const volumeBlock = findSuccessfulVolumeBlock(
      exposure.sets,
      trainingMax
    );

    if (volumeBlock) {
      lastSuccessfulVolume = {
        ...volumeBlock,
        workoutNumber: exposure.workoutNumber,
        workoutEffort: exposure.workoutEffort,
      };
      break;
    }
  }

  const highestRecentSuccessfulTopPct = Math.max(
    0,
    ...recentExposures.map(exposure => {
      if (exposure.smartDayType === 'deload') return 0;

      return findSuccessfulTopSet(
        exposure.sets,
        trainingMax
      )?.pct || 0;
    })
  );

  const recentSuccessfulVolumeBlocks = recentExposures
    .filter(exposure => exposure.smartDayType !== 'deload')
    .map(exposure => findSuccessfulVolumeBlock(
      exposure.sets,
      trainingMax
    ))
    .filter(block => block && Number(block.setCount) >= 4);

  const highestRecentSuccessfulVolumePct = Math.max(
    0,
    ...recentSuccessfulVolumeBlocks.map(block =>
      Number(block.pct) || 0
    )
  );

  const meetReadiness = meetPlanReadiness?.[lift] || {};

  const state = {
    lift,
    trainingMax: Number(trainingMax) || 0,
    exposureCount: exposures.length,
    recentExposureCount: recentExposures.length,
    workoutsSinceExposure: lastExposure
      ? Math.max(
        currentWorkoutNumber -
        Number(lastExposure.workoutNumber),
        0
      )
      : currentWorkoutNumber,
    lastExposure,
    lastSuccessfulTop,
    lastAttemptedTop,
    lastSuccessfulVolume,
    highestRecentSuccessfulTopPct,
    highestRecentSuccessfulVolumePct,
    recentFailedOrSkippedSetCount: recentExposures.reduce(
      (total, exposure) =>
        total +
        (Number(exposure.failedOrSkippedSetCount) || 0),
      0
    ),
    meetReadiness: {
      ready: Boolean(meetReadiness.ready),
      currentCycleReadinessRatio:
        Number(meetReadiness.currentCycleReadinessRatio) || 0,
      currentCycleShortfall:
        Number(meetReadiness.currentCycleShortfall) || 0,
      currentCycleBestE1RM:
        Number(meetReadiness.currentCycleBestE1RM) || 0,
      readinessTargetAttempt:
        Number(
          meetReadiness.readinessTargetAttempt ??
          meetReadiness.attempts?.opener
        ) || 0,
      plannedTopAttempt:
        Number(meetReadiness.plannedTopAttempt) || 0,
    },
  };

  return {
    ...state,
    progression: getProgressionDecision(state),
  };
}

export function buildSmartLiftStates({
  history = [],
  currentCycle = 1,
  trainingMaxes = {},
  meetPlanReadiness = {},
  rollingWindow = 6,
} = {}) {
  return SMART_LIFTS.reduce((states, lift) => ({
    ...states,
    [lift]: buildSmartLiftState({
      history,
      currentCycle,
      lift,
      trainingMax: trainingMaxes?.[lift],
      meetPlanReadiness,
      rollingWindow,
    }),
  }), {});
}

function buildGeneratedSet({
  lift,
  labelKey,
  reps,
  pct,
  trainingMax,
  groupKey,
}) {
  const weight = roundSmartWeight(
    Number(trainingMax) * Number(pct)
  );

  return {
    lift,
    labelKey,
    groupKey,
    groupLabelKey: labelKey,
    reps,
    pct: roundPct(pct),
    weight,
    originalPct: roundPct(pct),
    originalWeight: weight,
    done: false,
    failed: false,
    skipped: false,
    smartGeneratedPrescription: true,
  };
}

function getNextPrimaryTop(state = {}) {
  const progression = state.progression || {
    adjustment: 0,
    direction: 'hold',
    reason: 'insufficient-feedback',
  };

  const anchor =
    state.lastSuccessfulTop ||
    (
      progression.direction === 'regress'
        ? state.lastAttemptedTop
        : null
    );

  if (!anchor) {
    return {
      reps: 3,
      pct: 0.70,
      anchorPct: 0,
      progressionDirection: 'establish',
      progressionReason: 'no-recent-top-work',
    };
  }

  let reps = clamp(
    Number(anchor.reps) || 3,
    1,
    3
  );

  let limit = TOP_PCT_LIMITS[reps];

  if (
    progression.direction === 'progress' &&
    anchor.pct >= limit.max &&
    reps > 1
  ) {
    reps -= 1;
    limit = TOP_PCT_LIMITS[reps];
  }

  let pct = clamp(
    Number(anchor.pct) + progression.adjustment,
    limit.min,
    limit.max
  );

  if (progression.direction !== 'regress') {
    pct = Math.max(pct, Number(anchor.pct) || 0);
  }

  const meetRatio = Number(
    state.meetReadiness?.currentCycleReadinessRatio
  ) || 0;
  const recentVolumeAnchor = Number(
    state.highestRecentSuccessfulVolumePct
  ) || 0;
  const canUseMeetSpecificVolumeAnchor =
    progression.direction !== 'regress' &&
    !state.meetReadiness?.ready &&
    meetRatio > 0 &&
    meetRatio < 1 &&
    recentVolumeAnchor > 0;
  const meetSpecificTopFloor = canUseMeetSpecificVolumeAnchor
    ? clamp(
      recentVolumeAnchor + 0.075,
      limit.min,
      limit.max
    )
    : 0;

  if (meetSpecificTopFloor > 0) {
    pct = Math.max(pct, meetSpecificTopFloor);
  }

  return {
    reps,
    pct: roundPct(pct),
    anchorPct: Number(anchor.pct) || 0,
    volumeAnchorPct: recentVolumeAnchor,
    meetSpecificTopFloor: roundPct(meetSpecificTopFloor),
    meetSpecificProgression: meetSpecificTopFloor > 0,
    progressionDirection: progression.direction,
    progressionReason: progression.reason,
  };
}

function getNormalVolumeSetCount(state = {}) {
  const effort = normalizeEffort(
    state.lastExposure?.workoutEffort
  );

  return effort === 'easy' &&
    Number(state.recentFailedOrSkippedSetCount) === 0
    ? 5
    : 4;
}

function getPrimaryVolumeReps(topReps) {
  if (topReps === 3) return 5;
  return 4;
}

function getSecondaryVolumePct(state = {}) {
  const anchorPct =
    Number(state.lastSuccessfulVolume?.pct) || 0.625;
  const progression = state.progression || {
    adjustment: 0,
    direction: 'hold',
  };

  let pct = clamp(
    anchorPct + progression.adjustment,
    0.60,
    0.725
  );

  if (progression.direction !== 'regress') {
    pct = Math.max(pct, anchorPct);
  }

  return roundPct(pct);
}

export function buildSmartLiftPrescription({
  state,
  role = 'primary',
  isSingleLiftWorkout = false,
  isMixedLiftWorkout = false,
  avoidRecentRepeat = false,
} = {}) {
  if (!state || !SMART_LIFTS.includes(state.lift)) {
    throw new Error('A valid Smart lift state is required.');
  }

  if (!Number.isFinite(state.trainingMax) || state.trainingMax <= 0) {
    throw new Error(
      `A positive training max is required for ${state.lift}.`
    );
  }

  let volumeSetCount = getNormalVolumeSetCount(state);

  if (isSingleLiftWorkout) {
    volumeSetCount = 5;
  } else if (isMixedLiftWorkout) {
    volumeSetCount = 3;
  }

  const sets = [];
  let progressionAnchorPct = 0;
  let topSetAnchorPct = 0;
  let volumeAnchorPct = Number(
    state.highestRecentSuccessfulVolumePct
  ) || 0;
  let plannedVolumePct = 0;
  let meetSpecificProgression = false;
  let repeatVariationApplied = false;
  let regressionReason = null;

  if (role === 'primary') {
    const baseTop = getNextPrimaryTop(state);
    let top = { ...baseTop };

    if (
      avoidRecentRepeat &&
      baseTop.progressionDirection !== 'regress' &&
      normalizeEffort(state.lastExposure?.workoutEffort) !== 'toomuch' &&
      Number(state.recentFailedOrSkippedSetCount) === 0
    ) {
      const currentLimit = TOP_PCT_LIMITS[top.reps];

      if (top.pct < currentLimit.max) {
        top.pct = roundPct(Math.min(
          currentLimit.max,
          top.pct + 0.025
        ));
        repeatVariationApplied = top.pct !== baseTop.pct;
      } else if (top.reps > 1) {
        const nextReps = top.reps - 1;
        const nextLimit = TOP_PCT_LIMITS[nextReps];
        top = {
          ...top,
          reps: nextReps,
          pct: roundPct(clamp(
            top.pct + 0.025,
            nextLimit.min,
            nextLimit.max
          )),
        };
        repeatVariationApplied = true;
      }
    }

    const topLabelKey = top.reps === 1
      ? 'topSingle'
      : top.reps === 2
        ? 'topDouble'
        : 'topTriple';

    sets.push(buildGeneratedSet({
      lift: state.lift,
      labelKey: topLabelKey,
      reps: top.reps,
      pct: top.pct,
      trainingMax: state.trainingMax,
      groupKey: `${state.lift}-top`,
    }));

    progressionAnchorPct = top.anchorPct;
    topSetAnchorPct = top.anchorPct;
    meetSpecificProgression = Boolean(
      top.meetSpecificProgression
    );
    regressionReason = top.progressionDirection === 'regress'
      ? top.progressionReason
      : null;

    const volumeReferenceTopPct = repeatVariationApplied
      ? baseTop.pct
      : top.pct;
    let volumePct = roundPct(
      clamp(volumeReferenceTopPct - 0.10, 0.60, 0.75)
    );

    if (meetSpecificProgression && volumeAnchorPct > 0) {
      volumePct = roundPct(Math.min(
        top.pct - 0.025,
        Math.max(volumePct, volumeAnchorPct - 0.025)
      ));
    }

    let volumeReps = getPrimaryVolumeReps(top.reps);

    const singleLiftBenchVolume =
      isSingleLiftWorkout &&
      state.lift === 'Bench' &&
      normalizeEffort(state.lastExposure?.workoutEffort) !== 'tooMuch' &&
      Number(state.recentFailedOrSkippedSetCount) === 0;

    if (singleLiftBenchVolume) {
      volumeSetCount = 6;
      volumeReps = 6;
      volumePct = Math.min(volumePct, 0.70);
    }

    if (meetSpecificProgression && !isSingleLiftWorkout) {
      // The heavier meet-specific top set already adds stimulus. On a
      // mixed-lift day, three back-off sets preserve progression without
      // leaving a visually incomplete four-item grid or overloading the day.
      volumeSetCount = 3;
    }

    plannedVolumePct = volumePct;

    for (let index = 0; index < volumeSetCount; index += 1) {
      sets.push(buildGeneratedSet({
        lift: state.lift,
        labelKey: 'backoff',
        reps: volumeReps,
        pct: volumePct,
        trainingMax: state.trainingMax,
        groupKey: `${state.lift}-backoff`,
      }));
    }
  } else {
    const volumePct = getSecondaryVolumePct(state);
    plannedVolumePct = volumePct;
    const previousReps =
      Number(state.lastSuccessfulVolume?.reps) || 5;
    const volumeReps = clamp(previousReps, 4, 6);

    for (let index = 0; index < volumeSetCount; index += 1) {
      sets.push(buildGeneratedSet({
        lift: state.lift,
        labelKey: 'workSets',
        reps: volumeReps,
        pct: volumePct,
        trainingMax: state.trainingMax,
        groupKey: `${state.lift}-worksets`,
      }));
    }
  }

  const prescription = {
    lift: state.lift,
    role,
    sets,
    progressionAnchorPct,
    topSetAnchorPct,
    volumeAnchorPct,
    plannedVolumePct,
    meetSpecificProgression,
    ...(isMixedLiftWorkout
      ? { isMixedLiftWorkout: true }
      : {}),
    repeatVariationApplied,
    regressionReason,
    smartGeneratedPrescription: true,
  };

  return {
    ...prescription,
    validation: validateSmartLiftPrescription(prescription),
  };
}

export function validateSmartLiftPrescription(
  prescription = {}
) {
  const errors = [];
  const sets = Array.isArray(prescription.sets)
    ? prescription.sets
    : [];

  const topSets = sets.filter(set =>
    TOP_LABEL_KEYS.has(normalizeLabelKey(set))
  );

  if (topSets.length > 1) {
    errors.push('A normal Smart lift may contain only one top set.');
  }

  topSets.forEach(set => {
    const reps = Number(set.reps) || 0;

    if (reps < 1 || reps > 3) {
      errors.push('Top work must contain 1–3 reps.');
    }
  });

  const volumeGroups = sets
    .filter(set =>
      VOLUME_LABEL_KEYS.has(normalizeLabelKey(set))
    )
    .reduce((groups, set) => {
      const key = set.groupKey || normalizeLabelKey(set);
      const current = groups.get(key) || [];
      current.push(set);
      groups.set(key, current);
      return groups;
    }, new Map());

  if (volumeGroups.size === 0) {
    errors.push(
      'A normal Smart lift requires a back-off or work-set block.'
    );
  }

  const allowsThreeSetVolumeBlock = Boolean(
    prescription.isMixedLiftWorkout ||
    (
      prescription.role === 'primary' &&
      prescription.meetSpecificProgression
    )
  );

  volumeGroups.forEach(group => {
    const validSetCount =
      (group.length >= 4 && group.length <= 6) ||
      (allowsThreeSetVolumeBlock && group.length === 3);

    if (!validSetCount) {
      errors.push(
        allowsThreeSetVolumeBlock
          ? 'Mixed or meet-specific volume blocks require 3–6 sets.'
          : 'Back-off and work-set blocks require 4–6 sets.'
      );
    }

    group.forEach(set => {
      const reps = Number(set.reps) || 0;

      if (reps < 4 || reps > 6) {
        errors.push(
          'Back-off and work-set blocks require 4–6 reps.'
        );
      }
    });
  });

  const topPct = Number(topSets[0]?.pct) || 0;
  if (
    topPct > 0 &&
    [...volumeGroups.values()].some(group =>
      group.some(set => (Number(set.pct) || 0) >= topPct)
    )
  ) {
    errors.push('Back-off work must be lighter than top work.');
  }
  const anchorPct =
    Number(prescription.progressionAnchorPct) || 0;

  if (
    topPct > 0 &&
    anchorPct > 0 &&
    topPct < anchorPct &&
    !prescription.regressionReason
  ) {
    errors.push(
      'Top work regressed without a lift-specific reason.'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function rankSmartLiftPriorities(
  states = {},
  {
    programProfile = 'kelaniSbd',
  } = {}
) {
  const targets =
    PROFILE_EXPOSURE_TARGETS[programProfile] ||
    PROFILE_EXPOSURE_TARGETS.kelaniSbd;

  return SMART_LIFTS
    .map(lift => {
      const state = states?.[lift] || {};
      const exposureTarget = Number(targets[lift]) || 0;
      const recentExposureCount =
        Number(state.recentExposureCount) || 0;
      const exposureDeficit = Math.max(
        exposureTarget - recentExposureCount,
        0
      );

      const meetRatio =
        Number(
          state.meetReadiness?.currentCycleReadinessRatio
        ) || 0;

      const meetShortfall = meetRatio > 0
        ? Math.max(1 - meetRatio, 0)
        : 0;

      const staleness =
        Number(state.workoutsSinceExposure) || 0;

      const lastEffort = normalizeEffort(
        state.lastExposure?.workoutEffort
      );

      const fatiguePenalty =
        lastEffort === 'tooMuch'
          ? 10
          : lastEffort === 'hard'
            ? 3
            : 0;

      const failedPenalty =
        Number(
          state.lastExposure?.failedOrSkippedSetCount
        ) > 0
          ? 8
          : 0;

      const score =
        exposureDeficit * 10 +
        meetShortfall * 8 +
        staleness * 2 -
        fatiguePenalty -
        failedPenalty;

      return {
        lift,
        score,
        exposureTarget,
        recentExposureCount,
        exposureDeficit,
        meetShortfall,
        staleness,
      };
    })
    .sort((a, b) =>
      b.score - a.score ||
      SMART_LIFTS.indexOf(a.lift) -
      SMART_LIFTS.indexOf(b.lift)
    );
}
