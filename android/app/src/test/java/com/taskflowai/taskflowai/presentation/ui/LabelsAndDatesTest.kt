package com.taskflowai.taskflowai.presentation.ui

import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LabelsAndDatesTest {
    @Test
    fun statusLabelsMatchTheWebApp() {
        assertEquals(listOf("To do", "In progress", "In review", "Done"), Labels.statuses.map(Labels::status))
        assertEquals("IN_REVIEW", Labels.nextStatus("IN_PROGRESS"))
        assertNull(Labels.nextStatus("DONE"))
    }

    @Test
    fun priorityLabelsFollowTheApiValues() {
        assertEquals("Normal", Labels.priority(0))
        assertEquals("Urgent", Labels.priority(3))
        assertEquals("P7", Labels.priority(7))
    }

    @Test
    fun initialsUseFirstAndLastName() {
        assertEquals("AD", Labels.initials("Ayşe Demir"))
        assertEquals("M", Labels.initials("Mehmet"))
        assertEquals("JS", Labels.initials("  jane  van der  smith "))
        assertEquals("?", Labels.initials(null))
    }

    @Test
    fun dateOnlyDueDatesNeverShiftAcrossTimeZones() {
        // Stored as UTC midnight; must read as the same calendar day everywhere.
        assertEquals("Nov 28, 2026", Dates.dueDate("2026-11-28T00:00:00.000Z", dateOnly = true))
        assertEquals("No due date", Dates.dueDate(null, dateOnly = null))
    }

    @Test
    fun dateTimesUseTheViewerZone() {
        assertEquals("Nov 28, 2026, 3:04 PM", Dates.dateTime("2026-11-28T12:04:00Z", ZoneId.of("Europe/Istanbul")))
    }

    @Test
    fun pickerMillisBecomeCalendarDates() {
        val millis = 1_795_824_000_000L // 2026-11-28T00:00:00Z
        assertEquals("2026-11-28", Dates.isoDateFromPicker(millis))
        assertEquals("Nov 28, 2026", Dates.displayDateFromPicker(millis))
    }
}
