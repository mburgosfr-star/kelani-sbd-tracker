package com.kelani.sbdtracker;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertEquals;
import org.junit.Test;

public class CalendarEventIdentityTest {
    private static final String MARKER = "Kelani SBD Tracker event v1: 8:12";

    @Test
    public void onlyGeneratedProvisionalAndCurrentTitlesAreEquivalent() {
        String current = "Kelani workout · C6W27";
        String provisional = "Kelani workout (provisional) · C6W27";
        assertTrue(CalendarEventIdentity.sameGeneratedTitle(current, provisional, current, provisional));
        assertTrue(CalendarEventIdentity.sameGeneratedTitle(provisional, current, current, provisional));
        assertTrue(CalendarEventIdentity.sameGeneratedTitle(current, current, current, null));
        assertFalse(CalendarEventIdentity.sameGeneratedTitle("My renamed meet", provisional, current, provisional));
        assertFalse(CalendarEventIdentity.sameGeneratedTitle(current, "My renamed meet", current, provisional));
        assertFalse(CalendarEventIdentity.sameGeneratedTitle(current, "Kelani workout · C6W28", current, provisional));
        assertFalse(CalendarEventIdentity.sameGeneratedTitle(current, provisional, current, null));
    }

    @Test
    public void deletedProviderRowsAreMissingEvenWhenTheirMarkerStillMatches() {
        assertEquals(-1, CalendarEventIdentity.eventStatus(7, 7, MARKER + " ", MARKER, true));
        assertEquals(1, CalendarEventIdentity.eventStatus(7, 7, MARKER + " ", MARKER, false));
        assertEquals(0, CalendarEventIdentity.eventStatus(8, 7, MARKER, MARKER, false));
    }

    @Test
    public void recognizesMarkerWithProviderWhitespace() {
        for (String description : new String[] { MARKER, MARKER + " ", MARKER + "\r\n", "\t " + MARKER + "\n " }) {
            assertTrue(CalendarEventIdentity.isManagedEvent(7, 7, description, MARKER));
        }
    }

    @Test
    public void refusesAnotherCalendarEvenWithExactMarker() {
        assertFalse(CalendarEventIdentity.isManagedEvent(8, 7, MARKER + " ", MARKER));
    }

    @Test
    public void refusesOtherWorkoutsCyclesAndUnrelatedDescriptions() {
        for (String description : new String[] {
            null, "", " ", "Meeting", "Kelani SBD Tracker event v1: 8:13",
            "Kelani SBD Tracker event v1: 9:12", MARKER + "0",
            "Copied from " + MARKER, MARKER + " extra text", "Kelani SBD Tracker event v1:8:12"
        }) {
            assertFalse(CalendarEventIdentity.isManagedEvent(7, 7, description, MARKER));
        }
        assertFalse(CalendarEventIdentity.isManagedEvent(7, 7, MARKER, null));
    }
}
