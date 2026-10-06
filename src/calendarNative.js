import { Capacitor, registerPlugin } from '@capacitor/core';

const CalendarIntegration = registerPlugin('CalendarIntegration');

export function isNativeCalendarAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function getCalendarPermissionState() {
  if (!isNativeCalendarAvailable()) return 'unavailable';
  const result = await CalendarIntegration.checkPermissions();
  return result?.calendar || 'prompt';
}

export async function requestCalendarPermission() {
  if (!isNativeCalendarAvailable()) return 'unavailable';
  const result = await CalendarIntegration.requestPermissions({ permissions: ['calendar'] });
  return result?.calendar || 'denied';
}

export async function getWritableDeviceCalendars() {
  if (!isNativeCalendarAvailable()) return [];
  const result = await CalendarIntegration.getWritableCalendars();
  return Array.isArray(result?.calendars) ? result.calendars : [];
}

export async function upsertDeviceWorkoutEvent(event) {
  if (!isNativeCalendarAvailable()) throw new Error('Calendar unavailable');
  const result = await CalendarIntegration.upsertWorkoutEvent(event);
  if (!result?.eventId) throw new Error('Calendar event was not saved');
  return String(result.eventId);
}

export async function deleteDeviceWorkoutEvent(mapping) {
  if (!isNativeCalendarAvailable()) throw new Error('Calendar unavailable');
  await CalendarIntegration.deleteWorkoutEvent(mapping);
}

export async function ensureDeviceWorkoutEventReminder(mapping) {
  if (!isNativeCalendarAvailable()) throw new Error('Calendar unavailable');
  await CalendarIntegration.ensureWorkoutEventReminder(mapping);
}
