import fs from 'fs';
import path from 'path';

const root = path.resolve(process.cwd());

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('Android rest timers use an alarm-clock receiver independent of the WebView', () => {
  const plugin = read(
    'android/app/src/main/java/com/kelani/sbdtracker/RestTimerAlarmPlugin.java'
  );
  const receiver = read(
    'android/app/src/main/java/com/kelani/sbdtracker/RestTimerAlarmReceiver.java'
  );
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  const mainActivity = read(
    'android/app/src/main/java/com/kelani/sbdtracker/MainActivity.java'
  );

  expect(plugin).toContain('alarmManager.setAlarmClock');
  expect(plugin).toContain('AudioAttributes.USAGE_ALARM');
  expect(plugin).toContain('areNotificationsEnabled()');
  expect(plugin).toContain('cancelLegacyCapacitorAlarm');
  expect(plugin).toContain('kelani_rest_timer_v5');
  expect(plugin).toContain('REST_TIMER_TEST_NOTIFICATION_ID = 1209');
  expect(plugin).toContain('void scheduleTest');
  expect(plugin).toContain('void getTestStatus');
  expect(plugin).toContain('LAST_DELIVERED_AT_PREFIX');
  expect(receiver).toContain('NotificationCompat.CATEGORY_ALARM');
  expect(receiver).toContain('manager.notify');
  expect(receiver).toContain('EXTRA_NOTIFICATION_ID');
  expect(manifest).toContain('android:name=".RestTimerAlarmReceiver"');
  expect(manifest).toContain('android:exported="false"');
  expect(mainActivity).toContain('registerPlugin(RestTimerAlarmPlugin.class)');
});

test('the app schedules and verifies the dedicated native rest timer alarm', () => {
  const app = read('src/App.js');
  const permissionCoordinator = app.slice(
    app.indexOf('export async function scheduleNativeRestTimerAlarmWithPermissions'),
    app.indexOf('export function getRestTimerNotificationChannelStatus')
  );

  expect(app).toContain("registerPlugin('RestTimerAlarm')");
  expect(app).toContain('RestTimerAlarm.schedule');
  expect(app).toContain('RestTimerAlarm.getPending');
  expect(app).toContain('RestTimerAlarm.cancel');
  expect(app).toContain('RestTimerAlarm.scheduleTest');
  expect(app).toContain('RestTimerAlarm.getTestStatus');
  expect(app).toContain('scheduleNativeRestTimerAlarmWithPermissions({');
  expect(app).not.toContain('LocalNotifications.schedule({');
  expect(permissionCoordinator.indexOf('return await scheduleAlarm')).toBeLessThan(
    permissionCoordinator.indexOf('requestNotificationPermission()')
  );
});

test('starting a new native rest timer dismisses the previous delivered alert', () => {
  const plugin = read(
    'android/app/src/main/java/com/kelani/sbdtracker/RestTimerAlarmPlugin.java'
  );
  const scheduleMethod = plugin.slice(
    plugin.indexOf('private void scheduleAlarm('),
    plugin.indexOf('@PluginMethod\n    public void cancel(')
  );

  expect(scheduleMethod).toContain(
    'cancelAlarm(getContext(), notificationId, true, cancelLegacyAlarm);'
  );
});
