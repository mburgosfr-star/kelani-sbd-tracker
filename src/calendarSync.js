import { normalizeCalendarIntegrationSettings } from './calendarIntegration';
import { parseWorkoutDateKey } from './workoutScheduleDates';

function workoutKey(cycleId, workoutId) {
  return `${Number(cycleId)}:${Number(workoutId)}`;
}

export async function syncWorkoutCalendar({
  settings,
  desiredEvents = [],
  completedWorkoutKeys = new Set(),
  today = new Date(),
  upsertEvent,
  deleteEvent,
  ensureReminder,
  onProgress = () => {},
}) {
  const normalized = normalizeCalendarIntegrationSettings(settings);
  const todayKey = parseWorkoutDateKey(today);
  if (!todayKey) throw new Error('Invalid calendar date');

  const desired = normalized.enabled
    ? desiredEvents.filter(event => event && event.dateKey >= todayKey &&
      !completedWorkoutKeys.has(workoutKey(event.cycleId, event.workoutId)))
    : [];
  const desiredByKey = new Map(desired.map(event => [workoutKey(event.cycleId, event.workoutId), event]));
  let mappings = [...normalized.eventMappings];
  let created = 0;
  let updated = 0;
  let removed = 0;

  function recordProgress(nextMappings) {
    mappings = nextMappings;
    onProgress([...mappings]);
  }

  for (const mapping of [...mappings]) {
    const key = workoutKey(mapping.cycleId, mapping.workoutId);
    const stillDesired = desiredByKey.has(key) &&
      (mapping.calendarId || normalized.calendarId) === normalized.calendarId;
    const completed = completedWorkoutKeys.has(key);
    if (completed
      ? !normalized.deleteCompletedWorkouts
      : stillDesired || mapping.syncedDate < todayKey) continue;

    try {
      await deleteEvent({
        calendarId: mapping.calendarId || normalized.calendarId,
        eventId: mapping.eventId,
        cycleId: mapping.cycleId,
        workoutId: mapping.workoutId,
      });
    } catch (error) {
      if (error?.code !== 'EVENT_NOT_FOUND') throw error;
    }
    recordProgress(mappings.filter(item => item !== mapping));
    removed += 1;
  }

  for (const event of desired) {
    const key = workoutKey(event.cycleId, event.workoutId);
    const mapping = mappings.find(item => workoutKey(item.cycleId, item.workoutId) === key &&
      (item.calendarId || normalized.calendarId) === normalized.calendarId);
    const unchanged = mapping &&
      mapping.syncedDate === event.dateKey &&
      mapping.startTime === event.startTime &&
      mapping.durationMinutes === event.durationMinutes;
    if (unchanged && mapping.reminderInitialized) continue;

    let eventId;
    try {
      eventId = unchanged ? mapping.eventId : await upsertEvent({
        calendarId: normalized.calendarId,
        eventId: mapping?.eventId || null,
        cycleId: event.cycleId,
        workoutId: event.workoutId,
        title: event.title,
        startMillis: event.startMillis,
        endMillis: event.endMillis,
      });
      if (mapping && !mapping.reminderInitialized) {
        await ensureReminder({
          calendarId: normalized.calendarId,
          eventId: String(eventId),
          cycleId: event.cycleId,
          workoutId: event.workoutId,
        });
      }
    } catch (error) {
      if (mapping && error?.code === 'EVENT_NOT_FOUND') {
        recordProgress(mappings.filter(item => item !== mapping));
      }
      throw error;
    }
    const nextMapping = {
      cycleId: event.cycleId,
      workoutId: event.workoutId,
      calendarId: normalized.calendarId,
      eventId: String(eventId),
      syncedDate: event.dateKey,
      startTime: event.startTime,
      durationMinutes: event.durationMinutes,
      reminderMinutes: 0,
      reminderInitialized: true,
    };
    recordProgress([...mappings.filter(item => item !== mapping), nextMapping]);
    if (mapping) updated += 1;
    else created += 1;
  }

  return { mappings, created, updated, removed };
}
