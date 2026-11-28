package com.taskflowai.taskflowai.presentation.ui.workspaces

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.taskflowai.taskflowai.data.remote.ApiClient
import com.taskflowai.taskflowai.data.remote.WorkspaceDto
import com.taskflowai.taskflowai.data.remote.errorMessage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class WorkspaceSelectionViewModel(application: Application) : AndroidViewModel(application) {
    /** Null until the first load finishes. */
    var workspaces by mutableStateOf<List<WorkspaceDto>?>(null)
        private set
    var isRefreshing by mutableStateOf(false)
        private set
    var errorMessage by mutableStateOf<String?>(null)
        private set

    init {
        fetchWorkspaces()
    }

    fun fetchWorkspaces() {
        viewModelScope.launch(Dispatchers.IO) {
            isRefreshing = true
            try {
                val response = ApiClient.workspaceService.getWorkspaces()
                val body = response.body()
                if (response.isSuccessful && body != null) {
                    workspaces = body
                    errorMessage = null
                } else {
                    errorMessage = response.errorMessage("Your workspaces could not be loaded.")
                }
            } catch (e: Exception) {
                errorMessage = "Cannot reach the server. Pull down to try again."
            } finally {
                if (workspaces == null && errorMessage != null) workspaces = emptyList()
                isRefreshing = false
            }
        }
    }
}
