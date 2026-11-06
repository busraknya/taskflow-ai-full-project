package com.taskflowai.taskflowai.presentation.ui.workspaces

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.taskflowai.taskflowai.data.remote.ApiClient
import com.taskflowai.taskflowai.data.remote.WorkspaceDto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class WorkspaceViewModel : androidx.lifecycle.ViewModel() {
    var workspaces by mutableStateOf<List<WorkspaceDto>>(emptyList())
        private set
    var isLoading by mutableStateOf(false)
        private set

    init {
        fetchWorkspaces()
    }

    fun fetchWorkspaces() {
        kotlinx.coroutines.CoroutineScope(Dispatchers.IO).launch {
            isLoading = true
            try {
                val response = ApiClient.workspaceService.getWorkspaces()
                if (response.isSuccessful && response.body() != null) {
                    workspaces = response.body()!!
                }
            } catch (e: Exception) {
                // Hata yönetimi
            } finally {
                isLoading = false
            }
        }
    }
}

@Composable
fun WorkspaceSelectionScreen(
    viewModel: WorkspaceViewModel = androidx.lifecycle.viewmodel.compose.viewModel(),
    onWorkspaceSelected: (String, String) -> Unit // workspaceId, workspaceSlug
) {
    val workspaces = viewModel.workspaces

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF09090B))
            .padding(24.dp)
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            Text(
                text = "Workspaces",
                color = Color.White,
                fontSize = 24.sp,
                style = MaterialTheme.typography.headlineMedium
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Select a workspace to continue.",
                color = Color(0xFFA1A1AA),
                fontSize = 14.sp
            )
            Spacer(modifier = Modifier.height(24.dp))

            if (viewModel.isLoading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Color.White)
                }
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(workspaces) { ws ->
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF18181B)),
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onWorkspaceSelected(ws.id, ws.slug) }
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text(text = ws.name, color = Color.White, fontSize = 16.sp)
                                Spacer(modifier = Modifier.height(2.dp))
                                Text(text = "Role: ${ws.role}", color = Color(0xFFA1A1AA), fontSize = 12.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}