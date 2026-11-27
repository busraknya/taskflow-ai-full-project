package com.taskflowai.taskflowai.presentation.ui.tasks

import com.taskflowai.taskflowai.data.remote.RiskAssessmentDto

private val RISK_LEVELS = setOf("LOW", "MEDIUM", "HIGH")

/**
 * Shown when no task has a risk level. TaskFlow ships without a predictive
 * model; a level only appears once a model trained on the workspace's own
 * task history has passed evaluation.
 */
const val RISK_UNAVAILABLE_MESSAGE =
    "Risk prediction not available yet. A delay-risk level appears only after a model trained on this workspace's task history has passed evaluation."

/** The latest risk level from a model, or null; unknown values are never shown. */
fun currentRiskLevel(assessments: List<RiskAssessmentDto>?): String? =
    assessments?.firstOrNull()?.riskLevel?.takeIf { it in RISK_LEVELS }
