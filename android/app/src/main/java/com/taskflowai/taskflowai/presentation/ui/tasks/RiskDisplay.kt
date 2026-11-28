package com.taskflowai.taskflowai.presentation.ui.tasks

import com.taskflowai.taskflowai.data.remote.RiskAssessmentDto
import com.taskflowai.taskflowai.data.remote.RiskModelStatusDto

private val RISK_LEVELS = setOf("LOW", "MEDIUM", "HIGH")

/**
 * Shown when no task has a risk level and the workspace state is unknown.
 * TaskFlow ships without a predictive model; a level only appears once a
 * model trained on the workspace's own task history has passed evaluation.
 */
const val RISK_UNAVAILABLE_MESSAGE =
    "Risk prediction not available yet. A delay-risk level appears only after a model trained on this workspace's task history has passed evaluation."

/** The latest risk level from a model, or null; unknown values are never shown. */
fun currentRiskLevel(assessments: List<RiskAssessmentDto>?): String? =
    assessments?.firstOrNull()?.riskLevel?.takeIf { it in RISK_LEVELS }

/**
 * Workspace-level risk state, matching the web app (architecture §12).
 * Returns null when nothing needs explaining (levels are shown and the model
 * is calibrated).
 */
fun workspaceRiskMessage(status: RiskModelStatusDto?, anyLevelShown: Boolean): String? {
    if (status == null) return if (anyLevelShown) null else RISK_UNAVAILABLE_MESSAGE
    if (!status.trainingEnabled) {
        return "No validated model for this workspace yet. Risk predictions are off until an owner or admin enables training."
    }
    val model = status.activeModel
    if (model == null) {
        if (!status.modelServiceAvailable) return "Prediction not available right now: the risk service cannot be reached."
        val readiness = status.readiness
        if (readiness == null || !readiness.ready) {
            return if (readiness == null) {
                "Collecting data for risk prediction."
            } else {
                "Collecting data for risk prediction (labelled tasks: ${readiness.labelableTasks} / ${readiness.requiredTasks})."
            }
        }
        return if (status.lastRun?.status == "REJECTED") {
            "No validated model for this workspace yet: the last trained model did not pass evaluation."
        } else {
            "No validated model for this workspace yet."
        }
    }
    return if (!model.calibrated) {
        "Levels come from this workspace's model and are low confidence (not calibrated)."
    } else {
        null
    }
}
