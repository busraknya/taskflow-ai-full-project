package com.taskflowai.taskflowai.presentation.ui.tasks

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.taskflowai.taskflowai.data.remote.ApiClient
import com.taskflowai.taskflowai.data.remote.ProjectDto
import com.taskflowai.taskflowai.data.remote.TaskDto
import com.taskflowai.taskflowai.data.remote.UpdateTaskRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class TaskViewModelFactory(private val workspaceId: String) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(TaskViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return TaskViewModel(android.app.Application(), workspaceId) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}

class TaskViewModel(application: Application, private val workspaceId: String) : AndroidViewModel(application) {
    var projects by mutableStateOf<List<ProjectDto>>(emptyList())
        private set

    var selectedProject by mutableStateOf<ProjectDto?>(null)
        private set

    var tasks by mutableStateOf<List<TaskDto>>(emptyList())
        private set

    var isLoading by mutableStateOf(false)
        private set

    init {
        fetchProjects()
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
                }
            } catch (_: Exception) {
            } finally {
                isLoading = false
            }
        }
    }

    fun selectProject(project: ProjectDto) {
        selectedProject = project
        fetchTasksForProject(project.id)
    }

    fun fetchTasksForProject(projectId: String) {
        viewModelScope.launch(Dispatchers.IO) {
            isLoading = true
            try {
                val response = ApiClient.taskService.getTasks(workspaceId, projectId)
                if (response.isSuccessful && response.body() != null) {
                    tasks = response.body()!!
                }
            } catch (_: Exception) {
            } finally {
                isLoading = false
            }
        }
    }

    fun updateTaskStatus(taskId: String, newStatus: String, currentVersion: Int) {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val response = ApiClient.taskService.updateTaskStatus(
                    workspaceId,
                    taskId,
                    UpdateTaskRequest(status = newStatus, version = currentVersion)
                )
                if (response.isSuccessful && selectedProject != null) {
                    fetchTasksForProject(selectedProject!!.id)
                }
            } catch (_: Exception) {
            }
        }
    }
}