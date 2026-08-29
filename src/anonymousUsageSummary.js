function sessionKey(entry = {}) {
  const cycle = Number(entry.cycle);
  const workoutNumber = Number(entry.workoutNumber);

  if (!Number.isFinite(cycle) || !Number.isFinite(workoutNumber) || workoutNumber <= 0) {
    return null;
  }

  return `${cycle}:${workoutNumber}`;
}

function countFailedOrSkippedSets(value) {
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countFailedOrSkippedSets(item), 0);
  }

  if (!value || typeof value !== 'object') return 0;

  const isSet = Object.prototype.hasOwnProperty.call(value, 'reps') ||
    Object.prototype.hasOwnProperty.call(value, 'weight');
  if (isSet && (value.failed || value.skipped)) return 1;

  return Object.values(value).reduce(
    (total, item) => total + countFailedOrSkippedSets(item),
    0
  );
}

function classifySession(entries = [], snapshot = {}) {
  if (
    snapshot.type === 'meet' ||
    snapshot.smartDayType === 'meet' ||
    entries.some(entry => entry.meetDay)
  ) {
    return 'meet';
  }

  if (
    snapshot.type === 'rest' ||
    snapshot.smartDayType === 'recovery' ||
    entries.some(entry => entry.restDay)
  ) {
    return 'recovery';
  }

  return 'training';
}

export function buildAnonymousUsageMetrics({
  history = [],
  appVersion = 'dev',
  language = 'en',
  weightUnit = 'kg',
  trainingModel = 'smart',
  athleteLevel = 'beginner',
  preparationMode = 'off',
  accessoryMode = 'off',
  cooldownMode = 'off',
} = {}) {
  const groupedSessions = new Map();

  (Array.isArray(history) ? history : []).forEach(entry => {
    const key = sessionKey(entry);
    if (!key || entry?.seedMax || entry?.manualMax) return;

    const isCompleted = Boolean(
      entry?.workoutSnapshot ||
      entry?.lift ||
      entry?.restDay ||
      entry?.completionOnly ||
      entry?.meetDay
    );
    if (!isCompleted) return;

    const group = groupedSessions.get(key) || { entries: [], snapshot: null };
    group.entries.push(entry);
    if (!group.snapshot && entry?.workoutSnapshot) {
      group.snapshot = entry.workoutSnapshot;
    }
    groupedSessions.set(key, group);
  });

  const sessionTypes = { training: 0, recovery: 0, meet: 0 };
  const efforts = { easy: 0, good: 0, hard: 0, tooMuch: 0, unrecorded: 0 };
  let failedOrSkippedSets = 0;
  let milestoneCelebrations = 0;

  groupedSessions.forEach(({ entries, snapshot }) => {
    const safeSnapshot = snapshot || {};
    sessionTypes[classifySession(entries, safeSnapshot)] += 1;

    const effort = safeSnapshot.workoutEffort || entries.find(entry => entry?.workoutEffort)?.workoutEffort;
    if (Object.prototype.hasOwnProperty.call(efforts, effort)) {
      efforts[effort] += 1;
    } else {
      efforts.unrecorded += 1;
    }

    failedOrSkippedSets += countFailedOrSkippedSets(safeSnapshot);
    if (Array.isArray(safeSnapshot?.milestoneCelebration?.achievements) &&
        safeSnapshot.milestoneCelebration.achievements.length > 0) {
      milestoneCelebrations += 1;
    }
  });

  return {
    schemaVersion: 1,
    appVersion: String(appVersion || 'dev'),
    language: String(language || 'en'),
    weightUnit: String(weightUnit || 'kg'),
    trainingModel: String(trainingModel || 'smart'),
    athleteLevel: String(athleteLevel || 'beginner'),
    completedSessions: groupedSessions.size,
    trainingSessions: sessionTypes.training,
    recoverySessions: sessionTypes.recovery,
    meetSessions: sessionTypes.meet,
    efforts,
    failedOrSkippedSets,
    milestoneCelebrations,
    preparationMode: String(preparationMode || 'off'),
    accessoryMode: String(accessoryMode || 'off'),
    cooldownMode: String(cooldownMode || 'off'),
  };
}

export function buildAnonymousUsageReport(metrics = {}) {
  const efforts = metrics.efforts || {};
  return [
    'Kelani anonymous usage summary',
    `schema_version=${Number(metrics.schemaVersion) || 1}`,
    `app_version=${metrics.appVersion || 'dev'}`,
    `language=${metrics.language || 'en'}`,
    `weight_unit=${metrics.weightUnit || 'kg'}`,
    `training_model=${metrics.trainingModel || 'smart'}`,
    `athlete_level=${metrics.athleteLevel || 'beginner'}`,
    `completed_sessions=${Number(metrics.completedSessions) || 0}`,
    `training_sessions=${Number(metrics.trainingSessions) || 0}`,
    `recovery_sessions=${Number(metrics.recoverySessions) || 0}`,
    `meet_sessions=${Number(metrics.meetSessions) || 0}`,
    `effort_easy=${Number(efforts.easy) || 0}`,
    `effort_good=${Number(efforts.good) || 0}`,
    `effort_hard=${Number(efforts.hard) || 0}`,
    `effort_too_much=${Number(efforts.tooMuch) || 0}`,
    `effort_unrecorded=${Number(efforts.unrecorded) || 0}`,
    `failed_or_skipped_sets=${Number(metrics.failedOrSkippedSets) || 0}`,
    `milestone_celebrations=${Number(metrics.milestoneCelebrations) || 0}`,
    `preparation_mode=${metrics.preparationMode || 'off'}`,
    `accessory_mode=${metrics.accessoryMode || 'off'}`,
    `cooldown_mode=${metrics.cooldownMode || 'off'}`,
  ].join('\n');
}
