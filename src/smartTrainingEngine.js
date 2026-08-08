import {
  buildSmartLiftPrescription,
  buildSmartLiftStates,
  rankSmartLiftPriorities,
  EXPOSURE_TARGETS_BY_LEVEL,
  SMART_LIFTS,
} from './smartPrescriptionEngine';
import { constrainSmartWorkoutByFrequency, getSmartFrequencyPolicyDecision, roundBarbellWeight, normalizeAthleteLevel, getSmartFrequencyScoreTargets, computeSmartFrequencyScoreState } from './smartFrequencyPolicy';
import {
  TRAINING_MODELS,
  SMART_DAY_TYPES,
  SMART_DECISION_REASONS,
  SMART_OVERRIDES,
  SMART_THRESHOLDS,
  SMART_SECONDARY_EXPOSURE_WEIGHT,
  SMART_DELOAD,
  SMART_PRESCRIPTION_VERSION,
  SMART_GENERATED_FLAGS,
  getSmartMaxConsecutiveTrainingDays,
  MEET_ATTEMPT_KEYS,
} from './smartTrainingConstants';
import {
  LIFT_ORDER,
  isTopSetLabel,
  getSmartLiftSetsFromSnapshot,
  calculateBestMaxesFromHistory,
  getAchievedHistoryMaxCandidates,
  calculateAchievedMaxesFromHistory,
  getEntryCycle,
  getCompletedWorkoutNumbers,
  roundE1RM,
} from './workoutHistoryStats';
import {
  normalizeBenchPressVariant,
  normalizeSquatVariant,
  normalizeDeadliftVariant,
  normalizeProgramProfile,
  isSmartTrainingModel,
  normalizePreparationMode,
} from './programProfiles';
import {
  removeDeprecatedPrepItemsFromWorkouts,
  generateWarmups,
  generatePrepItems,
  roundMeetWeight,
} from './warmupAndPrepGeneration';
import {
  generateAccessoriesForLift,
  selectSmartAccessoriesForWorkout,
  applyAccessoryPlanToWorkouts,
} from './accessoryGeneration';
import { generateProgramForProfile } from './classicProgramTemplates';
import { buildMeetAttemptsFromOneRM } from './meetAttemptPlanning';

export function regenerateSmartWorkoutsAfterCompletion({
  workouts = [],
  finishedWorkout = null,
  completedIndex = -1,
  nextHistory = [],
  currentCycle = 1,
  nextWorkoutIndex = 0,
  generationOptions = {},
} = {}) {
  const normalizedCompletedIndex = Number(completedIndex);
  const normalizedNextWorkoutIndex = Math.max(
    0,
    Number(nextWorkoutIndex) || 0
  );

  if (
    !finishedWorkout ||
    !Number.isInteger(normalizedCompletedIndex) ||
    normalizedCompletedIndex < 0
  ) {
    return workouts;
  }

  const generatedWorkouts = generateWorkoutsForTrainingModel(
    TRAINING_MODELS.SMART,
    {
      ...generationOptions,
      history: nextHistory,
      currentIndex: normalizedNextWorkoutIndex,
      currentCycle,
    }
  );

  const workoutsWithCompletedSnapshot = (workouts || []).map(
    (workout, index) =>
      index === normalizedCompletedIndex
        ? finishedWorkout
        : workout
  );

  const activeWorkoutNumber =
    Number(generatedWorkouts[normalizedNextWorkoutIndex]?.number) ||
    normalizedNextWorkoutIndex + 1;

  return removeDeprecatedPrepItemsFromWorkouts(
    applyAccessoryPlanToWorkouts(
      workoutsWithCompletedSnapshot,
      generatedWorkouts,
      getCompletedWorkoutNumbers(nextHistory, currentCycle),
      activeWorkoutNumber
    )
  );
}



function buildSmartTrainingContext({
  history = [],
  currentIndex = 0,
  currentCycle = 1,
} = {}) {
  const normalizedCycle = Number(currentCycle) || 1;
  const normalizedCurrentIndex = Math.max(0, Number(currentIndex) || 0);
  const fullHistory = history || [];
  const cycleHistory = fullHistory.filter(entry =>
    Number(entry?.cycle) === normalizedCycle
  );
  const completedWorkoutNumbers = [...new Set(
    cycleHistory
      .map(entry => Number(entry?.workoutNumber))
      .filter(number => Number.isFinite(number) && number > 0)
  )].sort((a, b) => a - b);

  const usedSmartSourceWorkoutNumbers = [...new Set(
    cycleHistory
      .map(entry => {
        const explicitSourceNumber = Number(entry?.workoutSnapshot?.smartSourceWorkoutNumber);
        if (Number.isFinite(explicitSourceNumber) && explicitSourceNumber > 0) {
          return explicitSourceNumber;
        }

        const snapshot = entry?.workoutSnapshot || {};
        const isGeneratedTraining = Boolean(snapshot?.[SMART_GENERATED_FLAGS.TRAINING]);
        if (isGeneratedTraining) {
          return Number(snapshot?.number) || Number(entry?.workoutNumber);
        }

        return 0;
      })
      .filter(number => Number.isFinite(number) && number > 0)
  )];

  return {
    history: fullHistory,
    currentIndex: normalizedCurrentIndex,
    currentCycle: normalizedCycle,
    completedWorkoutNumbers,
    usedSmartSourceWorkoutNumbers,
  };
}

function getSmartEffortScore(effort) {
  const normalizedEffort = String(effort || '').trim().toLowerCase();

  if (normalizedEffort === 'easy') return -1;
  if (normalizedEffort === 'good' || normalizedEffort === 'normal') return 0;
  if (normalizedEffort === 'hard') return 1;
  if (['toomuch', 'veryhard', 'max'].includes(normalizedEffort)) return 2;
  return 0;
}

function isSmartHardEffort(effort) {
  return getSmartEffortScore(effort) > 0;
}

function hasUnrecoveredSmartHardEffort(readiness = {}) {
  return (
    isSmartHardEffort(readiness.lastWorkoutEffort) &&
    !readiness.lastWasRecoveryIntervention
  );
}
export function countFailedOrSkippedSetsFromSnapshot(snapshot = {}) {
  const liftSets = (snapshot?.lifts || []).flatMap(liftBlock => liftBlock?.sets || []);
  const directSets = snapshot?.sets || [];
  const allSets = liftSets.length > 0 ? liftSets : directSets;

  return allSets.filter(set => set?.failed || set?.skipped).length;
}

function countFailedOrSkippedSetsForLiftFromSnapshot(snapshot = {}, lift = null) {
  if (!lift) return 0;

  const liftBlock = (snapshot?.lifts || []).find(block => block?.lift === lift);
  const sets = liftBlock
    ? (liftBlock.sets || [])
    : snapshot?.lift === lift
      ? (snapshot?.sets || [])
      : [];

  return sets.filter(set => set?.failed || set?.skipped).length;
}

function getSmartLiftSetEffortScoreFromSnapshot(snapshot = {}, lift = null) {
  return Math.max(
    0,
    ...getSmartLiftSetsFromSnapshot(snapshot, lift)
      .map(set => getSmartEffortScore(set?.effort))
  );
}

function getSmartLiftMaxPctFromSnapshot(snapshot = {}, lift = null) {
  return Math.max(
    0,
    ...getSmartLiftSetsFromSnapshot(snapshot, lift)
      .map(set => Number(set?.originalPct ?? set?.pct) || 0)
  );
}


function getWorkoutLiftNames(workout = {}) {
  const liftBlocks = workout?.lifts || [];
  const liftNames = liftBlocks
    .map(liftBlock => liftBlock?.lift)
    .filter(lift => LIFT_ORDER.includes(lift));

  if (liftNames.length > 0) return [...new Set(liftNames)];

  return LIFT_ORDER.includes(workout?.lift) ? [workout.lift] : [];
}

function countSharedWorkoutLifts(workout = {}, lifts = []) {
  const liftSet = new Set(lifts || []);
  return getWorkoutLiftNames(workout).filter(lift => liftSet.has(lift)).length;
}

function getSmartTrainingPrescriptionSignature(workout = {}) {
  const snapshots = Array.isArray(workout?.entries) && workout.entries.length > 0
    ? workout.entries.map(entry => entry?.workoutSnapshot || entry).filter(Boolean)
    : [workout];

  const snapshotSignatures = snapshots.map(snapshot => {
    const parts = [];
    const liftBlocks = Array.isArray(snapshot?.lifts) && snapshot.lifts.length > 0
      ? snapshot.lifts
      : LIFT_ORDER.includes(snapshot?.lift)
        ? [{ lift: snapshot.lift, sets: snapshot.sets || [] }]
        : [];

    liftBlocks.forEach(liftBlock => {
      const lift = liftBlock?.lift;
      if (!LIFT_ORDER.includes(lift)) return;

      (liftBlock.sets || []).forEach(set => {
        if (set?.warmup || set?.isWarmup) return;

        const reps = Number(set?.reps) || 0;
        const weight = Number(set?.weight ?? set?.originalWeight) || 0;
        const pct = Number(set?.pct ?? set?.originalPct) || 0;

        if (reps <= 0 || (weight <= 0 && pct <= 0)) return;

        parts.push(`${lift}:${reps}:${weight}:${pct}`);
      });
    });

    return [...new Set(parts)].sort().join('|');
  }).filter(Boolean);

  return [...new Set(snapshotSignatures)].sort().join('||');
}


function getSmartPrimaryLiftPrescriptionSignature(
  workout = {},
  targetLift = null
) {
  const snapshots =
    Array.isArray(workout?.entries) && workout.entries.length > 0
      ? workout.entries
        .map(entry => entry?.workoutSnapshot || entry)
        .filter(Boolean)
      : [workout];

  const signatures = snapshots.map(snapshot => {
    const liftBlocks =
      Array.isArray(snapshot?.lifts) ? snapshot.lifts : [];
    const primaryBlock =
      liftBlocks.find(block => block?.role === 'primary') ||
      liftBlocks[0];

    if (
      !primaryBlock ||
      (targetLift && primaryBlock.lift !== targetLift)
    ) {
      return '';
    }

    return getSmartTrainingPrescriptionSignature({
      lifts: [primaryBlock],
    });
  }).filter(Boolean);

  return [...new Set(signatures)].sort().join('||');
}


function normalizeSmartTrainingPrescriptionSignature(signature = '') {
  return String(signature || '')
    .split('||')
    .map(snapshot => [...new Set(
      snapshot.split('|').filter(Boolean)
    )].sort().join('|'))
    .filter(Boolean)
    .sort()
    .join('||');
}

function hasSameSmartTrainingPrescriptionAsLastWorkout(candidate = {}, readiness = {}) {
  const primaryLift =
    candidate?.lifts?.find(block => block?.role === 'primary')?.lift ||
    candidate?.lifts?.[0]?.lift ||
    candidate?.lift;
  const primarySignature = normalizeSmartTrainingPrescriptionSignature(
    getSmartPrimaryLiftPrescriptionSignature(candidate, primaryLift)
  );
  const recentPrimarySignatures = (
    readiness.recentPrimaryLiftPrescriptionSignaturesByLift?.[
      primaryLift
    ] || []
  ).map(normalizeSmartTrainingPrescriptionSignature);

  if (
    primarySignature &&
    recentPrimarySignatures.includes(primarySignature)
  ) {
    return true;
  }

  const candidateSignature = normalizeSmartTrainingPrescriptionSignature(
    getSmartTrainingPrescriptionSignature(candidate)
  );
  const recentSignatures = (
    Array.isArray(readiness.recentTrainingPrescriptionSignatures)
      ? readiness.recentTrainingPrescriptionSignatures
      : [readiness.lastWorkoutPrescriptionSignature].filter(Boolean)
  ).map(normalizeSmartTrainingPrescriptionSignature);

  return Boolean(
    candidateSignature &&
    recentSignatures.includes(candidateSignature)
  );
}


export function shouldVaryRepeatedSmartPrescription(
  candidate = {},
  readiness = {}
) {
  return Boolean(
    hasSameSmartTrainingPrescriptionAsLastWorkout(candidate, readiness) &&
    Number(readiness.recentFatigueScore) <
      SMART_THRESHOLDS.FATIGUE_RECOVERY_SCORE &&
    Number(readiness.recentFailedOrSkippedSetCount) === 0
  );
}

function getSmartPostMeetRecoveryTarget(day = {}) {
  const effort = day?.workoutEffort;
  const failedCount = Number(day?.failedOrSkippedSetCount) || 0;

  let target = 1;

  if (effort === 'easy') target = 0;
  if (effort === 'good') target = 1;
  if (effort === 'hard') target = 2;
  if (effort === 'tooMuch') target = 3;

  if (failedCount >= 2) target = 3;
  else if (failedCount >= 1) target = Math.max(target, 2);

  return Math.min(
    Math.max(target, 0),
    SMART_THRESHOLDS.POST_MEET_RECOVERY_MAX_DAYS
  );
}

function getSmartPostMeetRecoveryReason(day = {}) {
  if (!day) return null;

  const effort = day?.workoutEffort || 'good';
  const failedCount = Number(day?.failedOrSkippedSetCount) || 0;

  if (failedCount >= 2) return 'failed-skipped-2-plus';
  if (failedCount >= 1) return 'failed-skipped-1';

  return `meet-effort-${effort}`;
}


export function isSmartCycleCompleteAfterHistory(history = [], currentCycle = 1) {
  const readiness = buildSmartReadinessSignals({
    history,
    currentCycle,
  });

  return Boolean(
    readiness.lastMeetWorkoutNumber &&
    readiness.postMeetRecoveryTargetReached &&
    !readiness.inPostMeetRecovery
  );
}


export function buildSmartReadinessSignals(context = {}) {
  const targetCycle = Number(context.currentCycle) || 1;
  const smartMeetPlanReadiness = buildSmartMeetPlanReadiness({
    history: context.history || [],
    prs: context.prs || {},
    meetPlannerAttempts: context.meetPlannerAttempts || {},
    currentCycle: targetCycle,
  });

  const isMeetLikeHistoryEntry = entry =>
    entry?.smartDayType === SMART_DAY_TYPES.MEET ||
    entry?.type === 'meet' ||
    entry?.workoutSnapshot?.smartDayType === SMART_DAY_TYPES.MEET ||
    entry?.workoutSnapshot?.type === 'meet' ||
    entry?.workoutSnapshot?.completedSummary?.type === 'meet';

  const completedEntries = (context.history || [])
    .filter(entry => {
      const entryCycle = Number(getEntryCycle(entry)) || targetCycle;
      const isCurrentCycle = entryCycle === targetCycle;
      const isPriorMeet = entryCycle < targetCycle && isMeetLikeHistoryEntry(entry);

      return (
        (isCurrentCycle || isPriorMeet) &&
        Number(entry?.workoutNumber) > 0 &&
        !entry?.manualMax &&
        !entry?.seedMax &&
        (entry?.workoutSnapshot || entry?.restDay)
      );
    })
    .sort((a, b) =>
      (Number(getEntryCycle(a)) || targetCycle) - (Number(getEntryCycle(b)) || targetCycle) ||
      Number(a.workoutNumber) - Number(b.workoutNumber)
    );

  const workoutDays = [...completedEntries.reduce((map, entry) => {
    const workoutNumber = Number(entry?.workoutNumber);
    if (!Number.isFinite(workoutNumber) || workoutNumber <= 0) return map;

    const workoutCycle = Number(getEntryCycle(entry)) || targetCycle;
    const workoutKey = `${workoutCycle}:${workoutNumber}`;

    const current = map.get(workoutKey) || {
      cycle: workoutCycle,
      workoutNumber,
      entries: [],
      workoutEffort: null,
      restDay: false,
      type: null,
      smartDayType: null,
      failedOrSkippedSetCount: 0,
      failedOrSkippedSetCountsByLift: LIFT_ORDER.reduce((counts, lift) => ({
        ...counts,
        [lift]: 0,
      }), {}),
      setEffortScoresByLift: LIFT_ORDER.reduce((scores, lift) => ({
        ...scores,
        [lift]: 0,
      }), {}),
      heavyLiftByLift: LIFT_ORDER.reduce((flags, lift) => ({
        ...flags,
        [lift]: false,
      }), {}),
      maxPctByLift: LIFT_ORDER.reduce((values, lift) => ({
        ...values,
        [lift]: 0,
      }), {}),
      lifts: [],
    };

    const entryFailedCount =
      Number(entry?.failedOrSkippedSetCount) ||
      countFailedOrSkippedSetsFromSnapshot(entry?.workoutSnapshot);

    current.entries.push(entry);
    current.lifts = [...new Set([
      ...(current.lifts || []),
      ...getWorkoutLiftNames(entry?.workoutSnapshot || entry),
    ])];
    current.workoutEffort = current.workoutEffort || entry?.workoutEffort || null;
    current.type = current.type || entry?.type || entry?.workoutSnapshot?.type || entry?.workoutSnapshot?.completedSummary?.type || null;
    current.smartDayType = current.smartDayType || entry?.smartDayType || entry?.workoutSnapshot?.smartDayType || null;
    current.restDay =
      current.restDay ||
      Boolean(entry?.restDay) ||
      entry?.smartDayType === SMART_DAY_TYPES.RECOVERY;
    current.failedOrSkippedSetCount = Math.max(
      current.failedOrSkippedSetCount,
      entryFailedCount
    );

    LIFT_ORDER.forEach(lift => {
      const liftFailedCount = countFailedOrSkippedSetsForLiftFromSnapshot(
        entry?.workoutSnapshot,
        lift
      );

      current.failedOrSkippedSetCountsByLift[lift] = Math.max(
        Number(current.failedOrSkippedSetCountsByLift[lift]) || 0,
        liftFailedCount
      );

      current.setEffortScoresByLift[lift] = Math.max(
        Number(current.setEffortScoresByLift[lift]) || 0,
        getSmartLiftSetEffortScoreFromSnapshot(entry?.workoutSnapshot, lift)
      );

      current.heavyLiftByLift[lift] = Boolean(
        current.heavyLiftByLift[lift] ||
        isHeavySmartTrainingLift(entry?.workoutSnapshot || entry, lift) ||
        getSmartLiftSetEffortScoreFromSnapshot(entry?.workoutSnapshot, lift) > 0
      );

      current.maxPctByLift[lift] = Math.max(
        Number(current.maxPctByLift[lift]) || 0,
        getSmartLiftMaxPctFromSnapshot(entry?.workoutSnapshot, lift)
      );
    });

    if (
      entry?.lift &&
      LIFT_ORDER.includes(entry.lift) &&
      !(entry?.workoutSnapshot?.lifts || []).length
    ) {
      current.failedOrSkippedSetCountsByLift[entry.lift] = Math.max(
        Number(current.failedOrSkippedSetCountsByLift[entry.lift]) || 0,
        entryFailedCount
      );
    }

    map.set(workoutKey, current);
    return map;
  }, new Map()).values()].sort((a, b) =>
    Number(a.cycle) - Number(b.cycle) ||
    Number(a.workoutNumber) - Number(b.workoutNumber)
  );

  const lastDay = workoutDays[workoutDays.length - 1] || null;

  const historyEntriesForPostMeet = (context.history || [])
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) =>
      Number(entry?.workoutNumber) > 0 &&
      !entry?.manualMax &&
      !entry?.seedMax &&
      (entry?.workoutSnapshot || entry?.restDay)
    );

  const lastMeetHistoryIndex = historyEntriesForPostMeet.findLastIndex(({ entry }) =>
    isMeetLikeHistoryEntry(entry)
  );

  const lastMeetHistoryItem = lastMeetHistoryIndex >= 0
    ? historyEntriesForPostMeet[lastMeetHistoryIndex]
    : null;

  const postMeetHistoryEntries = lastMeetHistoryIndex >= 0
    ? historyEntriesForPostMeet.slice(lastMeetHistoryIndex + 1)
    : [];

  const lastMeetDayIndex = workoutDays.findLastIndex(day =>
    day.smartDayType === SMART_DAY_TYPES.MEET ||
    day.type === 'meet'
  );

  const lastMeetDayFromWorkoutDays = lastMeetDayIndex >= 0 ? workoutDays[lastMeetDayIndex] : null;

  const lastMeetDay = lastMeetDayFromWorkoutDays || (lastMeetHistoryItem ? {
    cycle: Number(getEntryCycle(lastMeetHistoryItem.entry)) || targetCycle,
    workoutNumber: Number(lastMeetHistoryItem.entry?.workoutNumber) || 0,
    entries: [lastMeetHistoryItem.entry],
    workoutEffort: lastMeetHistoryItem.entry?.workoutEffort || lastMeetHistoryItem.entry?.workoutSnapshot?.workoutEffort || null,
    restDay: false,
    type: lastMeetHistoryItem.entry?.type || lastMeetHistoryItem.entry?.workoutSnapshot?.type || lastMeetHistoryItem.entry?.workoutSnapshot?.completedSummary?.type || 'meet',
    smartDayType: lastMeetHistoryItem.entry?.smartDayType || lastMeetHistoryItem.entry?.workoutSnapshot?.smartDayType || SMART_DAY_TYPES.MEET,
    failedOrSkippedSetCount:
      Number(lastMeetHistoryItem.entry?.failedOrSkippedSetCount) ||
      countFailedOrSkippedSetsFromSnapshot(lastMeetHistoryItem.entry?.workoutSnapshot),
    failedOrSkippedSetCountsByLift: LIFT_ORDER.reduce((counts, lift) => ({
      ...counts,
      [lift]: countFailedOrSkippedSetsForLiftFromSnapshot(lastMeetHistoryItem.entry?.workoutSnapshot, lift),
    }), {}),
    lifts: getWorkoutLiftNames(lastMeetHistoryItem.entry?.workoutSnapshot || lastMeetHistoryItem.entry),
  } : null);

  const postMeetDaysFromWorkoutDays = lastMeetDayIndex >= 0
    ? workoutDays.slice(lastMeetDayIndex + 1)
    : [];

  const postMeetDaysFromHistory = postMeetHistoryEntries.reduce((days, { entry }) => {
    const workoutNumber = Number(entry?.workoutNumber);
    if (!Number.isFinite(workoutNumber) || workoutNumber <= 0) return days;

    const cycle = Number(getEntryCycle(entry)) || targetCycle;
    const key = `${cycle}:${workoutNumber}:${entry?.restDay ? 'rest' : entry?.workoutSnapshot?.type || entry?.type || 'workout'}`;
    const existing = days.get(key) || {
      cycle,
      workoutNumber,
      restDay: false,
      type: null,
      smartDayType: null,
      failedOrSkippedSetCount: 0,
    };

    existing.restDay =
      existing.restDay ||
      Boolean(entry?.restDay) ||
      entry?.smartDayType === SMART_DAY_TYPES.RECOVERY ||
      entry?.workoutSnapshot?.smartDayType === SMART_DAY_TYPES.RECOVERY ||
      entry?.workoutSnapshot?.type === 'rest';

    existing.type = existing.type || entry?.type || entry?.workoutSnapshot?.type || entry?.workoutSnapshot?.completedSummary?.type || null;
    existing.smartDayType = existing.smartDayType || entry?.smartDayType || entry?.workoutSnapshot?.smartDayType || null;
    existing.failedOrSkippedSetCount = Math.max(
      Number(existing.failedOrSkippedSetCount) || 0,
      Number(entry?.failedOrSkippedSetCount) || countFailedOrSkippedSetsFromSnapshot(entry?.workoutSnapshot)
    );

    days.set(key, existing);
    return days;
  }, new Map());

  const postMeetDays = postMeetDaysFromWorkoutDays.length > 0
    ? postMeetDaysFromWorkoutDays
    : [...postMeetDaysFromHistory.values()];
  const postMeetRecoveryTarget = lastMeetDay
    ? getSmartPostMeetRecoveryTarget(lastMeetDay)
    : 0;
  const postMeetRecoveryReason = lastMeetDay
    ? getSmartPostMeetRecoveryReason(lastMeetDay)
    : null;
  const postMeetRecoveryDaysCompleted = postMeetDays.filter(day =>
    day.restDay || day.smartDayType === SMART_DAY_TYPES.RECOVERY
  ).length;
  const postMeetTrainingDaysCompleted = postMeetDays.filter(day =>
    !day.restDay &&
    day.smartDayType !== SMART_DAY_TYPES.RECOVERY &&
    day.smartDayType !== SMART_DAY_TYPES.DELOAD &&
    day.smartDayType !== SMART_DAY_TYPES.MEET &&
    day.type !== 'meet'
  ).length;

  const postMeetAcuteRecoveryStillRelevant = Boolean(
    lastMeetDay &&
    postMeetTrainingDaysCompleted === 0
  );
  const inPostMeetRecovery = Boolean(
    lastMeetDay &&
    postMeetAcuteRecoveryStillRelevant &&
    postMeetRecoveryDaysCompleted < postMeetRecoveryTarget
  );
  const postMeetRecoveryTargetReached = Boolean(
    !lastMeetDay ||
    postMeetRecoveryDaysCompleted >= postMeetRecoveryTarget ||
    !postMeetAcuteRecoveryStillRelevant
  );
  const lastMeetFailedOrSkippedSetCount = Number(lastMeetDay?.failedOrSkippedSetCount) || 0;
  const lastMeetWasFailed = lastMeetFailedOrSkippedSetCount > 0;
  const postMeetMinimumTrainingTarget = lastMeetDay
    ? lastMeetWasFailed
      ? SMART_THRESHOLDS.POST_FAILED_MEET_MIN_TRAINING_DAYS
      : SMART_THRESHOLDS.POST_MEET_MIN_TRAINING_DAYS
    : 0;
  const postMeetMinimumTrainingTargetReached = Boolean(
    !lastMeetDay ||
    postMeetTrainingDaysCompleted >= postMeetMinimumTrainingTarget
  );
  const lastPostMeetTrainingEffort = String(lastDay?.workoutEffort || '')
    .trim()
    .toLowerCase();
  const hasSuccessfulPostMeetTraining = Boolean(
    postMeetTrainingDaysCompleted > 0 &&
    ['easy', 'good', 'hard', 'normal'].includes(lastPostMeetTrainingEffort) &&
    Number(lastDay?.failedOrSkippedSetCount) === 0
  );
  const inPostMeetTrainingCooldown = Boolean(
    lastMeetDay &&
    !postMeetMinimumTrainingTargetReached &&
    !hasSuccessfulPostMeetTraining
  );

  const lastRecoveryInterventionIndex = workoutDays.findLastIndex(day =>
    day.restDay ||
    day.smartDayType === SMART_DAY_TYPES.RECOVERY ||
    day.smartDayType === SMART_DAY_TYPES.DELOAD
  );
  const activeBlockDays = lastRecoveryInterventionIndex >= 0
    ? workoutDays.slice(lastRecoveryInterventionIndex + 1)
    : workoutDays;
  const activeBlockLiftExposureCounts = LIFT_ORDER.reduce((counts, lift) => ({
    ...counts,
    [lift]: activeBlockDays.filter(day => (day.lifts || []).includes(lift)).length,
  }), {});

  const trainingDaysOnly = workoutDays.filter(day =>
    !day.restDay &&
    day.smartDayType !== SMART_DAY_TYPES.RECOVERY &&
    day.smartDayType !== SMART_DAY_TYPES.DELOAD &&
    day.type !== 'rest'
  );

  const rollingTrainingDays = trainingDaysOnly.slice(-SMART_THRESHOLDS.ROLLING_TRAINING_DAYS);

  const rollingLiftExposureCounts = LIFT_ORDER.reduce((counts, lift) => ({
    ...counts,
    [lift]: rollingTrainingDays.filter(day => (day.lifts || []).includes(lift)).length,
  }), {});

  // The meet projection needs a steadier frequency estimate than the short
  // window used for same-day candidate scoring: in a 6-slot window, one day
  // entering or leaving swings the ratio by 1/6, and the projection's
  // 1/effectiveFrequency term amplifies that into large jumps in the
  // projected meet date after a single non-squat (or non-bench/deadlift) day.
  // Doubling the window for this estimate only halves that single-day
  // leverage without touching the shorter, more responsive window other
  // Smart Training logic (candidate scoring, safety checks) relies on.
  const projectionTrainingDays = trainingDaysOnly.slice(-SMART_THRESHOLDS.ROLLING_TRAINING_DAYS * 2);

  const projectionLiftExposureCounts = LIFT_ORDER.reduce((counts, lift) => ({
    ...counts,
    [lift]: projectionTrainingDays.filter(day => (day.lifts || []).includes(lift)).length,
  }), {});

  // A successful Smart exposure advances this lift's prescription even when
  // it is secondary or light: `getProgressionDecision` receives the same
  // good-feedback signal and raises its top-set percentage. The meet
  // projection must therefore count every usable lift exposure, not only
  // primary/heavy roles. Counting heavy roles alone made the calendar
  // projection materially later than the exact all-successful simulation.
  const projectionProgressionExposureCounts = LIFT_ORDER.reduce((counts, lift) => ({
    ...counts,
    [lift]: projectionTrainingDays.filter(day => (day.lifts || []).includes(lift)).length,
  }), {});

  const lastTrainingDay = rollingTrainingDays[rollingTrainingDays.length - 1] || null;
  const lastWorkoutWasHeavyTraining = Boolean(
    lastDay &&
    !lastDay.restDay &&
    lastDay.smartDayType !== SMART_DAY_TYPES.RECOVERY &&
    lastDay.smartDayType !== SMART_DAY_TYPES.DELOAD &&
    LIFT_ORDER.some(lift => Boolean(lastDay.heavyLiftByLift?.[lift]))
  );
  const lastTrainingDayWasLightOnly = Boolean(
    lastTrainingDay &&
    (lastTrainingDay.lifts || []).length > 0 &&
    (lastTrainingDay.lifts || []).every(
      lift => !lastTrainingDay.heavyLiftByLift?.[lift]
    )
  );
  const recentTrainingPrescriptionSignatures = rollingTrainingDays
    .slice(-SMART_THRESHOLDS.RECENT_PRESCRIPTION_TRAINING_DAYS)
    .map(day => getSmartTrainingPrescriptionSignature(day))
    .filter(Boolean);

  const recentPrimaryLiftPrescriptionSignaturesByLift =
    LIFT_ORDER.reduce((signatures, lift) => ({
      ...signatures,
      [lift]: rollingTrainingDays
        .map(day =>
          getSmartPrimaryLiftPrescriptionSignature(day, lift)
        )
        .filter(Boolean),
    }), {});

  const recentHeavyDeadliftDays = rollingTrainingDays
    .slice(-SMART_THRESHOLDS.HEAVY_DEADLIFT_LOOKBACK_DAYS)
    .filter(day => Boolean(day.heavyLiftByLift?.Deadlift));

  const recentLiftSetEffortScores = LIFT_ORDER.reduce((scores, lift) => ({
    ...scores,
    [lift]: rollingTrainingDays.reduce(
      (score, day) => score + (Number(day.setEffortScoresByLift?.[lift]) || 0),
      0
    ),
  }), {});

  const recentSharedLowerBodyFatigueScore =
    (Number(recentLiftSetEffortScores.Squat) || 0) +
    (Number(recentLiftSetEffortScores.Deadlift) || 0);

  const recentSquatExposureDays = rollingTrainingDays
    .filter(day => (Number(day.maxPctByLift?.Squat) || 0) > 0)
    .slice(-2);

  const recentSquatMaxPct = Math.max(
    0,
    ...recentSquatExposureDays.map(day => Number(day.maxPctByLift?.Squat) || 0)
  );

  const recentDays = activeBlockDays.slice(-SMART_THRESHOLDS.RECENT_DAYS);

  const recentHardCount = recentDays.filter(day =>
    isSmartHardEffort(day.workoutEffort)
  ).length;

  const recentEasyCount = recentDays.filter(day =>
    String(day.workoutEffort || '').trim().toLowerCase() === 'easy'
  ).length;

  const recentGoodCount = recentDays.filter(day =>
    String(day.workoutEffort || '').trim().toLowerCase() === 'good'
  ).length;

  const recentMaxCount = recentDays.filter(day =>
    String(day.workoutEffort || '').trim().toLowerCase() === 'max'
  ).length;

  const recentFailedOrSkippedSetCount = recentDays.reduce(
    (total, day) => total + day.failedOrSkippedSetCount,
    0
  );

  const recentFailedOrSkippedSetCountsByLift = LIFT_ORDER.reduce((counts, lift) => ({
    ...counts,
    [lift]: recentDays.reduce(
      (total, day) => total + (Number(day.failedOrSkippedSetCountsByLift?.[lift]) || 0),
      0
    ),
  }), {});

  const effortFatigueScore = recentDays.reduce(
    (score, day) => score + getSmartEffortScore(day.workoutEffort),
    0
  );

  const failedSetFatigueScore = Math.min(
    recentFailedOrSkippedSetCount,
    SMART_THRESHOLDS.FAILED_SET_FATIGUE_CAP
  );

  const recentFatigueScore =
    Math.max(effortFatigueScore, 0) + failedSetFatigueScore;
  const lastWasRecoveryIntervention = Boolean(
    lastDay?.restDay ||
    lastDay?.smartDayType === SMART_DAY_TYPES.RECOVERY ||
    lastDay?.smartDayType === SMART_DAY_TYPES.DELOAD
  );
  const profileExposureTargets =
    EXPOSURE_TARGETS_BY_LEVEL[normalizeAthleteLevel(context.athleteLevel)] ||
    EXPOSURE_TARGETS_BY_LEVEL.intermediate;
  const frequencyScoreTargets = getSmartFrequencyScoreTargets(
    normalizeAthleteLevel(context.athleteLevel)
  );
  const profileProgressionExposureTargets = LIFT_ORDER.reduce((targets, lift) => ({
    ...targets,
    [lift]: Number(frequencyScoreTargets?.[lift]?.defaultMix?.heavy) || 0,
  }), {});
  const meetProjection = buildSmartMeetWorkoutProjection({
    meetPlanReadiness: smartMeetPlanReadiness,
    currentCycle: targetCycle,
    currentWorkoutNumber: Math.max(
      1,
      (Number(context.currentIndex) || 0) + 1
    ),
    rollingLiftExposureCounts: projectionLiftExposureCounts,
    rollingProgressionExposureCounts: projectionProgressionExposureCounts,
    rollingTrainingDayCount: projectionTrainingDays.length,
    profileExposureTargets,
    profileProgressionExposureTargets,
    lastWasRecoveryIntervention,
    lastTrainingDayWasLightOnly,
  });

  return {
    completedCount: workoutDays.length,
    activeBlockCompletedCount: activeBlockDays.length,
    activeBlockLiftExposureCounts,
    rollingLiftExposureCounts,
    rollingTrainingDayCount: rollingTrainingDays.length,
    projectionLiftExposureCounts,
    projectionProgressionExposureCounts,
    projectionTrainingDayCount: projectionTrainingDays.length,
    recentLiftSetEffortScores,
    recentSharedLowerBodyFatigueScore,
    lastTrainingDayHeavyDeadlift: Boolean(lastTrainingDay?.heavyLiftByLift?.Deadlift),
    lastWorkoutWasHeavyTraining,
    lastTrainingDayWasLightOnly,
    recentHeavyDeadliftDayCount: recentHeavyDeadliftDays.length,
    recentSquatMaxPct,
    meetPlanReady: Boolean(smartMeetPlanReadiness.ready),
    // Stricter than meetPlanReady - stays false until every lift has also
    // indirectly demonstrated its third attempt, so the diagnosis keeps
    // pointing at that instead of going silent once the meet itself is
    // already schedulable.
    meetPlanFullyDemonstrated: Boolean(smartMeetPlanReadiness.fullyDemonstrated),
    meetPlanOpenerReady: Boolean(smartMeetPlanReadiness.openerReady),
    meetPlanSecondAttemptReady: Boolean(
      smartMeetPlanReadiness.secondAttemptReady
    ),
    meetPlanOpenerReadyCount:
      smartMeetPlanReadiness.openerReadyCount || 0,
    meetPlanSecondAttemptReadyCount:
      smartMeetPlanReadiness.secondAttemptReadyCount || 0,
    meetPlanThirdAttemptPotentialCount:
      smartMeetPlanReadiness.thirdAttemptPotentialCount || 0,
    meetPlanHasCurrentCycleEvidence: smartMeetPlanReadiness.hasCurrentCycleMeetEvidence,
    meetPlanReadiness: smartMeetPlanReadiness.byLift,
    meetPlanWeakestLift: smartMeetPlanReadiness.weakestLift || null,
    meetPlanWeakestPhase: smartMeetPlanReadiness.weakestPhase || null,
    meetPlanWeakestRatio: smartMeetPlanReadiness.weakestRatio || 0,
    meetPlanWeakestTarget: smartMeetPlanReadiness.weakestTarget || 0,
    meetPlanWeakestBestE1RM: smartMeetPlanReadiness.weakestBestE1RM || 0,
    meetProjection,
    meetdayBlockers: getSmartMeetdayBlockers({
      completedCount: activeBlockDays.length,
      activeBlockCompletedCount: activeBlockDays.length,
      activeBlockLiftExposureCounts,
      recentFatigueScore,
      recentFailedOrSkippedSetCount,
      meetPlanReady: Boolean(smartMeetPlanReadiness.ready),
      meetPlanFullyDemonstrated: Boolean(
        smartMeetPlanReadiness.fullyDemonstrated
      ),
      meetPlanOpenerReady: Boolean(smartMeetPlanReadiness.openerReady),
      meetPlanSecondAttemptReady: Boolean(
        smartMeetPlanReadiness.secondAttemptReady
      ),
      meetPlanReadiness: smartMeetPlanReadiness.byLift,
      lastWorkoutEffort: lastDay?.workoutEffort || null,
      lastWasRecoveryIntervention,
      lastMeetWorkoutNumber: Number(lastMeetDay?.workoutNumber) || 0,
      lastMeetFailedOrSkippedSetCount,
      lastMeetWasFailed,
      postMeetTrainingDaysCompleted,
      postMeetMinimumTrainingTarget,
      postMeetMinimumTrainingTargetReached,
      inPostMeetTrainingCooldown,
    }),
    lastWorkoutNumber: Number(lastDay?.workoutNumber) || 0,
    lastMeetWorkoutNumber: Number(lastMeetDay?.workoutNumber) || 0,
    lastWorkoutEffort: lastDay?.workoutEffort || null,
    lastWorkoutLifts: lastTrainingDay?.lifts || [],
    lastWorkoutPrimaryLift: (lastTrainingDay?.lifts || [])[0] || null,
    lastWorkoutPrescriptionSignature: getSmartTrainingPrescriptionSignature(lastTrainingDay || {}),
    recentTrainingPrescriptionSignatures,
    recentPrimaryLiftPrescriptionSignaturesByLift,
    lastSmartDayType: lastDay?.smartDayType || null,
    lastWasRestDay: Boolean(lastDay?.restDay || lastDay?.smartDayType === SMART_DAY_TYPES.RECOVERY),
    lastWasRecoveryIntervention,
    inPostMeetRecovery,
    postMeetRecoveryTarget,
    postMeetRecoveryReason,
    postMeetRecoveryDaysCompleted,
    postMeetRecoveryTargetReached,
    recentHardCount,
    recentEasyCount,
    recentGoodCount,
    recentMaxCount,
    recentFailedOrSkippedSetCount,
    recentFailedOrSkippedSetCountsByLift,
    effortFatigueScore,
    failedSetFatigueScore,
    recentFatigueScore,
    recentFailedMeetTrainingCooldown: Boolean(
      lastMeetWasFailed &&
      inPostMeetTrainingCooldown
    ),
  };
}

export function isHeavySmartTrainingLift(workout = {}, lift = null) {
  if (!lift || workout.smartDayType === SMART_DAY_TYPES.DELOAD) return false;

  const liftBlock = (workout.lifts || []).find(block => block?.lift === lift);
  const sets = liftBlock
    ? (liftBlock.sets || [])
    : workout.lift === lift
      ? (workout.sets || [])
      : [];

  return sets.some(set => {
    const label = String(set?.labelKey || set?.label || '').toLowerCase();
    const pct = Number(set?.pct) || 0;
    const reps = Number(set?.reps) || 0;

    return (
      label.includes('opener') ||
      label.includes('attempt') ||
      label.includes('max') ||
      label.includes('topsingle') ||
      label.includes('topdouble') ||
      (reps > 0 && reps <= 2 && pct >= 0.80) ||
      pct >= 0.85
    );
  });
}

export function isMaximalSmartTrainingLift(workout = {}, lift = null) {
  if (!lift || workout.smartDayType === SMART_DAY_TYPES.DELOAD) return false;

  const liftBlock = (workout.lifts || []).find(block => block?.lift === lift);
  const sets = liftBlock
    ? (liftBlock.sets || [])
    : workout.lift === lift
      ? (workout.sets || [])
      : [];

  return sets.some(set => {
    const label = String(set?.labelKey || set?.label || '').toLowerCase();
    const pct = Number(set?.pct) || 0;
    const reps = Number(set?.reps) || 0;

    return (
      label.includes('attempt') ||
      label.includes('max') ||
      label.includes('opener') ||
      (reps === 1 && pct >= 0.9)
    );
  });
}

export function violatesSmartTrainingSafety(candidate = {}, readiness = {}) {
  const hasHeavyDeadlift = isHeavySmartTrainingLift(candidate, 'Deadlift');
  const hasMaximalSquat = isMaximalSmartTrainingLift(candidate, 'Squat');
  const recentHeavyDeadliftDayCount =
    Number(readiness.recentHeavyDeadliftDayCount) || 0;
  const recentSquatMaxPct = Number(readiness.recentSquatMaxPct) || 0;

  if (
    readiness.lastWorkoutWasHeavyTraining &&
    isHeavySmartTrainingCandidate(candidate)
  ) {
    return true;
  }

  if (hasHeavyDeadlift && readiness.lastTrainingDayHeavyDeadlift) {
    return true;
  }

  if (hasMaximalSquat && recentHeavyDeadliftDayCount >= 2) {
    return true;
  }

  if (
    hasMaximalSquat &&
    recentSquatMaxPct > 0 &&
    recentSquatMaxPct < 0.8
  ) {
    return true;
  }

  return false;
}

export function repeatsHeavyPrimaryLift(candidate = {}, readiness = {}) {
  const lastPrimaryLift = readiness.lastWorkoutPrimaryLift || null;

  return Boolean(
    lastPrimaryLift &&
    hasUnrecoveredSmartHardEffort(readiness) &&
    isHeavySmartTrainingLift(candidate, lastPrimaryLift)
  );
}

function isHeavySmartTrainingCandidate(workout = {}) {
  if (workout.smartDayType === SMART_DAY_TYPES.DELOAD) return false;

  const label = String(workout.labelKey || workout.label || '').toLowerCase();
  const type = String(workout.type || '').toLowerCase();

  if (type === 'meet') return true;

  if (
    label.includes('heavy') ||
    label.includes('peak') ||
    label.includes('opener') ||
    label.includes('attempt') ||
    label.includes('max')
  ) {
    return true;
  }

  const allSets = [
    ...(workout.sets || []),
    ...(workout.lifts || []).flatMap(liftBlock => liftBlock.sets || []),
  ];

  return allSets.some(set => {
    const setLabel = String(set?.labelKey || set?.label || '').toLowerCase();
    const pct = Number(set?.pct) || 0;
    const reps = Number(set?.reps) || 0;

    return (
      setLabel.includes('opener') ||
      setLabel.includes('attempt') ||
      setLabel.includes('max') ||
      setLabel.includes('topsingle') ||
      setLabel.includes('topdouble') ||
      (reps <= 2 && pct >= 0.80) ||
      pct >= 0.85
    );
  });
}


export function isUltraLightSmartTrainingCandidate(workout = {}) {
  if (!workout || workout.type !== 'training') return false;

  const allSets = [
    ...(workout.sets || []),
    ...(workout.lifts || []).flatMap(liftBlock => liftBlock.sets || []),
  ];

  const pctSets = allSets
    .map(set => ({
      pct: Number(set?.pct) || 0,
      reps: Number(set?.reps) || 0,
    }))
    .filter(set => set.pct > 0);

  if (!pctSets.length) return false;

  return pctSets.every(set => set.pct <= 0.55 && set.reps <= 3);
}

export function hasEffectiveSmartTrainingStimulus(workout = {}) {
  if (!workout || workout.type !== 'training') return false;
  if (isUltraLightSmartTrainingCandidate(workout)) return false;

  const liftBlocks = (workout.lifts || []).length
    ? workout.lifts
    : workout.lift
      ? [{
        lift: workout.lift,
        sets: workout.sets || [],
      }]
      : [];

  if (!liftBlocks.length) return false;

  return liftBlocks.every(liftBlock => {
    const sets = liftBlock.sets || [];
    const hasHeavySingle = sets.some(set =>
      Number(set?.reps) === 1 &&
      Number(set?.pct) >= 0.85
    );

    if (!hasHeavySingle) {
      const effectiveSets = sets.filter(set =>
        Number(set?.pct) >= 0.60 &&
        Number(set?.reps) >= 3
      );

      return effectiveSets.length >= 2;
    }

    const backoffSets = sets.filter(set => {
      const label = String(set?.labelKey || '').toLowerCase();
      const reps = Number(set?.reps) || 0;
      const pct = Number(set?.pct) || 0;

      return (
        ['backoff', 'worksets'].includes(label) &&
        reps >= 4 &&
        reps <= 6 &&
        pct >= 0.60
      );
    });

    return backoffSets.length >= 4;
  });
}

function getSmartMeetProgressionEvidence(entries = [], lift = null) {
  const bestByWorkout = new Map();

  (entries || []).forEach(entry => {
    if (!entry || entry.lift !== lift) return;

    const workoutNumber = Number(entry.workoutNumber) || 0;
    const achievedE1RM = Number(
      getAchievedHistoryMaxCandidates(entry).e1rm
    ) || 0;

    if (workoutNumber <= 0 || achievedE1RM <= 0) return;

    bestByWorkout.set(
      workoutNumber,
      Math.max(
        Number(bestByWorkout.get(workoutNumber)) || 0,
        achievedE1RM
      )
    );
  });

  const observations = [...bestByWorkout.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([workoutNumber, e1rm]) => ({ workoutNumber, e1rm }));
  const gains = [];
  let runningBest = 0;

  observations.forEach(observation => {
    if (observation.e1rm <= runningBest) return;

    if (runningBest > 0) {
      gains.push(observation.e1rm - runningBest);
    }

    runningBest = observation.e1rm;
  });

  const recentGains = gains.slice(-3);
  const observedGainPerExposure = recentGains.length > 0
    ? recentGains.reduce((total, gain) => total + gain, 0) /
      recentGains.length
    : 0;

  return {
    successfulExposureCount: observations.length,
    progressionGainCount: gains.length,
    observedGainPerExposure,
  };
}

export function buildSmartMeetPlanReadiness({
  history = [],
  prs = {},
  meetPlannerAttempts = {},
  currentCycle = 1,
} = {}) {
  const bestMaxes = calculateBestMaxesFromHistory(history);
  const currentCycleEntries = (history || []).filter(entry =>
    Number(entry?.cycle) === Number(currentCycle) &&
    Number(entry?.workoutNumber) > 0 &&
    !entry?.manualMax &&
    !entry?.seedMax
  );
  const currentCycleBestMaxes =
    calculateAchievedMaxesFromHistory(currentCycleEntries);

  const byLift = LIFT_ORDER.reduce((acc, lift) => {
    const bestE1RM = roundE1RM(Math.max(
      Number(prs?.[lift]) || 0,
      Number(bestMaxes?.[lift]?.e1rm) || 0
    ));
    const currentCycleBestE1RM = roundE1RM(
      Number(currentCycleBestMaxes?.[lift]?.e1rm) || 0
    );
    // Meet attempts (opener/2nd/3rd) are meant to be percentages of a real,
    // achieved 1RM - not the estimated e1RM, which shifts every time a
    // sub-maximal training set (e.g. a top double) sets a new e1RM. Real
    // 1RM only moves when the athlete actually lifts a heavier weight,
    // which barely happens in training by design (near-meet singles are
    // avoided there) - so attempts naturally stay stable through a cycle
    // and only really move after a genuine new max, e.g. at the meet
    // itself. bestMaxes(...).oneRM already includes the onboarding-seeded
    // starting max in normal use, so this works from cycle 1 with no
    // training history yet. prs is only a fallback for the rare case where
    // no real single has ever been recorded at all (never a Math.max floor
    // - once a real oneRM exists, a later e1RM-only PR must not pull this
    // back up, or the exact "moving target" problem this exists to solve
    // comes right back).
    const bestOneRM = Number(bestMaxes?.[lift]?.oneRM) || Number(prs?.[lift]) || 0;

    const suggestedAttempts = buildMeetAttemptsFromOneRM(bestOneRM);
    const attempts = MEET_ATTEMPT_KEYS.reduce((attemptAcc, key) => {
      const custom = Number(meetPlannerAttempts?.[lift]?.[key]);
      return {
        ...attemptAcc,
        [key]: Number.isFinite(custom) && custom > 0
          ? roundMeetWeight(custom)
          : suggestedAttempts[key],
      };
    }, {});

    const plannedTopAttempt = Math.max(
      Number(attempts.opener) || 0,
      Number(attempts.secondAttempt) || 0,
      Number(attempts.thirdAttempt) || 0
    );
    const openerTargetAttempt = Number(attempts.opener) || 0;
    const secondAttemptSupportTarget =
      (Number(attempts.secondAttempt) || 0) *
      SMART_THRESHOLDS.MEETDAY_SECOND_ATTEMPT_SUPPORT_RATIO;
    const thirdAttemptPotentialTarget =
      (Number(attempts.thirdAttempt) || 0) *
      SMART_THRESHOLDS.MEETDAY_THIRD_ATTEMPT_POTENTIAL_RATIO;
    const hasCurrentCycleEvidence = currentCycleBestE1RM > 0;
    const openerReadinessRatio = openerTargetAttempt > 0
      ? currentCycleBestE1RM / openerTargetAttempt
      : 0;
    const secondAttemptReadinessRatio = secondAttemptSupportTarget > 0
      ? currentCycleBestE1RM / secondAttemptSupportTarget
      : 0;
    const thirdAttemptPotentialRatio = thirdAttemptPotentialTarget > 0
      ? currentCycleBestE1RM / thirdAttemptPotentialTarget
      : 0;
    // A real but sub-barbell-increment shortfall (e.g. 0.45kg) isn't a
    // meaningful training target and made the diagnosis show "Cycle e1RM:
    // 170 kg, 2nd support: 170 kg" while still calling the lift a blocker -
    // a flat contradiction between what's shown and what's claimed. Round
    // the GAP itself (not each side independently - rounding both sides
    // separately gives each up to 2.5kg of slack, so two values up to just
    // under 5kg apart could still land in the same bucket and look
    // "equal", which is too coarse for lighter lifters/lower target
    // weights) to the same 5kg step used everywhere else; a gap that
    // rounds to zero counts as met.
    const isEffectivelyMet = (current, target) =>
      target > 0 && roundBarbellWeight(target - current, 'nearest', 5) <= 0;
    const openerReady = isEffectivelyMet(
      currentCycleBestE1RM, openerTargetAttempt
    );
    const secondAttemptReady = isEffectivelyMet(
      currentCycleBestE1RM, secondAttemptSupportTarget
    );
    const thirdAttemptPotential = isEffectivelyMet(
      currentCycleBestE1RM, thirdAttemptPotentialTarget
    );
    const readinessPhase = !openerReady
      ? 'opener'
      : !secondAttemptReady
        ? 'second-attempt'
        : !thirdAttemptPotential
          ? 'third-attempt'
          : 'ready';
    const readinessTargetAttempt = readinessPhase === 'opener'
      ? openerTargetAttempt
      : readinessPhase === 'second-attempt'
        ? secondAttemptSupportTarget
        : thirdAttemptPotentialTarget;
    const readinessRatio = readinessTargetAttempt > 0
      ? bestE1RM / readinessTargetAttempt
      : 0;
    const currentCycleReadinessRatio = readinessTargetAttempt > 0
      ? currentCycleBestE1RM / readinessTargetAttempt
      : 0;
    const currentCycleTarget = readinessTargetAttempt;
    const currentCycleShortfall = hasCurrentCycleEvidence
      ? Math.max(0, currentCycleTarget - currentCycleBestE1RM)
      : null;
    const openerShortfall = hasCurrentCycleEvidence
      ? Math.max(0, openerTargetAttempt - currentCycleBestE1RM)
      : null;
    const meetReadinessShortfall = hasCurrentCycleEvidence
      ? Math.max(
        0,
        secondAttemptSupportTarget - currentCycleBestE1RM
      )
      : null;
    const progressionEvidence = getSmartMeetProgressionEvidence(
      currentCycleEntries,
      lift
    );
    const fallbackGainPerExposure = Math.max(
      SMART_THRESHOLDS.MEET_PROJECTION_MIN_GAIN_KG,
      (Number(prs?.[lift]) || currentCycleTarget || 0) *
        SMART_THRESHOLDS.MEET_PROJECTION_FALLBACK_GAIN_RATIO
    );
    const maximumCredibleGain = Math.max(
      fallbackGainPerExposure,
      currentCycleTarget * 0.05
    );
    const projectedGainPerExposure =
      progressionEvidence.observedGainPerExposure > 0
        ? Math.min(
          Math.max(
            progressionEvidence.observedGainPerExposure,
            fallbackGainPerExposure * 0.5
          ),
          maximumCredibleGain
        )
        : fallbackGainPerExposure;
    const projectedOpenerExposureCount = openerShortfall > 0
      ? Math.max(
        1,
        Math.ceil(openerShortfall / projectedGainPerExposure)
      )
      : 0;
    // A lift may still have several sequential readiness phases left. The
    // old projection counted only the currently active phase, so a Deadlift
    // still at opener readiness was projected as if it could jump directly
    // to third-attempt potential. Walk the phases in order and carry the
    // projected gains forward between them.
    const projectedPhaseTargets = [
      openerTargetAttempt,
      secondAttemptSupportTarget,
      thirdAttemptPotentialTarget,
    ];
    let projectedReadiness = currentCycleBestE1RM;
    let projectedExposureCount = 0;
    projectedPhaseTargets.forEach(target => {
      if (!(target > projectedReadiness)) return;
      const exposures = Math.max(
        1,
        Math.ceil((target - projectedReadiness) / projectedGainPerExposure)
      );
      projectedExposureCount += exposures;
      projectedReadiness += exposures * projectedGainPerExposure;
    });

    return {
      ...acc,
      [lift]: {
        bestE1RM,
        currentCycleBestE1RM,
        hasCurrentCycleEvidence,
        attempts,
        plannedTopAttempt,
        openerTargetAttempt,
        secondAttemptSupportTarget,
        thirdAttemptPotentialTarget,
        openerReadinessRatio,
        secondAttemptReadinessRatio,
        thirdAttemptPotentialRatio,
        openerReady,
        secondAttemptReady,
        thirdAttemptPotential,
        readinessPhase,
        readinessTargetAttempt,
        currentCycleTarget,
        currentCycleShortfall,
        openerShortfall,
        meetReadinessShortfall,
        readinessRatio,
        currentCycleReadinessRatio,
        successfulExposureCount:
          progressionEvidence.successfulExposureCount,
        progressionGainCount:
          progressionEvidence.progressionGainCount,
        observedGainPerExposure:
          progressionEvidence.observedGainPerExposure,
        projectedGainPerExposure,
        projectedOpenerExposureCount,
        projectedExposureCount,
        ready: openerReady && secondAttemptReady && thirdAttemptPotential,
      },
    };
  }, {});

  const hasCurrentCycleMeetEvidence = LIFT_ORDER.some(lift =>
    Number(byLift[lift]?.currentCycleBestE1RM) > 0
  );
  const openerReady = LIFT_ORDER.every(
    lift => byLift[lift]?.openerReady
  );
  const secondAttemptReady = LIFT_ORDER.every(
    lift => byLift[lift]?.secondAttemptReady
  );
  const thirdAttemptPotentialReady = LIFT_ORDER.every(
    lift => byLift[lift]?.thirdAttemptPotential
  );
  // Meet-day readiness deliberately stops at opener+second-attempt (the
  // third attempt is proven live at the meet, never rehearsed in training)
  // - this stays unchanged so it keeps controlling when the app actually
  // offers the meet day and schedules the taper.
  const ready = openerReady && secondAttemptReady;
  // A separate, stricter signal for the diagnosis/blocker display only: once
  // openers and second attempts are all met, the diagnosis should keep
  // pointing at whichever lift hasn't indirectly demonstrated its third
  // attempt yet, instead of going silent.
  const fullyDemonstrated = ready && thirdAttemptPotentialReady;
  const weakestPhase = !openerReady
    ? 'opener'
    : !secondAttemptReady
      ? 'second-attempt'
      : !thirdAttemptPotentialReady
        ? 'third-attempt'
        : 'ready';
  const weakestCandidates = weakestPhase === 'opener'
    ? LIFT_ORDER.filter(lift => !byLift[lift]?.openerReady)
    : weakestPhase === 'second-attempt'
      ? LIFT_ORDER.filter(lift => !byLift[lift]?.secondAttemptReady)
      : weakestPhase === 'third-attempt'
        ? LIFT_ORDER.filter(lift => !byLift[lift]?.thirdAttemptPotential)
        : [...LIFT_ORDER];
  const ratioForPhase = lift => weakestPhase === 'opener'
    ? Number(byLift[lift]?.openerReadinessRatio) || 0
    : weakestPhase === 'second-attempt'
      ? Number(byLift[lift]?.secondAttemptReadinessRatio) || 0
      : Number(byLift[lift]?.thirdAttemptPotentialRatio) || 0;
  const weakestLift = hasCurrentCycleMeetEvidence
    ? weakestCandidates
      .filter(lift => Number(byLift[lift]?.readinessTargetAttempt) > 0)
      .sort((a, b) => ratioForPhase(a) - ratioForPhase(b))[0] || null
    : null;

  // The first unmet readiness phase is the primary current blocker. This is
  // separate from the projection limiter, which may need more total future
  // exposures and therefore be a different lift.
  const primaryBlockerLift = weakestLift;
  const primaryBlockerPhase = weakestPhase;

  return {
    byLift,
    hasCurrentCycleMeetEvidence,
    openerReady,
    secondAttemptReady,
    thirdAttemptPotentialReady,
    ready,
    fullyDemonstrated,
    openerReadyCount: LIFT_ORDER.filter(
      lift => byLift[lift]?.openerReady
    ).length,
    secondAttemptReadyCount: LIFT_ORDER.filter(
      lift => byLift[lift]?.secondAttemptReady
    ).length,
    thirdAttemptPotentialCount: LIFT_ORDER.filter(
      lift => byLift[lift]?.thirdAttemptPotential
    ).length,
    weakestLift,
    weakestPhase,
    weakestRatio: weakestLift ? ratioForPhase(weakestLift) : 0,
    weakestTarget: weakestLift
      ? Number(byLift[weakestLift]?.currentCycleTarget) || 0
      : 0,
    weakestBestE1RM: weakestLift
      ? Number(byLift[weakestLift]?.currentCycleBestE1RM) || 0
      : 0,
    primaryBlockerLift,
    primaryBlockerPhase,
  };
}

export function buildSmartMeetWorkoutProjection({
  meetPlanReadiness = {},
  currentCycle = 1,
  currentWorkoutNumber = 1,
  rollingLiftExposureCounts = {},
  rollingProgressionExposureCounts = null,
  rollingTrainingDayCount = 0,
  profileExposureTargets = {},
  profileProgressionExposureTargets = null,
  lastWasRecoveryIntervention = false,
  lastTrainingDayWasLightOnly = false,
} = {}) {
  const byLift = meetPlanReadiness.byLift || {};
  const missingEvidence = LIFT_ORDER.some(lift =>
    !byLift[lift]?.hasCurrentCycleEvidence ||
    Number(byLift[lift]?.readinessTargetAttempt) <= 0
  );

  if (missingEvidence) {
    return {
      available: false,
      reason: 'insufficient-active-cycle-data',
      limitingLift: meetPlanReadiness.weakestLift || null,
      limitingPhase: meetPlanReadiness.weakestPhase || null,
    };
  }

  // Recovery is feedback- and eligibility-driven, not scheduled after a
  // fixed number of successful training days. Do not inflate every meet
  // projection with a synthetic one-in-three rest cadence.
  const recoveryOverhead = 1;
  const perLift = LIFT_ORDER.map(lift => {
    const liftReadiness = byLift[lift] || {};
    const requiredExposures = Math.max(
      0,
      Number(liftReadiness.projectedExposureCount) || 0
    );
    const hasProgressionFrequency = rollingProgressionExposureCounts !== null;
    const observedExposureCounts = hasProgressionFrequency
      ? rollingProgressionExposureCounts
      : rollingLiftExposureCounts;
    const plannedExposureTargets = profileProgressionExposureTargets !== null
      ? profileProgressionExposureTargets
      : profileExposureTargets;
    const observedFrequency = rollingTrainingDayCount > 0
      ? (Number(observedExposureCounts[lift]) || 0) /
        rollingTrainingDayCount
      : 0;
    const profileFrequency =
      (Number(plannedExposureTargets[lift]) || 0) /
      SMART_THRESHOLDS.ROLLING_TRAINING_DAYS;
    const effectiveFrequency = Math.max(
      observedFrequency,
      profileFrequency,
      1 / SMART_THRESHOLDS.ROLLING_TRAINING_DAYS
    );
    const expectedWorkouts = requiredExposures > 0
      ? requiredExposures * (1 / effectiveFrequency) * recoveryOverhead
      : 0;
    // A heavy-role cadence is already the conservative, progression-capable
    // schedule. Do not apply the older 15%-early/25%-late uncertainty band
    // that was designed around noisier all-exposure frequency; for an
    // all-successful projection, use the planned cadence as the earliest
    // date and allow a small scheduling margin on the late side.
    const rangeLowFactor = hasProgressionFrequency
      ? 1
      : SMART_THRESHOLDS.MEET_PROJECTION_RANGE_LOW_FACTOR;
    const rangeHighFactor = hasProgressionFrequency
      ? 1.1
      : SMART_THRESHOLDS.MEET_PROJECTION_RANGE_HIGH_FACTOR;

    return {
      lift,
      phase: liftReadiness.readinessPhase || 'ready',
      requiredExposures,
      expectedWorkouts,
      minimumWorkouts: Math.ceil(
        expectedWorkouts * rangeLowFactor
      ),
      maximumWorkouts: Math.ceil(
        expectedWorkouts * rangeHighFactor
      ),
    };
  });
  const limiter = [...perLift].sort((a, b) =>
    b.maximumWorkouts - a.maximumWorkouts ||
    b.requiredExposures - a.requiredExposures
  )[0] || null;
  const taperWorkouts = lastWasRecoveryIntervention
    ? 0
    : meetPlanReadiness.fullyDemonstrated
      ? lastTrainingDayWasLightOnly
        ? 1
        : 2
      : 1;
  const minimumWorkoutsBeforeMeet =
    (limiter?.minimumWorkouts || 0) + taperWorkouts;
  const maximumWorkoutsBeforeMeet =
    (limiter?.maximumWorkouts || 0) + taperWorkouts;
  const safeCurrentWorkoutNumber = Math.max(
    1,
    Number(currentWorkoutNumber) || 1
  );
  const minimumWorkoutNumber =
    safeCurrentWorkoutNumber + minimumWorkoutsBeforeMeet;
  const maximumWorkoutNumber =
    safeCurrentWorkoutNumber + maximumWorkoutsBeforeMeet;
  const label = minimumWorkoutNumber === maximumWorkoutNumber
    ? `C${currentCycle}W${minimumWorkoutNumber}`
    : `C${currentCycle}W${minimumWorkoutNumber}–C${currentCycle}W${maximumWorkoutNumber}`;

  return {
    available: true,
    cycle: Number(currentCycle) || 1,
    currentWorkoutNumber: safeCurrentWorkoutNumber,
    minimumWorkoutNumber,
    maximumWorkoutNumber,
    label,
    // The displayed limiter answers “which lift reaches full readiness last?”
    // under the successful-progression model. The calendar calculation still
    // uses the exposure-based limiter below, but that is not the athlete's
    // primary readiness blocker and must not be shown as one.
    limitingLift: meetPlanReadiness.fullyDemonstrated
      ? null
      : meetPlanReadiness.weakestLift || limiter?.lift || null,
    limitingPhase: meetPlanReadiness.fullyDemonstrated
      ? 'ready'
      : meetPlanReadiness.weakestPhase || limiter?.phase || null,
    scheduleLimitingLift: limiter?.lift || null,
    scheduleLimitingPhase: limiter?.phase || null,
    taperWorkouts,
    minimumWorkoutsBeforeMeet,
    maximumWorkoutsBeforeMeet,
    perLift,
  };
}

function getSmartMeetdayBlockers(readiness = {}) {

  if (readiness?.inPostMeetTrainingCooldown) {
    return [readiness.lastMeetWasFailed
      ? 'post-failed-meet-training-cooldown'
      : 'post-meet-training-cooldown'];
  }

  const blockers = [];
  const meetPlanReadiness = readiness.meetPlanReadiness || {};
  const missingLifts = LIFT_ORDER.filter(lift =>
    !meetPlanReadiness?.[lift]?.hasCurrentCycleEvidence
  );
  const isClean = (
    Number(readiness.recentFatigueScore) === 0 &&
    Number(readiness.recentFailedOrSkippedSetCount) === 0 &&
    !hasUnrecoveredSmartHardEffort(readiness)
  );

  if (
    readiness.lastWasRecoveryIntervention &&
    readiness.meetPlanFullyDemonstrated &&
    isClean
  ) {
    return [];
  }

  if (Number(readiness.completedCount) < LIFT_ORDER.length) {
    blockers.push('active-block-too-short');
  }

  if (Number(readiness.recentFatigueScore) > 0) {
    blockers.push('fatigue');
  }

  if (Number(readiness.recentFailedOrSkippedSetCount) > 0) {
    blockers.push('failed-skipped');
  }

  if (missingLifts.length > 0) {
    blockers.push('missing-lift-exposure');
  }

  // Meet-day readiness now requires every lift to have also indirectly
  // demonstrated its third attempt (see meetPlanFullyDemonstrated), not
  // just openers and second attempts - competing without that evidence
  // isn't the concern (the third attempt is proven live at the meet), but
  // *tapering* before it is: there's still real, useful training work left
  // (more reps at a proven-or-higher weight) until it's shown.
  if (!readiness.meetPlanFullyDemonstrated) {
    if (!readiness.meetPlanOpenerReady) {
      blockers.push('opener-readiness');
    } else if (!readiness.meetPlanSecondAttemptReady) {
      blockers.push('second-attempt-readiness');
    } else {
      blockers.push('third-attempt-potential');
    }
  }

  if (hasUnrecoveredSmartHardEffort(readiness)) {
    blockers.push('last-workout-hard');
  }

  if (readiness.lastWasRecoveryIntervention) {
    blockers.push('after-recovery-intervention');
  }

  return blockers;
}

export function getSmartMeetCompletedTrainingDays(readiness = {}) {
  const completedCount = Number(readiness.completedCount) || 0;

  const candidates = [
    Number(readiness.meetReadyDays),
    Number(readiness.trainingExposureDays),
    Number(readiness.trainingWorkoutCount),
    Number(readiness.completedTrainingWorkoutCount),
    Number(readiness.activeBlockCompletedCount),
    completedCount,
  ].filter(value => Number.isFinite(value) && value >= 0);

  return Math.min(Math.max(0, ...candidates), completedCount);
}

export function isSmartMeetdayReady(readiness = {}) {
  const blockers = Array.isArray(readiness.meetdayBlockers)
    ? readiness.meetdayBlockers
    : [];

  // Requires meetPlanFullyDemonstrated (opener + second attempt + every
  // lift's third-attempt potential), not just meetPlanReady - see the
  // comment on the third-attempt-potential blocker above for why.
  return Boolean(readiness.meetPlanFullyDemonstrated) &&
    blockers.length === 0 &&
    getSmartMeetCompletedTrainingDays(readiness) >= SMART_THRESHOLDS.MEETDAY_MIN_ACTIVE_BLOCK_DAYS;
}

function shouldAccelerateSmartEasyReadiness(readiness = {}) {
  const completedCount = Number(readiness.completedCount) || 0;
  const recentEasyCount = Number(readiness.recentEasyCount) || 0;
  const fatigueScore = Number(readiness.recentFatigueScore) || 0;
  const failedCount = Number(readiness.recentFailedOrSkippedSetCount) || 0;
  const meetPlanReadiness = readiness.meetPlanReadiness || {};
  const hasAllLiftEvidence = LIFT_ORDER.every(lift =>
    meetPlanReadiness?.[lift]?.hasCurrentCycleEvidence
  );

  return (
    completedCount >= LIFT_ORDER.length &&
    recentEasyCount >= LIFT_ORDER.length &&
    fatigueScore === 0 &&
    failedCount === 0 &&
    hasAllLiftEvidence &&
    !Boolean(readiness.meetPlanReady)
  );
}

function shouldScheduleSmartGoodMeetTaper(readiness = {}) {
  const fatigueScore = Number(readiness.recentFatigueScore) || 0;
  const failedCount = Number(readiness.recentFailedOrSkippedSetCount) || 0;

  return (
    (
      isSmartMeetdayReady(readiness) ||
      (
        readiness.meetPlanFullyDemonstrated &&
        readiness.lastTrainingDayWasLightOnly
      )
    ) &&
    fatigueScore === 0 &&
    failedCount === 0 &&
    !readiness.lastWasRecoveryIntervention
  );
}

function decideSmartNextDayType(readiness = {}) {
  if (readiness.inPostMeetRecovery) return SMART_DAY_TYPES.RECOVERY;

  if (
    readiness.lastMeetWorkoutNumber &&
    readiness.postMeetRecoveryTargetReached &&
    readiness.inPostMeetTrainingCooldown
  ) {
    return SMART_DAY_TYPES.TRAINING;
  }

  if (Number(readiness.recentFailedOrSkippedSetCount) >= SMART_THRESHOLDS.FAILED_SET_DELOAD_COUNT) {
    return SMART_DAY_TYPES.DELOAD;
  }

  if (Number(readiness.recentFatigueScore) >= SMART_THRESHOLDS.FATIGUE_RECOVERY_SCORE) {
    return SMART_DAY_TYPES.RECOVERY;
  }

  if (shouldScheduleSmartGoodMeetTaper(readiness)) {
    return SMART_DAY_TYPES.RECOVERY;
  }

  if (isSmartMeetdayReady(readiness)) {
    return SMART_DAY_TYPES.MEET;
  }

  if (readiness.lastWasRecoveryIntervention) return SMART_DAY_TYPES.TRAINING;

  if (shouldPreferSmartPeakCandidate(readiness) || shouldAccelerateSmartEasyReadiness(readiness)) {
    return SMART_DAY_TYPES.TRAINING;
  }

  return SMART_DAY_TYPES.TRAINING;
}

function decideSmartNextWorkoutIndex(context, generatedWorkouts = []) {
  const readiness = buildSmartReadinessSignals(context);
  const maxIndex = Math.max(generatedWorkouts.length - 1, 0);

  const nextIndex = Math.min(
    Math.max(Number(context?.currentIndex) || 0, 0),
    maxIndex
  );

  const dayType = decideSmartNextDayType(readiness);
  const reason = dayType === SMART_DAY_TYPES.DELOAD
    ? SMART_DECISION_REASONS.FAILED_SET_DELOAD
    : dayType === SMART_DAY_TYPES.MEET
      ? SMART_DECISION_REASONS.MEETDAY_READY
      : dayType === SMART_DAY_TYPES.RECOVERY
        ? readiness.inPostMeetRecovery
          ? SMART_DECISION_REASONS.POST_MEET_RECOVERY
          : Number(readiness.recentFatigueScore) >= SMART_THRESHOLDS.FATIGUE_RECOVERY_SCORE
            ? SMART_DECISION_REASONS.FATIGUE_RECOVERY
            : SMART_DECISION_REASONS.TRAINING_STREAK_RECOVERY
        : SMART_DECISION_REASONS.TRAINING_FALLBACK;

  return {
    index: nextIndex,
    dayType,
    readiness,
    reason,
    overrideType: dayType === SMART_DAY_TYPES.RECOVERY ? 'rest' : null,
  };
}

function resetSmartSetProgress(set = {}) {
  return {
    ...set,
    done: false,
    failed: false,
    skipped: false,
    effort: null,
    failedAttempts: 0,
    failedWeight: null,
    adjustedWeight: null,
    adjustedFromFailedSet: false,
    adjustedFromOriginal: false,
  };
}

function resetSmartChecklistProgress(item = {}) {
  return {
    ...item,
    done: false,
  };
}

function resetSmartWorkoutProgress(workout = {}) {
  return {
    ...workout,
    completed: false,
    completedAt: null,
    completedDate: null,
    completedSummary: null,
    smartSelectable: false,
    workoutEffort: null,
    smartDecision: null,
    smartDecisionSummary: null,
    smartDayType: null,
    smartOverride: null,
    smartVisible: false,
    smartCurrentIndex: null,
    smartCurrentCycle: null,
    smartSourceWorkoutNumber: null,
    smartGeneratedDeload: false,
    [SMART_GENERATED_FLAGS.RECOVERY]: false,
    [SMART_GENERATED_FLAGS.TRAINING]: false,
    prepItems: (workout.prepItems || []).map(resetSmartChecklistProgress),
    warmups: (workout.warmups || []).map(resetSmartChecklistProgress),
    sets: (workout.sets || []).map(resetSmartSetProgress),
    cooldownItems: (workout.cooldownItems || []).map(resetSmartChecklistProgress),
    lifts: (workout.lifts || []).map(liftBlock => ({
      ...liftBlock,
      prepItems: (liftBlock.prepItems || []).map(resetSmartChecklistProgress),
      warmups: (liftBlock.warmups || []).map(resetSmartChecklistProgress),
      sets: (liftBlock.sets || []).map(resetSmartSetProgress),
    })),
    accessories: (workout.accessories || []).map(accessory => ({
      ...accessory,
      done: (accessory.done || []).map(() => false),
    })),
  };
}

function buildSmartRecoveryWorkout(sourceWorkout = {}) {
  return {
    ...resetSmartWorkoutProgress(sourceWorkout),
    type: 'rest',
    labelKey: 'restAndRecovery',
    workoutEffort: 'easy',
    lift: null,
    lifts: [],
    sets: [],
    warmups: [],
    accessories: [],
    cooldownItems: [],
    prepItems: [],
    [SMART_GENERATED_FLAGS.RECOVERY]: true,
  };
}

function buildSmartTrainingWorkout(sourceWorkout = {}, trainingCandidate = null, options = {}) {
  if (!trainingCandidate || trainingCandidate?.type !== 'training') {
    return sourceWorkout;
  }

  if (
    sourceWorkout?.type === 'training' &&
    !options.forceReplacement
  ) {
    return {
      ...resetSmartWorkoutProgress(sourceWorkout),
      smartSourceWorkoutNumber: trainingCandidate.number || sourceWorkout.number,
      [SMART_GENERATED_FLAGS.TRAINING]: true,
    };
  }

  return {
    ...resetSmartWorkoutProgress(trainingCandidate),
    number: sourceWorkout.number,
    smartSourceWorkoutNumber: trainingCandidate.number,
    [SMART_GENERATED_FLAGS.TRAINING]: true,
  };
}

function getLiftBlockTrainingMaxEstimate(liftBlock = {}) {
  return Math.max(0, ...(liftBlock.sets || []).map(set => {
    const pct = Number(set?.originalPct ?? set?.pct) || 0;
    const weight = Number(set?.originalWeight ?? set?.weight) || 0;

    return pct > 0 && weight > 0 ? weight / pct : 0;
  }));
}

function shouldUseSmartVolumeStimulus(workout = {}, readiness = {}) {
  if (workout?.type !== 'training') return false;
  if (workout.smartVolumeStimulus) return false;
  if (readiness.meetPlanReady) return false;
  if (readiness.lastWasRecoveryIntervention) return false;
  if (Number(readiness.recentFatigueScore) > 0) return false;
  if (Number(readiness.recentFailedOrSkippedSetCount) > 0) return false;
  if (hasUnrecoveredSmartHardEffort(readiness)) return false;

  const recentEasyGoodCount =
    (Number(readiness.recentEasyCount) || 0) +
    (Number(readiness.recentGoodCount) || 0);

  if (recentEasyGoodCount < 2) return false;

  const allSets = [
    ...(workout.sets || []),
    ...(workout.lifts || []).flatMap(liftBlock => liftBlock?.sets || []),
  ];

  if (!allSets.length) return false;

  const lowRepHeavySetCount = allSets.filter(set => {
    const reps = Number(set?.reps) || 0;
    const pct = Number(set?.pct) || 0;

    return (
      isTopSetLabel(set?.labelKey) ||
      (reps > 0 && reps <= 3 && pct >= 0.70) ||
      pct >= 0.80
    );
  }).length;

  return lowRepHeavySetCount > 0;
}

function buildSmartVolumeStimulusSet({ trainingMax, reps, pct, groupKey }) {
  const weight = roundMeetWeight(trainingMax * pct);

  return {
    labelKey: 'workSets',
    groupKey,
    groupLabelKey: 'workSets',
    reps,
    pct,
    weight,
    originalWeight: weight,
    originalPct: pct,
    done: false,
    smartVolumeStimulus: true,
  };
}

function buildSmartVolumeStimulusLiftBlock(liftBlock = {}) {
  const lift = liftBlock.lift;
  const trainingMax = getLiftBlockTrainingMaxEstimate(liftBlock);

  if (!lift || trainingMax <= 0) return liftBlock;

  const topPct = lift === 'Bench' ? 0.72 : 0.70;
  const volumePct = lift === 'Bench' ? 0.64 : 0.62;
  const volumeSetCount = lift === 'Deadlift' ? 2 : 3;

  const sets = [
    buildSmartVolumeStimulusSet({
      trainingMax,
      reps: 5,
      pct: topPct,
      groupKey: `${lift}-volume-top`,
    }),
    ...Array.from({ length: volumeSetCount }, () =>
      buildSmartVolumeStimulusSet({
        trainingMax,
        reps: 6,
        pct: volumePct,
        groupKey: `${lift}-volume-backoff`,
      })
    ),
  ];

  return {
    ...liftBlock,
    sets,
    warmups: generateWarmups(sets, lift),
    smartVolumeStimulus: true,
  };
}

function buildSmartVolumeStimulusWorkout(workout = {}, readiness = {}) {
  if (!shouldUseSmartVolumeStimulus(workout, readiness)) return workout;

  const meetPlanReadiness = readiness.meetPlanReadiness || {};
  const targetLifts = (workout.lifts || [])
    .map(liftBlock => liftBlock.lift)
    .filter(lift => !meetPlanReadiness?.[lift]?.ready);

  const shouldTransformLift = lift =>
    targetLifts.length === 0 || targetLifts.includes(lift);

  const lifts = (workout.lifts || []).map(liftBlock =>
    shouldTransformLift(liftBlock.lift)
      ? buildSmartVolumeStimulusLiftBlock(liftBlock)
      : liftBlock
  );

  const primaryLift = lifts[0] || null;

  return {
    ...workout,
    smartVolumeStimulus: true,
    smartVolumeStimulusLifts: lifts
      .filter(liftBlock => liftBlock.smartVolumeStimulus)
      .map(liftBlock => liftBlock.lift)
      .filter(Boolean),
    lifts,
    sets: primaryLift?.sets || workout.sets || [],
    warmups: primaryLift?.warmups || workout.warmups || [],
  };
}

function reduceSmartDeloadSet(set = {}) {
  const nextSet = { ...set };
  const weight = Number(nextSet.weight);
  const pct = Number(nextSet.pct);

  if (Number.isFinite(weight) && weight > 0) {
    nextSet.weight = Math.round((weight * SMART_DELOAD.LOAD_FACTOR) / 2.5) * 2.5;
    nextSet.originalWeight = nextSet.weight;
  }

  if (Number.isFinite(pct) && pct > 0) {
    nextSet.pct = Math.max(
      SMART_DELOAD.MIN_PCT,
      Math.round(pct * SMART_DELOAD.LOAD_FACTOR * 1000) / 1000
    );
    nextSet.originalPct = nextSet.pct;
  }

  nextSet.failedWeight = null;
  nextSet.adjustedWeight = null;
  nextSet.adjustedFromFailedSet = false;
  nextSet.adjustedFromOriginal = false;

  return nextSet;
}

function limitSmartDeloadSets(sets = []) {
  return (sets || [])
    .slice(0, 2)
    .map(reduceSmartDeloadSet);
}

function buildSmartDeloadSelectionSummary(candidate = null, readiness = {}) {
  if (!candidate || candidate?.type !== 'training') return null;

  const candidateLifts = getWorkoutLiftNames(candidate);
  const recentFailedLifts = LIFT_ORDER.filter(lift =>
    Number(readiness.recentFailedOrSkippedSetCountsByLift?.[lift]) > 0
  );
  const selectedFailedLifts = candidateLifts.filter(lift => recentFailedLifts.includes(lift));

  return {
    sourceWorkoutNumber: candidate.number || null,
    candidateLifts,
    recentFailedLifts,
    selectedFailedLifts,
    primaryLift: candidateLifts[0] || null,
    primaryFailedLift: selectedFailedLifts.includes(candidateLifts[0] || null),
    reasonFlags: [
      'failed-set-deload',
      selectedFailedLifts.length ? 'includes-recent-failed-lift' : null,
      selectedFailedLifts.includes(candidateLifts[0] || null) ? 'failed-lift-primary' : null,
    ].filter(Boolean),
  };
}

function buildSmartDeloadWorkout(sourceWorkout = {}, trainingCandidate = null, readiness = {}) {
  const trainingWorkout = buildSmartTrainingWorkout(sourceWorkout, trainingCandidate, {
    forceReplacement: true,
  });
  const smartDeloadSelectionSummary = buildSmartDeloadSelectionSummary(trainingCandidate, readiness);
  const smartDeloadByLift = {};

  const deloadLifts = (trainingWorkout.lifts || []).map(liftBlock => {
    const originalSets = liftBlock.sets || [];
    const deloadSets = limitSmartDeloadSets(originalSets);

    smartDeloadByLift[liftBlock.lift] = {
      lift: liftBlock.lift,
      originalSetCount: originalSets.length,
      deloadSetCount: deloadSets.length,
      loadFactor: SMART_DELOAD.LOAD_FACTOR,
      minPct: SMART_DELOAD.MIN_PCT,
    };

    return {
      ...liftBlock,
      sets: deloadSets,
      warmups: generateWarmups(deloadSets, liftBlock.lift),
    };
  });

  const primaryDeloadSets = deloadLifts[0]?.sets || limitSmartDeloadSets(trainingWorkout.sets || []);
  const primaryDeloadWarmups = deloadLifts[0]?.warmups || generateWarmups(primaryDeloadSets, trainingWorkout.lift);

  return {
    ...trainingWorkout,
    labelKey: 'deload',
    label: null,
    smartDayType: SMART_DAY_TYPES.DELOAD,
    smartGeneratedDeload: true,
    smartDeloadSelectionSummary,
    smartDeloadByLift,
    sets: primaryDeloadSets,
    warmups: primaryDeloadWarmups,
    lifts: deloadLifts,
  };
}

export function buildSmartMeetWarmups(openerWeight = 0, lift = '') {
  const opener = Number(openerWeight) || 0;
  if (opener < 30) return [];

  const weights = [20];
  let lastWeight = 20;

  // Meet warm-ups prepare the opener, not the heaviest planned attempt.
  // Add clean 50kg plate jumps until the remaining jump is at most 55kg.
  while (opener - lastWeight > 55) {
    const nextWeight = lastWeight + 50;
    if (nextWeight >= opener) break;
    weights.push(nextWeight);
    lastWeight = nextWeight;
  }

  return weights.map((weight, index) => {
    const isFinalWarmup = index === weights.length - 1 && index > 0;
    const reps = index === 0
      ? 5
      : lift === 'Squat'
        ? (isFinalWarmup ? 1 : 3)
        : lift === 'Bench'
          ? 3
          : weight <= 70
            ? 5
            : 3;

    return {
      reps,
      weight,
      originalWeight: weight,
      done: false,
    };
  });
}

export function buildSmartMeetAttemptSets(lift = '', readiness = {}, fallbackSets = []) {
  const plannedAttempts = readiness?.meetPlanReadiness?.[lift]?.attempts || {};
  const fallbackByKey = Object.fromEntries(
    (fallbackSets || []).map(set => [set.labelKey, Number(set.weight) || 0])
  );
  const attemptKeys = ['opener', 'secondAttempt', 'thirdAttempt'];
  const attemptPcts = [0.90, 0.975, 1.025];
  let previousWeight = 0;

  return attemptKeys.map((labelKey, index) => {
    const plannedWeight = Number(plannedAttempts[labelKey]) || fallbackByKey[labelKey] || 0;
    let weight = roundBarbellWeight(plannedWeight, 'nearest', 5);
    if (weight > 0 && weight <= previousWeight) weight = previousWeight + 2.5;
    previousWeight = weight;

    return {
      labelKey,
      reps: 1,
      pct: attemptPcts[index],
      weight,
      originalWeight: weight,
      done: false,
    };
  });
}

function buildSmartMeetWorkout(sourceWorkout = {}, meetCandidate = null, readiness = {}) {
  const template = meetCandidate?.type === 'meet' ? meetCandidate : sourceWorkout;

  const lifts = (template.lifts || []).map(liftBlock => {
    const sets = buildSmartMeetAttemptSets(
      liftBlock.lift,
      readiness,
      liftBlock.sets
    );

    return {
      ...liftBlock,
      warmups: buildSmartMeetWarmups(sets[0]?.weight, liftBlock.lift),
      sets,
    };
  });

  return {
    ...resetSmartWorkoutProgress(template),
    number: sourceWorkout.number,
    type: 'meet',
    labelKey: 'meetDay',
    smartDayType: SMART_DAY_TYPES.MEET,
    smartSourceWorkoutNumber: template.number,
    [SMART_GENERATED_FLAGS.MEET]: true,
    lifts,
    warmups: lifts[0]?.warmups || [],
    sets: lifts[0]?.sets || [],
  };
}


function buildSmartWorkoutPool(generatedWorkouts = [], currentIndex = 0) {
  const targetLength = Math.max(
    generatedWorkouts.length,
    (Math.max(Number(currentIndex) || 0, 0) + 1)
  );

  if (generatedWorkouts.length >= targetLength) return generatedWorkouts;

  const repeatableWorkouts = generatedWorkouts.filter(workout => workout?.type !== 'meet');
  const fallbackPool = repeatableWorkouts.length > 0 ? repeatableWorkouts : generatedWorkouts;
  const nextWorkouts = [...generatedWorkouts];

  while (nextWorkouts.length < targetLength) {
    const source = fallbackPool[(nextWorkouts.length - generatedWorkouts.length) % fallbackPool.length];

    nextWorkouts.push({
      ...resetSmartWorkoutProgress(source),
      number: nextWorkouts.length + 1,
    });
  }

  return nextWorkouts;
}

function buildSmartTrainingCandidateDebug({
  generatedWorkouts = [],
  visibleThroughIndex = 0,
  readiness = {},
  usedSmartSourceWorkoutNumbers = [],
} = {}) {
  const usedSourceSet = new Set((usedSmartSourceWorkoutNumbers || []).map(Number));
  const fallbackTrainingPool = generatedWorkouts.slice(visibleThroughIndex);

  return fallbackTrainingPool
    .filter(candidate => candidate?.type === 'training')
    .slice(0, 12)
    .map(candidate => {
      const lifts = getWorkoutLiftNames(candidate);
      const overlapCount = countSharedWorkoutLifts(candidate, readiness.lastWorkoutLifts || []);
      const isUnused = !usedSourceSet.has(Number(candidate?.number));
      const isHeavy = isHeavySmartTrainingCandidate(candidate);

      const failedLiftCount = lifts.reduce(
        (total, lift) => total + (Number(readiness.recentFailedOrSkippedSetCountsByLift?.[lift]) || 0),
        0
      );

      return {
        number: candidate.number,
        labelKey: candidate.labelKey,
        lifts,
        liftCount: lifts.length,
        overlapCount,
        failedLiftCount,
        isUnused,
        isHeavy,
      };
    });
}

function selectSmartDeloadCandidate({
  generatedWorkouts = [],
  visibleThroughIndex = 0,
  readiness = {},
  usedSmartSourceWorkoutNumbers = [],
} = {}) {
  const usedSourceSet = new Set((usedSmartSourceWorkoutNumbers || []).map(Number));
  const failedLifts = LIFT_ORDER.filter(lift =>
    Number(readiness.recentFailedOrSkippedSetCountsByLift?.[lift]) > 0
  );

  const pool = [
    ...generatedWorkouts.slice(visibleThroughIndex),
    ...generatedWorkouts.slice(0, visibleThroughIndex + 1).reverse(),
  ].filter(candidate => candidate?.type === 'training');

  const scored = pool
    .map(candidate => {
      const lifts = getWorkoutLiftNames(candidate);
      const failedLiftMatches = lifts.filter(lift => failedLifts.includes(lift)).length;
      const primaryFailedLiftBonus = failedLifts.includes(lifts[0]) ? 12 : 0;
      const isUnused = !usedSourceSet.has(Number(candidate?.number));
      const isHeavy = isHeavySmartTrainingCandidate(candidate);
      const liftCountPenalty = Math.max(lifts.length - 1, 0);

      return {
        candidate,
        score:
          (failedLiftMatches * 20) +
          primaryFailedLiftBonus +
          (isUnused ? 3 : 0) -
          (isHeavy ? 8 : 0) -
          liftCountPenalty,
      };
    })
    .filter(item => item.candidate && item.score > -100)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.candidate || null;
}

function shouldPreferSmartPeakCandidate(readiness = {}) {
  const completedCount = Number(readiness.completedCount) || 0;

  return (
    Boolean(readiness.meetPlanHasCurrentCycleEvidence) &&
    !readiness.meetPlanReady &&
    Boolean(readiness.meetPlanWeakestLift) &&
    completedCount >= Math.max(6, LIFT_ORDER.length * 2) &&
    Number(readiness.recentFatigueScore) === 0 &&
    Number(readiness.recentFailedOrSkippedSetCount) === 0 &&
    !hasUnrecoveredSmartHardEffort(readiness)
  );
}

function isSmartPeakCandidateForLift(candidate = {}, lift = null) {
  if (!candidate || candidate?.type !== 'training' || !lift) return false;

  const candidateLifts = getWorkoutLiftNames(candidate);
  if (!candidateLifts.includes(lift)) return false;

  const allSets = [
    ...(candidate.sets || []),
    ...(candidate.lifts || []).flatMap(liftBlock => liftBlock?.sets || []),
  ];

  return allSets.some(set => {
    const label = String(set?.labelKey || set?.label || '').toLowerCase();
    const pct = Number(set?.pct) || 0;
    const reps = Number(set?.reps) || 0;

    return (
      label.includes('opener') ||
      label.includes('topsingle') ||
      label.includes('topdouble') ||
      (reps <= 2 && pct >= 0.80) ||
      pct >= 0.85
    );
  });
}

function selectSmartTrainingCandidate({
  generatedWorkouts = [],
  visibleThroughIndex = 0,
  readiness = {},
  usedSmartSourceWorkoutNumbers = [],
} = {}) {
  const usedSourceSet = new Set((usedSmartSourceWorkoutNumbers || []).map(Number));
  const isUnusedTraining = candidate =>
    candidate?.type === 'training' &&
    !usedSourceSet.has(Number(candidate?.number));

  const fallbackTrainingPool = generatedWorkouts.slice(visibleThroughIndex);
  const previousTrainingPool = generatedWorkouts.slice(0, visibleThroughIndex + 1).reverse();

  function scoreCandidate(candidate) {
    const candidateLifts = getWorkoutLiftNames(candidate);
    const liftExposureCounts =
      readiness.rollingLiftExposureCounts ||
      readiness.activeBlockLiftExposureCounts ||
      {};
    const meetPlanReadiness = readiness.meetPlanReadiness || {};
    const targetExposureCounts = {
      Squat: 3,
      Bench: 4,
      Deadlift: 2,
    };
    const totalExposurePenalty = candidateLifts.reduce(
      (total, lift) => total + (Number(liftExposureCounts[lift]) || 0),
      0
    );
    const undertrainedBonus = candidateLifts.reduce((bonus, lift) => {
      const target = Number(targetExposureCounts[lift]) || 0;
      const actual = Number(liftExposureCounts[lift]) || 0;

      return bonus + Math.max(target - actual, 0) * 2;
    }, 0);
    const shouldUseMeetPlanTrainingBias =
      Number(readiness.completedCount) > 0 &&
      Number(readiness.activeBlockCompletedCount) > 0;

    const meetPlanNeedsWorkBonus = shouldUseMeetPlanTrainingBias
      ? candidateLifts.filter(lift =>
        meetPlanReadiness?.[lift] && !meetPlanReadiness[lift].ready
      ).length * 5
      : 0;
    const weakestLiftBonus =
      shouldUseMeetPlanTrainingBias &&
      !readiness.meetPlanReady &&
      readiness.meetPlanWeakestLift &&
      candidateLifts.includes(readiness.meetPlanWeakestLift)
        ? 8
        : 0;
    const overlapCount = countSharedWorkoutLifts(candidate, readiness.lastWorkoutLifts || []);
    const overlapPenalty = overlapCount * (hasUnrecoveredSmartHardEffort(readiness) ? 8 : 2);
    const failedLiftPenalty = candidateLifts.reduce(
      (total, lift) => total + ((Number(readiness.recentFailedOrSkippedSetCountsByLift?.[lift]) || 0) * 7),
      0
    );
    const liftCountPenalty = Math.max(getWorkoutLiftNames(candidate).length - 1, 0);
    const heavyPenalty = isHeavySmartTrainingCandidate(candidate) ? 2 : 0;
    const lowerBodyFatiguePenalty = candidateLifts.reduce((penalty, lift) => {
      if (!['Squat', 'Deadlift'].includes(lift)) return penalty;

      return penalty + Math.min(
        Number(readiness.recentSharedLowerBodyFatigueScore) || 0,
        4
      );
    }, 0);

    return weakestLiftBonus +
      meetPlanNeedsWorkBonus +
      undertrainedBonus -
      totalExposurePenalty -
      overlapPenalty -
      failedLiftPenalty -
      liftCountPenalty -
      heavyPenalty -
      lowerBodyFatiguePenalty;
  }

  function pickBestCandidate(pool = [], predicate = () => true) {
    return (pool || [])
      .filter(candidate =>
        candidate?.type === 'training' &&
        hasEffectiveSmartTrainingStimulus(candidate) &&
        !violatesSmartTrainingSafety(candidate, readiness) &&
        predicate(candidate)
      )
      .sort((a, b) => scoreCandidate(b) - scoreCandidate(a))[0] || null;
  }

  function pickLowestOverlapCandidate(pool = [], predicate = () => true) {
    return (pool || [])
      .filter(candidate =>
        candidate?.type === 'training' &&
        hasEffectiveSmartTrainingStimulus(candidate) &&
        !violatesSmartTrainingSafety(candidate, readiness) &&
        predicate(candidate)
      )
      .sort((a, b) => {
        const overlapDiff =
          countSharedWorkoutLifts(a, readiness.lastWorkoutLifts || []) -
          countSharedWorkoutLifts(b, readiness.lastWorkoutLifts || []);

        if (overlapDiff !== 0) return overlapDiff;

        return scoreCandidate(b) - scoreCandidate(a);
      })[0] || null;
  }

  function pickPeakCandidateForLift(lift = null) {
    const targetWorkoutNumber = Math.max(Number(visibleThroughIndex) || 0, 0) + 1;
    const maxLookahead = 8;
    const candidates = orderedPools
      .flatMap(pool => pool || [])
      .filter(candidate =>
        candidate?.type === 'training' &&
        hasEffectiveSmartTrainingStimulus(candidate) &&
        !violatesSmartTrainingSafety(candidate, readiness) &&
        !hasSameSmartTrainingPrescriptionAsLastWorkout(candidate, readiness) &&
        isSmartPeakCandidateForLift(candidate, lift)
      );

    const nearbyCandidates = candidates.filter(candidate => {
      const distance = Math.abs((Number(candidate.number) || 0) - targetWorkoutNumber);
      return distance <= maxLookahead;
    });

    return (nearbyCandidates.length ? nearbyCandidates : candidates)
      .sort((a, b) => {
        const distanceA = Math.abs((Number(a.number) || 0) - targetWorkoutNumber);
        const distanceB = Math.abs((Number(b.number) || 0) - targetWorkoutNumber);

        if (distanceA !== distanceB) return distanceA - distanceB;

        const heavyDiff = Number(isHeavySmartTrainingCandidate(a)) - Number(isHeavySmartTrainingCandidate(b));
        if (heavyDiff !== 0) return heavyDiff;

        return scoreCandidate(b) - scoreCandidate(a);
      })[0] || null;
  }

  const orderedPools = [
    fallbackTrainingPool.filter(isUnusedTraining),
    previousTrainingPool.filter(isUnusedTraining),
    fallbackTrainingPool.filter(candidate => candidate?.type === 'training'),
    previousTrainingPool.filter(candidate => candidate?.type === 'training'),
  ];

  const isDirectRepeatCandidate = candidate =>
    hasSameSmartTrainingPrescriptionAsLastWorkout(candidate, readiness);

  function pickFromPools(predicate = () => true, options = {}) {
    const allowDirectRepeat = Boolean(options.allowDirectRepeat);

    return orderedPools
      .map(pool => pickBestCandidate(pool, candidate =>
        predicate(candidate) &&
        (allowDirectRepeat || !isDirectRepeatCandidate(candidate))
      ))
      .find(Boolean) || null;
  }

  const defaultTrainingCandidate = pickFromPools();

  const lastEffort = String(readiness.lastWorkoutEffort || '').trim().toLowerCase();
  const shouldAvoidBackToBackOverlap =
    ['easy', 'good', 'normal'].includes(lastEffort) &&
    !readiness.lastWasRestDay &&
    !readiness.lastWasRecoveryIntervention;

  const pickLowerOverlapCandidate = () => {
    const lastWorkoutLifts = readiness.lastWorkoutLifts || [];
    const isNormalTrainingCandidate = candidate =>
      !isUltraLightSmartTrainingCandidate(candidate) &&
      !LIFT_ORDER.some(lift => isSmartPeakCandidateForLift(candidate, lift));

    return pickFromPools(candidate =>
      isNormalTrainingCandidate(candidate) &&
      countSharedWorkoutLifts(candidate, lastWorkoutLifts) === 0
    ) || pickFromPools(candidate =>
      isNormalTrainingCandidate(candidate) &&
      countSharedWorkoutLifts(candidate, lastWorkoutLifts) <= 1
    ) || pickFromPools(candidate =>
      !isUltraLightSmartTrainingCandidate(candidate) &&
      countSharedWorkoutLifts(candidate, lastWorkoutLifts) <= 1
    );
  };

  if (shouldPreferSmartPeakCandidate(readiness)) {
    const weakestLift = readiness.meetPlanWeakestLift;
    const peakCandidate = pickPeakCandidateForLift(weakestLift);
    const lastWorkoutLifts = readiness.lastWorkoutLifts || [];

    if (
      shouldAvoidBackToBackOverlap &&
      peakCandidate &&
      countSharedWorkoutLifts(peakCandidate, lastWorkoutLifts) > 1
    ) {
      return pickLowerOverlapCandidate() || peakCandidate || defaultTrainingCandidate;
    }

    return peakCandidate || defaultTrainingCandidate;
  }

  if (readiness.lastWasRestDay || readiness.lastWasRecoveryIntervention) {
    const lastWorkoutLifts = readiness.lastWorkoutLifts || [];
    const isPostRecoveryTrainingCandidate = candidate =>
      !isHeavySmartTrainingCandidate(candidate) &&
      !isUltraLightSmartTrainingCandidate(candidate);

    return pickFromPools(candidate =>
      isPostRecoveryTrainingCandidate(candidate) &&
      countSharedWorkoutLifts(candidate, lastWorkoutLifts) === 0
    ) || pickFromPools(candidate =>
      isPostRecoveryTrainingCandidate(candidate) &&
      countSharedWorkoutLifts(candidate, lastWorkoutLifts) <= 1
    ) || pickFromPools(isPostRecoveryTrainingCandidate) || pickFromPools(candidate =>
      !isHeavySmartTrainingCandidate(candidate)
    ) || defaultTrainingCandidate;
  }

  if (hasUnrecoveredSmartHardEffort(readiness)) {
    const lastWorkoutLifts = readiness.lastWorkoutLifts || [];
    const avoidsRepeatedHeavyPrimary = candidate =>
      !repeatsHeavyPrimaryLift(candidate, readiness);

    return pickFromPools(candidate =>
      avoidsRepeatedHeavyPrimary(candidate) &&
      countSharedWorkoutLifts(candidate, lastWorkoutLifts) === 0
    ) || pickFromPools(candidate =>
      avoidsRepeatedHeavyPrimary(candidate) &&
      countSharedWorkoutLifts(candidate, lastWorkoutLifts) <= 1
    ) || orderedPools
      .map(pool => pickLowestOverlapCandidate(pool, avoidsRepeatedHeavyPrimary))
      .find(Boolean) || defaultTrainingCandidate;
  }

  if (shouldAvoidBackToBackOverlap) {
    return pickLowerOverlapCandidate() || defaultTrainingCandidate;
  }

  return defaultTrainingCandidate;
}

function buildSmartTrainingSelectionSummary(candidate = null, readiness = {}) {
  if (!candidate || candidate?.type !== 'training') return null;

  const candidateLifts = getWorkoutLiftNames(candidate);
  const meetPlanReadiness = readiness.meetPlanReadiness || {};
  const exposureCounts = readiness.activeBlockLiftExposureCounts || {};
  const lastWorkoutLifts = readiness.lastWorkoutLifts || [];
  const isNewCycleStart =
    Number(readiness.completedCount) === 0 &&
    Number(readiness.activeBlockCompletedCount) === 0;
  const recentFailedLifts = LIFT_ORDER.filter(lift =>
    Number(readiness.recentFailedOrSkippedSetCountsByLift?.[lift]) > 0
  );
  const selectedFailedLifts = candidateLifts.filter(lift => recentFailedLifts.includes(lift));
  const avoidedFailedLifts = recentFailedLifts.filter(lift => !candidateLifts.includes(lift));
  const meetPlanNeeds = candidateLifts.filter(lift =>
    meetPlanReadiness?.[lift] && !meetPlanReadiness[lift].ready
  );
  const overlapLifts = candidateLifts.filter(lift => lastWorkoutLifts.includes(lift));
  const undertrainedLifts = (() => {
    const exposureValues = LIFT_ORDER.map(lift => Number(exposureCounts[lift]) || 0);
    const minExposure = Math.min(...exposureValues);

    return candidateLifts.filter(lift =>
      (Number(exposureCounts[lift]) || 0) === minExposure
    );
  })();

  const usesPeakPreference = shouldPreferSmartPeakCandidate(readiness);
  const peakTargetLift = usesPeakPreference ? readiness.meetPlanWeakestLift || null : null;

  return {
    sourceWorkoutNumber: candidate.number || null,
    candidateLifts,
    usesPeakPreference,
    peakTargetLift,
    isPeakCandidateForTarget: usesPeakPreference
      ? isSmartPeakCandidateForLift(candidate, peakTargetLift)
      : false,
    weakestLift: isNewCycleStart ? null : readiness.meetPlanWeakestLift || null,
    meetPlanNeeds: isNewCycleStart ? [] : meetPlanNeeds,
    recentFailedLifts,
    selectedFailedLifts,
    avoidedFailedLifts,
    undertrainedLifts,
    overlapLifts,
    exposureCounts,
    lastWorkoutLifts,
    reasonFlags: [
      isNewCycleStart ? 'new-cycle-start' : null,
      undertrainedLifts.length ? 'undertrained-lift-balance' : null,
      meetPlanNeeds.length && !isNewCycleStart ? 'meet-plan-needs-work' : null,
      usesPeakPreference ? 'peak-readiness-preference' : null,
      avoidedFailedLifts.length ? 'avoided-recent-failed-lift' : null,
      selectedFailedLifts.length ? 'selected-recent-failed-lift-capped' : null,
      overlapLifts.length ? 'last-workout-overlap' : null,
    ].filter(Boolean),
  };
}

function getProjectedSmartLiftEligibility({
  history = [],
  currentCycle = 1,
  athleteLevel = 'intermediate',
  targetWorkoutNumber = 1,
} = {}) {
  const targets =
    EXPOSURE_TARGETS_BY_LEVEL[athleteLevel] ||
    EXPOSURE_TARGETS_BY_LEVEL.intermediate;

  const completedDays = new Map();

  (history || []).forEach(entry => {
    const cycle = Number(
      entry?.cycle ||
      entry?.workoutSnapshot?.smartCurrentCycle ||
      currentCycle
    ) || currentCycle;
    const workoutNumber = Number(entry?.workoutNumber) || 0;

    if (
      cycle !== Number(currentCycle) ||
      workoutNumber <= 0 ||
      workoutNumber >= Number(targetWorkoutNumber)
    ) return;

    const snapshot = entry?.workoutSnapshot || entry;
    const isRecovery = Boolean(
      entry?.restDay ||
      entry?.completionOnly ||
      snapshot?.restDay ||
      snapshot?.completionOnly ||
      String(entry?.smartDayType || snapshot?.smartDayType || '').toLowerCase() === 'recovery' ||
      String(snapshot?.type || '').toLowerCase() === 'rest'
    );

    const day = completedDays.get(workoutNumber) || {
      lifts: new Set(),
      primaryLift: null,
    };

    if (!isRecovery) {
      const liftBlocks = Array.isArray(snapshot?.lifts)
        ? snapshot.lifts.filter(block =>
          LIFT_ORDER.includes(block?.lift)
        )
        : [];

      liftBlocks.forEach(block => {
        day.lifts.add(block.lift);
      });

      const snapshotLift = LIFT_ORDER.includes(snapshot?.lift)
        ? snapshot.lift
        : null;
      const directLift = snapshotLift || (
        LIFT_ORDER.includes(entry?.lift)
          ? entry.lift
          : null
      );

      if (directLift) day.lifts.add(directLift);

      const explicitPrimaryLift = liftBlocks.find(block =>
        String(block?.role || '').toLowerCase() === 'primary'
      )?.lift;
      // A deliberate all-light day (every lift block explicitly role
      // 'secondary'/'tertiary', none 'primary' - see the heavy-quota gate
      // in buildGeneratedSmartTrainingWorkout) must record no primary lift
      // at all. The snapshotLift/liftBlocks[0] fallback below only exists
      // for genuinely legacy entries that never tagged role in the first
      // place - applying it here too would silently re-credit whichever
      // lift happened to render first with a heavy exposure it never
      // actually had, corrupting every later heavy-quota decision.
      const hasAnyExplicitRole = liftBlocks.some(block => Boolean(block?.role));

      const primaryLift =
        explicitPrimaryLift || (
          hasAnyExplicitRole
            ? null
            : (snapshotLift || liftBlocks[0]?.lift || directLift || null)
        );

      if (!day.primaryLift && LIFT_ORDER.includes(primaryLift)) {
        day.primaryLift = primaryLift;
      }
    }

    completedDays.set(workoutNumber, day);
  });

  const previousSixDays = [...completedDays.entries()]
    .sort((a, b) => b[0] - a[0])
    .slice(0, SMART_THRESHOLDS.ROLLING_TRAINING_DAYS)
    .sort((a, b) => a[0] - b[0]);

  const exposureCounts = LIFT_ORDER.reduce((counts, lift) => ({
    ...counts,
    [lift]: previousSixDays.reduce(
      (total, [, day]) => total + Number(day.lifts.has(lift)),
      0
    ),
  }), {});

  const primaryExposureCounts = LIFT_ORDER.reduce((counts, lift) => ({
    ...counts,
    [lift]: previousSixDays.reduce(
      (total, [, day]) => total + Number(day.primaryLift === lift),
      0
    ),
  }), {});

  const secondaryExposureCounts = LIFT_ORDER.reduce((counts, lift) => ({
    ...counts,
    [lift]: Math.max(
      Number(exposureCounts[lift]) -
      Number(primaryExposureCounts[lift]),
      0
    ),
  }), {});

  const weightedExposureCounts = LIFT_ORDER.reduce((counts, lift) => ({
    ...counts,
    [lift]:
      Number(primaryExposureCounts[lift]) +
      Number(secondaryExposureCounts[lift]) *
        SMART_SECONDARY_EXPOSURE_WEIGHT,
  }), {});

  const consecutiveEligibleLifts = new Set(LIFT_ORDER.filter(lift => {
    const maximum = getSmartMaxConsecutiveTrainingDays(athleteLevel, lift);
    let streak = 0;

    for (let index = previousSixDays.length - 1; index >= 0; index -= 1) {
      if (!previousSixDays[index][1].lifts.has(lift)) break;
      streak += 1;
    }

    return streak < maximum;
  }));

  const lastPrimaryDay = [...previousSixDays]
    .reverse()
    .find(([, day]) => LIFT_ORDER.includes(day.primaryLift));
  const lastPrimaryLift =
    lastPrimaryDay?.[1]?.primaryLift || null;

  // How many workouts ago each lift was last primary (heavy) - a lift never
  // primary within the window is treated as maximally overdue.
  const lastPrimaryWorkoutIndexByLift = {};
  previousSixDays.forEach(([, day], index) => {
    if (LIFT_ORDER.includes(day.primaryLift)) {
      lastPrimaryWorkoutIndexByLift[day.primaryLift] = index;
    }
  });
  const workoutsSinceLastPrimary = lift =>
    lastPrimaryWorkoutIndexByLift[lift] === undefined
      ? previousSixDays.length
      : previousSixDays.length - 1 - lastPrimaryWorkoutIndexByLift[lift];

  const comparePrimaryLoad = (a, b) => {
    const aTarget = Math.max(Number(targets[a]) || 1, 1);
    const bTarget = Math.max(Number(targets[b]) || 1, 1);
    const aPrimaryRatio =
      Number(primaryExposureCounts[a]) / aTarget;
    const bPrimaryRatio =
      Number(primaryExposureCounts[b]) / bTarget;
    const aWeightedRatio =
      Number(weightedExposureCounts[a]) / aTarget;
    const bWeightedRatio =
      Number(weightedExposureCounts[b]) / bTarget;

    return (
      // Recency of each lift's last heavy exposure takes precedence over
      // the flat target-normalized ratio below - otherwise a lift with a
      // higher weekly target (e.g. intermediate Bench at 4 vs Squat's 3)
      // looks "less loaded" for the exact same single recent heavy exposure
      // purely because of that denominator, even when its heavy exposure is
      // actually the MORE recent of the two. Real report (C3W36): Bench
      // went heavy again right after being heavy on W33, while Squat's last
      // heavy turn (W30) was about to roll out of the window entirely -
      // Squat was the more overdue lift, but the ratio math alone picked
      // Bench anyway.
      workoutsSinceLastPrimary(b) - workoutsSinceLastPrimary(a) ||
      aPrimaryRatio - bPrimaryRatio ||
      aWeightedRatio - bWeightedRatio ||
      LIFT_ORDER.indexOf(a) - LIFT_ORDER.indexOf(b)
    );
  };

  const underTargetPrimaryLifts = LIFT_ORDER
    .filter(lift =>
      // Raw exposure count, not the weighted one - a lift that already had
      // its full weekly allocation (even if part of it was a lighter
      // secondary/tertiary session) is done for the week, full stop. Real
      // report: Deadlift had its heavy day (W32) and its one other
      // allocated day (W34) - already 2/2 against its own weekly target -
      // but weightedExposureCounts discounts light exposures to 0.5, which
      // let it sneak back into primary contention (and, via the meet-
      // weakest-lift override, get selected again on W37) even though
      // secondaryEligibleLifts below (which already used the raw count)
      // correctly excluded it.
      Number(exposureCounts[lift]) <
        Number(targets[lift] || 0) &&
      consecutiveEligibleLifts.has(lift) &&
      Number(primaryExposureCounts[lift]) <
        Number(targets[lift] || 0)
    )
    .sort(comparePrimaryLoad);

  const nonRepeatedUnderTargetPrimaryLifts =
    underTargetPrimaryLifts.filter(lift =>
      lift !== lastPrimaryLift
    );

  const nonRepeatedFallbackPrimaryLifts = LIFT_ORDER
    .filter(lift =>
      lift !== lastPrimaryLift && consecutiveEligibleLifts.has(lift)
    )
    .sort(comparePrimaryLoad);

  const primaryEligibleLifts =
    nonRepeatedUnderTargetPrimaryLifts.length > 0
      ? nonRepeatedUnderTargetPrimaryLifts
      : nonRepeatedFallbackPrimaryLifts.length > 0
        ? nonRepeatedFallbackPrimaryLifts
        : underTargetPrimaryLifts.length > 0
          ? underTargetPrimaryLifts
          : LIFT_ORDER.filter(lift => consecutiveEligibleLifts.has(lift));

  const secondaryEligibleLifts = LIFT_ORDER
    .filter(lift =>
      Number(exposureCounts[lift]) <
        Number(targets[lift] || 0) &&
      consecutiveEligibleLifts.has(lift) &&
      Number(primaryExposureCounts[lift]) <
        Number(targets[lift] || 0)
    )
    .sort((a, b) => {
      const aTarget = Math.max(Number(targets[a]) || 1, 1);
      const bTarget = Math.max(Number(targets[b]) || 1, 1);

      return (
        Number(exposureCounts[a]) / aTarget -
          Number(exposureCounts[b]) / bTarget ||
        comparePrimaryLoad(a, b)
      );
    });

  const eligibleLifts = LIFT_ORDER.filter(lift =>
    Number(exposureCounts[lift]) <
      Number(targets[lift] || 0) &&
    consecutiveEligibleLifts.has(lift)
  );

  return {
    targets,
    exposureCounts,
    primaryExposureCounts,
    secondaryExposureCounts,
    weightedExposureCounts,
    eligibleLifts,
    primaryEligibleLifts,
    secondaryEligibleLifts,
    lastPrimaryLift,
    previousWorkoutNumbers: previousSixDays.map(([number]) => number),
  };
}

// Must stay in sync with WORKOUT_CIRCLE_ITEM_GRID_TEMPLATE in App.js - that
// constant defines the visual grid's column count, and this one is the
// content-generation invariant that guarantees every row is full (no empty
// trailing cells) by padding/trimming volume sets to a multiple of it.
const SMART_LIFT_GRID_COLUMNS = 4;
const SMART_LIGHT_MAX_TOTAL_WORK_REPS = 24;
const SMART_LIGHT_MAX_LOADED_PCT = 0.70;

export function constrainExplicitLightLiftDose({ sets = [], trainingMax = 0 } = {}) {
  const isVolumeSet = set => {
    const label = String(set?.labelKey || '').toLowerCase();
    return label === 'backoff' || label === 'worksets';
  };
  const volumeSetCount = sets.filter(isVolumeSet).length;

  if (volumeSetCount === 0 || Number(trainingMax) <= 0) return sets;

  const maxRepsPerSet = Math.max(
    4,
    Math.min(6, Math.floor(SMART_LIGHT_MAX_TOTAL_WORK_REPS / volumeSetCount))
  );
  // Round the actual load down to a valid 5kg increment. Nearest rounding
  // could put the bar above the promised 70% ceiling.
  const maxLoadedWeight = Math.floor(
    (Number(trainingMax) * SMART_LIGHT_MAX_LOADED_PCT) / 5
  ) * 5;

  return sets.map(set => {
    if (!isVolumeSet(set)) return set;

    const pct = Math.min(Number(set.pct) || 0, SMART_LIGHT_MAX_LOADED_PCT);
    const precisePct = Math.min(
      Number(set.precisePct ?? set.pct) || 0,
      SMART_LIGHT_MAX_LOADED_PCT
    );
    const weight = Math.min(Number(set.weight) || 0, maxLoadedWeight);

    return {
      ...set,
      reps: Math.min(Number(set.reps) || maxRepsPerSet, maxRepsPerSet),
      pct,
      precisePct,
      weight,
      originalPct: pct,
      originalWeight: weight,
    };
  });
}

export function completeSmartLiftGrid({
  sets = [],
  warmups = [],
  preferMoreVolume = false,
  minimumVolumeSets = 2,
} = {}) {
  const completedSets = (sets || []).map(set => ({ ...set }));
  const warmupCount = Array.isArray(warmups) ? warmups.length : 0;
  const remainder = (warmupCount + completedSets.length) % SMART_LIFT_GRID_COLUMNS;

  if (remainder === 0) return completedSets;

  const isVolumeSet = set => {
    const label = String(set?.labelKey || '').toLowerCase();
    return label === 'backoff' || label === 'worksets';
  };
  const volumeIndexes = completedSets
    .map((set, index) => isVolumeSet(set) ? index : -1)
    .filter(index => index >= 0);

  if (volumeIndexes.length === 0) {
    throw new Error(
      'Smart lift grid cannot be completed without volume sets.'
    );
  }

  const addCount = (SMART_LIFT_GRID_COLUMNS - remainder) % SMART_LIFT_GRID_COLUMNS;
  const removeCount = remainder;
  const maximumVolumeSets = 6;
  const canAdd =
    addCount > 0 &&
    volumeIndexes.length + addCount <= maximumVolumeSets;
  const canRemove =
    removeCount > 0 &&
    volumeIndexes.length - removeCount >= minimumVolumeSets;
  const shouldAdd = canAdd && (preferMoreVolume || !canRemove);

  if (shouldAdd || (!canRemove && canAdd)) {
    const template = completedSets[volumeIndexes.at(-1)];

    for (let index = 0; index < addCount; index += 1) {
      completedSets.push({
        ...template,
        done: false,
        failed: false,
        skipped: false,
      });
    }
  } else if (canRemove) {
    const removeIndexes = new Set(volumeIndexes.slice(-removeCount));
    const reducedSets = completedSets.filter(
      (_, index) => !removeIndexes.has(index)
    );

    if ((warmupCount + reducedSets.length) % SMART_LIFT_GRID_COLUMNS !== 0) {
      throw new Error('Smart lift grid reduction invariant failed.');
    }

    return reducedSets;
  } else {
    throw new Error(
      'Smart lift grid cannot be completed within safe volume limits.'
    );
  }

  if ((warmupCount + completedSets.length) % SMART_LIFT_GRID_COLUMNS !== 0) {
    throw new Error('Smart lift grid completion invariant failed.');
  }

  return completedSets;
}

export function buildGeneratedSmartTrainingWorkout({
  sourceWorkout = {},
  athleteLevel = 'intermediate',
  squat = 0,
  bench = 0,
  deadlift = 0,
  accessoryMode = 'off',
  accessoryPRs = {},
  preparationMode = 'basicFirst',
  deadliftVariant = 'standard',
  benchPressVariant = 'standard',
  squatVariant = 'standard',
  history = [],
  currentCycle = 1,
  readiness = {},
  excludedLifts = [],
  forcedSecondaryLift = null,
} = {}) {
  const trainingMaxes = {
    Squat: Number(squat) || 0,
    Bench: Number(bench) || 0,
    Deadlift: Number(deadlift) || 0,
  };

  const normalizedPreparationMode = normalizePreparationMode(preparationMode);

  const liftStates = buildSmartLiftStates({
    history,
    currentCycle,
    trainingMaxes,
    meetPlanReadiness: readiness.meetPlanReadiness || {},
    rollingWindow: SMART_THRESHOLDS.ROLLING_TRAINING_DAYS,
  });

  const priorities = rankSmartLiftPriorities(liftStates, {
    athleteLevel,
  });

  const frequencyEligibility = getProjectedSmartLiftEligibility({
    history,
    currentCycle,
    athleteLevel,
    targetWorkoutNumber: sourceWorkout.number,
  });
  const frequencyScoreState = computeSmartFrequencyScoreState({
    history,
    currentCycle,
    workoutNumber: sourceWorkout.number,
    athleteLevel,
  });

  const excludedLiftsSet = new Set(excludedLifts);
  const configuredPriorities = priorities.filter(item =>
    !excludedLiftsSet.has(item.lift) &&
    Number(trainingMaxes[item.lift]) > 0
  );

  let selectedLifts;
  let primaryEligibleSet = new Set();
  let secondaryEligibleSet = new Set();

  if (
    forcedSecondaryLift &&
    Number(trainingMaxes[forcedSecondaryLift]) > 0 &&
    !excludedLiftsSet.has(forcedSecondaryLift)
  ) {
    // A lift can still have light-only capacity left (its heavy-maximum is
    // hit, but its total/light caps aren't) while every other lift is fully
    // excluded. Normal primary selection would force it into the 'primary'
    // role - and explicitIntensityRole (smartFrequencyPolicy.js) always
    // reads 'primary' as heavy regardless of the actual prescription,
    // guaranteeing it re-trips its own heavy cap and gets excluded too.
    // Force it into the 'secondary' role instead so it's genuinely
    // prescribed light and can actually fit its remaining capacity.
    const forcedPriority =
      priorities.find(item => item.lift === forcedSecondaryLift) ||
      { lift: forcedSecondaryLift, score: 0 };

    selectedLifts = [{
      lift: forcedSecondaryLift,
      role: 'secondary',
      priority: forcedPriority,
    }];
  } else {
  const primaryEligibilityOrder = new Map(
    frequencyEligibility.primaryEligibleLifts.map(
      (lift, index) => [lift, index]
    )
  );
  primaryEligibleSet = new Set(
    frequencyEligibility.primaryEligibleLifts
  );
  secondaryEligibleSet = new Set(
    frequencyEligibility.secondaryEligibleLifts
  );

  let availablePrimaryPriorities = configuredPriorities
    .filter(item => primaryEligibleSet.has(item.lift))
    .sort((a, b) =>
      Number(primaryEligibilityOrder.get(a.lift) ?? 999) -
        Number(primaryEligibilityOrder.get(b.lift) ?? 999) ||
      b.score - a.score
    );

  if (!availablePrimaryPriorities.length) {
    // No lift is due for its own "lead" turn today (e.g. the one lift that
    // was still under-target got excluded for an unrelated reason, like a
    // consecutive-day conflict from the outer retry loop) - prefer a lift
    // that still has genuine remaining weekly capacity
    // (secondaryEligibleLifts, gated on the lift's own raw exposure count)
    // over blindly falling back to "anyone" below, which could otherwise
    // re-admit a lift that already used its full weekly allocation. Real
    // report: on C3W37, Squat (the only lift still under target) was
    // excluded for training the day before - the next fallback tier's
    // "anyone but the last primary lift" then pulled Deadlift back in even
    // though Deadlift was already at 2/2 for the week and Bench still had
    // real room left.
    availablePrimaryPriorities = configuredPriorities
      .filter(item => secondaryEligibleSet.has(item.lift));
  }

  if (!availablePrimaryPriorities.length) {
    availablePrimaryPriorities = configuredPriorities
      .filter(item =>
        item.lift !== frequencyEligibility.lastPrimaryLift
      );
  }

  if (!availablePrimaryPriorities.length) {
    availablePrimaryPriorities = configuredPriorities;
  }

  const shouldPrioritizeMeetWeakestLift = Boolean(
    !readiness.meetPlanReady &&
    readiness.meetPlanWeakestLift &&
    Number(readiness.recentFatigueScore) === 0 &&
    Number(readiness.recentFailedOrSkippedSetCount) === 0 &&
    !hasUnrecoveredSmartHardEffort(readiness)
  );

  const meetWeakestPriority = shouldPrioritizeMeetWeakestLift
    ? availablePrimaryPriorities.find(
      item => item.lift === readiness.meetPlanWeakestLift
    ) || null
    : null;

  // A lift only needs a real heavy/top-set exposure if it hasn't already
  // used its ideal weekly heavy allocation (SMART_FREQUENCY_SCORE_TARGETS_
  // BY_LEVEL's defaultMix.heavy) within the rolling window - out-ranking the
  // other candidates by exposure-count/recency isn't enough on its own.
  // Real report (C3W36): Squat, having already gone heavy on W30 (its one
  // heavy turn for the week, per its own default mix of 1 heavy exposure),
  // still got prescribed a near-repeat of that same heavy session on W36
  // purely because it out-ranked Bench under the (now recency-fixed)
  // primary-load comparison - neither lift actually still needed to be
  // heavy that week.
  const heavyQuotaByLift = getSmartFrequencyScoreTargets(athleteLevel);
  const isDueForHeavy = lift => {
    const heavyQuota = Number(heavyQuotaByLift[lift]?.defaultMix?.heavy) || 0;

    if (Number(frequencyEligibility.primaryExposureCounts[lift]) < heavyQuota) {
      return true;
    }

    // The lift already used its ideal heavy allocation this window - only
    // still allow another heavy exposure if it's badly behind on its
    // OVERALL weekly exposure count (under half its total target). Early in
    // a lift's week, getting it trained at all matters more than following
    // the ideal heavy/medium/light order; a lift already close to its full
    // weekly exposure count doesn't get that grace.
    const totalTarget = Number(frequencyEligibility.targets[lift]) || 0;
    const totalSoFar = Number(frequencyEligibility.exposureCounts[lift]) || 0;

    return totalTarget > 0 && totalSoFar < totalTarget / 2;
  };

  const dueForHeavyPriority = availablePrimaryPriorities.find(
    item => isDueForHeavy(item.lift)
  ) || null;

  const primaryPriority =
    meetWeakestPriority ||
    dueForHeavyPriority ||
    availablePrimaryPriorities[0] ||
    null;

  if (!primaryPriority) return null;

  const primaryLift = primaryPriority.lift;
  // meetWeakestPriority is an urgent meet-readiness override - it always
  // gets a genuine heavy exposure regardless of the weekly heavy quota,
  // same as before this change.
  const primaryLiftDueForHeavy = Boolean(
    !readiness.lastWorkoutWasHeavyTraining &&
    (primaryPriority === meetWeakestPriority || isDueForHeavy(primaryLift))
  );

  const secondaryCandidates = configuredPriorities
    .filter(item =>
      item.lift !== primaryLift &&
      secondaryEligibleSet.has(item.lift)
    )
    .map(item => {
      const state = liftStates[item.lift] || {};
      const wasInLastWorkout = (
        readiness.lastWorkoutLifts || []
      ).includes(item.lift);

      const bothLowerBody =
        ['Squat', 'Deadlift'].includes(primaryLift) &&
        ['Squat', 'Deadlift'].includes(item.lift);

      const lowerBodyFatiguePenalty =
        bothLowerBody
          ? Math.min(
            Number(readiness.recentSharedLowerBodyFatigueScore) || 0,
            4
          ) * 3
          : 0;

      const immediateRepeatPenalty =
        wasInLastWorkout ? 20 : 0;

      const stalenessBonus =
        (Number(state.workoutsSinceExposure) || 0) * 4;

      return {
        ...item,
        secondaryScore:
          item.score +
          stalenessBonus -
          immediateRepeatPenalty -
          lowerBodyFatiguePenalty,
      };
    })
    .sort((a, b) =>
      b.secondaryScore - a.secondaryScore ||
      b.score - a.score
    );

  const secondaryPriority =
    secondaryCandidates[0] || null;

  // A third lift is only ever additive on top of an already-valid 2-lift
  // day (e.g. DBS: heavy Deadlift + light Bench + light Squat) - never
  // a replacement for primary/secondary. Gate it on a genuine, full-exposure
  // deficit (not a marginal fraction) plus clean readiness, so it only fires
  // when every lift is meaningfully under-trained and recovery is good -
  // matching the same zero-fatigue/zero-failed-sets/no-unrecovered-hard-effort
  // signals already used above for shouldPrioritizeMeetWeakestLift. If the
  // resulting 3-lift candidate still violates a hard frequency cap, the
  // retry loop in generateSmartWorkouts excludes it like any other lift and
  // falls back to a clean 2-lift day.
  const tertiaryLift = secondaryPriority
    ? LIFT_ORDER.find(lift => lift !== primaryLift && lift !== secondaryPriority.lift)
    : null;

  const tertiaryDeficit = tertiaryLift
    ? Number(frequencyEligibility.targets[tertiaryLift] || 0) -
      Number(frequencyEligibility.weightedExposureCounts[tertiaryLift] || 0)
    : 0;

  const hasGoodReadinessForTertiary =
    Number(readiness.recentFatigueScore) === 0 &&
    Number(readiness.recentFailedOrSkippedSetCount) === 0 &&
    !hasUnrecoveredSmartHardEffort(readiness);

  const tertiaryPriority =
    tertiaryLift &&
    !excludedLiftsSet.has(tertiaryLift) &&
    Number(trainingMaxes[tertiaryLift]) > 0 &&
    tertiaryDeficit >= 1 &&
    hasGoodReadinessForTertiary
      ? priorities.find(item => item.lift === tertiaryLift) || null
      : null;

  selectedLifts = [
    {
      lift: primaryLift,
      // No lift in today's candidate pool still needs a real heavy
      // exposure this week - build the day's lead lift as light too
      // instead of forcing a repeat heavy top set (see isDueForHeavy
      // above).
      role: primaryLiftDueForHeavy ? 'primary' : 'secondary',
      priority: primaryPriority,
    },
    ...(secondaryPriority
      ? [{
        lift: secondaryPriority.lift,
        role: 'secondary',
        priority: secondaryPriority,
      }]
      : []),
    ...(tertiaryPriority
      ? [{
        lift: tertiaryLift,
        role: 'tertiary',
        priority: tertiaryPriority,
      }]
      : []),
  ];
  }

  selectedLifts = selectedLifts.map(selection => ({
    ...selection,
    intensityRole: selection.role === 'primary'
      ? 'heavy'
      : selection.role === 'tertiary'
        ? 'light'
        : Number(frequencyScoreState[selection.lift]?.remainingMix?.medium) > 0
          ? 'medium'
          : 'light',
  }));

  // Generic across both branches: in the forced-secondary path,
  // selectedLifts has exactly one entry (the forced lift), so it's reported
  // as the workout's "main" lift even though its role is 'secondary'.
  const reportedPrimaryLift = selectedLifts[0]?.lift || null;
  const reportedSecondaryLift = selectedLifts[1]?.lift || null;
  const buildLiftBlocks = ({ avoidRecentRepeat = false } = {}) =>
    selectedLifts.map((selection, selectionIndex) => {
    const isExplicitLightLift = selection.intensityRole === 'light';
    const prescription = buildSmartLiftPrescription({
      state: liftStates[selection.lift],
      role: selection.role,
      isSingleLiftWorkout: selectedLifts.length === 1,
      isMixedLiftWorkout: selectedLifts.length > 1,
      avoidRecentRepeat:
        avoidRecentRepeat && selectionIndex === 0,
    });

    if (!prescription.validation.valid) {
      throw new Error(
        `Invalid Smart prescription for ${selection.lift}: ` +
        prescription.validation.errors.join(' ')
      );
    }

    const isSingleLiftWorkout = selectedLifts.length === 1;
    const initialWarmups = generateWarmups(
      prescription.sets,
      selection.lift,
      isSingleLiftWorkout
    );
    const completedSets = completeSmartLiftGrid({
      sets: prescription.sets,
      warmups: initialWarmups,
      // Only bias toward MORE volume on a genuine single-lift day. On a
      // mixed (2- or 3-lift) day the primary lift's backoff count is
      // deliberately capped at 3 (isMixedLiftWorkout above), matching what
      // secondary/tertiary lifts already get - letting the grid-completion
      // step pad it back up here was silently undoing that cap (e.g. 3
      // warmups + 1 top + 3 backoff = 7, padded to 9 instead of trimmed to
      // 6), making the primary lift disproportionately harder than the
      // other lifts in the same workout for no intentional reason.
      preferMoreVolume:
        isSingleLiftWorkout &&
        selection.role === 'primary' &&
        !prescription.regressionReason &&
        Number(readiness.recentFatigueScore) <
          SMART_THRESHOLDS.FATIGUE_RECOVERY_SCORE &&
        Number(readiness.recentFailedOrSkippedSetCount) === 0,
      // A secondary/tertiary lift's volume block is meant to be light and
      // supplementary, but a single set is not a "light exposure" - it's
      // barely a stimulus at all. C3W36 regression boundary: a secondary
      // Squat block (3 warmups + isMixedLiftWorkout's own 3-set volume
      // target = 6, remainder 2 against the 4-column grid) got trimmed all
      // the way down to ONE 4-rep work set instead of padded up to five,
      // because the floor of 1 let the grid-completion step prefer removal
      // over addition. Floor secondary/tertiary at the same 3 sets
      // isMixedLiftWorkout already targets for them, so the grid can still
      // trim a genuine one-set-too-many but can never collapse a whole
      // volume block down to a token single set.
      minimumVolumeSets: selection.role === 'primary' ? 2 : 3,
    });
    let doseConstrainedSets = isExplicitLightLift
      ? constrainExplicitLightLiftDose({
        sets: completedSets,
        trainingMax: trainingMaxes[selection.lift],
      })
      : completedSets;
    const lightWorkWeights = doseConstrainedSets
      .filter(set => {
        const label = String(set?.labelKey || '').toLowerCase();
        return label === 'backoff' || label === 'worksets';
      })
      .map(set => Number(set.weight) || 0)
      .filter(weight => weight > 0);
    const lightWorkWeight = lightWorkWeights.length
      ? Math.min(...lightWorkWeights)
      : 0;
    const canPreserveInitialWarmups =
      isExplicitLightLift &&
      lightWorkWeight > 0 &&
      initialWarmups.every(warmup =>
        Number(warmup?.weight) > 0 &&
        Number(warmup.weight) < lightWorkWeight &&
        lightWorkWeight - Number(warmup.weight) >= 7.5
      );
    let completedWarmups = canPreserveInitialWarmups
      ? initialWarmups
      : generateWarmups(
        doseConstrainedSets,
        selection.lift,
        isSingleLiftWorkout
      );

    // Lowering an explicitly light work weight can remove a now-redundant
    // warm-up. If that changes the row count, complete the grid once more
    // against the final warm-ups, then reapply the rep cap for the final
    // number of work sets. The weight no longer changes on this pass, so
    // warm-up generation is stable afterwards.
    if (
      isExplicitLightLift &&
      (completedWarmups.length + doseConstrainedSets.length) % SMART_LIFT_GRID_COLUMNS !== 0
    ) {
      doseConstrainedSets = completeSmartLiftGrid({
        sets: doseConstrainedSets,
        warmups: completedWarmups,
        minimumVolumeSets: 3,
      });
      doseConstrainedSets = constrainExplicitLightLiftDose({
        sets: doseConstrainedSets,
        trainingMax: trainingMaxes[selection.lift],
      });
      completedWarmups = generateWarmups(
        doseConstrainedSets,
        selection.lift,
        isSingleLiftWorkout
      );
    }

    if ((completedWarmups.length + doseConstrainedSets.length) % SMART_LIFT_GRID_COLUMNS !== 0) {
      throw new Error(
        `Incomplete Smart lift grid for ${selection.lift}.`
      );
    }

    const includePreparation =
      selectionIndex === 0 ||
      normalizedPreparationMode === 'basicAll';

    const liftBlock = {
      lift: selection.lift,
      role: selection.role,
      intensityRole: selection.intensityRole,
      sets: doseConstrainedSets,
      warmups: completedWarmups,
      prepItems: includePreparation
        ? generatePrepItems(selection.lift, normalizedPreparationMode)
        : [],
      smartPrescription: {
        role: selection.role,
        intensityRole: selection.intensityRole,
        priorityScore: selection.priority.score,
        progressionAnchorPct:
          prescription.progressionAnchorPct || 0,
        topSetAnchorPct:
          prescription.topSetAnchorPct || 0,
        topSetAnchorWeight:
          prescription.topSetAnchorWeight || 0,
        volumeAnchorPct:
          prescription.volumeAnchorPct || 0,
        plannedVolumePct:
          prescription.plannedVolumePct || 0,
        meetSpecificProgression:
          Boolean(prescription.meetSpecificProgression),
        repeatVariationApplied:
          Boolean(prescription.repeatVariationApplied),
        regressionReason:
          prescription.regressionReason || null,
        completeGrid: true,
        gridItemCount:
          doseConstrainedSets.length + completedWarmups.length,
      },
    };

    if (selection.lift === 'Squat') {
      liftBlock.squatVariant =
        normalizeSquatVariant(squatVariant);
    }

    if (selection.lift === 'Bench') {
      liftBlock.benchPressVariant =
        normalizeBenchPressVariant(benchPressVariant);
    }

    if (selection.lift === 'Deadlift') {
      liftBlock.deadliftVariant =
        normalizeDeadliftVariant(deadliftVariant);
    }

    return liftBlock;
  });


  let liftBlocks = buildLiftBlocks();
  const initialPrimaryBlock = liftBlocks[0];
  const initialCandidate = {
    type: 'training',
    lift: reportedPrimaryLift,
    lifts: liftBlocks,
    sets: initialPrimaryBlock?.sets || [],
  };
  const shouldVaryRecentRepeat =
    shouldVaryRepeatedSmartPrescription(
      initialCandidate,
      readiness
    );

  if (shouldVaryRecentRepeat) {
    liftBlocks = buildLiftBlocks({ avoidRecentRepeat: true });
  }

  const primaryBlock = liftBlocks[0];

  const accessoriesByLift = selectedLifts.map(selection =>
    generateAccessoriesForLift(
      selection.lift,
      accessoryMode,
      accessoryPRs,
      trainingMaxes
    )
  );
  const accessories = selectSmartAccessoriesForWorkout(
    accessoriesByLift
  );
  const repeatVariationApplied = Boolean(
    primaryBlock?.smartPrescription?.repeatVariationApplied
  );

  return {
    ...resetSmartWorkoutProgress(sourceWorkout),
    number: sourceWorkout.number,
    type: 'training',
    label: null,
    labelKey: 'practice',
    lift: reportedPrimaryLift,
    lifts: liftBlocks,
    sets: primaryBlock?.sets || [],
    warmups: primaryBlock?.warmups || [],
    prepItems: primaryBlock?.prepItems || [],
    accessories,
    cooldownItems: [],
    preparationMode: normalizedPreparationMode,
    smartSourceWorkoutNumber: null,
    smartGeneratedPrescription: true,
    smartGeneratedPrescriptionVersion: SMART_PRESCRIPTION_VERSION,
    smartLiftPriorities: priorities,
    smartTrainingSelectionSummary: {
      sourceWorkoutNumber: null,
      candidateLifts: selectedLifts.map(item => item.lift),
      primaryLift: reportedPrimaryLift,
      secondaryLift: reportedSecondaryLift,
      generatedFromHistory: true,
      templateIndependent: true,
      frequencyTargets: frequencyEligibility.targets,
      frequencyExposureCounts: frequencyEligibility.exposureCounts,
      frequencyPrimaryExposureCounts:
        frequencyEligibility.primaryExposureCounts,
      frequencySecondaryExposureCounts:
        frequencyEligibility.secondaryExposureCounts,
      frequencyWeightedExposureCounts:
        frequencyEligibility.weightedExposureCounts,
      frequencyEligibleLifts: frequencyEligibility.eligibleLifts,
      frequencyPrimaryEligibleLifts:
        frequencyEligibility.primaryEligibleLifts,
      frequencySecondaryEligibleLifts:
        frequencyEligibility.secondaryEligibleLifts,
      frequencyLastPrimaryLift:
        frequencyEligibility.lastPrimaryLift,
      frequencyWindowWorkoutNumbers:
        frequencyEligibility.previousWorkoutNumbers,
      reasonFlags: [
        'generated-prescription',
        'history-based-lift-priority',
        primaryEligibleSet.size < configuredPriorities.length ||
          secondaryEligibleSet.size < configuredPriorities.length
          ? 'projected-frequency-guard'
          : null,
        primaryEligibleSet.size < configuredPriorities.length
          ? 'primary-load-balance'
          : null,
        secondaryEligibleSet.size < configuredPriorities.length
          ? 'secondary-frequency-guard'
          : null,
        frequencyEligibility.lastPrimaryLift &&
          !primaryEligibleSet.has(
            frequencyEligibility.lastPrimaryLift
          ) &&
          reportedPrimaryLift !== frequencyEligibility.lastPrimaryLift
          ? 'avoided-consecutive-primary'
          : null,
        readiness.meetPlanWeakestLift === reportedPrimaryLift
          ? 'meet-plan-weakest-lift-primary'
          : null,
        repeatVariationApplied
          ? 'recent-prescription-variation'
          : null,
      ].filter(Boolean),
    },
    [SMART_GENERATED_FLAGS.TRAINING]: true,
  };
}

function generateSmartWorkouts({
  programProfile,
  athleteLevel = 'intermediate',
  squat,
  bench,
  deadlift,
  accessoryMode = 'off',
  accessoryPRs = {},
  preparationMode = 'basicFirst',
  deadliftVariant = 'standard',
  benchPressVariant = 'standard',
  squatVariant = 'standard',
  cooldownMode = 'upperBackFriendly',
  history = [],
  currentIndex = 0,
  currentCycle = 1,
  meetPlannerAttempts = {},
}) {
  const smartContext = buildSmartTrainingContext({
    history,
    currentIndex,
    currentCycle,
  });

  const baseGeneratedWorkouts = generateProgramForProfile(
    programProfile,
    squat,
    bench,
    deadlift,
    accessoryMode,
    accessoryPRs,
    preparationMode,
    deadliftVariant,
    benchPressVariant,
    squatVariant,
    cooldownMode
  );

  const generatedWorkouts = buildSmartWorkoutPool(
    baseGeneratedWorkouts,
    smartContext.currentIndex
  );
  const smartMeetCandidate = baseGeneratedWorkouts.find(workout => workout?.type === 'meet') || null;

  if (!Number.isFinite(smartContext.currentIndex)) {
    return generatedWorkouts.map(workout => ({
      ...workout,
      smartVisible: true,
      smartSelectable: true,
    }));
  }

  const smartDecision = decideSmartNextWorkoutIndex({
    ...smartContext,
    programProfile,
    athleteLevel,
    prs: {
      Squat: squat,
      Bench: bench,
      Deadlift: deadlift,
    },
    meetPlannerAttempts,
  }, generatedWorkouts);
  const visibleThroughIndex = Math.min(
    Math.max(smartDecision.index, 0),
    Math.max(generatedWorkouts.length - 1, 0)
  );

  let generatedSmartTrainingWorkout = null;

  if (smartDecision.dayType === SMART_DAY_TYPES.TRAINING) {
    const smartWorkoutArgs = {
      sourceWorkout:
        generatedWorkouts[visibleThroughIndex] || {
          number: visibleThroughIndex + 1,
        },
      athleteLevel,
      squat,
      bench,
      deadlift,
      accessoryMode,
      accessoryPRs,
      preparationMode,
      deadliftVariant,
      benchPressVariant,
      squatVariant,
      history,
      currentCycle,
      readiness: smartDecision.readiness,
    };

    // A lift can look fine on soft exposure targets (used for selection
    // above) yet still violate a hard frequency cap (maxHeavy/maxLight -
    // only knowable once the prescription itself is generated). Retry with
    // that lift excluded rather than accepting a capped candidate, so we
    // never fall through to the stale Classic-template supplemental path
    // in constrainSmartWorkoutByFrequency below.
    let excludedLifts = [];
    // Each retry attempt only ever checks the lift(s) still left in that
    // attempt's narrowed candidate (earlier-excluded lifts aren't
    // re-checked), so "every lift hard-capped" can only be detected by
    // accumulating rolling-window-maximum blockers ACROSS attempts, not by
    // looking at a single attempt's decision in isolation.
    const rollingWindowMaxLifts = new Set();
    // A lift blocked only by heavy-maximum (total/light caps still have
    // room) still has real light-only capacity left - but the normal retry
    // loop only ever tries lifts as 'primary' (always heavy, see
    // explicitIntensityRole in smartFrequencyPolicy.js), so it always
    // re-trips the same heavy cap and gets excluded outright. Track these
    // separately so they can be retried with a forced light role below.
    const heavyOnlyBlockedLifts = new Set();
    let lastDecision = null;
    for (let attempt = 0; attempt < SMART_LIFTS.length; attempt += 1) {
      const candidate = buildGeneratedSmartTrainingWorkout({
        ...smartWorkoutArgs,
        excludedLifts,
      });

      if (!candidate) break;

      generatedSmartTrainingWorkout = candidate;

      const decision = getSmartFrequencyPolicyDecision({
        history,
        currentCycle,
        workoutNumber: candidate.number || (visibleThroughIndex + 1),
        candidateWorkout: candidate,
        athleteLevel,
      });
      lastDecision = decision;

      decision.blockers.forEach(blocker => {
        if (blocker.reasons.includes('rolling-window-maximum')) {
          rollingWindowMaxLifts.add(blocker.lift);
        } else if (
          blocker.reasons.includes('heavy-maximum') &&
          !blocker.reasons.includes('light-maximum')
        ) {
          heavyOnlyBlockedLifts.add(blocker.lift);
        }
      });

      if (decision.valid) {
        // Already frequency-compliant via a real Smart-generated candidate -
        // tell generateWorkoutsForTrainingModel's outer frequency check to
        // skip its own supplemental-lift top-up, which sources replacement
        // blocks from the static Classic-template pool, not the Smart
        // engine, and would otherwise silently overwrite this valid,
        // deliberately single-lift (or two-lift) result.
        generatedSmartTrainingWorkout.smartFrequencyValidated = true;
        break;
      }

      excludedLifts = [...new Set([
        ...excludedLifts,
        ...decision.blockers.map(blocker => blocker.lift),
      ])];
    }

    if (
      generatedSmartTrainingWorkout &&
      !generatedSmartTrainingWorkout.smartFrequencyValidated &&
      lastDecision &&
      !lastDecision.valid
    ) {
      const forcedLift = (generatedSmartTrainingWorkout.smartLiftPriorities || [])
        .filter(item => heavyOnlyBlockedLifts.has(item.lift))
        .sort((a, b) => b.score - a.score)[0]?.lift
        || [...heavyOnlyBlockedLifts][0]
        || null;

      const forcedCandidate = forcedLift
        ? buildGeneratedSmartTrainingWorkout({
          ...smartWorkoutArgs,
          excludedLifts: excludedLifts.filter(lift => lift !== forcedLift),
          forcedSecondaryLift: forcedLift,
        })
        : null;

      const forcedDecision = forcedCandidate
        ? getSmartFrequencyPolicyDecision({
          history,
          currentCycle,
          workoutNumber: forcedCandidate.number || (visibleThroughIndex + 1),
          candidateWorkout: forcedCandidate,
          athleteLevel,
        })
        : null;

      if (forcedCandidate && forcedDecision?.valid) {
        generatedSmartTrainingWorkout = forcedCandidate;
        generatedSmartTrainingWorkout.smartFrequencyValidated = true;
      } else {
        // Distinguish a narrow, transitional cap violation from a genuine
        // full exhaustion where every lift has hit its hard maxTotal/
        // rolling-window cap and truly cannot be trained again this week
        // under any circumstance. For the former, a Smart-generated
        // candidate that's a little over cap for one transitional day is
        // still better than falling through to the stale Classic-template
        // supplemental path below, so accept it as-is. For the latter,
        // leave smartFrequencyValidated unset so generateWorkoutsForTrainingModel's
        // own constrainSmartWorkoutByFrequency call runs and correctly
        // converts this into a rest day instead of handing out an over-cap
        // workout with nowhere left to go.
        const allLiftsFrequencyExhausted = SMART_LIFTS.every(lift =>
          rollingWindowMaxLifts.has(lift)
        );

        if (!allLiftsFrequencyExhausted) {
          generatedSmartTrainingWorkout.smartFrequencyValidated = true;
        }
      }
    }
  }

  const smartTrainingCandidateDebug = buildSmartTrainingCandidateDebug({
    generatedWorkouts,
    visibleThroughIndex,
    readiness: smartDecision.readiness,
    usedSmartSourceWorkoutNumbers: smartContext.usedSmartSourceWorkoutNumbers,
  });

  const fallbackTrainingCandidate = smartDecision.dayType === SMART_DAY_TYPES.DELOAD
    ? selectSmartDeloadCandidate({
      generatedWorkouts,
      visibleThroughIndex,
      readiness: smartDecision.readiness,
      usedSmartSourceWorkoutNumbers: smartContext.usedSmartSourceWorkoutNumbers,
    }) || selectSmartTrainingCandidate({
      generatedWorkouts,
      visibleThroughIndex,
      readiness: smartDecision.readiness,
      usedSmartSourceWorkoutNumbers: smartContext.usedSmartSourceWorkoutNumbers,
    })
    : selectSmartTrainingCandidate({
      generatedWorkouts,
      visibleThroughIndex,
      readiness: smartDecision.readiness,
      usedSmartSourceWorkoutNumbers: smartContext.usedSmartSourceWorkoutNumbers,
    });

  return generatedWorkouts.map((workout, index) => {
    const isDecisionWorkout = index === visibleThroughIndex;
    const shouldBuildRecoveryDay =
      isDecisionWorkout &&
      smartDecision.dayType === SMART_DAY_TYPES.RECOVERY;
    const shouldBuildDeloadDay =
      isDecisionWorkout &&
      smartDecision.dayType === SMART_DAY_TYPES.DELOAD;
    const shouldBuildMeetDay =
      isDecisionWorkout &&
      smartDecision.dayType === SMART_DAY_TYPES.MEET;
    const shouldBlockSmartMeetDay =
      isDecisionWorkout &&
      smartDecision.dayType === SMART_DAY_TYPES.TRAINING &&
      workout.type === 'meet';

    const hasEffectiveTrainingCandidate =
      fallbackTrainingCandidate?.type === 'training' &&
      hasEffectiveSmartTrainingStimulus(fallbackTrainingCandidate);

    const repeatsRecentTrainingPrescription =
      workout?.type === 'training' &&
      hasSameSmartTrainingPrescriptionAsLastWorkout(
        workout,
        smartDecision.readiness
      );

    const shouldBuildNoEffectiveTrainingRecovery =
      isDecisionWorkout &&
      smartDecision.dayType === SMART_DAY_TYPES.TRAINING &&
      !hasEffectiveTrainingCandidate &&
      (
        workout.type !== 'training' ||
        !hasEffectiveSmartTrainingStimulus(workout) ||
        violatesSmartTrainingSafety(workout, smartDecision.readiness) ||
        repeatsRecentTrainingPrescription
      );

    const shouldUseFallbackTraining =
      isDecisionWorkout &&
      smartDecision.dayType === SMART_DAY_TYPES.TRAINING &&
      hasEffectiveTrainingCandidate &&
      (
        workout.type !== 'training' ||
        shouldBlockSmartMeetDay ||
        fallbackTrainingCandidate.number !== workout.number ||
        (
          smartDecision.readiness?.lastWasRecoveryIntervention &&
          isHeavySmartTrainingCandidate(workout) &&
          fallbackTrainingCandidate.number !== workout.number
        )
      );

    const smartWorkout = shouldBuildRecoveryDay
      ? buildSmartRecoveryWorkout(workout)
      : shouldBuildNoEffectiveTrainingRecovery
        ? buildSmartRecoveryWorkout(workout)
        : shouldBlockSmartMeetDay && !fallbackTrainingCandidate
          ? buildSmartRecoveryWorkout(workout)
        : shouldBuildMeetDay
          ? buildSmartMeetWorkout(workout, smartMeetCandidate, smartDecision.readiness)
          : shouldBuildDeloadDay
            ? buildSmartDeloadWorkout(workout, fallbackTrainingCandidate, smartDecision.readiness)
            : shouldUseFallbackTraining
            ? buildSmartTrainingWorkout(workout, fallbackTrainingCandidate, {
              forceReplacement: true,
            })
            : isDecisionWorkout && smartDecision.dayType === SMART_DAY_TYPES.TRAINING && workout.type === 'training'
              ? buildSmartTrainingWorkout(workout, workout)
              : workout;

    const generatedPrescriptionWorkout =
      isDecisionWorkout &&
      smartDecision.dayType === SMART_DAY_TYPES.TRAINING &&
      generatedSmartTrainingWorkout
        ? {
          ...generatedSmartTrainingWorkout,
          number: workout.number,
        }
        : smartWorkout;

    const adjustedSmartWorkout =
      isDecisionWorkout &&
      smartDecision.dayType === SMART_DAY_TYPES.TRAINING &&
      !generatedSmartTrainingWorkout
        ? buildSmartVolumeStimulusWorkout(
          generatedPrescriptionWorkout,
          smartDecision.readiness
        )
        : generatedPrescriptionWorkout;

    const finalSmartWorkout = adjustedSmartWorkout;

    const effectiveSmartDayType = shouldBuildNoEffectiveTrainingRecovery
      ? SMART_DAY_TYPES.RECOVERY
      : smartDecision.dayType;

    const smartDecisionSummary = isDecisionWorkout
      ? {
        dayType: effectiveSmartDayType,
        reason: smartDecision.reason,
        overrideType: smartDecision.overrideType,
        readiness: smartDecision.readiness
          ? {
            completedCount: smartDecision.readiness.completedCount || 0,
            activeBlockCompletedCount: smartDecision.readiness.activeBlockCompletedCount || 0,
            activeBlockLiftExposureCounts: smartDecision.readiness.activeBlockLiftExposureCounts || {},
            rollingLiftExposureCounts: smartDecision.readiness.rollingLiftExposureCounts || {},
            rollingTrainingDayCount:
              smartDecision.readiness.rollingTrainingDayCount || 0,
            recentLiftSetEffortScores: smartDecision.readiness.recentLiftSetEffortScores || {},
            recentSharedLowerBodyFatigueScore:
              smartDecision.readiness.recentSharedLowerBodyFatigueScore || 0,
            lastTrainingDayHeavyDeadlift:
              Boolean(smartDecision.readiness.lastTrainingDayHeavyDeadlift),
            lastWorkoutWasHeavyTraining:
              Boolean(smartDecision.readiness.lastWorkoutWasHeavyTraining),
            lastTrainingDayWasLightOnly:
              Boolean(smartDecision.readiness.lastTrainingDayWasLightOnly),
            recentHeavyDeadliftDayCount:
              smartDecision.readiness.recentHeavyDeadliftDayCount || 0,
            recentSquatMaxPct:
              smartDecision.readiness.recentSquatMaxPct || 0,
            meetPlanReady: Boolean(smartDecision.readiness.meetPlanReady),
            meetPlanFullyDemonstrated: Boolean(
              smartDecision.readiness.meetPlanFullyDemonstrated
            ),
            meetPlanOpenerReady: Boolean(
              smartDecision.readiness.meetPlanOpenerReady
            ),
            meetPlanSecondAttemptReady: Boolean(
              smartDecision.readiness.meetPlanSecondAttemptReady
            ),
            meetPlanOpenerReadyCount:
              smartDecision.readiness.meetPlanOpenerReadyCount || 0,
            meetPlanSecondAttemptReadyCount:
              smartDecision.readiness.meetPlanSecondAttemptReadyCount || 0,
            meetPlanThirdAttemptPotentialCount:
              smartDecision.readiness.meetPlanThirdAttemptPotentialCount || 0,
            meetPlanHasCurrentCycleEvidence: Boolean(smartDecision.readiness.meetPlanHasCurrentCycleEvidence),
            meetPlanReadiness: smartDecision.readiness.meetPlanReadiness || {},
            meetPlanWeakestLift: smartDecision.readiness.meetPlanWeakestLift || null,
            meetPlanWeakestPhase:
              smartDecision.readiness.meetPlanWeakestPhase || null,
            meetPlanWeakestRatio: smartDecision.readiness.meetPlanWeakestRatio || 0,
            meetPlanWeakestTarget: smartDecision.readiness.meetPlanWeakestTarget || 0,
            meetPlanWeakestBestE1RM: smartDecision.readiness.meetPlanWeakestBestE1RM || 0,
            meetProjection: smartDecision.readiness.meetProjection || null,
            meetdayBlockers: smartDecision.readiness.meetdayBlockers || [],
            lastWorkoutNumber: smartDecision.readiness.lastWorkoutNumber || 0,
            lastMeetWorkoutNumber: smartDecision.readiness.lastMeetWorkoutNumber || 0,
            lastWorkoutEffort: smartDecision.readiness.lastWorkoutEffort || null,
            lastWorkoutLifts: smartDecision.readiness.lastWorkoutLifts || [],
            lastWorkoutPrimaryLift: smartDecision.readiness.lastWorkoutPrimaryLift || null,
            lastWorkoutPrescriptionSignature:
              smartDecision.readiness.lastWorkoutPrescriptionSignature || '',
            recentTrainingPrescriptionSignatures:
              smartDecision.readiness.recentTrainingPrescriptionSignatures || [],
            lastSmartDayType: smartDecision.readiness.lastSmartDayType || null,
            lastWasRestDay: Boolean(smartDecision.readiness.lastWasRestDay),
            lastWasRecoveryIntervention: Boolean(smartDecision.readiness.lastWasRecoveryIntervention),
            inPostMeetRecovery: Boolean(smartDecision.readiness.inPostMeetRecovery),
            postMeetRecoveryTarget: smartDecision.readiness.postMeetRecoveryTarget || 0,
            postMeetRecoveryReason: smartDecision.readiness.postMeetRecoveryReason || null,
            postMeetRecoveryDaysCompleted: smartDecision.readiness.postMeetRecoveryDaysCompleted || 0,
            postMeetRecoveryTargetReached: Boolean(smartDecision.readiness.postMeetRecoveryTargetReached),
            recentHardCount: smartDecision.readiness.recentHardCount || 0,
            recentEasyCount: smartDecision.readiness.recentEasyCount || 0,
            recentFailedOrSkippedSetCount: smartDecision.readiness.recentFailedOrSkippedSetCount || 0,
            recentFailedOrSkippedSetCountsByLift: smartDecision.readiness.recentFailedOrSkippedSetCountsByLift || {},
            trainingCandidateDebug: smartTrainingCandidateDebug,
            effortFatigueScore: smartDecision.readiness.effortFatigueScore || 0,
            failedSetFatigueScore: smartDecision.readiness.failedSetFatigueScore || 0,
            recentFatigueScore: smartDecision.readiness.recentFatigueScore || 0,
          }
          : null,
      }
      : null;

    return {
      ...finalSmartWorkout,
      smartTrainingSelectionSummary:
        isDecisionWorkout &&
        smartDecision.dayType === SMART_DAY_TYPES.TRAINING
          ? (
            generatedSmartTrainingWorkout
              ? generatedSmartTrainingWorkout.smartTrainingSelectionSummary
              : buildSmartTrainingSelectionSummary(
                shouldUseFallbackTraining
                  ? fallbackTrainingCandidate
                  : adjustedSmartWorkout,
                smartDecision.readiness
              )
          )
          : null,
      smartVisible: index <= visibleThroughIndex,
      smartSelectable: index <= visibleThroughIndex,
      smartCurrentIndex: smartContext.currentIndex,
      smartCurrentCycle: smartContext.currentCycle,
      smartDecision: null,
      smartDecisionSummary,
      smartDayType: isDecisionWorkout ? effectiveSmartDayType : null,
      smartOverride: shouldBuildMeetDay
        ? SMART_OVERRIDES.MEETDAY
        : shouldBuildDeloadDay
          ? SMART_OVERRIDES.DELOAD
          : shouldBuildRecoveryDay || shouldBuildNoEffectiveTrainingRecovery
            ? SMART_OVERRIDES.RECOVERY
          : shouldUseFallbackTraining
            ? (
              smartDecision.readiness?.lastWasRecoveryIntervention
                ? SMART_OVERRIDES.POST_RECOVERY_LIGHT_TRAINING
                : SMART_OVERRIDES.TRAINING_FALLBACK
            )
            : null,
    };
  });
}

export function generateWorkoutsForTrainingModelUnconstrained(model, args = {}) {
  const workoutArgs = {
    programProfile: normalizeProgramProfile(args.programProfile),
    athleteLevel: normalizeAthleteLevel(args.athleteLevel),
    squat: args.squat,
    bench: args.bench,
    deadlift: args.deadlift,
    accessoryMode: args.accessoryMode ?? 'off',
    accessoryPRs: args.accessoryPRs || {},
    preparationMode: args.preparationMode ?? 'basicFirst',
    deadliftVariant: args.deadliftVariant ?? 'standard',
    benchPressVariant: args.benchPressVariant ?? 'standard',
    squatVariant: args.squatVariant ?? 'standard',
    cooldownMode: args.cooldownMode ?? 'upperBackFriendly',
    history: args.history || [],
    currentIndex: args.currentIndex ?? 0,
    currentCycle: args.currentCycle ?? 1,
    meetPlannerAttempts: args.meetPlannerAttempts || {},
  };

  if (isSmartTrainingModel(model)) {
    return generateSmartWorkouts(workoutArgs);
  }

  return generateProgramForProfile(
    workoutArgs.programProfile,
    workoutArgs.squat,
    workoutArgs.bench,
    workoutArgs.deadlift,
    workoutArgs.accessoryMode,
    workoutArgs.accessoryPRs,
    workoutArgs.preparationMode,
    workoutArgs.deadliftVariant,
    workoutArgs.benchPressVariant,
    workoutArgs.squatVariant,
    workoutArgs.cooldownMode
  );
}

function getSmartFrequencyCurrentIndex(workouts, options = {}) {
  const explicitCandidates = [
    options.currentIndex,
    options.selectedIndex,
    options.inProgress?.selectedIndex,
  ];

  for (const candidate of explicitCandidates) {
    const numericCandidate = Number(candidate);
    if (Number.isInteger(numericCandidate) && numericCandidate >= 0 && numericCandidate < workouts.length) {
      return numericCandidate;
    }
  }

  const history = options.history || options.data?.history || [];
  const currentCycle = Number(options.currentCycle || options.data?.currentCycle) || 1;
  const completedWorkoutNumbers = getCompletedWorkoutNumbers(history, currentCycle);
  const firstIncompleteIndex = workouts.findIndex(
    workout => !completedWorkoutNumbers.has(Number(workout?.number)),
  );

  return firstIncompleteIndex >= 0 ? firstIncompleteIndex : Math.max(0, workouts.length - 1);
}

function normalizeGeneratedMeetSet(set = {}) {
  const currentWeight = Number(set.weight) || 0;
  if (currentWeight <= 0) return set;

  const roundedWeight = roundBarbellWeight(
    currentWeight,
    'nearest',
    5,
  );
  const originalWeight =
    Number(set.originalWeight ?? set.weight) || currentWeight;

  return {
    ...set,
    weight: roundedWeight,
    originalWeight: roundBarbellWeight(
      originalWeight,
      'nearest',
      5,
    ),
  };
}

export function normalizeSmartMeetWorkoutWeights(workouts = []) {
  return (Array.isArray(workouts) ? workouts : []).map((workout) => {
    const isMeetWorkout = (
      workout?.type === 'meet'
      || workout?.smartDayType === SMART_DAY_TYPES.MEET
      || workout?.smartDecisionSummary?.dayType === SMART_DAY_TYPES.MEET
    );

    if (!isMeetWorkout) return workout;

    const lifts = (workout.lifts || []).map((liftBlock) => ({
      ...liftBlock,
      sets: (liftBlock.sets || []).map(normalizeGeneratedMeetSet),
    }));

    return {
      ...workout,
      lifts,
      sets: (workout.sets || []).map(normalizeGeneratedMeetSet),
    };
  });
}

// selectSupplementalLiftBlocks/normalizeSupplementalHeavyLiftBlock
// (smartFrequencyPolicy.js) build a standalone top+backoff prescription for
// a lift pulled in to fill a second workout slot, but can't call
// generateWarmups/completeSmartLiftGrid themselves without an import cycle
// (warmupAndPrepGeneration.js already imports FROM smartFrequencyPolicy.js,
// and completeSmartLiftGrid only lives here) - so warmups there fall back to
// a hand-rolled second-warmup calc with no max-jump check, and the grid
// completion step never runs at all. Finish the job here instead, where
// both already live: regenerate warmups properly (respecting the same
// max-jump rule every other prescription gets) and pad/trim the backoff
// count to the same "grid is always a multiple of 4" guarantee.
export function regenerateSupplementalLiftBlockGrid(liftBlock) {
  if (liftBlock?.frequencyRole !== 'supplemental-heavy') return liftBlock;

  const warmups = generateWarmups(liftBlock.sets || [], liftBlock.lift);
  const completedSets = completeSmartLiftGrid({
    sets: liftBlock.sets || [],
    warmups,
    minimumVolumeSets: 2,
  });

  return {
    ...liftBlock,
    warmups,
    sets: completedSets,
    smartPrescription: {
      ...(liftBlock.smartPrescription || {}),
      gridItemCount: warmups.length + completedSets.length,
    },
  };
}

function regenerateSupplementalLiftBlocksInWorkout(workout) {
  const lifts = Array.isArray(workout.lifts) ? workout.lifts : [];

  if (!lifts.some(block => block?.frequencyRole === 'supplemental-heavy')) {
    return workout;
  }

  const nextLifts = lifts.map(regenerateSupplementalLiftBlockGrid);
  const primaryLiftBlock = nextLifts[0] || null;

  return {
    ...workout,
    lifts: nextLifts,
    lift: primaryLiftBlock?.lift ?? workout.lift,
    warmups: primaryLiftBlock?.warmups ?? workout.warmups,
    sets: primaryLiftBlock?.sets ?? workout.sets,
    prepItems: primaryLiftBlock?.prepItems ?? workout.prepItems,
  };
}

function generateWorkoutsForTrainingModelBase(trainingModel, options = {}) {
  const generatedWorkouts = generateWorkoutsForTrainingModelUnconstrained(
    trainingModel,
    options,
  );

  if (
    !isSmartTrainingModel(trainingModel)
    || !Array.isArray(generatedWorkouts)
    || generatedWorkouts.length === 0
  ) {
    return generatedWorkouts;
  }

  const workouts = normalizeSmartMeetWorkoutWeights(generatedWorkouts);
  const currentIndex = getSmartFrequencyCurrentIndex(workouts, options);
  const candidateWorkout = workouts[currentIndex];

  if (
    !candidateWorkout ||
    candidateWorkout.type !== 'training' ||
    candidateWorkout.smartFrequencyValidated
  ) {
    return workouts;
  }

  const history = options.history || options.data?.history || [];
  const currentCycle = Number(
    options.currentCycle || options.data?.currentCycle || candidateWorkout.cycle,
  ) || 1;

  // A deload day already picked its lift(s) deliberately - selectSmartDeloadCandidate
  // prioritizes whichever lift actually needs the reduced load (e.g. the
  // one that just failed). constrainSmartWorkoutByFrequency below is built
  // for normal training days that want to fill up to 2 lift slots, and has
  // no idea a workout is a deload - if the deload's own lift gets blocked
  // by a rolling-window/consecutive-day cap, it would silently substitute
  // an unrelated lift via the frequency-supplemented path, at FULL
  // intensity (that path has no concept of "this should be deloaded"),
  // defeating the entire point of today's reduced-load day. If the
  // deload's own selection is itself frequency-blocked, fall back to rest
  // instead of forcing a mismatched, full-intensity substitute.
  if (candidateWorkout.smartDayType === SMART_DAY_TYPES.DELOAD) {
    const deloadFrequencyDecision = getSmartFrequencyPolicyDecision({
      history,
      currentCycle,
      workoutNumber: candidateWorkout.number || (currentIndex + 1),
      candidateWorkout,
      athleteLevel: normalizeAthleteLevel(options.athleteLevel),
    });

    if (deloadFrequencyDecision.blockers.length === 0) {
      return workouts;
    }

    const nextWorkouts = [...workouts];
    nextWorkouts[currentIndex] = {
      // resetSmartWorkoutProgress (called inside buildSmartRecoveryWorkout)
      // deliberately clears smartVisible/smartSelectable to false - every
      // other caller relies on an outer wrapper to immediately re-derive
      // them from the workout's position (index <= visibleThroughIndex).
      // This is that workout's own decision slot, so it must stay visible/
      // selectable exactly like the deload day it's replacing was.
      ...buildSmartRecoveryWorkout(candidateWorkout),
      smartVisible: true,
      smartSelectable: true,
      smartDayType: SMART_DAY_TYPES.RECOVERY,
      smartOverride: SMART_DECISION_REASONS.FREQUENCY_RECOVERY,
      smartFrequencyValidated: true,
      smartDecisionSummary: candidateWorkout.smartDecisionSummary
        ? {
          ...candidateWorkout.smartDecisionSummary,
          dayType: SMART_DAY_TYPES.RECOVERY,
          reason: SMART_DECISION_REASONS.FREQUENCY_RECOVERY,
        }
        : candidateWorkout.smartDecisionSummary,
    };

    return nextWorkouts;
  }

  const constrained = constrainSmartWorkoutByFrequency({
    history,
    currentCycle,
    workoutNumber: candidateWorkout.number || (currentIndex + 1),
    candidateWorkout,
    availableWorkouts: workouts,
    currentIndex,
    trainingMaxes: {
      Squat: Number(options.squat) || 0,
      Bench: Number(options.bench) || 0,
      Deadlift: Number(options.deadlift) || 0,
    },
    athleteLevel: normalizeAthleteLevel(options.athleteLevel),
  });

  if (!constrained.changed) {
    return workouts;
  }

  constrained.workout = regenerateSupplementalLiftBlocksInWorkout(constrained.workout);

  const nextWorkouts = [...workouts];
  const previousReasonFlags =
    candidateWorkout?.smartTrainingSelectionSummary?.reasonFlags || [];
  const selectedLifts =
    (constrained.workout.lifts || []).map(({ lift }) => lift);
  const primaryLift = selectedLifts[0] || null;
  const secondaryLift = selectedLifts[1] || null;
  const policyReasonFlags = [
    constrained.workout.type === 'rest'
      ? 'frequency-policy-recovery'
      : 'frequency-policy-filtered',
    ...(constrained.summary.supplementedLifts || []).length > 0
      ? ['frequency-policy-supplemented']
      : [],
    constrained.summary.singleLiftVolumeExpanded
      ? 'frequency-policy-full-single-lift-volume'
      : null,
  ].filter(Boolean);

  let nextWorkout = {
    ...constrained.workout,
    smartDecisionSummary: {
      ...(
        constrained.workout.smartDecisionSummary
        || candidateWorkout.smartDecisionSummary
        || {}
      ),
      primaryLift,
      secondaryLift,
      frequencyPolicySelection: {
        primary: primaryLift,
        secondary: secondaryLift,
      },
      frequencyPolicy: constrained.summary,
    },
    smartTrainingSelectionSummary: {
      ...(
        constrained.workout.smartTrainingSelectionSummary
        || candidateWorkout.smartTrainingSelectionSummary
        || {}
      ),
      primaryLift,
      secondaryLift,
      selectedPrimaryLift: primaryLift,
      selectedSecondaryLift: secondaryLift,
      frequencyPolicySelection: {
        primary: primaryLift,
        secondary: secondaryLift,
      },
      frequencyPolicy: constrained.summary,
      reasonFlags: [
        ...new Set([
          ...previousReasonFlags,
          ...policyReasonFlags,
        ]),
      ],
    },
  };

  if (constrained.workout.type === 'rest') {
    nextWorkout = {
      ...nextWorkout,
      smartDayType: SMART_DAY_TYPES.RECOVERY,
      smartOverride: SMART_DECISION_REASONS.FREQUENCY_RECOVERY,
      [SMART_GENERATED_FLAGS.RECOVERY]: true,
      [SMART_GENERATED_FLAGS.TRAINING]: false,
      smartDecisionSummary: {
        ...nextWorkout.smartDecisionSummary,
        reason: SMART_DECISION_REASONS.FREQUENCY_RECOVERY,
      },
    };
  }

  nextWorkouts[currentIndex] = nextWorkout;
  return nextWorkouts;
}

const SMART_MEET_PROJECTION_MAX_FUTURE_WORKOUTS = 24;

function markProjectedSmartWorkoutSuccessful(workout = {}) {
  const lifts = (workout.lifts || []).map(liftBlock => ({
    ...liftBlock,
    warmups: (liftBlock.warmups || []).map(item => ({ ...item, done: true })),
    sets: (liftBlock.sets || []).map(set => ({
      ...set,
      done: true,
      failed: false,
      skipped: false,
    })),
  }));

  return {
    ...workout,
    completed: true,
    workoutEffort: workout.type === 'training' ? 'good' : null,
    lifts,
    warmups: lifts[0]?.warmups || [],
    sets: lifts[0]?.sets || [],
  };
}

function projectedSmartHistoryEntries(workout, currentCycle) {
  const snapshot = markProjectedSmartWorkoutSuccessful(workout);
  const projectedE1RM = set => {
    const weight = Number(set?.weight) || 0;
    const reps = Number(set?.reps) || 0;
    return reps <= 1 ? weight : weight * (1 + reps / 30);
  };

  if ((snapshot.lifts || []).length === 0) {
    return [{
      workoutNumber: snapshot.number,
      cycle: currentCycle,
      smartDayType: snapshot.smartDayType,
      restDay: snapshot.type === 'rest',
      completionOnly: true,
      workoutEffort: null,
      failedOrSkippedSetCount: 0,
      smartDecisionSummary: snapshot.smartDecisionSummary || null,
      workoutSnapshot: snapshot,
    }];
  }

  return snapshot.lifts.map(liftBlock => {
    const successfulSets = liftBlock.sets || [];
    const topSet = successfulSets.reduce(
      (best, set) => projectedE1RM(set) > projectedE1RM(best) ? set : best,
      null,
    );
    const topWeight = Number(topSet?.weight) || 0;
    const topReps = Number(topSet?.reps) || 0;
    const e1rm = topReps <= 1
      ? roundE1RM(topWeight)
      : roundE1RM(projectedE1RM(topSet));

    return {
      workoutNumber: snapshot.number,
      cycle: currentCycle,
      smartDayType: snapshot.smartDayType,
      lift: liftBlock.lift,
      topWeight,
      topReps,
      e1rm,
      workoutEffort: 'good',
      failedOrSkippedSetCount: 0,
      smartDecisionSummary: snapshot.smartDecisionSummary || null,
      workoutSnapshot: snapshot,
    };
  });
}

export function projectSmartMeetBySuccessfulSimulation(options = {}) {
  const currentCycle = Number(options.currentCycle || options.data?.currentCycle) || 1;
  const startIndex = Math.max(Number(options.currentIndex) || 0, 0);
  let history = [...(options.history || options.data?.history || [])];

  for (
    let currentIndex = startIndex;
    currentIndex < startIndex + SMART_MEET_PROJECTION_MAX_FUTURE_WORKOUTS;
    currentIndex += 1
  ) {
    const workouts = generateWorkoutsForTrainingModelBase(TRAINING_MODELS.SMART, {
      ...options,
      history,
      currentCycle,
      currentIndex,
    });
    const workout = workouts[currentIndex];

    if (!workout) return null;
    if (workout.type === 'meet' || workout.smartDayType === SMART_DAY_TYPES.MEET) {
      return {
        available: true,
        cycle: currentCycle,
        currentWorkoutNumber: startIndex + 1,
        minimumWorkoutNumber: Number(workout.number) || currentIndex + 1,
        maximumWorkoutNumber: Number(workout.number) || currentIndex + 1,
        label: `C${currentCycle}W${Number(workout.number) || currentIndex + 1}`,
        projectedBySimulation: true,
        assumedSuccessfulFutureWorkouts: true,
      };
    }

    history = [
      ...history,
      ...projectedSmartHistoryEntries(workout, currentCycle),
    ];
  }

  return null;
}

export function generateWorkoutsForTrainingModel(trainingModel, options = {}) {
  const workouts = generateWorkoutsForTrainingModelBase(trainingModel, options);

  if (!isSmartTrainingModel(trainingModel) || options.skipMeetProjectionSimulation) {
    return workouts;
  }

  const currentIndex = getSmartFrequencyCurrentIndex(workouts, options);
  const currentWorkout = workouts[currentIndex];
  const readiness = currentWorkout?.smartDecisionSummary?.readiness;

  if (!readiness?.meetProjection?.available || currentWorkout.type === 'meet') {
    return workouts;
  }

  const simulatedProjection = projectSmartMeetBySuccessfulSimulation({
    ...options,
    skipMeetProjectionSimulation: true,
  });

  if (!simulatedProjection) return workouts;

  const nextWorkouts = [...workouts];
  nextWorkouts[currentIndex] = {
    ...currentWorkout,
    smartDecisionSummary: {
      ...currentWorkout.smartDecisionSummary,
      readiness: {
        ...readiness,
        meetProjection: {
          ...readiness.meetProjection,
          ...simulatedProjection,
        },
      },
    },
  };

  return nextWorkouts;
}
