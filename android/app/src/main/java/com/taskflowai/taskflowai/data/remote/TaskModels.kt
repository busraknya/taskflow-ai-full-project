package com.taskflowai.taskflowai.data.remote

data class AssigneeDto(
    val id: String,
    val fullName: String,
    val avatarUrl: String?
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
    val assignee: AssigneeDto?
)

data class UpdateTaskRequest(
    val status: String,
    val version: Int
)