import {
  generateWorkoutsForTrainingModel,
  isSmartCycleCompleteAfterHistory,
} from './smartTrainingEngine';
import { isSmartIdealRouteEnabled } from './smartIdealRoute';
import { getAthleteLevel } from './workoutHistoryStats';
import { isSmartTrainingModel } from './programProfiles';
import { normalizeOneRMs } from './oneRMState';

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
  const loadMaxes = normalizeOneRMs(oneRMs, prs);
  const athleteLevel = getAthleteLevel({
    prs,
    history,
    bodyWeights,
    strengthRatioMaxes,
  });
  const workouts = generateWorkoutsForTrainingModel(trainingModel, {
    programProfile,
    squat: loadMaxes.Squat,
    bench: loadMaxes.Bench,
    deadlift: loadMaxes.Deadlift,
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
    workouts,
    currentIndex: 0,
    selectedIndex: 0,
  };
}
