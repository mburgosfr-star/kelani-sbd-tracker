import { SMART_INTENSITY_POINTS } from './smartTrainingConstants';

export const SMART_IDEAL_LEVELS = Object.freeze([
  'beginner',
  'intermediate',
  'advanced',
  'elite',
]);

export const SMART_IDEAL_INTENSITY_ROLES = Object.freeze({
  HEAVY: 'heavy',
  MEDIUM: 'medium',
  LIGHT: 'light',
});

export const SMART_IDEAL_LOAD_POLICY = Object.freeze({
  basis: 'real-1rm',
  workWeightIncrementKg: 2.5,
  achievedE1RMIncrementKg: 2.5,
  displayedPercentageIncrement: 0.025,
  heavyPhaseMinimumIncreaseKg: 2.5,
  heavyPhaseCap: 'real-1rm',
});

export const SMART_IDEAL_MEET_POLICY = Object.freeze({
  attemptPcts: Object.freeze({
    opener: 0.90,
    secondAttempt: 0.975,
    thirdAttempt: 1.025,
  }),
  attemptWeightIncrementKg: 2.5,
  minimumAttemptIncreaseKg: 2.5,
  automaticAttemptBasis: 'real-1rm',
  recalculateAfterNewReal1RM: true,
  recalculateAfterE1RMOnlyPR: false,
  preserveManualAttempts: true,
  lockAttemptsAfterMeetStarts: true,
  thirdAttemptPreDemonstrationRequired: false,
  readinessEvidence: Object.freeze([
    'successful-90-percent-triple',
    'successful-95-percent-double',
    'achieved-current-cycle-e1rm-at-least-real-1rm',
    'successful-100-percent-single',
    'successful-taper-opener',
  ]),
});

const H = SMART_IDEAL_INTENSITY_ROLES.HEAVY;
const M = SMART_IDEAL_INTENSITY_ROLES.MEDIUM;
const L = SMART_IDEAL_INTENSITY_ROLES.LIGHT;

const lift = (name, intensityRole) => Object.freeze({
  lift: name,
  intensityRole,
});

const route = (...lifts) => Object.freeze(lifts);

// The seven-workout ideal composition. It repeats for the triple, double
// and single phases; only the heavy prescription changes between phases.
export const SMART_IDEAL_NORMAL_ROUTE = Object.freeze({
  beginner: Object.freeze({
    1: route(lift('Squat', H), lift('Bench', L)),
    2: route(),
    3: route(lift('Deadlift', H), lift('Bench', M)),
    4: route(),
    5: route(lift('Bench', H), lift('Squat', M)),
    6: route(),
    7: route(),
  }),
  intermediate: Object.freeze({
    1: route(lift('Squat', H), lift('Bench', L)),
    2: route(lift('Deadlift', M), lift('Bench', M)),
    3: route(),
    4: route(lift('Bench', H), lift('Squat', M)),
    5: route(),
    6: route(lift('Deadlift', H), lift('Bench', L), lift('Squat', L)),
    7: route(),
  }),
  advanced: Object.freeze({
    1: route(lift('Squat', H), lift('Bench', L)),
    2: route(lift('Deadlift', M), lift('Bench', M)),
    3: route(lift('Squat', M)),
    4: route(lift('Bench', H), lift('Deadlift', L)),
    5: route(lift('Squat', L), lift('Bench', L)),
    6: route(lift('Deadlift', H), lift('Bench', M), lift('Squat', L)),
    7: route(),
  }),
  elite: Object.freeze({
    1: route(lift('Squat', H), lift('Bench', L), lift('Deadlift', L)),
    2: route(lift('Deadlift', M), lift('Bench', M), lift('Squat', L)),
    3: route(lift('Bench', L)),
    4: route(lift('Bench', H), lift('Squat', M), lift('Deadlift', L)),
    5: route(lift('Squat', M), lift('Bench', M)),
    6: route(lift('Deadlift', H), lift('Bench', L), lift('Squat', L)),
    7: route(),
  }),
});

export const SMART_IDEAL_NORMAL_PHASES = Object.freeze([
  Object.freeze({
    key: 'triple',
    firstWorkout: 1,
    lastWorkout: 7,
    topSet: Object.freeze({ reps: 3, pct: 0.90 }),
    backoff: Object.freeze({ reps: 6, pct: 0.60 }),
  }),
  Object.freeze({
    key: 'double',
    firstWorkout: 8,
    lastWorkout: 14,
    topSet: Object.freeze({ reps: 2, pct: 0.95 }),
    backoff: Object.freeze({ reps: 5, pct: 0.65 }),
  }),
  Object.freeze({
    key: 'single',
    firstWorkout: 15,
    lastWorkout: 21,
    topSet: Object.freeze({ reps: 1, pct: 1.00 }),
    backoff: Object.freeze({ reps: 4, pct: 0.70 }),
  }),
]);

export const SMART_IDEAL_TAPER_ROUTE = Object.freeze({
  beginner: Object.freeze({
    22: route(lift('Squat', H), lift('Bench', L)),
    23: route(),
    24: route(lift('Deadlift', H), lift('Bench', M)),
    25: route(lift('Bench', H)),
  }),
  intermediate: Object.freeze({
    22: route(lift('Squat', H), lift('Bench', L)),
    23: route(lift('Deadlift', H), lift('Bench', M)),
    24: route(lift('Squat', M)),
    25: route(lift('Bench', H)),
  }),
  advanced: Object.freeze({
    22: route(lift('Squat', H), lift('Bench', L)),
    23: route(lift('Deadlift', H), lift('Bench', M)),
    24: route(lift('Squat', M), lift('Bench', L)),
    25: route(lift('Bench', H), lift('Deadlift', M), lift('Squat', L)),
  }),
  elite: Object.freeze({
    22: route(lift('Squat', H), lift('Bench', L)),
    23: route(lift('Deadlift', H), lift('Bench', M), lift('Squat', L)),
    24: route(lift('Squat', M), lift('Bench', L)),
    25: route(lift('Bench', H), lift('Deadlift', L)),
  }),
});

export const SMART_IDEAL_POST_MEET = Object.freeze({
  beginner: Object.freeze({ recoveryWorkouts: 1, nextCycleWorkout: 30 }),
  intermediate: Object.freeze({ recoveryWorkouts: 1, nextCycleWorkout: 30 }),
  advanced: Object.freeze({ recoveryWorkouts: 1, nextCycleWorkout: 30 }),
  elite: Object.freeze({ recoveryWorkouts: 1, nextCycleWorkout: 30 }),
});

export const SMART_IDEAL_ROUTE_VERSION = 1;
export const SMART_IDEAL_MEET_WORKOUT_NUMBER = 28;

export function resolveSmartIdealRouteStartCycle({
  savedStartCycle,
  currentCycle = 1,
} = {}) {
  const cycle = Math.max(Number(currentCycle) || 1, 1);
  const explicitStart = Number(savedStartCycle);
  if (Number.isInteger(explicitStart) && explicitStart >= 1) {
    // A short-lived migration build wrote currentCycle + 1 here. The route
    // is now deliberately immediate, so pull any such future marker back to
    // the active cycle when the record is next loaded.
    return Math.min(explicitStart, cycle);
  }

  // Activate the controller immediately for existing Smart records. A
  // partially completed legacy cycle keeps its existing displayed workout
  // numbering, while readiness determines the relative ideal-route entry.
  // The fixed route therefore does not wait for a new cycle boundary.
  return cycle;
}

export function isSmartIdealRouteEnabled({
  currentCycle = 1,
  startCycle = null,
} = {}) {
  const cycle = Number(currentCycle);
  const start = Number(startCycle);

  return (
    Number.isInteger(cycle) &&
    cycle >= 1 &&
    Number.isInteger(start) &&
    start >= 1 &&
    cycle >= start
  );
}

function normalizeLevel(athleteLevel) {
  return SMART_IDEAL_LEVELS.includes(athleteLevel)
    ? athleteLevel
    : 'intermediate';
}

export function getSmartIdealNormalPhase(workoutNumber) {
  const number = Number(workoutNumber);

  return SMART_IDEAL_NORMAL_PHASES.find(phase =>
    number >= phase.firstWorkout && number <= phase.lastWorkout
  ) || null;
}

function buildNormalPrescription(intensityRole, phase) {
  if (intensityRole === H) {
    return {
      kind: 'top-set-with-backoffs',
      basis: SMART_IDEAL_LOAD_POLICY.basis,
      topSet: { ...phase.topSet },
      backoff: {
        ...phase.backoff,
        setCount: 'grid-dependent',
      },
      fullGridRequired: true,
    };
  }

  return {
    kind: 'work-sets',
    basis: SMART_IDEAL_LOAD_POLICY.basis,
    pct: intensityRole === M ? 0.70 : 0.60,
    repRange: { min: 4, max: 6 },
    maxTotalWorkReps: 24,
    setCount: 'grid-dependent',
    fullGridRequired: true,
  };
}

function buildTaperPrescription(intensityRole) {
  if (intensityRole === H) {
    return {
      kind: 'opener-single',
      basis: SMART_IDEAL_LOAD_POLICY.basis,
      topSet: { reps: 1, pct: 0.90 },
      backoff: {
        reps: 4,
        pct: 0.60,
        setCount: 'grid-dependent',
        minimumSetCount: 1,
        fullRowWhenAligned: true,
      },
      normalBackoffs: false,
      fullGridRequired: true,
    };
  }

  return {
    kind: 'taper-work-sets',
    basis: SMART_IDEAL_LOAD_POLICY.basis,
    pct: intensityRole === M ? 0.70 : 0.60,
    reps: 4,
    minimumSetCount: 3,
    minimumRepsPerSet: 4,
    setCount: 'grid-dependent',
    fullGridRequired: true,
  };
}

function buildTrainingWorkout({ workoutNumber, stage, phase = null, lifts }) {
  const prescriptionFor = stage === 'taper'
    ? buildTaperPrescription
    : intensityRole => buildNormalPrescription(intensityRole, phase);

  return {
    workoutNumber,
    type: 'training',
    stage,
    phase: phase?.key || null,
    // Regular accessories stop during taper; the workout accessory policy
    // retains only a light Row on days containing Bench.
    accessoriesAllowed: stage !== 'taper',
    lifts: lifts.map(item => ({
      ...item,
      prescription: prescriptionFor(item.intensityRole),
    })),
  };
}

function buildRestWorkout(workoutNumber, stage) {
  return {
    workoutNumber,
    type: 'rest',
    stage,
    phase: null,
    accessoriesAllowed: false,
    lifts: [],
  };
}

export function getSmartIdealRouteWorkout({
  workoutNumber,
  athleteLevel = 'intermediate',
} = {}) {
  const number = Number(workoutNumber);
  if (!Number.isInteger(number) || number < 1) return null;

  const level = normalizeLevel(athleteLevel);

  if (number <= 21) {
    const phase = getSmartIdealNormalPhase(number);
    const rowNumber = ((number - 1) % 7) + 1;
    const lifts = SMART_IDEAL_NORMAL_ROUTE[level][rowNumber];

    return lifts.length > 0
      ? buildTrainingWorkout({
        workoutNumber: number,
        stage: 'normal',
        phase,
        lifts,
      })
      : buildRestWorkout(number, 'normal');
  }

  if (number <= 25) {
    const lifts = SMART_IDEAL_TAPER_ROUTE[level][number];

    return lifts.length > 0
      ? buildTrainingWorkout({
        workoutNumber: number,
        stage: 'taper',
        lifts,
      })
      : buildRestWorkout(number, 'taper');
  }

  if (number <= 27) return buildRestWorkout(number, 'taper');

  if (number === SMART_IDEAL_MEET_WORKOUT_NUMBER) {
    const postMeet = SMART_IDEAL_POST_MEET[level];

    return {
      workoutNumber: number,
      type: 'meet',
      stage: 'meet',
      phase: null,
      accessoriesAllowed: false,
      postMeetRecoveryTarget: postMeet.recoveryWorkouts,
      nextCycleWorkout: postMeet.nextCycleWorkout,
      lifts: ['Squat', 'Bench', 'Deadlift'].map(name => ({
        lift: name,
        intensityRole: 'meet',
        prescription: {
          kind: 'meet-attempts',
          attemptCount: 3,
          attemptPcts: { ...SMART_IDEAL_MEET_POLICY.attemptPcts },
          fullGridRequired: true,
        },
      })),
    };
  }

  const postMeet = SMART_IDEAL_POST_MEET[level];
  if (number < postMeet.nextCycleWorkout) {
    return {
      ...buildRestWorkout(number, 'post-meet'),
      postMeetRecoveryTarget: postMeet.recoveryWorkouts,
      nextCycleWorkout: postMeet.nextCycleWorkout,
    };
  }

  if (number === postMeet.nextCycleWorkout) {
    return {
      workoutNumber: number,
      type: 'new-cycle',
      stage: 'post-meet',
      phase: null,
      accessoriesAllowed: false,
      postMeetRecoveryTarget: postMeet.recoveryWorkouts,
      nextCycleWorkout: postMeet.nextCycleWorkout,
      lifts: [],
    };
  }

  return {
    workoutNumber: number,
    type: 'complete',
    stage: 'post-meet',
    phase: null,
    accessoriesAllowed: false,
    lifts: [],
  };
}

const ACCELERATION_ACTIONS = Object.freeze({
  REMOVE_REDUNDANT_REST: 'remove-redundant-rest',
  COMBINE_TRAINING: 'combine-training',
  REMOVE_TRAINING: 'remove-training',
  REMOVE_FINAL_REST: 'remove-final-rest',
});

function getRouteWorkoutNumbers(workout = {}) {
  const explicitNumbers = Array.isArray(workout.routeWorkoutNumbers)
    ? workout.routeWorkoutNumbers
    : [workout.workoutNumber];

  return [...new Set(explicitNumbers
    .map(Number)
    .filter(number => Number.isInteger(number) && number >= 1))]
    .sort((a, b) => a - b);
}

function addAccelerationMetadata(workout, {
  sourceWorkouts = [],
  action,
  skippedRouteWorkoutNumbers = [],
  combinedRouteWorkoutNumbers = [],
} = {}) {
  const sources = sourceWorkouts.filter(Boolean);
  const inheritedCredits = sources.reduce(
    (total, source) => total + (
      Number(source.accelerationCreditsConsumed) || 0
    ),
    0
  );
  const inheritedActions = sources.flatMap(source => (
    Array.isArray(source.accelerationActions)
      ? source.accelerationActions
      : []
  ));
  const inheritedSkippedNumbers = sources.flatMap(source => (
    Array.isArray(source.skippedRouteWorkoutNumbers)
      ? source.skippedRouteWorkoutNumbers
      : []
  ));
  const inheritedCombinedNumbers = sources.flatMap(source => (
    Array.isArray(source.combinedRouteWorkoutNumbers)
      ? source.combinedRouteWorkoutNumbers
      : []
  ));

  return {
    ...workout,
    accelerationCreditsConsumed: inheritedCredits + 1,
    accelerationActions: [...inheritedActions, action].filter(Boolean),
    skippedRouteWorkoutNumbers: [...new Set([
      ...inheritedSkippedNumbers,
      ...skippedRouteWorkoutNumbers,
    ])].sort((a, b) => a - b),
    combinedRouteWorkoutNumbers: [...new Set([
      ...inheritedCombinedNumbers,
      ...combinedRouteWorkoutNumbers,
    ])].sort((a, b) => a - b),
  };
}

function removeRoutePlanEntry(plan, index, action) {
  if (index < 0 || index >= plan.length - 1) return null;

  const removed = plan[index];
  const next = plan[index + 1];
  const replacement = addAccelerationMetadata(next, {
    sourceWorkouts: [removed, next],
    action,
    skippedRouteWorkoutNumbers: getRouteWorkoutNumbers(removed),
  });

  return [
    ...plan.slice(0, index),
    replacement,
    ...plan.slice(index + 2),
  ];
}

function findRedundantRestIndex(plan, hasTrailingCompletedRest) {
  const candidates = [];

  plan.forEach((workout, index) => {
    if (workout.type !== 'rest') return;

    const previousIsRest = index === 0
      ? hasTrailingCompletedRest
      : plan[index - 1]?.type === 'rest';
    const nextIsRest = plan[index + 1]?.type === 'rest';

    if (previousIsRest || nextIsRest) candidates.push(index);
  });

  // Keep the earlier recovery day and remove the latest duplicate. This
  // preserves recovery immediately before the meet whenever possible.
  return candidates.at(-1) ?? -1;
}

function canCombineRouteTrainingWorkouts(first, second) {
  if (first?.type !== 'training' || second?.type !== 'training') return false;
  if (first.stage !== second.stage || first.phase !== second.phase) return false;

  const firstLifts = new Set((first.lifts || []).map(item => item.lift));
  const secondLifts = new Set((second.lifts || []).map(item => item.lift));
  if ([...firstLifts].some(liftName => secondLifts.has(liftName))) return false;

  const combinedLifts = [...(first.lifts || []), ...(second.lifts || [])];
  const heavyCount = combinedLifts.filter(
    item => item.intensityRole === H
  ).length;

  return combinedLifts.length <= 3 && heavyCount <= 1;
}

function combineRouteTrainingWorkouts(first, second) {
  const intensityOrder = { heavy: 0, medium: 1, light: 2 };
  const routeWorkoutNumbers = [
    ...getRouteWorkoutNumbers(first),
    ...getRouteWorkoutNumbers(second),
  ].sort((a, b) => a - b);
  const combined = {
    ...second,
    workoutNumber: Math.max(...routeWorkoutNumbers),
    stage: first.stage,
    phase: first.phase,
    accessoriesAllowed: Boolean(
      first.accessoriesAllowed && second.accessoriesAllowed
    ),
    routeWorkoutNumbers,
    lifts: [...(first.lifts || []), ...(second.lifts || [])]
      .sort((a, b) => (
        (intensityOrder[a.intensityRole] ?? 9) -
        (intensityOrder[b.intensityRole] ?? 9)
      )),
  };

  return addAccelerationMetadata(combined, {
    sourceWorkouts: [first, second],
    action: ACCELERATION_ACTIONS.COMBINE_TRAINING,
    combinedRouteWorkoutNumbers: routeWorkoutNumbers,
  });
}

function findSafestTrainingCombinationIndex(plan) {
  for (let index = plan.length - 2; index >= 0; index -= 1) {
    if (canCombineRouteTrainingWorkouts(plan[index], plan[index + 1])) {
      return index;
    }
  }

  return -1;
}

function getTrainingRemovalRisk(workout = {}) {
  return (workout.lifts || []).reduce((risk, item) => {
    if (item.intensityRole === H) return risk + 100;
    if (item.intensityRole === M) return risk + 10;
    return risk + 1;
  }, 0);
}

function findSafestTrainingRemovalIndex(plan) {
  return plan.reduce((bestIndex, workout, index) => {
    if (workout.type !== 'training' || index >= plan.length - 1) {
      return bestIndex;
    }
    if (bestIndex < 0) return index;

    const risk = getTrainingRemovalRisk(workout);
    const bestRisk = getTrainingRemovalRisk(plan[bestIndex]);

    // Prefer the lightest dose. On equal risk, preserve the nearer workout
    // and remove the later one so the immediate plan changes as little as
    // possible.
    return risk < bestRisk || (risk === bestRisk && index > bestIndex)
      ? index
      : bestIndex;
  }, -1);
}

/**
 * Spend one route-compression credit for every clean "too easy" workout.
 * Each applied action removes exactly one future calendar slot. The order is
 * deliberately conservative: duplicate recovery, a compatible combined day,
 * the lightest remaining training day, and only then the final rest day.
 */
export function buildAcceleratedSmartIdealRoutePlan({
  athleteLevel = 'intermediate',
  startWorkoutNumber = 1,
  accelerationCredits = 0,
  hasTrailingCompletedRest = false,
} = {}) {
  const start = Math.max(Number(startWorkoutNumber) || 1, 1);
  const requestedCredits = Math.max(
    Math.floor(Number(accelerationCredits) || 0),
    0
  );
  let workouts = [];

  if (start > SMART_IDEAL_MEET_WORKOUT_NUMBER) {
    const postMeetWorkout = getSmartIdealRouteWorkout({
      athleteLevel,
      workoutNumber: start,
    });
    if (postMeetWorkout) workouts.push(postMeetWorkout);
  }

  for (
    let workoutNumber = start;
    workoutNumber <= SMART_IDEAL_MEET_WORKOUT_NUMBER;
    workoutNumber += 1
  ) {
    const workout = getSmartIdealRouteWorkout({
      athleteLevel,
      workoutNumber,
    });
    if (workout) workouts.push(workout);
  }

  let appliedCredits = 0;

  while (appliedCredits < requestedCredits && workouts.length > 1) {
    const redundantRestIndex = findRedundantRestIndex(
      workouts,
      hasTrailingCompletedRest
    );
    if (redundantRestIndex >= 0) {
      workouts = removeRoutePlanEntry(
        workouts,
        redundantRestIndex,
        ACCELERATION_ACTIONS.REMOVE_REDUNDANT_REST
      );
      appliedCredits += 1;
      continue;
    }

    const combinationIndex = findSafestTrainingCombinationIndex(workouts);
    if (combinationIndex >= 0) {
      workouts = [
        ...workouts.slice(0, combinationIndex),
        combineRouteTrainingWorkouts(
          workouts[combinationIndex],
          workouts[combinationIndex + 1]
        ),
        ...workouts.slice(combinationIndex + 2),
      ];
      appliedCredits += 1;
      continue;
    }

    const trainingRemovalIndex = findSafestTrainingRemovalIndex(workouts);
    if (trainingRemovalIndex >= 0) {
      workouts = removeRoutePlanEntry(
        workouts,
        trainingRemovalIndex,
        ACCELERATION_ACTIONS.REMOVE_TRAINING
      );
      appliedCredits += 1;
      continue;
    }

    const finalRestIndex = workouts.findLastIndex(
      (workout, index) => workout.type === 'rest' && index < workouts.length - 1
    );
    if (finalRestIndex >= 0) {
      workouts = removeRoutePlanEntry(
        workouts,
        finalRestIndex,
        ACCELERATION_ACTIONS.REMOVE_FINAL_REST
      );
      appliedCredits += 1;
      continue;
    }

    break;
  }

  return {
    workouts,
    requestedCredits,
    appliedCredits,
    unappliedCredits: Math.max(requestedCredits - appliedCredits, 0),
  };
}

/**
 * Apply the two symmetric calendar corrections to the remaining ideal route.
 * TOO EASY removes one future calendar slot through the conservative
 * compression policy above. TOO HARD inserts one real recovery day before
 * the next untouched route row. Keeping the inserted day transition-only
 * means it consumes a calendar day without also consuming that route row.
 */
export function buildAdjustedSmartIdealRoutePlan({
  athleteLevel = 'intermediate',
  startWorkoutNumber = 1,
  accelerationCredits = 0,
  delayCredits = 0,
  hasTrailingCompletedRest = false,
} = {}) {
  const acceleratedPlan = buildAcceleratedSmartIdealRoutePlan({
    athleteLevel,
    startWorkoutNumber,
    accelerationCredits,
    hasTrailingCompletedRest,
  });
  const requestedDelayCredits = Math.max(
    Math.floor(Number(delayCredits) || 0),
    0
  );
  const nextRouteWorkout = acceleratedPlan.workouts[0] || null;
  const insertedRecoveryDays = Array.from(
    { length: requestedDelayCredits },
    () => ({
      workoutNumber: Number(nextRouteWorkout?.workoutNumber) ||
        Math.max(Number(startWorkoutNumber) || 1, 1),
      type: 'rest',
      stage: nextRouteWorkout?.stage || 'normal',
      phase: nextRouteWorkout?.phase || null,
      accessoriesAllowed: false,
      lifts: [],
      transitionPending: true,
      adjustmentReason: 'too-hard-recovery',
      delayCreditsConsumed: 1,
    })
  );

  return {
    ...acceleratedPlan,
    workouts: [
      ...insertedRecoveryDays,
      ...acceleratedPlan.workouts,
    ],
    requestedDelayCredits,
    appliedDelayCredits: insertedRecoveryDays.length,
    unappliedDelayCredits: Math.max(
      requestedDelayCredits - insertedRecoveryDays.length,
      0
    ),
  };
}

export function getSmartIdealRouteEntryWorkoutNumber({
  athleteLevel = 'intermediate',
  readiness = {},
} = {}) {
  const level = normalizeLevel(athleteLevel);
  const byLift = readiness.meetPlanReadiness || readiness.byLift || {};
  const hasCurrentCycleEvidence = Boolean(
    readiness.meetPlanHasCurrentCycleEvidence ??
    readiness.hasCurrentCycleMeetEvidence
  );
  const meetPlanReady = Boolean(
    readiness.meetPlanReady ?? readiness.ready
  );

  if (meetPlanReady) return SMART_IDEAL_MEET_WORKOUT_NUMBER;
  if (!hasCurrentCycleEvidence) return 1;

  const openerReady = Boolean(
    readiness.meetPlanOpenerReady ?? readiness.openerReady
  );
  const secondAttemptReady = Boolean(
    readiness.meetPlanSecondAttemptReady ?? readiness.secondAttemptReady
  );
  const maximumProjectedExposures = Math.max(
    0,
    ...['Squat', 'Bench', 'Deadlift'].map(liftName => (
      Number(byLift[liftName]?.projectedMeetReadyExposureCount) || 0
    ))
  );
  const phase = !openerReady
    ? SMART_IDEAL_NORMAL_PHASES[0]
    : secondAttemptReady || maximumProjectedExposures <= 2
      ? SMART_IDEAL_NORMAL_PHASES[2]
      : SMART_IDEAL_NORMAL_PHASES[1];
  const readinessProperty = phase.key === 'triple'
    ? 'openerReady'
    : phase.key === 'double'
      ? 'secondAttemptReady'
      : 'thirdAttemptPotential';
  const unresolvedLifts = ['Squat', 'Bench', 'Deadlift'].filter(
    liftName => !byLift[liftName]?.[readinessProperty]
  );
  const firstNeededHeavyRow = Object.entries(
    SMART_IDEAL_NORMAL_ROUTE[level]
  )
    .filter(([, lifts]) => lifts.some(item => (
      item.intensityRole === H && unresolvedLifts.includes(item.lift)
    )))
    .map(([rowNumber]) => Number(rowNumber))
    .sort((a, b) => a - b)[0] || 1;

  return phase.firstWorkout + firstNeededHeavyRow - 1;
}

export function summarizeSmartIdealFrequency(athleteLevel = 'intermediate') {
  const level = normalizeLevel(athleteLevel);
  const summary = ['Squat', 'Bench', 'Deadlift'].reduce((result, name) => ({
    ...result,
    [name]: {
      days: 0,
      score: 0,
      mix: { heavy: 0, medium: 0, light: 0 },
    },
  }), {});

  Object.values(SMART_IDEAL_NORMAL_ROUTE[level]).forEach(lifts => {
    lifts.forEach(item => {
      summary[item.lift].days += 1;
      summary[item.lift].score += SMART_INTENSITY_POINTS[item.intensityRole];
      summary[item.lift].mix[item.intensityRole] += 1;
    });
  });

  return summary;
}
