package com.taskflowai.taskflowai.presentation.ui

/** Display names shared with the web app (frontend/src/lib/labels.ts). */
object Labels {
    val statuses = listOf("TODO", "IN_PROGRESS", "IN_REVIEW", "DONE")

    fun status(value: String): String = when (value) {
        "TODO" -> "To do"
        "IN_PROGRESS" -> "In progress"
        "IN_REVIEW" -> "In review"
        "DONE" -> "Done"
        else -> value
    }

    fun nextStatus(value: String): String? = when (value) {
        "TODO" -> "IN_PROGRESS"
        "IN_PROGRESS" -> "IN_REVIEW"
        "IN_REVIEW" -> "DONE"
        else -> null
    }

    /** API priority values 0–3, listed in the order the forms offer them. */
    val priorities = listOf(3, 2, 0, 1)

    fun priority(value: Int): String = when (value) {
        0 -> "Normal"
        1 -> "Low"
        2 -> "Medium"
        3 -> "Urgent"
        else -> "P$value"
    }

    fun role(value: String): String = when (value) {
        "OWNER" -> "Owner"
        "ADMIN" -> "Admin"
        "MEMBER" -> "Member"
        "VIEWER" -> "Viewer"
        else -> value
    }

    fun risk(level: String): String = when (level) {
        "LOW" -> "Low risk"
        "MEDIUM" -> "Medium risk"
        "HIGH" -> "High risk"
        else -> level
    }

    /** One or two initials for an avatar. */
    fun initials(name: String?): String {
        val parts = name.orEmpty().trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
        if (parts.isEmpty()) return "?"
        val first = parts.first().first()
        val last = if (parts.size > 1) parts.last().first().toString() else ""
        return (first + last).uppercase()
    }
}
