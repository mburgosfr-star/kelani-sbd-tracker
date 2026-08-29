import { TRAINING_MODELS } from './smartTrainingConstants';
import { WEIGHT_UNITS, displayWeightToKg, formatWeightFromKg } from './workoutUnits';
import { LIFT_ORDER, normalizeAccessoryMode } from './workoutHistoryStats';
import { translations } from './translations';

export function getWorkoutTypeKey(workout) {
  if (!workout) return null;
  if (workout.type === 'meet') return 'meetDay';
  if (workout.type === 'rest') return 'restAndRecovery';
  if (workout.label === 'Pre-meet') return 'preMeet';

  const label = String(workout.label || '').toLowerCase();

  if (label.includes('technique')) return 'practice';
  if (label.includes('volume')) return 'volume';
  if (label.includes('heavy') || label.includes('peak') || label.includes('strength')) return 'heavy';

  return 'practice';
}

export function liftLabel(lift, t) {
  if (lift === 'Squat') return t.squat;
  if (lift === 'Bench') return t.bench;
  if (lift === 'Deadlift') return t.deadlift;
  return lift;
}

export function normalizeBenchPressVariant(variant) {
  if (variant === 'standingLandminePress') return 'standingLandminePress';
  if (variant === 'shoulderPress') return 'shoulderPress';
  if (variant === 'machineAlternative') return 'machineAlternative';
  if (variant === 'goodMorning') return 'machineAlternative';
  return 'standard';
}

export function normalizeSquatVariant(variant) {
  if (variant === 'beltSquat') return 'beltSquat';
  if (variant === 'zercherSquat') return 'zercherSquat';
  return 'standard';
}

export function normalizeDeadliftVariant(variant) {
  if (variant === 'alternative') return 'alternative';
  if (variant === 'hipThrust') return 'hipThrust';
  return 'standard';
}

export const PROGRAM_PROFILES = {
  kelaniSbd: {
    preparationMode: 'off',
    accessoryMode: 'off',
    squatVariant: 'standard',
    benchPressVariant: 'standard',
    deadliftVariant: 'standard',
    includeCooldown: false,
    cooldownMode: 'off',
  },
  kelaniSbdPlus: {
    preparationMode: 'basicFirst',
    accessoryMode: 'standard',
    squatVariant: 'standard',
    benchPressVariant: 'standard',
    deadliftVariant: 'standard',
    includeCooldown: true,
    cooldownMode: 'upperBackFriendly',
  },
  kelaniSbdUltra: {
    preparationMode: 'off',
    accessoryMode: 'off',
    squatVariant: 'standard',
    benchPressVariant: 'standard',
    deadliftVariant: 'standard',
    includeCooldown: false,
    cooldownMode: 'off',
  },
  kelaniSbdLower: {
    preparationMode: 'shoulderThoracic',
    accessoryMode: 'off',
    squatVariant: 'standard',
    benchPressVariant: 'machineAlternative',
    deadliftVariant: 'hipThrust',
    includeCooldown: true,
    cooldownMode: 'upperBackFriendly',
  },
  kelaniSbdLowerPlus: {
    preparationMode: 'shoulderThoracic',
    accessoryMode: 'lowerBodyFriendly',
    squatVariant: 'standard',
    benchPressVariant: 'machineAlternative',
    deadliftVariant: 'hipThrust',
    includeCooldown: true,
    cooldownMode: 'upperBackFriendly',
  },
};

export function normalizeProgramProfile(profile) {
  if (profile === 'kelaniSbdSafe') return 'kelaniSbdLower';
  if (profile === 'kelaniSbdSafePlus') return 'kelaniSbdLowerPlus';

  return Object.prototype.hasOwnProperty.call(PROGRAM_PROFILES, profile)
    ? profile
    : 'kelaniSbd';
}

export function settingsForProgramProfile(profile) {
  return PROGRAM_PROFILES[normalizeProgramProfile(profile)] || PROGRAM_PROFILES.kelaniSbd;
}

export function normalizeTrainingModel(model) {
  return model === TRAINING_MODELS.SMART
    ? TRAINING_MODELS.SMART
    : TRAINING_MODELS.CLASSIC;
}

export function getNewUserTrainingModel() {
  return TRAINING_MODELS.SMART;
}

export function isSmartTrainingModel(model) {
  return normalizeTrainingModel(model) === TRAINING_MODELS.SMART;
}

export function getProgramProfileTitle(profile, t = translations.en) {
  const normalizedProfile = normalizeProgramProfile(profile);

  if (normalizedProfile === 'kelaniSbdUltra') {
    return t.programProfileKelaniSbdUltra;
  }

  if (
    normalizedProfile === 'kelaniSbdLower' ||
    normalizedProfile === 'kelaniSbdLowerPlus'
  ) {
    return t.programProfileKelaniSbdLower;
  }

  return t.programProfileKelaniSbd;
}
export function getProgramProfileDescription(profile, t = translations.en) {
  const normalizedProfile = normalizeProgramProfile(profile);

  if (normalizedProfile === 'kelaniSbdUltra') {
    return t.programProfileKelaniSbdUltraText;
  }

  if (
    normalizedProfile === 'kelaniSbdLower' ||
    normalizedProfile === 'kelaniSbdLowerPlus'
  ) {
    return t.programProfileKelaniSbdLowerText;
  }

  return t.programProfileKelaniSbdText;
}


export function summarizeProgramWorkouts(workouts = []) {
  const byLift = LIFT_ORDER.reduce((acc, lift) => ({
    ...acc,
    [lift]: {
      exposures: 0,
      reps: 0,
      pctRepSum: 0,
      avgIntensity: 0,
    },
  }), {});

  let trainingDays = 0;
  let restDays = 0;

  (workouts || []).forEach(workout => {
    if (!workout || workout.type === 'meet') return;

    if (workout.type === 'rest') {
      restDays += 1;
      return;
    }

    trainingDays += 1;

    (workout.lifts || []).forEach(liftBlock => {
      const lift = liftBlock?.lift;

      if (!LIFT_ORDER.includes(lift)) return;

      byLift[lift].exposures += 1;

      (liftBlock.sets || []).forEach(set => {
        const reps = Number(set?.reps) || 0;
        const pct = Number(set?.originalPct ?? set?.pct) || 0;

        byLift[lift].reps += reps;
        byLift[lift].pctRepSum += pct * reps;
      });
    });
  });

  LIFT_ORDER.forEach(lift => {
    byLift[lift].avgIntensity = byLift[lift].reps
      ? Math.round((byLift[lift].pctRepSum / byLift[lift].reps) * 100)
      : 0;
  });

  return { trainingDays, restDays, byLift };
}

export function detectProgramProfile({ preparationMode, accessoryMode, squatVariant, benchPressVariant, deadliftVariant }) {
  const normalizedSettings = {
    preparationMode: normalizePreparationMode(preparationMode),
    accessoryMode: normalizeAccessoryMode(accessoryMode),
    squatVariant: normalizeSquatVariant(squatVariant),
    benchPressVariant: normalizeBenchPressVariant(benchPressVariant),
    deadliftVariant: normalizeDeadliftVariant(deadliftVariant),
  };

  const match = Object.entries(PROGRAM_PROFILES).find(([, profile]) =>
    profile.preparationMode === normalizedSettings.preparationMode &&
    profile.accessoryMode === normalizedSettings.accessoryMode &&
    profile.squatVariant === normalizedSettings.squatVariant &&
    profile.benchPressVariant === normalizedSettings.benchPressVariant &&
    profile.deadliftVariant === normalizedSettings.deadliftVariant
  );

  return match?.[0] || 'kelaniSbd';
}

export function isStandingLandminePress(lift, benchPressVariant = 'standard') {
  return lift === 'Bench' && normalizeBenchPressVariant(benchPressVariant) === 'standingLandminePress';
}

export function isBenchMachineAlternative(lift, benchPressVariant = 'standard') {
  return lift === 'Bench' && normalizeBenchPressVariant(benchPressVariant) === 'machineAlternative';
}

export function isBenchHomeAlternative(lift, benchPressVariant = 'standard') {
  const normalizedBenchPressVariant = normalizeBenchPressVariant(benchPressVariant);

  return lift === 'Bench' && (
    normalizedBenchPressVariant === 'shoulderPress' ||
    normalizedBenchPressVariant === 'goodMorning'
  );
}

export function workoutLiftLabel(lift, t, benchPressVariant = 'standard', squatVariant = 'standard') {
  const normalizedBenchPressVariant = normalizeBenchPressVariant(benchPressVariant);
  const normalizedSquatVariant = normalizeSquatVariant(squatVariant);

  if (lift === 'Squat' && normalizedSquatVariant === 'beltSquat') {
    return t.squatAlternativeWorkout;
  }

  if (lift === 'Squat' && normalizedSquatVariant === 'zercherSquat') {
    return t.squatAlternativeZercherSquat;
  }

  if (lift === 'Bench' && normalizedBenchPressVariant === 'standingLandminePress') {
    return t.benchPressStandingLandminePress;
  }

  if (lift === 'Bench' && normalizedBenchPressVariant === 'shoulderPress') {
    return t.benchPressShoulderPress;
  }

  if (lift === 'Bench' && normalizedBenchPressVariant === 'goodMorning') {
    return t.benchPressGoodMorning;
  }

  if (lift === 'Bench' && normalizedBenchPressVariant === 'machineAlternative') {
    return t.benchPressMachineAlternativeWorkout;
  }

  return liftLabel(lift, t);
}

export function workoutLiftBlockLabel(liftBlock, t, benchPressVariant = 'standard') {
  if (liftBlock?.lift === 'Squat' && normalizeSquatVariant(liftBlock?.squatVariant) !== 'standard') {
    return workoutLiftLabel(
      liftBlock?.lift,
      t,
      liftBlock?.benchPressVariant || 'standard',
      liftBlock?.squatVariant || 'standard'
    );
  }

  if (liftBlock?.lift === 'Deadlift' && normalizeDeadliftVariant(liftBlock?.deadliftVariant) === 'hipThrust') {
    return t.deadliftHipThrustWorkout;
  }

  if (isDeadliftAlternativeLiftBlock(liftBlock)) {
    return t.deadliftAlternativeWorkout;
  }

  return workoutLiftLabel(
    liftBlock?.lift,
    t,
    liftBlock?.benchPressVariant || 'standard',
    liftBlock?.squatVariant || 'standard'
  );
}

export function workoutDisplayWeightKg(weightKg, lift, benchPressVariant = 'standard') {
  const numericWeight = Number(weightKg);
  if (!Number.isFinite(numericWeight)) return weightKg;

  return isStandingLandminePress(lift, benchPressVariant)
    ? numericWeight / 2
    : numericWeight;
}

export function workoutInputWeightKg(displayWeight, weightUnit = WEIGHT_UNITS.KG, lift, benchPressVariant = 'standard') {
  const baseKg = displayWeightToKg(displayWeight, weightUnit);
  return isStandingLandminePress(lift, benchPressVariant)
    ? baseKg * 2
    : baseKg;
}

export function formatWorkoutWeightFromKg(weightKg, weightUnit = WEIGHT_UNITS.KG, t, lift, benchPressVariant = 'standard') {
  const formatted = formatWeightFromKg(workoutDisplayWeightKg(weightKg, lift, benchPressVariant), weightUnit);

  return isStandingLandminePress(lift, benchPressVariant)
    ? `${formatted.replace(/\s/g, '\u00a0')}\u00a0${(t.perArm).replace(/\s/g, '\u00a0')}`
    : formatted;
}

export function shouldTrackWorkoutStrength(lift, benchPressVariant = 'standard') {
  if (isStandingLandminePress(lift, benchPressVariant)) return false;
  if (isBenchHomeAlternative(lift, benchPressVariant)) return false;
  if (isBenchMachineAlternative(lift, benchPressVariant)) return false;
  return true;
}

export function isSquatBeltAlternativeLiftBlock(liftBlock = {}) {
  return liftBlock?.lift === 'Squat' && (
    liftBlock.squatVariant === 'beltSquat' ||
    liftBlock.squatVariant === 'zercherSquat' ||
    (liftBlock.sets || []).some(set => String(set.groupKey || '').startsWith('squatAlternative'))
  );
}

export function isDeadliftAlternativeLiftBlock(liftBlock = {}) {
  return liftBlock?.lift === 'Deadlift' && (
    liftBlock.deadliftVariant === 'alternative' ||
    liftBlock.deadliftVariant === 'hipThrust' ||
    (liftBlock.sets || []).some(set => String(set.groupKey || '').startsWith('deadliftAlternative')) ||
    (liftBlock.sets || []).some(set => String(set.groupKey || '').startsWith('deadliftHomeAlternative'))
  );
}

export function isBenchMachineAlternativeLiftBlock(liftBlock = {}) {
  return liftBlock?.lift === 'Bench' && (
    liftBlock.benchPressVariant === 'machineAlternative' ||
    (liftBlock.sets || []).some(set => String(set.groupKey || '').startsWith('benchMachineAlternative'))
  );
}

export function isBenchHomeAlternativeLiftBlock(liftBlock = {}) {
  return liftBlock?.lift === 'Bench' && (
    liftBlock.benchPressVariant === 'shoulderPress' ||
    liftBlock.benchPressVariant === 'goodMorning' ||
    (liftBlock.sets || []).some(set => String(set.groupKey || '').startsWith('benchHomeAlternative'))
  );
}

export function shouldTrackLiftBlockStrength(liftBlock = {}, benchPressVariant = 'standard') {
  if (isSquatBeltAlternativeLiftBlock(liftBlock)) return false;
  if (isDeadliftAlternativeLiftBlock(liftBlock)) return false;
  if (isBenchMachineAlternativeLiftBlock(liftBlock)) return false;
  if (isBenchHomeAlternativeLiftBlock(liftBlock)) return false;

  return shouldTrackWorkoutStrength(
    liftBlock.lift,
    liftBlock.benchPressVariant || benchPressVariant
  );
}

export function getWorkoutTypeLabel(workout, t) {
  const key = getWorkoutTypeKey(workout);
  return key ? t[key] : '-';
}

export function normalizePreparationMode(mode) {
  if (mode === 'off') return 'off';
  if (mode === 'basicAll') return 'basicAll';
  if (mode === 'shoulderThoracic') return 'shoulderThoracic';

  // Backwards compatibility: old "basic" means first big lift only.
  if (mode === 'basic' || mode === 'basicFirst') return 'basicFirst';

  return 'basicFirst';
}
