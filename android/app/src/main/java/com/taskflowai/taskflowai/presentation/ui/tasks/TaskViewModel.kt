package com.taskflowai.taskflowai.presentation.ui.tasks

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.taskflowai.taskflowai.data.remote.ApiClient
import com.taskflowai.taskflowai.data.remote.TaskDto
import com.taskflowai.taskflowai.data.remote.UpdateTaskRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider

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
    var tasks by mutableStateOf<List<TaskDto>>(emptyList())
        private set

    var isLoading by mutableStateOf(false)
        private set

    init {
        fetchTasksForWorkspace()
    }

    private fun fetchTasksForWorkspace() {
        viewModelScope.launch(Dispatchers.IO) {
            isLoading = true
            try {
                val projectsResponse = ApiClient.workspaceService.getProjects(workspaceId)
                if (projectsResponse.isSuccessful && !projectsResponse.body().isNullOrEmpty()) {
                    val firstProjectId = projectsResponse.body()!![0].id

                    val tasksResponse = ApiClient.taskService.getTasks(workspaceId, firstProjectId)
                    if (tasksResponse.isSuccessful && tasksResponse.body() != null) {
                        tasks = tasksResponse.body()!!
                    }
                }
            } catch (e: Exception) {
                // exception
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
                if (response.isSuccessful) {
                    fetchTasksForWorkspace()
                }
            } catch (e: Exception) {
                // exception
            }
        }
    }
}