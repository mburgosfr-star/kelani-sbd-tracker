package com.kelani.sbdtracker;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.app.NotificationCompat;

public class RestTimerAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        RestTimerAlarmPlugin.createNotificationChannel(context);

        String title = intent.getStringExtra(RestTimerAlarmPlugin.EXTRA_TITLE);
        String body = intent.getStringExtra(RestTimerAlarmPlugin.EXTRA_BODY);
        long triggerAt = intent.getLongExtra(
            RestTimerAlarmPlugin.EXTRA_TRIGGER_AT,
            System.currentTimeMillis()
        );
        int notificationId = intent.getIntExtra(
            RestTimerAlarmPlugin.EXTRA_NOTIFICATION_ID,
            RestTimerAlarmPlugin.REST_TIMER_NOTIFICATION_ID
        );

        Intent launchIntent = context.getPackageManager()
            .getLaunchIntentForPackage(context.getPackageName());
        PendingIntent contentIntent = launchIntent == null
            ? null
            : PendingIntent.getActivity(
                context,
                notificationId + 200,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
            context,
            RestTimerAlarmPlugin.REST_TIMER_CHANNEL_ID
        )
            .setSmallIcon(R.drawable.ic_stat_rest_timer)
            .setContentTitle(title == null
                ? context.getString(R.string.rest_timer_notification_title)
                : title)
            .setContentText(body == null
                ? context.getString(R.string.rest_timer_notification_body)
                : body)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setSound(RestTimerAlarmPlugin.getSoundUri(context))
            .setVibrate(new long[] { 0L, 300L, 180L, 300L })
            .setWhen(triggerAt)
            .setShowWhen(true)
            .setAutoCancel(true);

        if (contentIntent != null) {
            builder.setContentIntent(contentIntent);
        }

        Notification notification = builder.build();
        NotificationManager manager = (NotificationManager) context
            .getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(notificationId, notification);
        }

        RestTimerAlarmPlugin.markDelivered(context, notificationId);
    }
}
