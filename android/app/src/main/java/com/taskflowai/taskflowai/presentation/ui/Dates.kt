package com.taskflowai.taskflowai.presentation.ui

import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

/** English date formats matching the web app ("Nov 28, 2026", "Nov 28, 2026, 3:04 PM"). */
object Dates {
    private val date = DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.US)
    private val dateTime = DateTimeFormatter.ofPattern("MMM d, yyyy, h:mm a", Locale.US)

    fun dateTime(iso: String, zone: ZoneId = ZoneId.systemDefault()): String =
        runCatching { dateTime.format(Instant.parse(iso).atZone(zone)) }.getOrDefault(iso)

    /** Date-only due dates are stored as UTC midnight of the calendar date. */
    fun utcDate(iso: String): String = runCatching { date.format(Instant.parse(iso).atZone(ZoneOffset.UTC)) }.getOrDefault(iso)

    fun dueDate(iso: String?, dateOnly: Boolean?): String = when {
        iso == null -> "No due date"
        dateOnly == true -> utcDate(iso)
        else -> dateTime(iso)
    }

    /** A picker's UTC-midnight millis as the API's calendar date (YYYY-MM-DD). */
    fun isoDateFromPicker(millis: Long): String = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate().toString()

    fun displayDateFromPicker(millis: Long): String = date.format(Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC))
}
