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

class TaskViewModel(application: Application) : AndroidViewModel(application) {
    var tasks by mutableStateOf<List<TaskDto>>(emptyList())
        private set

    var isLoading by mutableStateOf(false)
        private set

    var errorMessage by mutableStateOf<String?>(null)
        private set

    // Test için seed'den gelen gerçek Workspace ID ve Proje ID'sini buraya verebiliriz
    // (Veya login sonrası dinamik alınır)
    private val dummyWorkspaceId = "af39ea50-262b-441d-b97d-480e03c2e459"
    private val dummyProjectId = "3224de89-146f-4f06-bc86-127cf7dec84c"

    init {
        fetchTasks()
    }

    fun fetchTasks() {
        viewModelScope.launch(Dispatchers.IO) {
            isLoading = true
            try {
                val response = ApiClient.taskService.getTasks(dummyWorkspaceId, dummyProjectId)
                if (response.isSuccessful && response.body() != null) {
                    tasks = response.body()!!
                } else {
                    errorMessage = "Failed to load tasks from server."
                }
            } catch (e: Exception) {
                errorMessage = e.localizedMessage ?: "Network error."
            } finally {
                isLoading = false
            }
        }
    }

    fun updateTaskStatus(taskId: String, newStatus: String, currentVersion: Int) {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val response = ApiClient.taskService.updateTaskStatus(
                    dummyWorkspaceId,
                    taskId,
                    UpdateTaskRequest(status = newStatus, version = currentVersion)
                )
                if (response.isSuccessful) {
                    fetchTasks() // Listeyi tazele
                }
            } catch (e: Exception) {
                errorMessage = "Failed to update task status."
            }
        }
    }
}