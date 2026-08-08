export const TRAINING_MODELS = {
  CLASSIC: 'classic',
  SMART: 'smart',
};

export const SMART_DAY_TYPES = {
  TRAINING: 'training',
  RECOVERY: 'recovery',
  DELOAD: 'deload',
  MEET: 'meet',
};

export const SMART_DECISION_REASONS = {
  FATIGUE_RECOVERY: 'fatigue-recovery',
  TRAINING_STREAK_RECOVERY: 'training-streak-recovery',
  TRAINING_FALLBACK: 'training-fallback',
  FAILED_SET_DELOAD: 'failed-set-deload',
  MEETDAY_READY: 'meetday-ready',
  POST_MEET_RECOVERY: 'post-meet-recovery',

  FREQUENCY_RECOVERY: 'frequency-recovery',
};

export const SMART_OVERRIDES = {
  RECOVERY: 'recovery',
  TRAINING_FALLBACK: 'training-fallback',
  POST_RECOVERY_LIGHT_TRAINING: 'post-recovery-light-training',
  MEETDAY: 'meetday',
};

export const SMART_THRESHOLDS = {
  RECENT_DAYS: 3,
  ROLLING_TRAINING_DAYS: 6,
  RECENT_PRESCRIPTION_TRAINING_DAYS: 3,
  HEAVY_DEADLIFT_LOOKBACK_DAYS: 4,
  FATIGUE_RECOVERY_SCORE: 2,
  TRAINING_STREAK_RECOVERY_DAYS: 3,
  FAILED_SET_FATIGUE_CAP: 2,
  FAILED_SET_DELOAD_COUNT: 2,
  MEETDAY_MIN_ACTIVE_BLOCK_DAYS: 8,
  MEETDAY_CURRENT_CYCLE_READINESS_RATIO: 1.0,
  MEETDAY_SECOND_ATTEMPT_SUPPORT_RATIO: 0.975,
  MEETDAY_THIRD_ATTEMPT_POTENTIAL_RATIO: 1.0,
  MEET_PROJECTION_FALLBACK_GAIN_RATIO: 0.0125,
  MEET_PROJECTION_MIN_GAIN_KG: 1.25,
  MEET_PROJECTION_RANGE_LOW_FACTOR: 0.85,
  MEET_PROJECTION_RANGE_HIGH_FACTOR: 1.25,
  POST_MEET_RECOVERY_MAX_DAYS: 3,
  POST_MEET_MIN_TRAINING_DAYS: 8,
  POST_FAILED_MEET_MIN_TRAINING_DAYS: 12,
};

export const SMART_SECONDARY_EXPOSURE_WEIGHT = 0.5;

export const SMART_DELOAD = {
  LOAD_FACTOR: 0.9,
  MIN_PCT: 0.5,
};

// Primary top sets may continue progressing independently, but the volume
// work that follows them must remain recoverable. This is also the ceiling
// used for ordinary medium work.
export const SMART_PRIMARY_BACKOFF_MAX_PCT = 0.75;

export const SMART_PRESCRIPTION_VERSION = 11;

export const SMART_GENERATED_FLAGS = {
  RECOVERY: 'smartGeneratedRecovery',
  TRAINING: 'smartGeneratedTraining',
  MEET: 'smartGeneratedMeet',
};

export const MEET_ATTEMPT_KEYS = ['opener', 'secondAttempt', 'thirdAttempt'];

export const MEET_ATTEMPT_PCTS = {
  opener: 0.9,
  secondAttempt: 0.975,
  thirdAttempt: 1.025,
};

// Weighted intensity-score frequency model. Lives in this
// leaf module (no imports of its own) specifically so both
// smartPrescriptionEngine.js and smartFrequencyPolicy.js can read it without
// a circular import - smartFrequencyPolicy.js already imports from
// smartPrescriptionEngine.js for roundPercent.
export const SMART_INTENSITY_POINTS = Object.freeze({
  heavy: 3,
  medium: 2,
  light: 1,
});

export const SMART_MAX_CONSECUTIVE_TRAINING_DAYS_BY_LEVEL = Object.freeze({
  beginner: Object.freeze({ Squat: 2, Bench: 2, Deadlift: 2 }),
  intermediate: Object.freeze({ Squat: 2, Bench: 2, Deadlift: 2 }),
  advanced: Object.freeze({ Squat: 2, Bench: 3, Deadlift: 2 }),
  elite: Object.freeze({ Squat: 3, Bench: 3, Deadlift: 2 }),
});

export function getSmartMaxConsecutiveTrainingDays(
  athleteLevel = 'intermediate',
  lift = ''
) {
  const levelPolicy =
    SMART_MAX_CONSECUTIVE_TRAINING_DAYS_BY_LEVEL[athleteLevel] ||
    SMART_MAX_CONSECUTIVE_TRAINING_DAYS_BY_LEVEL.intermediate;
  return Number(levelPolicy[lift]) || 2;
}

// `score` is the real weekly target - any mix of heavy/medium/light
// sessions that reaches it is valid. `defaultMix` is only the *ideal*
// starting template, not a hard requirement. `days` is the flat weekly
// session count (replaces the old EXPOSURE_TARGETS_BY_LEVEL, which is now
// derived from this field - see smartPrescriptionEngine.js).
// `consecutiveAllowancePerWeek` is the graded replacement for the old
// noConsecutive/noConsecutiveHeavy booleans in smartFrequencyPolicy.js - how
// many times per rolling window the same lift is allowed on two consecutive
// training days, rather than an absolute ban.
export const SMART_FREQUENCY_SCORE_TARGETS_BY_LEVEL = Object.freeze({
  beginner: Object.freeze({
    Squat: Object.freeze({
      score: 5,
      days: 2,
      defaultMix: Object.freeze({ heavy: 1, medium: 1, light: 0 }),
      consecutiveAllowancePerWeek: 0,
    }),
    Bench: Object.freeze({
      score: 6,
      days: 3,
      defaultMix: Object.freeze({ heavy: 1, medium: 1, light: 1 }),
      consecutiveAllowancePerWeek: 0,
    }),
    Deadlift: Object.freeze({
      score: 3,
      days: 1,
      defaultMix: Object.freeze({ heavy: 1, medium: 0, light: 0 }),
      consecutiveAllowancePerWeek: 0,
    }),
  }),
  intermediate: Object.freeze({
    Squat: Object.freeze({
      score: 6,
      days: 3,
      defaultMix: Object.freeze({ heavy: 1, medium: 1, light: 1 }),
      consecutiveAllowancePerWeek: 0,
    }),
    Bench: Object.freeze({
      score: 7,
      days: 4,
      defaultMix: Object.freeze({ heavy: 1, medium: 1, light: 2 }),
      consecutiveAllowancePerWeek: 1,
    }),
    Deadlift: Object.freeze({
      score: 5,
      days: 2,
      defaultMix: Object.freeze({ heavy: 1, medium: 1, light: 0 }),
      consecutiveAllowancePerWeek: 0,
    }),
  }),
  advanced: Object.freeze({
    Squat: Object.freeze({
      score: 7,
      days: 4,
      defaultMix: Object.freeze({ heavy: 1, medium: 1, light: 2 }),
      consecutiveAllowancePerWeek: 1,
    }),
    Bench: Object.freeze({
      score: 9,
      days: 5,
      defaultMix: Object.freeze({ heavy: 1, medium: 2, light: 2 }),
      consecutiveAllowancePerWeek: 2,
    }),
    Deadlift: Object.freeze({
      score: 6,
      days: 3,
      defaultMix: Object.freeze({ heavy: 1, medium: 1, light: 1 }),
      consecutiveAllowancePerWeek: 0,
    }),
  }),
  elite: Object.freeze({
    Squat: Object.freeze({
      score: 9,
      days: 5,
      defaultMix: Object.freeze({ heavy: 1, medium: 2, light: 2 }),
      consecutiveAllowancePerWeek: 2,
    }),
    Bench: Object.freeze({
      score: 10,
      days: 6,
      defaultMix: Object.freeze({ heavy: 1, medium: 2, light: 3 }),
      consecutiveAllowancePerWeek: 3,
    }),
    Deadlift: Object.freeze({
      score: 7,
      days: 4,
      defaultMix: Object.freeze({ heavy: 1, medium: 1, light: 2 }),
      consecutiveAllowancePerWeek: 1,
    }),
  }),
});

export function getSmartFrequencyScoreTargets(athleteLevel = 'intermediate') {
  return (
    SMART_FREQUENCY_SCORE_TARGETS_BY_LEVEL[athleteLevel] ||
    SMART_FREQUENCY_SCORE_TARGETS_BY_LEVEL.intermediate
  );
}
