import { vi } from 'vitest';
import { syncWorkoutCalendar as syncCalendar } from './calendarSync';

const syncWorkoutCalendar = options => syncCalendar({ ensureReminder: vi.fn().mockResolvedValue(undefined), ...options });

const event = {
  cycleId: 5,
  workoutId: 18,
  dateKey: '2026-10-02',
  startTime: '19:30',
  durationMinutes: 90,
  startMillis: new Date(2026, 9, 2, 19, 30).getTime(),
  endMillis: new Date(2026, 9, 2, 21).getTime(),
  title: 'Kelani C5W18',
};
const today = new Date(2026, 9, 2, 12);
const settings = { enabled: true, calendarId: '7', calendarName: 'Training', hasSynced: true };

test('first sync creates one event and later syncs are idempotent', async () => {
  const upsertEvent = vi.fn().mockResolvedValue('42');
  const deleteEvent = vi.fn();
  const first = await syncWorkoutCalendar({ settings, desiredEvents: [event], today, upsertEvent, deleteEvent });
  expect(first).toMatchObject({ created: 1, updated: 0, removed: 0 });
  expect(first.mappings[0]).toMatchObject({ calendarId: '7', eventId: '42', syncedDate: '2026-10-02' });

  const second = await syncWorkoutCalendar({
    settings: { ...settings, eventMappings: first.mappings },
    desiredEvents: [event], today, upsertEvent, deleteEvent,
  });
  expect(second).toMatchObject({ created: 0, updated: 0, removed: 0 });
  expect(upsertEvent).toHaveBeenCalledTimes(1);
  expect(deleteEvent).not.toHaveBeenCalled();
});

test('reschedules only its mapped event and removes it when disabled', async () => {
  const oldMapping = {
    cycleId: 5, workoutId: 18, calendarId: '7', eventId: '42',
    syncedDate: '2026-10-02', startTime: '18:00', durationMinutes: 90,
  };
  const upsertEvent = vi.fn().mockResolvedValue('42');
  const deleteEvent = vi.fn().mockResolvedValue(undefined);
  const next = await syncWorkoutCalendar({
    settings: { ...settings, eventMappings: [oldMapping] },
    desiredEvents: [event], today, upsertEvent, deleteEvent,
  });
  expect(next.updated).toBe(1);
  expect(upsertEvent).toHaveBeenCalledWith(expect.objectContaining({ eventId: '42', calendarId: '7' }));

  const disabled = await syncWorkoutCalendar({
    settings: { ...settings, enabled: false, eventMappings: next.mappings },
    desiredEvents: [event], today, upsertEvent, deleteEvent,
  });
  expect(disabled.removed).toBe(1);
  expect(deleteEvent).toHaveBeenCalledWith(expect.objectContaining({ eventId: '42', calendarId: '7' }));
  expect(disabled.mappings).toEqual([]);
});

test('changing the default time updates every planned linked workout without duplicates or reminder resets', async () => {
  const desiredEvents = [event, { ...event, workoutId: 19 }].map(item => ({
    ...item, startTime: '10:00',
    startMillis: new Date(2026, 9, 2, 10).getTime(),
    endMillis: new Date(2026, 9, 2, 11, 30).getTime(),
  }));
  const eventMappings = desiredEvents.map((item, index) => ({
    cycleId: item.cycleId, workoutId: item.workoutId, calendarId: '7', eventId: String(42 + index),
    syncedDate: item.dateKey, startTime: '09:00', durationMinutes: 90, reminderInitialized: true,
  }));
  const upsertEvent = vi.fn().mockImplementation(async item => item.eventId);
  const ensureReminder = vi.fn();
  const deleteEvent = vi.fn();
  const result = await syncWorkoutCalendar({
    settings: { ...settings, eventMappings }, desiredEvents, today, upsertEvent, ensureReminder, deleteEvent,
  });
  expect(result).toMatchObject({ created: 0, updated: 2, removed: 0 });
  expect(upsertEvent.mock.calls.map(([item]) => item.eventId)).toEqual(['42', '43']);
  expect(upsertEvent.mock.calls.every(([item]) => item.startMillis === desiredEvents[0].startMillis)).toBe(true);
  expect(result.mappings.every(item => item.startTime === '10:00')).toBe(true);
  expect(ensureReminder).not.toHaveBeenCalled();
  expect(deleteEvent).not.toHaveBeenCalled();
});

test('completed workouts are kept as history while unrelated events are never queried', async () => {
  const mapping = {
    cycleId: 5, workoutId: 18, calendarId: '7', eventId: '42',
    syncedDate: '2026-10-02', startTime: '19:30', durationMinutes: 90,
  };
  const deleteEvent = vi.fn();
  const result = await syncWorkoutCalendar({
    settings: { ...settings, enabled: false, eventMappings: [mapping] },
    completedWorkoutKeys: new Set(['5:18']), today,
    upsertEvent: vi.fn(), deleteEvent,
  });
  expect(result.mappings).toHaveLength(1);
  expect(deleteEvent).not.toHaveBeenCalled();
});

test('persists successful operations before a later native failure', async () => {
  const onProgress = vi.fn();
  const upsertEvent = vi.fn()
    .mockResolvedValueOnce('42')
    .mockRejectedValueOnce(new Error('Calendar unavailable'));
  await expect(syncWorkoutCalendar({
    settings,
    desiredEvents: [event, { ...event, workoutId: 19 }],
    today, upsertEvent, deleteEvent: vi.fn(), onProgress,
  })).rejects.toThrow('Calendar unavailable');
  expect(onProgress).toHaveBeenCalledWith([expect.objectContaining({ eventId: '42' })]);
});

test('opted-in cleanup deletes completed mapped workouts across dates and cycles without recreating them', async () => {
  const completedMapping = {
    cycleId: 5, workoutId: 18, calendarId: '7', eventId: '42',
    syncedDate: '2026-10-02', startTime: '19:30', durationMinutes: 90,
  };
  const pastCompletedMapping = { ...completedMapping, cycleId: 4, workoutId: 28, eventId: '41', syncedDate: '2026-09-30' };
  const pastUnfinishedMapping = { ...completedMapping, workoutId: 17, eventId: '40', syncedDate: '2026-09-30' };
  const upsertEvent = vi.fn();
  const deleteEvent = vi.fn().mockResolvedValue(undefined);
  const onProgress = vi.fn();
  const result = await syncWorkoutCalendar({
    settings: { ...settings, deleteCompletedWorkouts: true, eventMappings: [completedMapping, pastCompletedMapping, pastUnfinishedMapping] },
    desiredEvents: [event], completedWorkoutKeys: new Set(['5:18', '4:28']),
    today, upsertEvent, deleteEvent, onProgress,
  });
  expect(deleteEvent.mock.calls.map(([args]) => args.eventId)).toEqual(['42', '41']);
  expect(result).toMatchObject({ created: 0, updated: 0, removed: 2 });
  expect(result.mappings).toEqual([expect.objectContaining({ eventId: '40' })]);
  expect(onProgress).toHaveBeenCalledTimes(2);
  expect(upsertEvent).not.toHaveBeenCalled();

  const repeat = await syncWorkoutCalendar({
    settings: { ...settings, deleteCompletedWorkouts: true, eventMappings: result.mappings },
    desiredEvents: [event], completedWorkoutKeys: new Set(['5:18', '4:28']),
    today, upsertEvent, deleteEvent,
  });
  expect(repeat.removed).toBe(0);
  expect(deleteEvent).toHaveBeenCalledTimes(2);
});

test('completed cleanup retains mappings when the native bridge refuses ownership', async () => {
  const onProgress = vi.fn();
  const deleteEvent = vi.fn().mockRejectedValue(Object.assign(new Error('Not managed'), { code: 'EVENT_NOT_MANAGED' }));
  await expect(syncWorkoutCalendar({
    settings: { ...settings, deleteCompletedWorkouts: true, eventMappings: [{
      cycleId: 5, workoutId: 18, calendarId: '7', eventId: '42', syncedDate: '2026-10-01',
    }] },
    completedWorkoutKeys: new Set(['5:18']), today, upsertEvent: vi.fn(), deleteEvent, onProgress,
  })).rejects.toMatchObject({ code: 'EVENT_NOT_MANAGED' });
  expect(onProgress).not.toHaveBeenCalled();
});

test('completed cleanup remembers a prior manual deletion', async () => {
  const deleteEvent = vi.fn().mockRejectedValue(Object.assign(new Error('Gone'), { code: 'EVENT_NOT_FOUND' }));
  const result = await syncWorkoutCalendar({
    settings: { ...settings, deleteCompletedWorkouts: true, eventMappings: [{
      cycleId: 5, workoutId: 18, calendarId: '7', eventId: '42', syncedDate: '2026-10-01',
    }] },
    completedWorkoutKeys: new Set(['5:18']), today, upsertEvent: vi.fn(), deleteEvent,
  });
  expect(result).toMatchObject({ mappings: [expect.objectContaining({ eventId: '42', deletedExternally: true })], removed: 0 });
});

test('does not silently recreate an event removed in the calendar', async () => {
  const mapping = {
    cycleId: 5, workoutId: 18, calendarId: '7', eventId: '42',
    syncedDate: '2026-10-02', startTime: '18:00', durationMinutes: 90,
  };
  const onProgress = vi.fn();
  const missing = Object.assign(new Error('Gone'), { code: 'EVENT_NOT_FOUND' });
  const upsertEvent = vi.fn().mockRejectedValue(missing);
  const result = await syncWorkoutCalendar({
    settings: { ...settings, eventMappings: [mapping] },
    desiredEvents: [event], today, upsertEvent, deleteEvent: vi.fn(), onProgress,
  });
  expect(result.mappings[0]).toMatchObject({ eventId: '42', deletedExternally: true });
  expect(onProgress).toHaveBeenCalledWith([expect.objectContaining({ deletedExternally: true })]);
  expect(upsertEvent).toHaveBeenCalledTimes(1);

  upsertEvent.mockClear();
  const deleteEvent = vi.fn();
  for (const changedSettings of [{}, { enabled: false }, { calendarId: '8', enabled: true }]) {
    const repeat = await syncWorkoutCalendar({
      settings: { ...settings, eventMappings: JSON.parse(JSON.stringify(result.mappings)), ...changedSettings },
      desiredEvents: [{ ...event, startTime: '10:00', dateKey: '2026-10-03' }],
      today, upsertEvent, deleteEvent,
    });
    expect(repeat.mappings[0].deletedExternally).toBe(true);
  }
  expect(upsertEvent).not.toHaveBeenCalled();
  expect(deleteEvent).not.toHaveBeenCalled();
});

test('a deleted workout does not block synchronizing the remaining planned workouts', async () => {
  const mapping = { cycleId: 5, workoutId: 18, calendarId: '7', eventId: '42',
    syncedDate: event.dateKey, startTime: '09:00', durationMinutes: 90, reminderInitialized: true };
  const upsertEvent = vi.fn()
    .mockRejectedValueOnce(Object.assign(new Error('Gone'), { code: 'EVENT_NOT_FOUND' }))
    .mockResolvedValueOnce('43');
  const result = await syncWorkoutCalendar({
    settings: { ...settings, eventMappings: [mapping] },
    desiredEvents: [event, { ...event, workoutId: 19 }], today, upsertEvent, deleteEvent: vi.fn(),
  });
  expect(result).toMatchObject({ created: 1, updated: 0 });
  expect(result.mappings).toEqual([
    expect.objectContaining({ eventId: '42', deletedExternally: true }),
    expect.objectContaining({ eventId: '43', workoutId: 19 }),
  ]);
});

test('missing events during reminder migration remain deleted on later syncs', async () => {
  const mapping = { cycleId: 5, workoutId: 18, calendarId: '7', eventId: '42',
    syncedDate: event.dateKey, startTime: event.startTime, durationMinutes: event.durationMinutes };
  const upsertEvent = vi.fn();
  const result = await syncWorkoutCalendar({
    settings: { ...settings, eventMappings: [mapping] }, desiredEvents: [event], today,
    upsertEvent, deleteEvent: vi.fn(),
    ensureReminder: vi.fn().mockRejectedValue(Object.assign(new Error('Gone'), { code: 'EVENT_NOT_FOUND' })),
  });
  expect(result.mappings[0].deletedExternally).toBe(true);
  await syncWorkoutCalendar({
    settings: { ...settings, eventMappings: result.mappings }, desiredEvents: [event], today,
    upsertEvent, deleteEvent: vi.fn(),
  });
  expect(upsertEvent).not.toHaveBeenCalled();
});

test('permission and ownership failures do not mark an event as manually deleted', async () => {
  const mapping = { cycleId: 5, workoutId: 18, calendarId: '7', eventId: '42', syncedDate: event.dateKey };
  for (const code of ['PERMISSION_DENIED', 'EVENT_NOT_MANAGED', 'SAVE_FAILED']) {
    const onProgress = vi.fn();
    await expect(syncWorkoutCalendar({
      settings: { ...settings, eventMappings: [mapping] }, desiredEvents: [event], today,
      upsertEvent: vi.fn().mockRejectedValue(Object.assign(new Error('Failure'), { code })),
      deleteEvent: vi.fn(), onProgress,
    })).rejects.toMatchObject({ code });
    expect(onProgress).not.toHaveBeenCalled();
  }
});


test('migrates reminders once without rewriting a manually moved event', async () => {
  const mapping = { cycleId: 5, workoutId: 18, calendarId: '7', eventId: '42',
    syncedDate: event.dateKey, startTime: event.startTime, durationMinutes: event.durationMinutes };
  const ensureReminder = vi.fn().mockResolvedValue(undefined);
  const upsertEvent = vi.fn();
  const result = await syncWorkoutCalendar({ settings: { ...settings, eventMappings: [mapping] },
    desiredEvents: [event], today, upsertEvent, deleteEvent: vi.fn(), ensureReminder });
  expect(upsertEvent).not.toHaveBeenCalled();
  expect(ensureReminder).toHaveBeenCalledWith({ calendarId: '7', eventId: '42', cycleId: 5, workoutId: 18 });
  expect(result.mappings[0].reminderInitialized).toBe(true);
  await syncWorkoutCalendar({ settings: { ...settings, eventMappings: result.mappings },
    desiredEvents: [{ ...event, startTime: '20:00' }], today,
    upsertEvent: vi.fn().mockResolvedValue('42'), deleteEvent: vi.fn(), ensureReminder });
  expect(ensureReminder).toHaveBeenCalledTimes(1);
});

test('does not persist reminder migration when ownership or provider validation fails', async () => {
  const mapping = { cycleId: 5, workoutId: 18, calendarId: '7', eventId: '42',
    syncedDate: event.dateKey, startTime: event.startTime, durationMinutes: event.durationMinutes };
  const onProgress = vi.fn();
  await expect(syncWorkoutCalendar({ settings: { ...settings, eventMappings: [mapping] },
    desiredEvents: [event], today, upsertEvent: vi.fn(), deleteEvent: vi.fn(), onProgress,
    ensureReminder: vi.fn().mockRejectedValue(Object.assign(new Error('Not managed'), { code: 'EVENT_NOT_MANAGED' }))
  })).rejects.toMatchObject({ code: 'EVENT_NOT_MANAGED' });
  expect(onProgress).not.toHaveBeenCalled();
});
