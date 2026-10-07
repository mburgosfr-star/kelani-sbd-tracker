package com.kelani.sbdtracker;

final class CalendarEventIdentity {
    private CalendarEventIdentity() {}

    static int eventStatus(long actualCalendarId, long expectedCalendarId,
                           String description, String expectedMarker, boolean deleted) {
        if (deleted) return -1;
        return isManagedEvent(actualCalendarId, expectedCalendarId, description, expectedMarker) ? 1 : 0;
    }

    static boolean isManagedEvent(long actualCalendarId, long expectedCalendarId,
                                  String description, String expectedMarker) {
        // Calendar providers may append spaces or line breaks during account sync.
        // Keep the exact marker and calendar checks after trimming outer whitespace.
        return actualCalendarId == expectedCalendarId
            && description != null
            && expectedMarker != null
            && expectedMarker.equals(description.trim());
    }
}
