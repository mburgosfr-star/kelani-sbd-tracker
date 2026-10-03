import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

test('registers the Android calendar bridge and declares permissions', () => {
  const manifest = fs.readFileSync(path.join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  const activity = fs.readFileSync(
    path.join(root, 'android/app/src/main/java/com/kelani/sbdtracker/MainActivity.java'),
    'utf8'
  );
  const plugin = fs.readFileSync(
    path.join(root, 'android/app/src/main/java/com/kelani/sbdtracker/CalendarIntegrationPlugin.java'),
    'utf8'
  );

  expect(manifest).toContain('android.permission.READ_CALENDAR');
  expect(manifest).toContain('android.permission.WRITE_CALENDAR');
  expect(activity).toContain('registerPlugin(CalendarIntegrationPlugin.class)');
  expect(plugin).toContain('@CapacitorPlugin(');
  expect(plugin).toContain('name = "CalendarIntegration"');
  expect(plugin).toContain('public void getWritableCalendars(PluginCall call)');
  expect(plugin).toContain('Calendars.CAL_ACCESS_CONTRIBUTOR');
  expect(plugin).toContain('public void upsertWorkoutEvent(PluginCall call)');
  expect(plugin).toContain('public void deleteWorkoutEvent(PluginCall call)');
  expect(plugin).toContain('managedEventStatus(eventId, calendarId, marker)');
});
