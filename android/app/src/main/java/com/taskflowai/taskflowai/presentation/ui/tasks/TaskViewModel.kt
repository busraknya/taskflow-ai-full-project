package com.taskflowai.taskflowai.presentation.ui.tasks

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import com.taskflowai.taskflowai.data.local.AppDatabase
import com.taskflowai.taskflowai.data.local.PendingOperationEntity
import com.taskflowai.taskflowai.data.local.TokenManager
import com.taskflowai.taskflowai.data.remote.ApiClient
import com.taskflowai.taskflowai.data.remote.ProjectDto
import com.taskflowai.taskflowai.data.remote.RiskModelStatusDto
import com.taskflowai.taskflowai.data.remote.TaskDto
import com.taskflowai.taskflowai.data.remote.UpdateTaskRequest
import com.taskflowai.taskflowai.sync.SyncScheduler
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.launch

private val BOARD_STATUSES = listOf("TODO", "IN_PROGRESS", "IN_REVIEW", "DONE")

class TaskViewModelFactory(
    private val application: Application,
    private val workspaceId: String,
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(TaskViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return TaskViewModel(application, workspaceId) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}

class TaskViewModel(
    application: Application,
    private val workspaceId: String,
) : AndroidViewModel(application) {
    var projects by mutableStateOf<List<ProjectDto>>(emptyList())
        private set
    var selectedProject by mutableStateOf<ProjectDto?>(null)
        private set
    /** Loaded tasks of every status; each status column is paged separately. */
    var tasks by mutableStateOf<List<TaskDto>>(emptyList())
        private set
    var nextCursors by mutableStateOf<Map<String, String?>>(emptyMap())
        private set
    var loadingMoreStatus by mutableStateOf<String?>(null)
        private set
    var isLoading by mutableStateOf(false)
        private set
    var errorMessage by mutableStateOf<String?>(null)
        private set
    var riskModelStatus by mutableStateOf<RiskModelStatusDto?>(null)
        private set

    init {
        fetchProjects()
        fetchRiskModelStatus()
    }

    /** Workspace-level risk state; optional, failures only hide the detail. */
    private fun fetchRiskModelStatus() {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val response = ApiClient.taskService.getRiskModelStatus(workspaceId)
                riskModelStatus = if (response.isSuccessful) response.body() else null
            } catch (error: Exception) {
                riskModelStatus = null
            }
        }
    }

    private fun fetchProjects() {
        viewModelScope.launch(Dispatchers.IO) {
            isLoading = true
            try {
                val response = ApiClient.workspaceService.getProjects(workspaceId)
                if (response.isSuccessful && !response.body().isNullOrEmpty()) {
                    projects = response.body()!!
                    selectedProject = projects[0]
                    fetchTasksForProject(projects[0].id)
                } else if (!response.isSuccessful) {
                    errorMessage = "Failed to load projects (HTTP ${response.code()})."
                }
            } catch (error: Exception) {
                errorMessage = error.localizedMessage ?: "Unable to load projects."
            } finally {
                isLoading = false
            }
        }
    }

    fun selectProject(project: ProjectDto) {
        selectedProject = project
        fetchTasksForProject(project.id)
    }

    /** Loads the first page of every status; later pages load on demand. */
    fun fetchTasksForProject(projectId: String) {
        viewModelScope.launch(Dispatchers.IO) {
            isLoading = true
            try {
                val pages = BOARD_STATUSES.map { status ->
                    async { ApiClient.taskService.getTasks(workspaceId, projectId, status) }
                }.awaitAll()
                val failed = pages.firstOrNull { !it.isSuccessful || it.body() == null }
                if (failed == null) {
                    tasks = pages.flatMap { it.body()!!.items }
                    nextCursors = BOARD_STATUSES.zip(pages.map { it.body()!!.nextCursor }).toMap()
                    errorMessage = null
                } else {
                    errorMessage = "Failed to load tasks (HTTP ${failed.code()})."
                }
            } catch (error: Exception) {
                errorMessage = error.localizedMessage ?: "Unable to load tasks."
            } finally {
                isLoading = false
            }
        }
    }

    fun loadMore(status: String) {
        val projectId = selectedProject?.id ?: return
        val cursor = nextCursors[status] ?: return
        if (loadingMoreStatus != null) return
        loadingMoreStatus = status
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val response = ApiClient.taskService.getTasks(workspaceId, projectId, status, cursor)
                val page = response.body()
                if (response.isSuccessful && page != null) {
                    // A task whose position changed meanwhile can reappear; keep one copy.
                    val loaded = tasks.mapTo(HashSet()) { it.id }
                    tasks = tasks + page.items.filter { it.id !in loaded }
                    nextCursors = nextCursors + (status to page.nextCursor)
                } else {
                    errorMessage = "Failed to load more tasks (HTTP ${response.code()})."
                }
            } catch (error: Exception) {
                errorMessage = error.localizedMessage ?: "Unable to load more tasks."
            } finally {
                loadingMoreStatus = null
            }
        }
    }

    fun updateTaskStatus(taskId: String, newStatus: String, currentVersion: Int) {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val response = ApiClient.taskService.updateTaskStatus(
                    workspaceId, taskId,
                    UpdateTaskRequest(status = newStatus, version = currentVersion)
                )
                when {
                    response.isSuccessful -> selectedProject?.let { fetchTasksForProject(it.id) }
                    response.code() == 408 || response.code() == 429 || response.code() >= 500 ->
                        queueStatusChange(taskId, newStatus, currentVersion)
                    else -> errorMessage = "Task update failed (HTTP ${response.code()}). Refresh and try again."
                }
            } catch (_: IOException) {
                queueStatusChange(taskId, newStatus, currentVersion)
            } catch (error: Exception) {
                errorMessage = error.localizedMessage ?: "Task update failed."
            }
        }
    }

    private suspend fun queueStatusChange(taskId: String, newStatus: String, currentVersion: Int) {
        val userId = TokenManager(getApplication<Application>()).getUserId()
        if (userId.isNullOrBlank()) {
            errorMessage = "Your session is unavailable. Sign in again before saving offline changes."
            return
        }

        val operation = PendingOperationEntity(
            id = UUID.randomUUID().toString(),
            ownerUserId = userId,
            workspaceId = workspaceId,
            entityType = "TASK",
            entityId = taskId,
            operationType = "UPDATE_STATUS",
            payloadJson = Gson().toJson(mapOf("status" to newStatus, "version" to currentVersion)),
            createdAt = System.currentTimeMillis(),
        )
        AppDatabase.getDatabase(getApplication<Application>())
            .operationDao()
            .replacePendingTaskStatusOperation(operation)

        tasks = tasks.map { task ->
            if (task.id == taskId) task.copy(status = newStatus) else task
        }
        errorMessage = "Offline: change saved on this device and will sync when connected."
        SyncScheduler.enqueue(getApplication())
    }
}
