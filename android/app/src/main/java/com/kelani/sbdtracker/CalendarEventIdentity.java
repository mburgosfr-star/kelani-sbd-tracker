package com.kelani.sbdtracker;

final class CalendarEventIdentity {
    private CalendarEventIdentity() {}

    static int[] parseWorkoutMarker(String description) {
        if (description == null) return null;
        java.util.regex.Matcher match = java.util.regex.Pattern.compile(
            "^Kelani SBD Tracker event v1: ([1-9][0-9]*):([1-9][0-9]*)$").matcher(description.trim());
        if (!match.matches()) return null;
        try {
            return new int[] { Integer.parseInt(match.group(1)), Integer.parseInt(match.group(2)) };
        } catch (NumberFormatException error) {
            return null;
        }
    }

    static boolean sameGeneratedTitle(String retained, String candidate, String expected, String alternate) {
        if (retained == null || candidate == null) return false;
        if (retained.equals(candidate)) return true;
        return alternate != null && expected != null
            && (retained.equals(expected) || retained.equals(alternate))
            && (candidate.equals(expected) || candidate.equals(alternate));
    }

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
