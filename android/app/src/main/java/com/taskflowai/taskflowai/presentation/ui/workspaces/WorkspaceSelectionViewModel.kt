package com.taskflowai.taskflowai.presentation.ui.workspaces

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.taskflowai.taskflowai.data.remote.ApiClient
import com.taskflowai.taskflowai.data.remote.WorkspaceDto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class WorkspaceSelectionViewModel(application: Application) : AndroidViewModel(application) {
    var workspaces by mutableStateOf<List<WorkspaceDto>>(emptyList())
        private set

    var isLoading by mutableStateOf(false)
        private set

    var errorMessage by mutableStateOf<String?>(null)
        private set

    init {
        fetchWorkspaces()
    }

    fun fetchWorkspaces() {
        viewModelScope.launch(Dispatchers.IO) {
            isLoading = true
            try {
                val response = ApiClient.workspaceService.getWorkspaces()
                if (response.isSuccessful && response.body() != null) {
                    workspaces = response.body()!!
                } else {
                    errorMessage = "Failed to load workspaces."
                }
            } catch (e: Exception) {
                errorMessage = e.localizedMessage ?: "Network error."
            } finally {
                isLoading = false
            }
        }
    }
}