package com.taskflowai.taskflowai.presentation.ui.tasks

import com.taskflowai.taskflowai.data.remote.RiskAssessmentDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RiskDisplayTest {
    private fun assessment(level: String) =
        RiskAssessmentDto(riskLevel = level, riskScore = null, factors = emptyList())

    @Test
    fun noAssessmentShowsNoLevel() {
        assertNull(currentRiskLevel(null))
        assertNull(currentRiskLevel(emptyList()))
    }

    @Test
    fun legacyUnavailablePlaceholderIsNotShownAsALevel() {
        assertNull(currentRiskLevel(listOf(assessment("UNAVAILABLE"))))
        assertNull(currentRiskLevel(listOf(assessment("UNKNOWN"))))
    }

    @Test
    fun modelLevelsAreShownFromTheLatestAssessment() {
        assertEquals("HIGH", currentRiskLevel(listOf(assessment("HIGH"), assessment("LOW"))))
        assertEquals("MEDIUM", currentRiskLevel(listOf(assessment("MEDIUM"))))
        assertEquals("LOW", currentRiskLevel(listOf(assessment("LOW"))))
    }
}
