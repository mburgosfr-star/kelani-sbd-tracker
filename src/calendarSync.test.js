import { vi } from 'vitest';
import { syncWorkoutCalendar } from './calendarSync';

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

test('does not silently recreate an event removed in the calendar', async () => {
  const mapping = {
    cycleId: 5, workoutId: 18, calendarId: '7', eventId: '42',
    syncedDate: '2026-10-02', startTime: '18:00', durationMinutes: 90,
  };
  const onProgress = vi.fn();
  const missing = Object.assign(new Error('Gone'), { code: 'EVENT_NOT_FOUND' });
  const upsertEvent = vi.fn().mockRejectedValue(missing);
  await expect(syncWorkoutCalendar({
    settings: { ...settings, eventMappings: [mapping] },
    desiredEvents: [event], today, upsertEvent, deleteEvent: vi.fn(), onProgress,
  })).rejects.toMatchObject({ code: 'EVENT_NOT_FOUND' });
  expect(onProgress).toHaveBeenCalledWith([]);
  expect(upsertEvent).toHaveBeenCalledTimes(1);
});
