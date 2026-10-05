import { parseWorkoutDateKey } from './workoutScheduleDates';
import { getEntryCycle, isCompletedHistoryEntry } from './workoutHistoryStats';

export const DEFAULT_CALENDAR_START_TIME = '18:00';
export const CALENDAR_MINUTES_PER_SET = 5;

function validStartTime(value) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
  if (!match) return false;
  return Number(match[1]) < 24 && Number(match[2]) < 60;
}

function normalizeEventMapping(mapping) {
  if (!mapping || mapping.eventId === undefined || mapping.eventId === null) return null;
  const cycleId = Number(mapping.cycleId);
  const workoutId = Number(mapping.workoutId);
  if (!Number.isFinite(cycleId) || !Number.isFinite(workoutId)) return null;

  return {
    cycleId,
    workoutId,
    calendarId: mapping.calendarId == null ? null : String(mapping.calendarId),
    eventId: String(mapping.eventId),
    syncedDate: parseWorkoutDateKey(mapping.syncedDate),
    startTime: validStartTime(mapping.startTime) ? mapping.startTime : DEFAULT_CALENDAR_START_TIME,
    durationMinutes: Math.max(0, Number(mapping.durationMinutes) || 0),
    reminderMinutes: Math.max(0, Number(mapping.reminderMinutes) || 0),
  };
}

export function createCalendarIntegrationSettings(overrides = {}) {
  return normalizeCalendarIntegrationSettings({
    enabled: false,
    deleteCompletedWorkouts: false,
    calendarId: null,
    calendarName: '',
    calendarAccountName: '',
    calendarAccountType: '',
    defaultStartTime: DEFAULT_CALENDAR_START_TIME,
    eventMappings: [],
    hasSynced: false,
    promptDismissedCycle: null,
    promptsDisabled: false,
    ...overrides,
  });
}

export function normalizeCalendarIntegrationSettings(value = {}) {
  const calendarId = value?.calendarId === undefined || value?.calendarId === null
    ? null
    : String(value.calendarId);
  const mappings = Array.isArray(value?.eventMappings)
    ? value.eventMappings.map(normalizeEventMapping).filter(Boolean)
    : [];
  const promptDismissedCycle = Number(value?.promptDismissedCycle);

  return {
    enabled: value?.enabled === true && Boolean(calendarId),
    deleteCompletedWorkouts: value?.deleteCompletedWorkouts === true,
    calendarId,
    calendarName: String(value?.calendarName || ''),
    calendarAccountName: String(value?.calendarAccountName || ''),
    calendarAccountType: String(value?.calendarAccountType || ''),
    defaultStartTime: validStartTime(value?.defaultStartTime)
      ? value.defaultStartTime
      : DEFAULT_CALENDAR_START_TIME,
    eventMappings: mappings,
    hasSynced: value?.hasSynced === true,
    promptDismissedCycle: Number.isFinite(promptDismissedCycle) && promptDismissedCycle > 0
      ? promptDismissedCycle
      : null,
    promptsDisabled: value?.promptsDisabled === true,
  };
}

export function getCompletedCalendarWorkoutKeys(history = []) {
  return new Set(history.filter(isCompletedHistoryEntry).map(entry => (
    `${getEntryCycle(entry)}:${Number(entry.workoutNumber)}`
  )));
}

function prescribedSetCount(item) {
  const explicit = Number(item?.sets);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const match = String(item?.prescription || '').match(/^\s*(\d+)\s*[×x]/i);
  return match ? Number(match[1]) : 1;
}

export function countPlannedWorkoutSets(workout = {}) {
  if (!workout || workout.type === 'rest') return 0;

  const liftBlocks = Array.isArray(workout.lifts) && workout.lifts.length
    ? workout.lifts
    : [{ warmups: workout.warmups || [], sets: workout.sets || [] }];
  const liftSetCount = liftBlocks.reduce((total, liftBlock) => (
    total + (liftBlock?.warmups?.length || 0) + (liftBlock?.sets?.length || 0)
  ), 0);
  const preparationSetCount = (workout.prepItems || [])
    .reduce((total, item) => total + prescribedSetCount(item), 0);
  const accessorySetCount = (workout.accessories || []).reduce((total, accessory) => (
    total + (accessory?.weights?.length || accessory?.done?.length || prescribedSetCount(accessory))
  ), 0);
  const cooldownSetCount = (workout.cooldownItems || [])
    .reduce((total, item) => total + prescribedSetCount(item), 0);

  return liftSetCount + preparationSetCount + accessorySetCount + cooldownSetCount;
}

export function getWorkoutCalendarDurationMinutes(workout = {}) {
  return countPlannedWorkoutSets(workout) * CALENDAR_MINUTES_PER_SET;
}

export function getFutureCalendarWorkouts({
  workouts = [],
  scheduleDateKeys = [],
  currentIndex = 0,
  today = new Date(),
} = {}) {
  const todayKey = parseWorkoutDateKey(today);
  if (!todayKey) return [];

  return (workouts || []).flatMap((workout, index) => {
    const dateKey = parseWorkoutDateKey(scheduleDateKeys[index]);
    if (
      index < Number(currentIndex || 0) ||
      workout?.completed ||
      workout?.type === 'rest' ||
      !dateKey ||
      dateKey < todayKey
    ) {
      return [];
    }

    return [{ workout, index, dateKey }];
  });
}

export function shouldShowCalendarCyclePrompt(settings, currentCycle) {
  const normalized = normalizeCalendarIntegrationSettings(settings);
  return !normalized.enabled &&
    !normalized.promptsDisabled &&
    normalized.promptDismissedCycle !== Number(currentCycle);
}

export function buildCalendarEventSpecs({
  workouts = [], scheduleDateKeys = [], currentIndex = 0, currentCycle,
  startTime = DEFAULT_CALENDAR_START_TIME, today = new Date(), titleTemplate,
} = {}) {
  const safeTime = validStartTime(startTime) ? startTime : DEFAULT_CALENDAR_START_TIME;
  const [hours, minutes] = safeTime.split(':').map(Number);
  return getFutureCalendarWorkouts({ workouts, scheduleDateKeys, currentIndex, today })
    .flatMap(({ workout, dateKey }) => {
      const durationMinutes = getWorkoutCalendarDurationMinutes(workout);
      const workoutId = Number(workout?.number);
      if (!Number.isFinite(workoutId) || durationMinutes <= 0) return [];
      const [year, month, day] = dateKey.split('-').map(Number);
      const startsAt = new Date(year, month - 1, day, hours, minutes);
      const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
      return [{
        cycleId: Number(currentCycle),
        workoutId,
        dateKey,
        startTime: safeTime,
        durationMinutes,
        startMillis: startsAt.getTime(),
        endMillis: endsAt.getTime(),
        title: String(titleTemplate || 'C{cycle}W{workout}')
          .replace('{cycle}', String(currentCycle))
          .replace('{workout}', String(workoutId)),
      }];
    });
}
