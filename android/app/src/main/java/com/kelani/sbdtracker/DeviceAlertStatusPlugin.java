package com.kelani.sbdtracker;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DeviceAlertStatus")
public class DeviceAlertStatusPlugin extends Plugin {
    private static final String REST_TIMER_CHANNEL_ID = "kelani_rest_timer_v5";
    private static final String ZEN_MODE_SETTINGS_ACTION = "android.settings.ZEN_MODE_SETTINGS";

    @PluginMethod
    public void getStatus(PluginCall call) {
        NotificationManager manager = (NotificationManager) getContext()
            .getSystemService(Context.NOTIFICATION_SERVICE);
        JSObject result = new JSObject();

        if (manager == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            result.put("available", false);
            result.put("interruptionFilter", "unknown");
            call.resolve(result);
            return;
        }

        int interruptionFilter = manager.getCurrentInterruptionFilter();
        result.put("available", true);
        result.put("interruptionFilter", interruptionFilterName(interruptionFilter));

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = manager.getNotificationChannel(REST_TIMER_CHANNEL_ID);
            result.put(
                "channelCanBypassDoNotDisturb",
                channel != null && channel.canBypassDnd()
            );
        }

        call.resolve(result);
    }

    @PluginMethod
    public void openDoNotDisturbSettings(PluginCall call) {
        try {
            Intent intent = new Intent(ZEN_MODE_SETTINGS_ACTION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not open Do Not Disturb settings", error);
        }
    }

    private String interruptionFilterName(int interruptionFilter) {
        switch (interruptionFilter) {
            case NotificationManager.INTERRUPTION_FILTER_ALL:
                return "all";
            case NotificationManager.INTERRUPTION_FILTER_PRIORITY:
                return "priority";
            case NotificationManager.INTERRUPTION_FILTER_ALARMS:
                return "alarms";
            case NotificationManager.INTERRUPTION_FILTER_NONE:
                return "none";
            default:
                return "unknown";
        }
    }
}
