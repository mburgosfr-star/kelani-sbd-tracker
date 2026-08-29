package com.kelani.sbdtracker;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "RestTimerAlarm")
public class RestTimerAlarmPlugin extends Plugin {
    public static final int REST_TIMER_NOTIFICATION_ID = 1208;
    public static final int REST_TIMER_TEST_NOTIFICATION_ID = 1209;
    public static final String REST_TIMER_CHANNEL_ID = "kelani_rest_timer_v5";
    public static final String EXTRA_TITLE = "restTimerTitle";
    public static final String EXTRA_BODY = "restTimerBody";
    public static final String EXTRA_TRIGGER_AT = "restTimerTriggerAt";
    public static final String EXTRA_NOTIFICATION_ID = "restTimerNotificationId";

    private static final String ALARM_STATE = "kelani_rest_timer_alarm_state";
    private static final String PENDING_AT_PREFIX = "pendingAt:";
    private static final String LAST_SCHEDULED_AT_PREFIX = "lastScheduledAt:";
    private static final String LAST_TARGET_AT_PREFIX = "lastTargetAt:";
    private static final String LAST_DELIVERED_AT_PREFIX = "lastDeliveredAt:";

    @PluginMethod
    public void ensureChannel(PluginCall call) {
        createNotificationChannel(getContext());
        call.resolve();
    }

    @PluginMethod
    public void schedule(PluginCall call) {
        scheduleAlarm(call, REST_TIMER_NOTIFICATION_ID, true);
    }

    @PluginMethod
    public void scheduleTest(PluginCall call) {
        scheduleAlarm(call, REST_TIMER_TEST_NOTIFICATION_ID, false);
    }

    private void scheduleAlarm(
        PluginCall call,
        int notificationId,
        boolean cancelLegacyAlarm
    ) {
        Long triggerAt = call.getLong("at");
        String title = call.getString(
            "title",
            getContext().getString(R.string.rest_timer_notification_title)
        );
        String body = call.getString(
            "body",
            getContext().getString(R.string.rest_timer_notification_body)
        );

        if (triggerAt == null || triggerAt <= System.currentTimeMillis()) {
            call.reject("Rest timer deadline must be in the future", "INVALID_DEADLINE");
            return;
        }

        AlarmManager alarmManager = (AlarmManager) getContext()
            .getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) {
            call.reject("Android alarm service is unavailable", "ALARM_SERVICE_UNAVAILABLE");
            return;
        }

        if (!NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) {
            call.reject(
                "Notification permission is required",
                "NOTIFICATION_PERMISSION_REQUIRED"
            );
            return;
        }

        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            !alarmManager.canScheduleExactAlarms()
        ) {
            call.reject("Exact alarm permission is required", "EXACT_ALARM_PERMISSION_REQUIRED");
            return;
        }

        createNotificationChannel(getContext());
        // Starting a new timer also dismisses an earlier delivered alert with
        // this id. Otherwise Android leaves the completed-rest notification
        // visible while the replacement timer is already running.
        cancelAlarm(getContext(), notificationId, true, cancelLegacyAlarm);

        Intent alarmIntent = new Intent(getContext(), RestTimerAlarmReceiver.class);
        alarmIntent.putExtra(EXTRA_TITLE, title);
        alarmIntent.putExtra(EXTRA_BODY, body);
        alarmIntent.putExtra(EXTRA_TRIGGER_AT, triggerAt);
        alarmIntent.putExtra(EXTRA_NOTIFICATION_ID, notificationId);
        PendingIntent alarmOperation = PendingIntent.getBroadcast(
            getContext(),
            notificationId,
            alarmIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent launchIntent = getContext().getPackageManager()
            .getLaunchIntentForPackage(getContext().getPackageName());
        PendingIntent showIntent = launchIntent == null
            ? alarmOperation
            : PendingIntent.getActivity(
                getContext(),
                notificationId + 100,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

        try {
            AlarmManager.AlarmClockInfo alarmClock = new AlarmManager.AlarmClockInfo(
                triggerAt,
                showIntent
            );
            alarmManager.setAlarmClock(alarmClock, alarmOperation);
            saveScheduledState(getContext(), notificationId, triggerAt);

            JSObject result = new JSObject();
            result.put("scheduled", true);
            result.put("id", notificationId);
            result.put("at", triggerAt);
            result.put("method", "alarmClock");
            call.resolve(result);
        } catch (SecurityException error) {
            call.reject(
                "Android refused the exact rest timer alarm",
                "EXACT_ALARM_PERMISSION_REQUIRED",
                error
            );
        } catch (Exception error) {
            call.reject("Could not schedule the native rest timer alarm", error);
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        cancelAlarm(getContext(), REST_TIMER_NOTIFICATION_ID, true, true);
        call.resolve();
    }

    @PluginMethod
    public void cancelTest(PluginCall call) {
        cancelAlarm(getContext(), REST_TIMER_TEST_NOTIFICATION_ID, true, false);
        call.resolve();
    }

    @PluginMethod
    public void getPending(PluginCall call) {
        int notificationId = REST_TIMER_NOTIFICATION_ID;
        long triggerAt = getStoredLong(getContext(), PENDING_AT_PREFIX, notificationId);
        PendingIntent pendingIntent = getAlarmPendingIntent(
            getContext(),
            notificationId,
            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
        );
        boolean pending = pendingIntent != null && triggerAt > System.currentTimeMillis();

        if (!pending && triggerAt != 0L) {
            clearPendingState(getContext(), notificationId);
        }

        JSObject result = new JSObject();
        result.put("pending", pending);
        result.put("id", notificationId);
        result.put("at", pending ? triggerAt : 0L);
        call.resolve(result);
    }

    @PluginMethod
    public void getTestStatus(PluginCall call) {
        int notificationId = REST_TIMER_TEST_NOTIFICATION_ID;
        long triggerAt = getStoredLong(getContext(), PENDING_AT_PREFIX, notificationId);
        long scheduledAt = getStoredLong(
            getContext(),
            LAST_SCHEDULED_AT_PREFIX,
            notificationId
        );
        long targetAt = getStoredLong(
            getContext(),
            LAST_TARGET_AT_PREFIX,
            notificationId
        );
        long deliveredAt = getStoredLong(
            getContext(),
            LAST_DELIVERED_AT_PREFIX,
            notificationId
        );
        PendingIntent pendingIntent = getAlarmPendingIntent(
            getContext(),
            notificationId,
            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
        );
        boolean pending = pendingIntent != null && triggerAt > System.currentTimeMillis();
        boolean delivered = scheduledAt > 0L && deliveredAt >= scheduledAt;

        if (!pending && triggerAt != 0L) {
            clearPendingState(getContext(), notificationId);
        }

        JSObject result = new JSObject();
        result.put("pending", pending);
        result.put("delivered", delivered);
        result.put("id", notificationId);
        result.put("at", pending ? triggerAt : 0L);
        result.put("scheduledAt", scheduledAt);
        result.put("targetAt", targetAt);
        result.put("deliveredAt", deliveredAt);
        call.resolve(result);
    }

    public static void createNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = (NotificationManager) context
            .getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || manager.getNotificationChannel(REST_TIMER_CHANNEL_ID) != null) {
            return;
        }

        Uri soundUri = getSoundUri(context);
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        NotificationChannel channel = new NotificationChannel(
            REST_TIMER_CHANNEL_ID,
            context.getString(R.string.rest_timer_channel_name),
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(context.getString(R.string.rest_timer_channel_description));
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        channel.enableVibration(true);
        channel.setSound(soundUri, audioAttributes);
        manager.createNotificationChannel(channel);
    }

    public static Uri getSoundUri(Context context) {
        return Uri.parse(
            "android.resource://" + context.getPackageName() + "/" +
            R.raw.kelani_rest_timer_quiet
        );
    }

    public static void markDelivered(Context context, int notificationId) {
        context.getSharedPreferences(ALARM_STATE, Context.MODE_PRIVATE)
            .edit()
            .remove(PENDING_AT_PREFIX + notificationId)
            .putLong(LAST_DELIVERED_AT_PREFIX + notificationId, System.currentTimeMillis())
            .apply();
    }

    private static PendingIntent getAlarmPendingIntent(
        Context context,
        int notificationId,
        int flags
    ) {
        Intent intent = new Intent(context, RestTimerAlarmReceiver.class);
        return PendingIntent.getBroadcast(
            context,
            notificationId,
            intent,
            flags
        );
    }

    private static void cancelAlarm(
        Context context,
        int notificationId,
        boolean cancelDeliveredNotification,
        boolean cancelLegacyAlarm
    ) {
        AlarmManager alarmManager = (AlarmManager) context
            .getSystemService(Context.ALARM_SERVICE);
        PendingIntent pendingIntent = getAlarmPendingIntent(
            context,
            notificationId,
            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
        );

        if (alarmManager != null && pendingIntent != null) {
            alarmManager.cancel(pendingIntent);
            pendingIntent.cancel();
        }

        if (cancelLegacyAlarm) {
            cancelLegacyCapacitorAlarm(context, alarmManager);
        }

        if (cancelDeliveredNotification) {
            NotificationManager notificationManager = (NotificationManager) context
                .getSystemService(Context.NOTIFICATION_SERVICE);
            if (notificationManager != null) {
                notificationManager.cancel(notificationId);
            }
        }

        clearPendingState(context, notificationId);
    }

    private static void cancelLegacyCapacitorAlarm(
        Context context,
        AlarmManager alarmManager
    ) {
        if (alarmManager == null) return;

        Intent legacyIntent = new Intent();
        legacyIntent.setClassName(
            context,
            "com.capacitorjs.plugins.localnotifications.TimedNotificationPublisher"
        );
        int flags = PendingIntent.FLAG_NO_CREATE;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_MUTABLE;
        }
        PendingIntent legacyPendingIntent = PendingIntent.getBroadcast(
            context,
            REST_TIMER_NOTIFICATION_ID,
            legacyIntent,
            flags
        );

        if (legacyPendingIntent != null) {
            alarmManager.cancel(legacyPendingIntent);
            legacyPendingIntent.cancel();
        }
    }

    private static void saveScheduledState(
        Context context,
        int notificationId,
        long triggerAt
    ) {
        context.getSharedPreferences(ALARM_STATE, Context.MODE_PRIVATE)
            .edit()
            .putLong(PENDING_AT_PREFIX + notificationId, triggerAt)
            .putLong(LAST_SCHEDULED_AT_PREFIX + notificationId, System.currentTimeMillis())
            .putLong(LAST_TARGET_AT_PREFIX + notificationId, triggerAt)
            .remove(LAST_DELIVERED_AT_PREFIX + notificationId)
            .apply();
    }

    private static long getStoredLong(
        Context context,
        String prefix,
        int notificationId
    ) {
        return context.getSharedPreferences(ALARM_STATE, Context.MODE_PRIVATE)
            .getLong(prefix + notificationId, 0L);
    }

    private static void clearPendingState(Context context, int notificationId) {
        context.getSharedPreferences(ALARM_STATE, Context.MODE_PRIVATE)
            .edit()
            .remove(PENDING_AT_PREFIX + notificationId)
            .apply();
    }
}
