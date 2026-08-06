import {
  MEET_ATTEMPT_PCTS,
  SMART_FREQUENCY_SCORE_TARGETS_BY_LEVEL,
} from './smartTrainingConstants';

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

// Weekly exposure targets (flat session count per lift), keyed by Smart
// Training athlete experience level (auto-derived from eStrength - see
// classifyAthleteLevel in workoutHistoryStats.js) - deliberately decoupled
// from the legacy Classic programProfile, which is in maintenance mode.
// "intermediate" is the default fallback. Derived from
// SMART_FREQUENCY_SCORE_TARGETS_BY_LEVEL's `days` field (the frequency-
// score table) rather than hand-maintained separately, so the three
// consumers of a flat weekly count (this ranking, getProjectedSmartLift
// Eligibility, and the meet-projection exposure target in
// smartTrainingEngine.js) can never drift from the score table.
export const EXPOSURE_TARGETS_BY_LEVEL = Object.freeze(
  Object.fromEntries(
    Object.entries(SMART_FREQUENCY_SCORE_TARGETS_BY_LEVEL).map(
      ([level, lifts]) => [
        level,
        Object.freeze(
          Object.fromEntries(
            Object.entries(lifts).map(([lift, target]) => [lift, target.days])
          )
        ),
      ]
    )
  )
);

// Back-compat alias for any direct consumers of the old flat shape.
export const PROFILE_EXPOSURE_TARGETS = Object.freeze({
  kelaniSbdUltra: EXPOSURE_TARGETS_BY_LEVEL.intermediate,
  kelaniSbd: EXPOSURE_TARGETS_BY_LEVEL.intermediate,
  kelaniSbdLower: EXPOSURE_TARGETS_BY_LEVEL.intermediate,
  kelaniSbdLowerPlus: EXPOSURE_TARGETS_BY_LEVEL.intermediate,
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

export function roundSmartWeight(weight, increment = 5) {
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

// Rounds a fraction to the nearest 5% step for display/weight purposes.
// Progression itself still advances in finer (2.5%) steps internally -
// see `precisePct` on generated sets - so the athlete's pace doesn't change,
// only the percentage and weight shown ever land on a clean 5% multiple.
export function roundPercent(value, increment = 0.05) {
  const numericValue = Number(value);
  const numericIncrement = Number(increment);

  if (
    !Number.isFinite(numericValue) ||
    numericValue <= 0 ||
    !Number.isFinite(numericIncrement) ||
    numericIncrement <= 0
  ) {
    return 0;
  }

  // Plain float division (e.g. 0.825 / 0.05) can land a hair below an exact
  // half-step (16.499999999999996 instead of 16.5) and silently round the
  // wrong way. Scaling to integers first removes that float noise so ties
  // round consistently.
  const scale = 100000;
  const scaledValue = Math.round(numericValue * scale);
  const scaledIncrement = Math.round(numericIncrement * scale);
  const steps = Math.round(scaledValue / scaledIncrement);

  return roundPct((steps * scaledIncrement) / scale);
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
        role: block.role || null,
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
    role: snapshot.role || entry.role || null,
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
  // A set generated after the 5% display-rounding change carries its true,
  // finer-grained (2.5%-step) percentage in `precisePct`. Progression must
  // anchor on that, not the rounded `pct` the athlete saw, or progression
  // pace would silently double (every rounded step would always round up).
  const precisePct = Number(set.precisePct) || 0;

  if (precisePct > 0) return precisePct;

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

    const liftBlocks = getSnapshotLiftBlocks(entry);
    const workoutFailedOrSkippedSetCount = liftBlocks.reduce(
      (total, block) => total + block.sets.filter(set =>
        set?.failed || set?.skipped
      ).length,
      0
    );

    liftBlocks.forEach(block => {
      const key = `${cycle}:${workoutNumber}:${block.lift}`;
      const failedSets = block.sets.filter(set =>
        set?.failed || set?.skipped
      );
      const failedTopSetCount = failedSets.filter(set => {
        const labelKey = normalizeLabelKey(set);
        const reps = Number(set?.reps) || 0;
        return TOP_LABEL_KEYS.has(labelKey) || (
          reps >= 1 && reps <= 3 && !VOLUME_LABEL_KEYS.has(labelKey)
        );
      }).length;

      exposureMap.set(key, {
        cycle,
        workoutNumber,
        historyIndex,
        lift: block.lift,
        role: block.role,
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
        failedOrSkippedSetCount: failedSets.length,
        failedTopSetCount,
        workoutFailedOrSkippedSetCount,
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
  const failedTopSetCount =
    Number(lastExposure?.failedTopSetCount) || 0;
  const role = String(lastExposure?.role || '').toLowerCase();

  if (failedCount > 0) {
    if (
      failedTopSetCount === 0 &&
      (role === 'secondary' || role === 'tertiary')
    ) {
      if (state.hasRecoveryAfterLastExposure) {
        return {
          adjustment: 0.025,
          direction: 'progress',
          reason: 'recovered-light-volume-failure-progress',
        };
      }

      return {
        adjustment: 0,
        direction: 'hold',
        reason: 'light-volume-failure-recovery',
      };
    }

    return {
      adjustment: -0.05,
      direction: 'regress',
      reason: 'failed-skipped',
    };
  }

  if (effort === 'tooMuch') {
    if (Number(lastExposure?.workoutFailedOrSkippedSetCount) > 0) {
      return {
        adjustment: 0.025,
        direction: 'progress',
        reason: 'other-lift-failed-progress',
      };
    }

    return {
      adjustment: -0.05,
      direction: 'regress',
      reason: 'too-much',
    };
  }

  // workoutEffort is rated once for the whole day, not per lift, so a "hard"
  // rating driven by a different lift (e.g. a heavy Squat day) must not
  // block THIS lift's progression - especially now that frequency policy
  // never repeats a lift on consecutive days, a prior day's overall rating
  // is never really about the lift being prescribed today. Only an explicit
  // "too much" rating or an actual failed/skipped set hold back progress.
  if (effort === 'hard' || effort === 'easy' || effort === 'good') {
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
  const hasRecoveryAfterLastExposure = Boolean(
    lastExposure && history.some(entry => {
      const cycle = getEntryCycle(entry, currentCycle);
      const workoutNumber = Number(entry?.workoutNumber) || 0;
      const snapshot = entry?.workoutSnapshot || entry;
      const snapshotType = getSnapshotType(entry, snapshot);

      return (
        cycle === (Number(currentCycle) || 1) &&
        workoutNumber > Number(lastExposure.workoutNumber) &&
        (
          entry?.restDay ||
          snapshotType === 'rest' ||
          snapshotType === 'recovery'
        )
      );
    })
  );

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
    hasRecoveryAfterLastExposure,
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
      readinessPhase: meetReadiness.readinessPhase || 'opener',
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
      attempts: {
        opener: Number(meetReadiness.attempts?.opener) || 0,
        secondAttempt: Number(meetReadiness.attempts?.secondAttempt) || 0,
        thirdAttempt: Number(meetReadiness.attempts?.thirdAttempt) || 0,
      },
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
  useBarbellPrecision = false,
}) {
  const precisePct = roundPct(pct);
  let displayPct;
  let weight;

  if (useBarbellPrecision) {
    // Meet-specific top sets (second/third-attempt phases) target a real,
    // specific attempt weight. Rounding the percentage itself to the
    // nearest 5% bucket FIRST, then deriving the weight from that bucket,
    // can permanently trap progression when the true ceiling falls
    // mid-bucket - e.g. a 96.1% ceiling always rounds down to 95%, so the
    // athlete can never reach a third attempt's e1RM no matter how many
    // cycles pass (real report: Deadlift stuck at 170kg/181.3 e1RM forever
    // against a 184.5kg third-attempt target, because 96.1% never rounds
    // up to 100%). Round the actual barbell weight instead, and derive the
    // displayed percentage from that real weight so the two always agree.
    weight = roundSmartWeight(Number(trainingMax) * precisePct);
    displayPct = Number(trainingMax) > 0
      ? weight / Number(trainingMax)
      : precisePct;
  } else {
    displayPct = roundPercent(precisePct);
    weight = roundSmartWeight(
      Number(trainingMax) * displayPct
    );
  }

  return {
    lift,
    labelKey,
    groupKey,
    groupLabelKey: labelKey,
    reps,
    pct: displayPct,
    weight,
    originalPct: displayPct,
    originalWeight: weight,
    // The true (2.5%-step) progression anchor, so future exposures keep
    // advancing at the same pace the rounded 5% display doesn't reveal.
    precisePct,
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

  const trainingMax = Number(state.trainingMax) || 0;
  const meetReadiness = state.meetReadiness || {};
  const attempts = meetReadiness.attempts || {};
  const readinessPhase = meetReadiness.readinessPhase || 'opener';

  // Real second/third-attempt targets (from the athlete's Meet Planner
  // attempts if set, else the default MEET_ATTEMPT_PCTS) - training top
  // sets climb toward these instead of an arbitrary flat cap.
  const secondAttemptWeight =
    Number(attempts.secondAttempt) ||
    trainingMax * MEET_ATTEMPT_PCTS.secondAttempt;
  const secondAttemptPct = trainingMax > 0
    ? clamp(secondAttemptWeight / trainingMax, TOP_PCT_LIMITS[1].min, 1.0)
    : TOP_PCT_LIMITS[1].max;

  const thirdAttemptWeight =
    Number(attempts.thirdAttempt) ||
    trainingMax * MEET_ATTEMPT_PCTS.thirdAttempt;
  // Epley-inverse: the %1RM a top DOUBLE needs to hit to be e1RM-equivalent
  // to the third attempt - demonstrated via extra reps, never a literal
  // third-attempt single (that's reserved for the actual meet).
  const thirdAttemptDoublePct = trainingMax > 0
    ? clamp(thirdAttemptWeight / trainingMax / (1 + 2 / 30), TOP_PCT_LIMITS[2].min, 1.0)
    : TOP_PCT_LIMITS[2].max;

  if (readinessPhase === 'ready') {
    // Third-attempt e1RM already demonstrated this cycle - hold rather
    // than escalate further. This is the lift's own taper until a new
    // cycle resets readinessPhase back to 'opener'.
    return {
      reps: 3,
      pct: 0.90,
      anchorPct: Number(anchor.pct) || 0,
      progressionDirection: 'regress',
      progressionReason: 'ready-taper',
      meetSpecificProgression: true,
      useBarbellPrecision: true,
    };
  }

  if (readinessPhase === 'third-attempt') {
    // Second attempt already demonstrated - escalate a top double toward
    // third-attempt e1RM equivalence.
    const anchorIsDouble = Number(anchor.reps) === 2;
    const anchorReps = Number(anchor.reps) || 2;
    const rawAnchorPct = Number(anchor.pct) || TOP_PCT_LIMITS[2].min;
    // The previous top set may have been a different rep scheme (e.g. a
    // single from the second-attempt phase this cycle just transitioned out
    // of) - translate it to its double-equivalent %1RM first (same
    // Epley-style conversion used below for the opener/second-attempt
    // ratchet) so it's a fair anchor for a double, and so the validator's
    // "did top work regress" check compares like-for-like instead of a raw
    // single's higher % against a double's lower %. Ceiling is this phase's
    // real ceiling (thirdAttemptDoublePct), not the normal double's training
    // ceiling (TOP_PCT_LIMITS[2].max) - clamping to the lower, generic
    // ceiling was silently discarding real demonstrated strength (e.g. a
    // 95%-single converts to ~92% as a double, well above the 87.5% generic
    // cap), making the next prescription look like progress from an
    // artificially deflated anchor while actually prescribing less than
    // already proven.
    const anchorPct = anchorIsDouble
      ? rawAnchorPct
      : clamp(
          rawAnchorPct * (1 + anchorReps / 30) / (1 + 2 / 30),
          TOP_PCT_LIMITS[2].min,
          thirdAttemptDoublePct
        );

    let pct = clamp(
      anchorPct + progression.adjustment,
      TOP_PCT_LIMITS[2].min,
      thirdAttemptDoublePct
    );

    if (progression.direction !== 'regress') {
      pct = Math.max(pct, anchorPct);
    }

    return {
      reps: 2,
      pct: roundPct(pct),
      anchorPct: roundPct(anchorPct),
      progressionDirection: progression.direction,
      progressionReason: progression.reason,
      meetSpecificProgression: true,
      useBarbellPrecision: true,
    };
  }

  // Phases 'opener' / 'second-attempt': keep the existing gradual
  // triple -> double -> single ratchet, but let the single's ceiling climb
  // toward the athlete's real second-attempt target instead of stopping at
  // a flat 90% (previously TOP_PCT_LIMITS[1].max, which only coincidentally
  // matches the meet opener percentage, not a real training ceiling).
  let reps = clamp(
    Number(anchor.reps) || 3,
    1,
    3
  );

  let limit = TOP_PCT_LIMITS[reps];
  let effectiveMax = reps === 1 ? secondAttemptPct : limit.max;
  let convertedAnchorPct = Number(anchor.pct) || 0;

  if (
    progression.direction === 'progress' &&
    anchor.pct >= effectiveMax &&
    reps > 1
  ) {
    const previousReps = reps;
    reps -= 1;
    limit = TOP_PCT_LIMITS[reps];
    effectiveMax = reps === 1 ? secondAttemptPct : limit.max;
    // Translate the anchor to its e1RM-equivalent % at the new rep count
    // before adding the normal progression step, so dropping a rep is a
    // genuine step forward - a flat "+2.5pp" here barely offsets the lost
    // rep (e.g. a maxed 82.5% triple -> "85%" double is ~90.75% vs ~90.67%
    // e1RM-equivalent, essentially unchanged despite reading as +2.5%).
    convertedAnchorPct = convertedAnchorPct *
      (1 + previousReps / 30) / (1 + reps / 30);
  }

  let pct = clamp(
    convertedAnchorPct + progression.adjustment,
    limit.min,
    effectiveMax
  );

  if (progression.direction !== 'regress') {
    pct = Math.max(pct, convertedAnchorPct);
  }

  return {
    reps,
    pct: roundPct(pct),
    anchorPct: Number(anchor.pct) || 0,
    progressionDirection: progression.direction,
    progressionReason: progression.reason,
    meetSpecificProgression: readinessPhase === 'second-attempt',
    // Only once this ratchet has actually reached a single is the ceiling
    // (effectiveMax above) a real meet-target-derived value
    // (secondAttemptPct) instead of a generic, already-5%-aligned
    // TOP_PCT_LIMITS bucket - barbell-precision rounding is only meaningful
    // (and only correct) once there's a real target ceiling to round toward.
    useBarbellPrecision: reps === 1 && readinessPhase === 'second-attempt',
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

  // Re-clamp after the "never regress" floor - that floor can otherwise
  // override the 60-72.5% ceiling above whenever anchorPct itself already
  // sits above it (e.g. lastSuccessfulVolume picked up a heavier backoff
  // recorded under a different, primary-role exposure of this lift), which
  // let secondary/volume intensity silently creep past its intended cap
  // over successive sessions until it caused a real failure (the
  // C3W34: 5x4x145kg at 77.5-80% on a secondary Deadlift day, well above
  // this function's own stated 72.5% ceiling).
  return roundPct(clamp(pct, 0.60, 0.725));
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
    volumeSetCount = 6;
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
      // Meet-specific phases (second-attempt/third-attempt) already
      // deliberately fix the rep scheme as part of their own ratchet (e.g.
      // third-attempt always escalates a double) and climb toward a real
      // attempt-weight ceiling, not the generic TOP_PCT_LIMITS training
      // table this variation logic uses. Applying it here could drop a
      // rep against a still-anchored-to-the-old-rep-scheme pct, comparing
      // mismatched rep schemes and flagging a false "regressed" - the
      // real bug behind a repeat "Invalid Smart prescription" crash right
      // after workout completion.
      !baseTop.meetSpecificProgression &&
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

    // The prescribed top set's actual weight must never be a real
    // regression from what the athlete already proved, unless this
    // genuinely is a deliberate regression (regressionReason set just
    // below, e.g. a deload or failed feedback) - always make real
    // progress unless there's a reason not to. The % anchor above already
    // guards the *percentage*, but converting % to a barbell-loadable
    // weight (5kg steps) can still round the actual kg down below the last
    // proven top - especially right after a rep-scheme change (e.g. a
    // single carried into a double-only phase), where a lower %1RM can
    // still be a "valid" double even though it's a lower absolute weight.
    // The lifted weight is what the athlete actually sees and feels, so it
    // must hold this floor even when the underlying % technically ticks up.
    if (
      top.progressionDirection !== 'regress' &&
      Number(state.lastSuccessfulTop?.weight) > 0 &&
      Number(state.trainingMax) > 0
    ) {
      const provenWeight = Number(state.lastSuccessfulTop.weight);
      const projectedWeight = roundSmartWeight(
        state.trainingMax * (
          top.useBarbellPrecision
            ? roundPct(top.pct)
            : roundPercent(top.pct)
        )
      );
      // 'progress' is an explicit "this cycle should move forward" signal,
      // not just "don't go backward" - a genuine but small %-increase can
      // still round back down to the exact same barbell weight as last
      // time (real report: Squat's third-attempt % ticked up from 87.5% to
      // 90% after a successful cycle, but 145kg training max * 90% = 130.5,
      // which rounds right back to the same 130kg the athlete already
      // lifted). The floor below already guarantees "never lower"; when
      // the policy says "progress" AND this is a useBarbellPrecision
      // (meet-specific) top set AND the rep scheme is unchanged from the
      // anchor, it must guarantee "strictly higher" - otherwise the athlete
      // sees an identical prescription and reads it as no progress at all,
      // which it effectively wasn't. Scoped narrowly:
      // - useBarbellPrecision only: the opener/second-attempt ratchet's
      //   fixed 2.5pp TOP_PCT_LIMITS steps are already tuned (and covered
      //   by the recovery-matrix tests) to produce real weight changes at
      //   typical training maxes - a flat +5kg floor there would be a
      //   wildly oversized jump for a lighter lift's training max (e.g.
      //   +5kg on a 32.5kg Bench max is +15 percentage points, not +2.5).
      // - same rep scheme only: a rep-scheme change (e.g. a single anchor
      //   converting into this phase's double) already gets its own
      //   Epley-style conversion upstream, and can legitimately land on
      //   the exact same "floor" weight as the anchor without that being a
      //   stall - forcing +5kg on top of an already-converted rep-scheme
      //   change overshoots what real progress from that anchor means.
      const sameRepScheme = Number(state.lastSuccessfulTop?.reps) === Number(top.reps);
      const minimumWeight = (
        top.progressionDirection === 'progress' &&
        top.useBarbellPrecision &&
        sameRepScheme
      )
        ? provenWeight + 5
        : provenWeight;

      if (projectedWeight < minimumWeight) {
        let flooredWeight = projectedWeight;

        while (flooredWeight < minimumWeight) {
          flooredWeight = roundSmartWeight(flooredWeight + 5);
        }

        top = { ...top, pct: flooredWeight / state.trainingMax };
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
      useBarbellPrecision: Boolean(top.useBarbellPrecision),
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
    // Ceiling matches the natural result of (top pct - 10%) at the highest
    // top-single pct (TOP_PCT_LIMITS[1].max = 0.90) - a lower cap here was
    // silently clipping backoff% for any top set at/near its rep-scheme max,
    // making backoffs look identical across sessions despite the top set
    // actually progressing (see C3W26 vs C3W29 Bench stagnation report).
    let volumePct = roundPct(
      clamp(volumeReferenceTopPct - 0.10, 0.60, 0.80)
    );

    if (meetSpecificProgression && volumeAnchorPct > 0) {
      volumePct = roundPct(Math.min(
        top.pct - 0.025,
        Math.max(volumePct, volumeAnchorPct - 0.025)
      ));
    }

    let volumeReps = getPrimaryVolumeReps(top.reps);

    if (state.meetReadiness?.readinessPhase === 'ready') {
      volumePct = Math.min(volumePct, 0.70);
      volumeReps = 4;
    }

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

  // Use the true, finer-grained precisePct, not the display-rounded pct
  // (nearest 5%) - a genuinely-held-or-higher precise value (e.g. 0.974,
  // exactly matching a real proven anchor) can round DOWN for display
  // (0.95), which made the validator compare a rounded current value
  // against an unrounded anchor and see a "regression" that never actually
  // happened. This is the root cause behind the real "Invalid Smart
  // prescription" crash right after workout completion.
  const topPct = Number(topSets[0]?.precisePct ?? topSets[0]?.pct) || 0;
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
    athleteLevel = 'intermediate',
  } = {}
) {
  const targets =
    EXPOSURE_TARGETS_BY_LEVEL[athleteLevel] ||
    EXPOSURE_TARGETS_BY_LEVEL.intermediate;

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
