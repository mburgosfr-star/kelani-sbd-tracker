import { formatDecimalDisplay } from './workoutUnits';

export const LIFT_ORDER = ['Squat', 'Bench', 'Deadlift'];

const COOLDOWN_MODES = ['off', 'upperBackFriendly'];
export const ACCESSORY_MODES = ['off', 'standard', 'upperBackFriendly', 'lowerBodyFriendly'];
export const REST_TIME_OPTIONS = [90, 180, 300, 480];
export const DEFAULT_REST_TIME_SECONDS = 300;

export function toOptionalNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function calculateLeanMassEstimate(bodyWeight, bodyFat) {
  if (!bodyWeight || !bodyFat) return null;

  const leanMass = bodyWeight * (1 - (bodyFat / 100));

  return Math.round(leanMass * 10) / 10;
}

export function normalizeCooldownMode(value) {
  if (value === true) return 'upperBackFriendly';
  if (value === false) return 'off';
  return COOLDOWN_MODES.includes(value) ? value : 'off';
}

export function normalizeAccessoryMode(value) {
  if (value === 'basic' || value === 'full') return 'standard';
  return ACCESSORY_MODES.includes(value) ? value : 'off';
}

export function normalizeRestTimeSeconds(value) {
  return REST_TIME_OPTIONS.includes(Number(value)) ? Number(value) : DEFAULT_REST_TIME_SECONDS;
}

export function epley(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;

  if (w <= 0 || r <= 0) return 0;
  if (r <= 1) return w;

  return w * (1 + r / 30);
}

// e1RM is an actionable barbell estimate, not a lab measurement. Keep one
// canonical 2.5kg barbell value everywhere it is stored, displayed or
// compared by Smart Training. Actual lifted 1RM values remain untouched.
export function roundE1RM(value) {
  const numeric = Number(value) || 0;
  if (numeric <= 0) return 0;

  return Math.round(numeric / 2.5) * 2.5;
}

// Set-label classification. Small and dependency-free, but needed both here
// (getRecommendedRestTimeSeconds) and by later modules (warmup/prep
// generation, the smart engine) - kept here so nothing needs to import back
// into a "later" module and create a cycle.
export function isTopSetLabel(labelKey) {
  return ['heavySingle', 'topSingle', 'topDouble', 'topTriple'].includes(labelKey);
}

export function isMainOrAttemptLabelKey(labelKey) {
  return [
    'heavySingle',
    'topSingle',
    'topDouble',
    'topTriple',
    'opener',
    'secondAttempt',
    'thirdAttempt',
  ].includes(labelKey);
}

export function isAttemptSetLabel(labelKey) {
  return ['opener', 'secondAttempt', 'thirdAttempt'].includes(labelKey);
}

export function getRecommendedRestTimeSeconds({ workouts = [], placement = null, fallbackSeconds = 180 } = {}) {
  if (!placement) return fallbackSeconds;

  const workout = (workouts || []).find(item =>
    Number(item?.number) === Number(placement.workoutNumber)
  );

  let set = null;

  if (placement.type === 'main') {
    set = workout?.sets?.[placement.index];
  }

  if (placement.type === 'meetSet') {
    set = workout?.lifts?.[placement.liftIndex]?.sets?.[placement.index];
  }

  const labelKey = set?.labelKey;
  const isRealMeetDay = workout?.type === 'meet';

  // Real meet day and real attempt labels need long attempt-style rest.
  if (isRealMeetDay || isAttemptSetLabel(labelKey)) return 480;

  // Accessories stay short, successful or failed.
  if (placement.type === 'accessory') return 90;

  if (placement.type === 'warmup') return 90;
  if (placement.type === 'cooldown') return 90;

  // Failed training work needs extra recovery, but not attempt-level rest.
  if (placement.failed) return 300;

  if (isTopSetLabel(labelKey)) return 300;

  if (labelKey === 'backoff' || labelKey === 'workSets') return 180;

  // Multi-lift secondary/light training sets often have no labelKey.
  // They are training work, not meet attempts.
  if (placement.type === 'main' || placement.type === 'meetSet') return 180;

  return fallbackSeconds;
}

// Reads the lift block (or flat sets) for a given lift out of a workout
// snapshot. Zero dependencies of its own - kept here as the foundational
// "read a snapshot" utility so both history-stats math and (later) the smart
// engine can use it without a circular import.
export function getSmartLiftSetsFromSnapshot(snapshot = {}, lift = null) {
  if (!lift) return [];

  const liftBlock = (snapshot?.lifts || []).find(block => block?.lift === lift);

  if (liftBlock) return liftBlock.sets || [];
  if (snapshot?.lift === lift) return snapshot?.sets || [];

  return [];
}

// Some generators (the Smart ideal route) mirror the primary lift onto the
// flat workout.lift/workout.sets fields for backward compatibility, even
// though workout.lifts already fully describes the day. A completion
// handler must only treat a workout as flat-legacy when workout.lifts is
// genuinely empty - otherwise a legacy single-lift completion path can run
// after the multi-lift one and silently overwrite its result with a single
// (primary-only) lift.
export function isFlatLegacyTrainingWorkout(workout = {}) {
  return workout?.type === 'training' && (workout?.lifts || []).length === 0;
}

export function getActualOneRMFromSets(sets = []) {
  return Math.max(
    0,
    ...(Array.isArray(sets) ? sets : [])
      .filter(set => (
        set?.done !== false &&
        !set?.failed &&
        !set?.skipped &&
        !set?.warmup &&
        !set?.isWarmup &&
        Number(set?.reps) === 1 &&
        Number(set?.weight) > 0
      ))
      .map(set => Number(set.weight) || 0)
  );
}

// Unlike getActualOneRMFromSets, this is not gated to literal singles: it is
// the heaviest weight actually put on the bar that day, at any rep count.
// Used for the "1RM today" workout-complete display, which is distinct from
// the strictly-demonstrated 1RM tracked for meet readiness.
export function getTopWeightFromSets(sets = []) {
  const weights = (Array.isArray(sets) ? sets : []).map(set => Number(set?.weight) || 0);
  return weights.length ? Math.max(...weights) : 0;
}

// The workout-complete screen shows one 1RM/e1RM section per trackable lift
// of the day, not only the primary one - a workout can mix intensities
// across its lifts, so every trackable lift needs its own real numbers.
export function buildCompletedWorkoutLiftSummaries({
  completedSummary,
  completedWorkout,
  best1RMs = {},
  bestE1RMs = {},
  prs = {},
} = {}) {
  const getSetsForLift = (lift) => {
    const liftBlock = (completedWorkout?.lifts || []).find(block => block?.lift === lift);
    const rawSets = liftBlock
      ? liftBlock.sets
      : completedWorkout?.lift === lift
        ? completedWorkout?.sets
        : [];

    return (rawSets || []).filter(set => set.done && !set.failed && !set.skipped);
  };

  const trackableResults = (completedSummary?.results || []).filter(
    result => result.trackStrength !== false
  );

  return trackableResults.map(result => {
    const sets = getSetsForLift(result.lift);

    const calculatedOneRMToday = getTopWeightFromSets(sets);
    const calculatedE1RMToday = sets.length
      ? roundE1RM(Math.max(...sets.map(set => epley(Number(set.weight) || 0, Number(set.reps) || 0))))
      : 0;

    const oneRMToday = result?.oneRMToday ?? calculatedOneRMToday;
    const e1RMToday = result?.e1RMToday ?? calculatedE1RMToday;

    const previousBest1RM = Number(best1RMs?.[result.lift]) || 0;
    const previousBestE1RM = Number(bestE1RMs?.[result.lift]) || Number(prs?.[result.lift]) || 0;

    const best1RM = Math.max(previousBest1RM, oneRMToday || 0);
    const bestE1RM = Math.max(previousBestE1RM, e1RMToday || 0);

    return {
      lift: result.lift,
      oneRMToday,
      e1RMToday,
      best1RM,
      bestE1RM,
      is1RMPR: oneRMToday > previousBest1RM && oneRMToday > 0,
      isE1RMPR: e1RMToday > previousBestE1RM && e1RMToday > 0,
    };
  });
}

// Legacy completed summaries retain the real 1RM that was already
// established before that workout. This is distinct from `best1RM`: older
// training summaries could accidentally let a heavy multi-rep weight raise
// that field. The previous value is the stable historical baseline and lets
// migrations and running-best charts place an older meet result at an older
// history point instead of inventing a jump at today's endpoint.
export function getEstablishedOneRMFromHistoryEntry(entry, lift = entry?.lift) {
  if (!LIFT_ORDER.includes(lift)) return 0;

  const summary = entry?.workoutSnapshot?.completedSummary;
  const summaryResults = Array.isArray(summary?.results)
    ? summary.results
    : summary?.lift
      ? [summary]
      : [];

  return Math.max(
    entry?.lift === lift ? Number(entry.previousBest1RM) || 0 : 0,
    ...summaryResults
      .filter(summaryResult => summaryResult?.lift === lift)
      .map(summaryResult => Number(summaryResult.previousBest1RM) || 0)
  );
}

export function getHistoryMaxCandidates(entry) {
  if (!entry || !LIFT_ORDER.includes(entry.lift)) {
    return { oneRM: 0, e1rm: 0 };
  }

  if (entry.manualMax || entry.seedMax) {
    const manualOneRM = Number(entry.topWeight) || Number(entry.oneRMToday) || 0;
    const manualE1RM = Number(entry.e1rm) || Number(entry.e1RMToday) || manualOneRM;

    // A seed/manual max is a real lifted baseline, not a formula estimate.
    // Preserve its valid 2.5kg precision so a later rounded training e1RM
    // can show the real PR delta (97.5 -> 100 = +2.5, not +0).
    return { oneRM: manualOneRM, e1rm: manualE1RM };
  }

  const snapshot = entry.workoutSnapshot || entry;
  const snapshotSets = getSmartLiftSetsFromSnapshot(snapshot, entry.lift);
  const hasStructuredSetEvidence = snapshotSets.length > 0;
  const entryTopReps = Number(entry.topReps) || 0;
  const legacyTopWeight = !hasStructuredSetEvidence && entryTopReps <= 0
    ? Number(entry.topWeight) || Number(entry.oneRMToday) || 0
    : 0;
  const oneRMCandidates = [
    getActualOneRMFromSets(snapshotSets),
    entryTopReps === 1 ? Number(entry.topWeight) || 0 : 0,
    entryTopReps === 1 ? Number(entry.oneRMToday) || 0 : 0,
    legacyTopWeight,
  ];

  const e1RMCandidates = [
    Number(entry.e1rm) || 0,
    Number(entry.e1RMToday) || 0,
    Number(entry.bestE1RM) || 0,
    Number(entry.previousBestE1RM) || 0,
  ];

  const summary = snapshot?.completedSummary;
  const summaryResults = Array.isArray(summary?.results)
    ? summary.results
    : summary?.lift
      ? [summary]
      : [];

  summaryResults
    .filter(result => result?.lift === entry.lift)
    .forEach(result => {
      const resultTopReps = Number(result?.topSet?.reps) || 0;
      oneRMCandidates.push(
        resultTopReps === 1 ? Number(result.oneRMToday) || 0 : 0
      );
      e1RMCandidates.push(
        Number(result.e1RMToday) || 0,
        Number(result.bestE1RM) || 0,
        Number(result.previousBestE1RM) || 0
      );
    });

  return {
    oneRM: Math.max(0, ...oneRMCandidates),
    // Historical charts must retain the value that was actually stored at
    // the time. Barbell rounding belongs at the current/readiness boundary,
    // never retroactively in the history reader.
    e1rm: Math.max(0, ...e1RMCandidates),
  };
}

export function calculateBestMaxesFromHistory(history = []) {
  const best = LIFT_ORDER.reduce((acc, lift) => ({
    ...acc,
    [lift]: { oneRM: 0, e1rm: 0 },
  }), {});

  (history || []).forEach(entry => {
    if (!entry || !LIFT_ORDER.includes(entry.lift)) return;

    const candidates = getHistoryMaxCandidates(entry);

    best[entry.lift] = entry.manualMax
      ? {
          oneRM: candidates.oneRM,
          e1rm: candidates.e1rm,
        }
      : {
          oneRM: Math.max(best[entry.lift].oneRM, candidates.oneRM),
          e1rm: Math.max(best[entry.lift].e1rm, candidates.e1rm),
        };
  });

  return best;
}

export function getAchievedHistoryMaxCandidates(entry = {}) {
  if (
    !entry ||
    !LIFT_ORDER.includes(entry.lift) ||
    entry.manualMax ||
    entry.seedMax ||
    entry.completionOnly ||
    entry.restDay
  ) {
    return { oneRM: 0, e1rm: 0 };
  }

  const snapshot = entry.workoutSnapshot || entry;
  const snapshotType = String(
    snapshot?.smartDayType || snapshot?.type || ''
  ).trim().toLowerCase();

  if (['rest', 'recovery', 'deload'].includes(snapshotType)) {
    return { oneRM: 0, e1rm: 0 };
  }

  const successfulSets = getSmartLiftSetsFromSnapshot(
    snapshot,
    entry.lift
  ).filter(set =>
    set?.done === true &&
    !set?.failed &&
    !set?.skipped &&
    !set?.warmup &&
    !set?.isWarmup &&
    Number(set?.weight) > 0 &&
    Number(set?.reps) > 0
  );

  const summary = snapshot?.completedSummary;
  const summaryResults = Array.isArray(summary?.results)
    ? summary.results
    : summary?.lift
      ? [summary]
      : [];
  const matchingSummaryResults = summaryResults.filter(
    result => result?.lift === entry.lift
  );

  const entryTopReps = Number(entry.topReps) || 0;
  const oneRMCandidates = [
    getActualOneRMFromSets(successfulSets),
    entryTopReps === 1 ? Number(entry.oneRMToday) || 0 : 0,
    entryTopReps === 1 ? Number(entry.topWeight) || 0 : 0,
    ...matchingSummaryResults.map(result => (
      Number(result?.topSet?.reps) === 1
        ? Number(result.oneRMToday) || 0
        : 0
    )),
  ];

  const e1RMCandidates = [
    Number(entry.e1rm) || 0,
    Number(entry.e1RMToday) || 0,
    ...matchingSummaryResults.map(
      result => Number(result.e1RMToday) || 0
    ),
    ...successfulSets.map(set =>
      epley(Number(set.weight) || 0, Number(set.reps) || 0)
    ),
  ];

  return {
    oneRM: Math.max(0, ...oneRMCandidates),
    e1rm: Math.max(0, ...e1RMCandidates),
  };
}

export function calculateAchievedMaxesFromHistory(history = []) {
  const best = LIFT_ORDER.reduce((acc, lift) => ({
    ...acc,
    [lift]: { oneRM: 0, e1rm: 0 },
  }), {});

  (history || []).forEach(entry => {
    if (!entry || !LIFT_ORDER.includes(entry.lift)) return;

    const candidates = getAchievedHistoryMaxCandidates(entry);

    best[entry.lift] = {
      oneRM: Math.max(best[entry.lift].oneRM, candidates.oneRM),
      e1rm: Math.max(best[entry.lift].e1rm, candidates.e1rm),
    };
  });

  return best;
}

// The same current-cycle filter buildSmartMeetPlanReadiness uses internally
// to decide meet-plan blockers. Exported so any live UI (the dashboard, the
// Smart modal) can compute the identical cycle-scoped best e1RM directly
// from history instead of a workout snapshot, which can go stale for days
// and - critically - must never be substituted with an all-time best, or a
// past cycle's PR can make this cycle look "blocker-free" while the
// blocker list (computed from this same scoped value) still lists it.
export function getCurrentCycleBestMaxes(history = [], currentCycle) {
  const currentCycleEntries = (history || []).filter(entry =>
    Number(entry?.cycle) === Number(currentCycle) &&
    Number(entry?.workoutNumber) > 0 &&
    !entry?.manualMax &&
    !entry?.seedMax
  );

  return calculateAchievedMaxesFromHistory(currentCycleEntries);
}

export function calculatePrsFromHistory(history = []) {
  const best = calculateBestMaxesFromHistory(history);

  return {
    Squat: best.Squat.e1rm || 0,
    Bench: best.Bench.e1rm || 0,
    Deadlift: best.Deadlift.e1rm || 0,
  };
}

export function mergeHigherPrs(current = {}, candidate = {}) {
  return LIFT_ORDER.reduce((next, lift) => {
    next[lift] = roundE1RM(Math.max(
      Number(current?.[lift]) || 0,
      Number(candidate?.[lift]) || 0
    ));

    return next;
  }, { ...(current || {}) });
}

export function getEntryCycle(entry) {
  return Number(entry.cycle) || 1;
}

export function getEntryWorkoutNumber(entry) {
  const workoutNumber = Number(entry.workoutNumber);
  return Number.isFinite(workoutNumber) ? workoutNumber : 0;
}

export function getAbsoluteWorkoutIndex(entry) {
  return ((getEntryCycle(entry) - 1) * 28) + getEntryWorkoutNumber(entry);
}

export function getWorkoutLabel(entry) {
  return `C${getEntryCycle(entry)}W${getEntryWorkoutNumber(entry)}`;
}

export function formatWorkoutProgressLabel({ t, workoutNumber, totalWorkouts = null, smartModel = false }) {
  const safeWorkoutNumber = Math.max(Number(workoutNumber) || 1, 1);

  if (smartModel) {
    return `${t.workoutProgress} ${safeWorkoutNumber}`;
  }

  const safeTotalWorkouts = Math.max(Number(totalWorkouts) || safeWorkoutNumber, safeWorkoutNumber);

  return `${t.workoutProgress} ${Math.min(safeWorkoutNumber, safeTotalWorkouts)} / ${safeTotalWorkouts}`;
}

export function formatCycleWorkoutSubtitle({ t, currentCycle, workoutNumber, totalWorkouts = null, smartModel = false, suffix = '' }) {
  return `${t.cycle} ${currentCycle} · ${formatWorkoutProgressLabel({
    t,
    workoutNumber,
    totalWorkouts,
    smartModel,
  })}${suffix}`;
}

// Experience-tier thresholds, in total-e1RM-to-bodyweight ratio ("eStrength").
// Deliberately unisex - the app treats every athlete the same way. Grounded
// in openpowerlifting.org all-tested rankings (e.g. the strongest raw
// lifters of all time sit around a 9-10x-bodyweight total).
export const ATHLETE_LEVEL_THRESHOLDS = Object.freeze({
  beginner: { min: 0, max: 3 },
  intermediate: { min: 3, max: 6 },
  advanced: { min: 6, max: 9 },
  elite: { min: 9, max: Infinity },
});

export function classifyAthleteLevel(eStrengthRatio) {
  const ratio = Number(eStrengthRatio) || 0;

  if (ratio >= ATHLETE_LEVEL_THRESHOLDS.elite.min) return 'elite';
  if (ratio >= ATHLETE_LEVEL_THRESHOLDS.advanced.min) return 'advanced';
  if (ratio >= ATHLETE_LEVEL_THRESHOLDS.intermediate.min) return 'intermediate';
  return 'beginner';
}

// Same total-e1RM-to-bodyweight ratio shown on the Dashboard/Stats screens
// (formerly computed inline in App.js) - factored out here so it can be
// derived from either live component state or freshly-loaded/restored data
// (e.g. right after a backup restore, before that data has reached state).
export function calculateEStrengthRatio({ prs = {}, history = [], bodyWeights = [] } = {}) {
  const bestMaxes = calculateBestMaxesFromHistory(history);
  const totalE1RM = LIFT_ORDER.reduce((sum, lift) => (
    sum + Math.max(Number(prs?.[lift]) || 0, Number(bestMaxes?.[lift]?.e1rm) || 0)
  ), 0);
  const latestBodyWeightEntry = [...(Array.isArray(bodyWeights) ? bodyWeights : [])]
    .filter(entry => entry?.bodyWeight)
    .slice(-1)[0];
  const latestBodyWeight = latestBodyWeightEntry?.bodyWeight || null;

  if (!latestBodyWeight) return null;

  return Math.round((totalE1RM / latestBodyWeight) * 100) / 100;
}

// Strength maxima are lifetime records of a *validly paired* strength total
// and bodyweight. A later PR must never be retroactively combined with an
// older, lighter weigh-in. This lets Smart Training use a stable experience
// tier while the ordinary current Strength/eStrength values may still move
// with today's bodyweight.
export function calculateStrengthRatioMaxes({
  prs = {},
  oneRMs = {},
  history = [],
  bodyWeights = [],
} = {}) {
  const sortedHistory = [...(Array.isArray(history) ? history : [])]
    .filter(entry => entry?.lift && LIFT_ORDER.includes(entry.lift))
    .sort((a, b) => getAbsoluteWorkoutIndex(a) - getAbsoluteWorkoutIndex(b));
  const sortedBodyWeights = [...(Array.isArray(bodyWeights) ? bodyWeights : [])]
    .filter(entry => Number(entry?.bodyWeight) > 0)
    .sort((a, b) => getAbsoluteWorkoutIndex(a) - getAbsoluteWorkoutIndex(b));
  const runningBest = Object.fromEntries(
    LIFT_ORDER.map(lift => [lift, { oneRM: 0, e1rm: 0 }])
  );
  let bodyIndex = 0;
  let activeBodyWeight = null;
  let strengthMax = 0;
  let eStrengthMax = 0;

  sortedHistory.forEach(entry => {
    const absoluteWorkoutIndex = getAbsoluteWorkoutIndex(entry);
    while (
      bodyIndex < sortedBodyWeights.length &&
      getAbsoluteWorkoutIndex(sortedBodyWeights[bodyIndex]) <= absoluteWorkoutIndex
    ) {
      activeBodyWeight = Number(sortedBodyWeights[bodyIndex].bodyWeight) || null;
      bodyIndex += 1;
    }

    if (entry.completionOnly) return;

    const candidates = getHistoryMaxCandidates(entry);
    if (candidates.oneRM <= 0 && candidates.e1rm <= 0) return;

    runningBest[entry.lift] = entry.manualMax
      ? { oneRM: candidates.oneRM, e1rm: candidates.e1rm }
      : {
          oneRM: Math.max(runningBest[entry.lift].oneRM, candidates.oneRM),
          e1rm: Math.max(runningBest[entry.lift].e1rm, candidates.e1rm),
        };

    if (!activeBodyWeight) return;

    const hasCompleteOneRMTotal = LIFT_ORDER.every(lift => runningBest[lift].oneRM > 0);
    const hasCompleteE1RMTotal = LIFT_ORDER.every(lift => (
      Math.max(runningBest[lift].oneRM, runningBest[lift].e1rm) > 0
    ));

    if (hasCompleteOneRMTotal) {
      const totalOneRM = LIFT_ORDER.reduce(
        (sum, lift) => sum + runningBest[lift].oneRM,
        0
      );
      strengthMax = Math.max(strengthMax, totalOneRM / activeBodyWeight);
    }

    if (hasCompleteE1RMTotal) {
      const totalE1RM = LIFT_ORDER.reduce(
        (sum, lift) => sum + Math.max(runningBest[lift].oneRM, runningBest[lift].e1rm),
        0
      );
      eStrengthMax = Math.max(eStrengthMax, totalE1RM / activeBodyWeight);
    }
  });

  // A weigh-in can happen between workouts. Record its then-available
  // running strength as well, otherwise a lighter legitimate weigh-in would
  // disappear from the max merely because no lift was completed that day.
  sortedBodyWeights.forEach(bodyEntry => {
    const bodyWeight = Number(bodyEntry.bodyWeight) || 0;
    if (!(bodyWeight > 0)) return;

    const maxesAtWeighIn = calculateBestMaxesFromHistory(
      sortedHistory.filter(entry =>
        getAbsoluteWorkoutIndex(entry) <= getAbsoluteWorkoutIndex(bodyEntry)
      )
    );
    const hasRecordedStrengthAtWeighIn = LIFT_ORDER.every(lift =>
      Number(maxesAtWeighIn?.[lift]?.oneRM) > 0
    );
    const hasRecordedEStrengthAtWeighIn = LIFT_ORDER.every(lift => (
      Math.max(
        Number(maxesAtWeighIn?.[lift]?.oneRM) || 0,
        Number(maxesAtWeighIn?.[lift]?.e1rm) || 0
      ) > 0
    ));

    if (hasRecordedStrengthAtWeighIn) {
      const totalOneRMAtWeighIn = LIFT_ORDER.reduce((sum, lift) => (
        sum + (Number(maxesAtWeighIn?.[lift]?.oneRM) || 0)
      ), 0);
      strengthMax = Math.max(strengthMax, totalOneRMAtWeighIn / bodyWeight);
    }

    if (hasRecordedEStrengthAtWeighIn) {
      const totalE1RMAtWeighIn = LIFT_ORDER.reduce((sum, lift) => (
        sum + Math.max(
          Number(maxesAtWeighIn?.[lift]?.oneRM) || 0,
          Number(maxesAtWeighIn?.[lift]?.e1rm) || 0
        )
      ), 0);
      eStrengthMax = Math.max(eStrengthMax, totalE1RMAtWeighIn / bodyWeight);
    }
  });

  const bestMaxes = calculateBestMaxesFromHistory(history);
  const hasExplicitOneRMs = LIFT_ORDER.every(lift => Number(oneRMs?.[lift]) > 0);
  const hasRecordedOneRMs = LIFT_ORDER.every(lift => Number(bestMaxes?.[lift]?.oneRM) > 0);
  const currentOneRMs = Object.fromEntries(LIFT_ORDER.map(lift => [
    lift,
    hasExplicitOneRMs
      ? Math.max(Number(oneRMs?.[lift]) || 0, Number(bestMaxes?.[lift]?.oneRM) || 0)
      : hasRecordedOneRMs
        ? Number(bestMaxes?.[lift]?.oneRM) || 0
        : 0,
  ]));
  const currentE1RMs = Object.fromEntries(LIFT_ORDER.map(lift => [
    lift,
    Math.max(
      Number(currentOneRMs[lift]) || 0,
      Number(prs?.[lift]) || 0,
      Number(bestMaxes?.[lift]?.e1rm) || 0
    ),
  ]));
  const hasCurrentOneRMTotal = LIFT_ORDER.every(lift => currentOneRMs[lift] > 0);
  const hasCurrentE1RMTotal = LIFT_ORDER.every(lift => currentE1RMs[lift] > 0);
  const latestBodyWeight = Number(
    [...(Array.isArray(bodyWeights) ? bodyWeights : [])]
      .filter(entry => Number(entry?.bodyWeight) > 0)
      .at(-1)?.bodyWeight
  ) || 0;

  if (latestBodyWeight > 0) {
    if (hasCurrentOneRMTotal) {
      const totalOneRM = LIFT_ORDER.reduce(
        (sum, lift) => sum + currentOneRMs[lift],
        0
      );
      strengthMax = Math.max(strengthMax, totalOneRM / latestBodyWeight);
    }

    if (hasCurrentE1RMTotal) {
      const totalE1RM = LIFT_ORDER.reduce(
        (sum, lift) => sum + currentE1RMs[lift],
        0
      );
      eStrengthMax = Math.max(eStrengthMax, totalE1RM / latestBodyWeight);
    }
  }

  return {
    strengthMax: strengthMax > 0 ? Math.round(strengthMax * 100) / 100 : null,
    eStrengthMax: eStrengthMax > 0 ? Math.round(eStrengthMax * 100) / 100 : null,
  };
}

export function getAthleteLevel({ prs, history, bodyWeights } = {}) {
  return classifyAthleteLevel(
    calculateStrengthRatioMaxes({ prs, history, bodyWeights }).eStrengthMax
  );
}

export function formatSetPercentDisplay(pct) {
  const value = Number(pct);

  if (!Number.isFinite(value) || value <= 0) return null;

  // App-wide display convention: percentages round to the nearest 2.5%
  // while the exact ratio remains available internally.
  const percent = value * 100;
  const roundedStep = Math.round(percent / 2.5) * 2.5;

  return formatDecimalDisplay(roundedStep, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

// A history entry is "completed" once it has a valid workout number and
// either a full snapshot or a recorded lift - used to decide whether a
// workout slot has actually been trained, not just planned.
export function isCompletedHistoryEntry(entry) {
  if (!entry) return false;

  const hasWorkoutNumber =
    Number.isFinite(Number(entry.workoutNumber)) &&
    Number(entry.workoutNumber) > 0;

  if (entry.workoutSnapshot) {
    return hasWorkoutNumber;
  }

  return Boolean(hasWorkoutNumber && entry.lift);
}

export function getCompletedWorkoutCount(history, currentCycle) {
  return getCompletedWorkoutNumbers(history, currentCycle).size;
}

export function getCompletedWorkoutNumbers(history, currentCycle) {
  return new Set(
    (history || [])
      .filter(entry => Number(entry.cycle) === Number(currentCycle))
      .filter(isCompletedHistoryEntry)
      .map(entry => Number(entry.workoutNumber))
      .filter(number => Number.isFinite(number))
  );
}

export function getRestorableSelectedIndex(inProgress, currentCycle, totalWorkouts) {
  const selectedIndex = Number(inProgress?.selectedIndex);

  if (
    !inProgress ||
    inProgress.currentCycle !== currentCycle ||
    !Number.isFinite(selectedIndex) ||
    totalWorkouts <= 0
  ) {
    return null;
  }

  return Math.max(0, Math.min(selectedIndex, totalWorkouts - 1));
}

export function normalizeBodyWeights(data) {
  const entries = [];

  function normalizedBodyEntry(entry, fallbackWorkoutNumber = 0) {
    const bodyData = {
      bodyWeight: toOptionalNumber(entry.bodyWeight || entry.weight || entry.bodyWeightToday),
      bodyFat: toOptionalNumber(entry.bodyFat),
      bodyWater: toOptionalNumber(entry.bodyWater),
      visceralFat: toOptionalNumber(entry.visceralFat),
      leanMass: toOptionalNumber(entry.leanMass),
      physiqueRating: toOptionalNumber(entry.physiqueRating),
    };

    const hasAnyBodyData = Object.values(bodyData).some(value => value !== null);
    if (!hasAnyBodyData) return null;

    return {
      workoutNumber: Number.isFinite(Number(entry.workoutNumber))
        ? Number(entry.workoutNumber)
        : fallbackWorkoutNumber,
      cycle: getEntryCycle(entry),
      date: entry.date || new Date().toLocaleDateString('nl-NL'),
      timestamp: entry.timestamp || new Date().toISOString(),
      ...bodyData,
    };
  }

  (data.bodyWeights || []).forEach((entry, index) => {
    const normalized = normalizedBodyEntry(entry, index);
    if (normalized) entries.push(normalized);
  });

  (data.history || []).forEach(entry => {
    const normalized = normalizedBodyEntry(entry, 0);
    if (normalized) entries.push(normalized);
  });

  if (data.bodyWeightToday) {
    const completedWorkouts = (data.history || []).filter(
      h => h.lift && h.workoutNumber > 0
    ).length;

    const normalized = normalizedBodyEntry({
      workoutNumber: completedWorkouts,
      bodyWeight: data.bodyWeightToday,
    }, completedWorkouts);

    if (normalized) entries.push(normalized);
  }

  const byWorkout = {};

  entries.forEach(entry => {
    byWorkout[`${getEntryCycle(entry)}-${entry.workoutNumber}`] = entry;
  });

  return Object.values(byWorkout).sort(
    (a, b) => getAbsoluteWorkoutIndex(a) - getAbsoluteWorkoutIndex(b)
  );
}
