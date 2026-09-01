import { buildNextCycleE1RMs } from './smartCycleBasis';
import {
  generateWorkoutsForTrainingModel,
  isSmartCycleCompleteAfterHistory,
} from './smartTrainingEngine';
import { isSmartIdealRouteEnabled } from './smartIdealRoute';
import { getAthleteLevel } from './workoutHistoryStats';
import { isSmartTrainingModel } from './programProfiles';

export function shouldAutomaticallyStartNextSmartCycle({
  trainingModel,
  history = [],
  currentCycle = 1,
} = {}) {
  const cycle = Math.max(Number(currentCycle) || 1, 1);
  const hasCompletedCurrentCycleWork = (history || []).some(entry =>
    Number(entry?.cycle) === cycle &&
    Number(entry?.workoutNumber) > 0 &&
    Boolean(entry?.workoutSnapshot)
  );

  return Boolean(
    isSmartTrainingModel(trainingModel) &&
    hasCompletedCurrentCycleWork &&
    isSmartCycleCompleteAfterHistory(history, cycle)
  );
}

export function buildAutomaticNextSmartCycle({
  trainingModel,
  currentCycle = 1,
  history = [],
  prs = {},
  oneRMs = {},
  bodyWeights = [],
  strengthRatioMaxes = {},
  programProfile = 'kelaniSbd',
  accessoryMode = 'off',
  accessoryPRs = {},
  preparationMode = 'off',
  deadliftVariant = 'standard',
  benchPressVariant = 'standard',
  squatVariant = 'standard',
  cooldownMode = 'off',
  smartIdealRouteStartCycle = 1,
} = {}) {
  if (!shouldAutomaticallyStartNextSmartCycle({
    trainingModel,
    history,
    currentCycle,
  })) {
    return null;
  }

  const nextCycle = Math.max(Number(currentCycle) || 1, 1) + 1;
  const nextCycleE1RMs = buildNextCycleE1RMs({
    prs,
    history,
    nextCycle,
  });
  const athleteLevel = getAthleteLevel({
    prs,
    history,
    bodyWeights,
    strengthRatioMaxes,
  });
  const workouts = generateWorkoutsForTrainingModel(trainingModel, {
    programProfile,
    squat: nextCycleE1RMs.Squat,
    bench: nextCycleE1RMs.Bench,
    deadlift: nextCycleE1RMs.Deadlift,
    accessoryMode,
    accessoryPRs,
    preparationMode,
    athleteLevel,
    deadliftVariant,
    benchPressVariant,
    squatVariant,
    cooldownMode,
    history,
    currentIndex: 0,
    currentCycle: nextCycle,
    meetPlannerAttempts: {},
    oneRMs,
    idealRouteEnabled: isSmartIdealRouteEnabled({
      currentCycle: nextCycle,
      startCycle: smartIdealRouteStartCycle,
    }),
  });

  return {
    currentCycle: nextCycle,
    cycleE1RMs: nextCycleE1RMs,
    workouts,
    currentIndex: 0,
    selectedIndex: 0,
  };
}
