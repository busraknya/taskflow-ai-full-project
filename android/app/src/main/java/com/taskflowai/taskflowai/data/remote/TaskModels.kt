package com.taskflowai.taskflowai.data.remote

data class AssigneeDto(
    val id: String,
    val fullName: String,
    val avatarUrl: String?
)

data class RiskAssessmentDto(
    val riskLevel: String,
    val riskScore: Double?,
    val factors: List<FactorDto>?,
    val reason: String? = null
)

/** Workspace risk-model state (GET workspaces/{id}/risk-model); extra fields are ignored. */
data class RiskModelStatusDto(
    val trainingEnabled: Boolean,
    val modelServiceAvailable: Boolean,
    val readiness: ReadinessDto?,
    val activeModel: ActiveModelDto?,
    val lastRun: TrainingRunDto?
)

data class ReadinessDto(
    val ready: Boolean,
    val labelableTasks: Int,
    val requiredTasks: Int
)

data class ActiveModelDto(
    val modelVersion: String,
    val calibrated: Boolean
)

data class TrainingRunDto(
    val status: String
)

data class FactorDto(
    val feature: String,
    val explanation: String
)

data class TaskDto(
    val id: String,
    val workspaceId: String,
    val projectId: String,
    val title: String,
    val description: String?,
    val status: String,
    val priority: Int,
    val version: Int,
    val assignee: AssigneeDto?,
    val riskAssessments: List<RiskAssessmentDto>?
)

/** One keyset page of tasks; nextCursor is null on the last page. */
data class TaskPageDto(
    val items: List<TaskDto>,
    val nextCursor: String?
)

data class TaskDetailDto(
    val id: String,
    val title: String,
    val description: String?,
    val status: String,
    val priority: Int,
    val version: Int,
    val dueDate: String?,
    val dueDateIsDateOnly: Boolean?,
    val assignee: AssigneeDto?,
    val riskAssessments: List<RiskAssessmentDto>?
)

data class CommentAuthorDto(val id: String, val fullName: String)

data class CommentDto(
    val id: String,
    val body: String,
    val createdAt: String,
    val author: CommentAuthorDto
)

data class CreateCommentRequest(val body: String)

/** Null fields are omitted by Gson, so optional values are simply left out. */
data class CreateTaskRequest(
    val title: String,
    val projectId: String,
    val priority: Int,
    val description: String? = null,
    val assigneeId: String? = null,
    // Calendar date (YYYY-MM-DD): stored as a date-only due date.
    val dueDate: String? = null
)

data class UpdateTaskRequest(
    val status: String,
    val version: Int,
    // ISO-8601 time the change was made on the device while offline.
    val clientOccurredAt: String? = null
)