package com.kelani.sbdtracker;

import android.Manifest;
import android.content.ContentUris;
import android.content.ContentProviderOperation;
import android.content.ContentProviderResult;
import android.provider.CalendarContract;
import android.provider.CalendarContract.Reminders;
import java.util.ArrayList;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract.Calendars;
import android.provider.CalendarContract.Events;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.util.TimeZone;

@CapacitorPlugin(
    name = "CalendarIntegration",
    permissions = {
        @Permission(
            alias = "calendar",
            strings = {
                Manifest.permission.READ_CALENDAR,
                Manifest.permission.WRITE_CALENDAR
            }
        )
    }
)
public class CalendarIntegrationPlugin extends Plugin {
    private static final String EVENT_MARKER_PREFIX = "Kelani SBD Tracker event v1: ";

    @PluginMethod
    public void getWritableCalendars(PluginCall call) {
        if (getPermissionState("calendar") != PermissionState.GRANTED) {
            call.reject("Calendar permission is required");
            return;
        }

        String[] projection = new String[] {
            Calendars._ID,
            Calendars.CALENDAR_DISPLAY_NAME,
            Calendars.ACCOUNT_NAME,
            Calendars.ACCOUNT_TYPE,
            Calendars.CALENDAR_ACCESS_LEVEL,
            Calendars.VISIBLE
        };
        String selection = Calendars.CALENDAR_ACCESS_LEVEL + ">=? AND " + Calendars.VISIBLE + "=1";
        String[] selectionArgs = new String[] {
            String.valueOf(Calendars.CAL_ACCESS_CONTRIBUTOR)
        };
        JSArray calendars = new JSArray();

        try (Cursor cursor = getContext().getContentResolver().query(
            Calendars.CONTENT_URI,
            projection,
            selection,
            selectionArgs,
            Calendars.CALENDAR_DISPLAY_NAME + " COLLATE NOCASE ASC"
        )) {
            if (cursor != null) {
                int idIndex = cursor.getColumnIndexOrThrow(Calendars._ID);
                int nameIndex = cursor.getColumnIndexOrThrow(Calendars.CALENDAR_DISPLAY_NAME);
                int accountNameIndex = cursor.getColumnIndexOrThrow(Calendars.ACCOUNT_NAME);
                int accountTypeIndex = cursor.getColumnIndexOrThrow(Calendars.ACCOUNT_TYPE);

                while (cursor.moveToNext()) {
                    JSObject calendar = new JSObject();
                    calendar.put("id", String.valueOf(cursor.getLong(idIndex)));
                    calendar.put("name", cursor.getString(nameIndex));
                    calendar.put("accountName", cursor.getString(accountNameIndex));
                    calendar.put("accountType", cursor.getString(accountTypeIndex));
                    calendars.put(calendar);
                }
            }

            JSObject result = new JSObject();
            result.put("calendars", calendars);
            call.resolve(result);
        } catch (SecurityException error) {
            call.reject("Calendar permission is required", error);
        } catch (Exception error) {
            call.reject("Could not read writable calendars", error);
        }
    }

    private boolean isWritableCalendar(long calendarId) {
        String[] projection = new String[] { Calendars._ID };
        String selection = Calendars._ID + "=? AND " + Calendars.CALENDAR_ACCESS_LEVEL + ">=? AND " + Calendars.VISIBLE + "=1";
        String[] args = new String[] { String.valueOf(calendarId), String.valueOf(Calendars.CAL_ACCESS_CONTRIBUTOR) };
        try (Cursor cursor = getContext().getContentResolver().query(Calendars.CONTENT_URI, projection, selection, args, null)) {
            return cursor != null && cursor.moveToFirst();
        }
    }

    private int managedEventStatus(long eventId, long calendarId, String marker) {
        Uri uri = ContentUris.withAppendedId(Events.CONTENT_URI, eventId);
        String[] projection = new String[] { Events.CALENDAR_ID, Events.DESCRIPTION };
        try (Cursor cursor = getContext().getContentResolver().query(uri, projection, null, null, null)) {
            if (cursor == null || !cursor.moveToFirst()) return -1;
            return cursor.getLong(0) == calendarId && marker.equals(cursor.getString(1)) ? 1 : 0;
        }
    }

    @PluginMethod
    public void upsertWorkoutEvent(PluginCall call) {
        if (getPermissionState("calendar") != PermissionState.GRANTED) {
            call.reject("Calendar permission is required", "PERMISSION_DENIED");
            return;
        }

        try {
            String calendarIdText = call.getString("calendarId");
            String eventIdText = call.getString("eventId");
            String title = call.getString("title");
            Long startMillis = call.getLong("startMillis");
            Long endMillis = call.getLong("endMillis");
            Integer cycleId = call.getInt("cycleId");
            Integer workoutId = call.getInt("workoutId");
            if (calendarIdText == null || title == null || title.isEmpty() || startMillis == null ||
                endMillis == null || endMillis <= startMillis || cycleId == null || workoutId == null) {
                call.reject("Invalid workout event", "INVALID_EVENT");
                return;
            }

            long calendarId = Long.parseLong(calendarIdText);
            if (!isWritableCalendar(calendarId)) {
                call.reject("Selected calendar is not writable", "CALENDAR_UNAVAILABLE");
                return;
            }

            String marker = EVENT_MARKER_PREFIX + cycleId + ":" + workoutId;
            ContentValues values = new ContentValues();
            values.put(Events.TITLE, title);
            values.put(Events.DESCRIPTION, marker);
            values.put(Events.DTSTART, startMillis);
            values.put(Events.DTEND, endMillis);
            values.put(Events.EVENT_TIMEZONE, TimeZone.getDefault().getID());

            long eventId;
            if (eventIdText == null || eventIdText.isEmpty()) {
                values.put(Events.CALENDAR_ID, calendarId);
                values.put(Events.HAS_ALARM, 1);
                // Create the event and reminder together, so a reminder failure
                // cannot leave an untracked event that is duplicated on retry.
                ArrayList<ContentProviderOperation> operations = new ArrayList<>();
                operations.add(ContentProviderOperation.newInsert(Events.CONTENT_URI)
                    .withValues(values).build());
                operations.add(ContentProviderOperation.newInsert(Reminders.CONTENT_URI)
                    .withValueBackReference(Reminders.EVENT_ID, 0)
                    .withValue(Reminders.MINUTES, 0)
                    .withValue(Reminders.METHOD, Reminders.METHOD_ALERT).build());
                ContentProviderResult[] results = getContext().getContentResolver()
                    .applyBatch(CalendarContract.AUTHORITY, operations);
                if (results[0].uri == null) {
                    call.reject("Could not create workout event", "INSERT_FAILED");
                    return;
                }
                eventId = ContentUris.parseId(results[0].uri);
            } else {
                eventId = Long.parseLong(eventIdText);
                int status = managedEventStatus(eventId, calendarId, marker);
                if (status != 1) {
                    if (status == -1) {
                        call.reject("Workout event no longer exists", "EVENT_NOT_FOUND");
                        return;
                    }
                    call.reject("Workout event is missing or is not managed by Kelani", "EVENT_NOT_MANAGED");
                    return;
                }
                Uri uri = ContentUris.withAppendedId(Events.CONTENT_URI, eventId);
                if (getContext().getContentResolver().update(uri, values, null, null) != 1) {
                    call.reject("Could not update workout event", "UPDATE_FAILED");
                    return;
                }
            }

            JSObject result = new JSObject();
            result.put("eventId", String.valueOf(eventId));
            call.resolve(result);
        } catch (SecurityException error) {
            call.reject("Calendar permission is required", "PERMISSION_DENIED", error);
        } catch (Exception error) {
            call.reject("Could not save workout event", "SAVE_FAILED", error);
        }
    }

    @PluginMethod
    public void ensureWorkoutEventReminder(PluginCall call) {
        if (getPermissionState("calendar") != PermissionState.GRANTED) {
            call.reject("Calendar permission is required", "PERMISSION_DENIED");
            return;
        }
        try {
            String eventIdText = call.getString("eventId");
            String calendarIdText = call.getString("calendarId");
            Integer cycleId = call.getInt("cycleId");
            Integer workoutId = call.getInt("workoutId");
            if (eventIdText == null || calendarIdText == null || cycleId == null || workoutId == null) {
                call.reject("Invalid workout event", "INVALID_EVENT");
                return;
            }
            long eventId = Long.parseLong(eventIdText);
            long calendarId = Long.parseLong(calendarIdText);
            String marker = EVENT_MARKER_PREFIX + cycleId + ":" + workoutId;
            int status = managedEventStatus(eventId, calendarId, marker);
            if (status != 1) {
                call.reject("Workout event is missing or is not managed by Kelani",
                    status == -1 ? "EVENT_NOT_FOUND" : "EVENT_NOT_MANAGED");
                return;
            }
            if (!isWritableCalendar(calendarId)) {
                call.reject("Selected calendar is not writable", "CALENDAR_UNAVAILABLE");
                return;
            }
            // Keep every existing reminder, including a manually chosen time.
            try (Cursor cursor = getContext().getContentResolver().query(
                Reminders.CONTENT_URI, new String[] { Reminders._ID },
                Reminders.EVENT_ID + "=?", new String[] { String.valueOf(eventId) }, null
            )) {
                if (cursor == null) throw new IllegalStateException("Could not read event reminders");
                if (cursor.moveToFirst()) {
                    call.resolve();
                    return;
                }
            }
            ArrayList<ContentProviderOperation> operations = new ArrayList<>();
            operations.add(ContentProviderOperation.newInsert(Reminders.CONTENT_URI)
                .withValue(Reminders.EVENT_ID, eventId)
                .withValue(Reminders.MINUTES, 0)
                .withValue(Reminders.METHOD, Reminders.METHOD_ALERT).build());
            operations.add(ContentProviderOperation.newUpdate(ContentUris.withAppendedId(Events.CONTENT_URI, eventId))
                .withValue(Events.HAS_ALARM, 1).withExpectedCount(1).build());
            getContext().getContentResolver().applyBatch(CalendarContract.AUTHORITY, operations);
            call.resolve();
        } catch (SecurityException error) {
            call.reject("Calendar permission is required", "PERMISSION_DENIED", error);
        } catch (Exception error) {
            call.reject("Could not initialize workout reminder", "REMINDER_FAILED", error);
        }
    }

    @PluginMethod
    public void deleteWorkoutEvent(PluginCall call) {
        if (getPermissionState("calendar") != PermissionState.GRANTED) {
            call.reject("Calendar permission is required", "PERMISSION_DENIED");
            return;
        }

        try {
            String calendarIdText = call.getString("calendarId");
            String eventIdText = call.getString("eventId");
            Integer cycleId = call.getInt("cycleId");
            Integer workoutId = call.getInt("workoutId");
            if (calendarIdText == null || eventIdText == null || cycleId == null || workoutId == null) {
                call.reject("Invalid workout event", "INVALID_EVENT");
                return;
            }
            long calendarId = Long.parseLong(calendarIdText);
            long eventId = Long.parseLong(eventIdText);
            String marker = EVENT_MARKER_PREFIX + cycleId + ":" + workoutId;
            int status = managedEventStatus(eventId, calendarId, marker);
            if (status != 1) {
                if (status == -1) {
                    call.reject("Workout event no longer exists", "EVENT_NOT_FOUND");
                    return;
                }
                call.reject("Workout event is missing or is not managed by Kelani", "EVENT_NOT_MANAGED");
                return;
            }
            Uri uri = ContentUris.withAppendedId(Events.CONTENT_URI, eventId);
            if (getContext().getContentResolver().delete(uri, null, null) != 1) {
                call.reject("Could not delete workout event", "DELETE_FAILED");
                return;
            }
            call.resolve();
        } catch (SecurityException error) {
            call.reject("Calendar permission is required", "PERMISSION_DENIED", error);
        } catch (Exception error) {
            call.reject("Could not delete workout event", "DELETE_FAILED", error);
        }
    }
}
