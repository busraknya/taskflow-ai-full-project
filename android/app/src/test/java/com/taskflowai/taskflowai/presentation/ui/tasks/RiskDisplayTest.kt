package com.taskflowai.taskflowai.presentation.ui.tasks

import com.taskflowai.taskflowai.data.remote.ActiveModelDto
import com.taskflowai.taskflowai.data.remote.ReadinessDto
import com.taskflowai.taskflowai.data.remote.RiskAssessmentDto
import com.taskflowai.taskflowai.data.remote.RiskModelStatusDto
import com.taskflowai.taskflowai.data.remote.TrainingRunDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
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

    private fun status(
        enabled: Boolean = true,
        service: Boolean = true,
        readiness: ReadinessDto? = ReadinessDto(ready = false, labelableTasks = 42, requiredTasks = 300),
        model: ActiveModelDto? = null,
        lastRun: String? = null,
    ) = RiskModelStatusDto(enabled, service, readiness, model, lastRun?.let { TrainingRunDto(it) })

    @Test
    fun workspaceStatesMatchTheWebApp() {
        assertEquals(RISK_UNAVAILABLE_MESSAGE, workspaceRiskMessage(null, anyLevelShown = false))
        assertTrue(workspaceRiskMessage(status(enabled = false), false)!!.contains("Risk predictions are off"))
        assertEquals(
            "Collecting data for risk prediction (labelled tasks: 42 / 300).",
            workspaceRiskMessage(status(), false)
        )
        val ready = ReadinessDto(ready = true, labelableTasks = 400, requiredTasks = 300)
        assertTrue(workspaceRiskMessage(status(readiness = ready, lastRun = "REJECTED"), false)!!.contains("did not pass evaluation"))
        assertTrue(workspaceRiskMessage(status(service = false), false)!!.contains("cannot be reached"))
        assertTrue(
            workspaceRiskMessage(status(model = ActiveModelDto("m1", calibrated = false)), true)!!.contains("low confidence")
        )
        assertNull(workspaceRiskMessage(status(model = ActiveModelDto("m1", calibrated = true)), true))
    }
}
