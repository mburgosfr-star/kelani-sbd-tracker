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
  readManagedEvents,
  restWorkoutKeys = new Set(),
  generatedTitleTemplates = [],
  onProgress = () => {},
}) {
  const normalized = normalizeCalendarIntegrationSettings(settings);
  const todayKey = parseWorkoutDateKey(today);
  if (!todayKey) throw new Error('Invalid calendar date');

  const desired = normalized.enabled
    ? desiredEvents.filter(event => event && event.dateKey >= todayKey &&
      !completedWorkoutKeys.has(workoutKey(event.cycleId, event.workoutId)) &&
      !normalized.eventMappings.some(mapping => mapping.deletedExternally &&
        workoutKey(mapping.cycleId, mapping.workoutId) === workoutKey(event.cycleId, event.workoutId)))
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

  // A legacy forecast may have left events with no saved mapping. Only reclaim
  // generated events for identities explicitly known to be rest days now.
  if (normalized.enabled && readManagedEvents && restWorkoutKeys.size) {
    const dayStart = new Date(`${todayKey}T00:00:00`).getTime();
    const providerEvents = await readManagedEvents({ calendarId: normalized.calendarId, fromMillis: dayStart });
    for (const event of providerEvents) {
      const key = workoutKey(event.cycleId, event.workoutId);
      if (String(event.calendarId) !== normalized.calendarId ||
        !restWorkoutKeys.has(key) || desiredByKey.has(key) ||
        !Number.isFinite(event.startMillis) || event.startMillis < dayStart ||
        mappings.some(mapping => String(mapping.eventId) === String(event.eventId) &&
          (mapping.calendarId || normalized.calendarId) === normalized.calendarId) ||
        !generatedTitleTemplates.some(template => String(template)
          .replace('{cycle}', String(event.cycleId))
          .replace('{workout}', String(event.workoutId)) === event.title)) continue;
      try {
        await deleteEvent({ calendarId: normalized.calendarId, eventId: String(event.eventId),
          cycleId: event.cycleId, workoutId: event.workoutId });
        removed += 1;
      } catch (error) {
        if (error?.code !== 'EVENT_NOT_FOUND') throw error;
      }
    }
  }

  for (const mapping of [...mappings]) {
    // Keep the deletion decision even when the route, calendar or time changes.
    if (mapping.deletedExternally) continue;
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
      recordProgress(mappings.map(item => item === mapping
        ? { ...mapping, deletedExternally: true } : item));
      continue;
    }
    recordProgress(mappings.filter(item => item !== mapping));
    removed += 1;
  }

  for (const event of desired) {
    const key = workoutKey(event.cycleId, event.workoutId);
    const mapping = mappings.find(item => workoutKey(item.cycleId, item.workoutId) === key &&
      (item.calendarId || normalized.calendarId) === normalized.calendarId);
    const timingUnchanged = mapping &&
      mapping.syncedDate === event.dateKey &&
      mapping.startTime === event.startTime &&
      mapping.durationMinutes === event.durationMinutes;
    const unchanged = timingUnchanged && (!mapping.provisional || mapping.identityVerified === true) &&
      Boolean(mapping.provisional) === Boolean(event.provisional);
    const reconcileDuplicates = Boolean(event.alternateTitle) && mapping?.duplicateReconciliationVersion !== 2;
    if (unchanged && mapping.reminderInitialized && !reconcileDuplicates) continue;

    let eventId;
    try {
      eventId = unchanged && !reconcileDuplicates ? mapping.eventId : await upsertEvent({
        calendarId: normalized.calendarId,
        eventId: mapping?.eventId || null,
        cycleId: event.cycleId,
        workoutId: event.workoutId,
        title: event.title,
        ...(event.alternateTitle ? { alternateTitle: event.alternateTitle, preserveTitle: Boolean(unchanged) } : {}),
        preserveTiming: Boolean(timingUnchanged),
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
        recordProgress(mappings.map(item => item === mapping
          ? { ...mapping, deletedExternally: true } : item));
        // A missing linked event is a user's calendar choice, not a sync failure.
        continue;
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
      identityVerified: true,
      ...(event.alternateTitle ? { duplicateReconciliationVersion: 2 } : {}),
      ...(event.provisional ? { provisional: true } : {}),
    };
    recordProgress([...mappings.filter(item => item !== mapping), nextMapping]);
    if (mapping) updated += 1;
    else created += 1;
  }

  return { mappings, created, updated, removed };
}
