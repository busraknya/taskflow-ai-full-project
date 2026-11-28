package com.taskflowai.taskflowai.presentation.ui.tasks

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.taskflowai.taskflowai.data.local.TokenManager
import com.taskflowai.taskflowai.data.remote.ApiClient
import com.taskflowai.taskflowai.data.remote.CommentDto
import com.taskflowai.taskflowai.data.remote.CreateCommentRequest
import com.taskflowai.taskflowai.data.remote.RiskModelStatusDto
import com.taskflowai.taskflowai.data.remote.TaskDetailDto
import com.taskflowai.taskflowai.data.remote.UpdateTaskRequest
import com.taskflowai.taskflowai.data.remote.errorMessage
import com.taskflowai.taskflowai.presentation.ui.Dates
import com.taskflowai.taskflowai.presentation.ui.Labels
import com.taskflowai.taskflowai.presentation.ui.components.Avatar
import com.taskflowai.taskflowai.presentation.ui.components.Badge
import com.taskflowai.taskflowai.presentation.ui.components.Banner
import com.taskflowai.taskflowai.presentation.ui.components.Dropdown
import com.taskflowai.taskflowai.presentation.ui.components.FormField
import com.taskflowai.taskflowai.presentation.ui.components.GhostButton
import com.taskflowai.taskflowai.presentation.ui.components.LoadingState
import com.taskflowai.taskflowai.presentation.ui.components.PrimaryButton
import com.taskflowai.taskflowai.presentation.ui.components.Tone
import com.taskflowai.taskflowai.presentation.ui.components.cardSurface
import com.taskflowai.taskflowai.presentation.ui.theme.Taskflow
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.launch

private const val OFFLINE = "Cannot reach the server. Check your connection and try again."

class TaskDetailViewModel(application: Application, private val workspaceId: String, private val taskId: String) : AndroidViewModel(application) {
    var task by mutableStateOf<TaskDetailDto?>(null)
        private set
    var comments by mutableStateOf<List<CommentDto>>(emptyList())
        private set
    var riskStatus by mutableStateOf<RiskModelStatusDto?>(null)
        private set
    var loading by mutableStateOf(true)
        private set
    var busy by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    /** True once the task itself changed, so the board knows to reload. */
    var changed by mutableStateOf(false)
        private set
    val currentUserId: String? = TokenManager(application).getUserId()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch(Dispatchers.IO) {
            loading = true
            try {
                val t = async { ApiClient.taskService.getTask(workspaceId, taskId) }
                val cs = async { ApiClient.taskService.getComments(workspaceId, taskId) }
                val rs = async { runCatching { ApiClient.taskService.getRiskModelStatus(workspaceId) }.getOrNull() }
                val taskResponse = t.await()
                task = taskResponse.body().takeIf { taskResponse.isSuccessful }
                error = if (task == null) taskResponse.errorMessage("This task could not be loaded. It may have been deleted.") else null
                comments = cs.await().body().orEmpty()
                riskStatus = rs.await()?.body()
            } catch (e: Exception) {
                error = OFFLINE
            } finally {
                loading = false
            }
        }
    }

    fun changeStatus(status: String) {
        val current = task ?: return
        viewModelScope.launch(Dispatchers.IO) {
            busy = true
            try {
                val response = ApiClient.taskService.updateTaskStatus(workspaceId, taskId, UpdateTaskRequest(status = status, version = current.version))
                val body = response.body()
                if (response.isSuccessful && body != null) {
                    task = current.copy(status = body.status, version = body.version)
                    changed = true
                    error = null
                } else {
                    error = response.errorMessage("The status could not be changed.")
                }
            } catch (e: Exception) {
                error = OFFLINE
            } finally {
                busy = false
            }
        }
    }

    fun addComment(body: String, onDone: () -> Unit) {
        viewModelScope.launch(Dispatchers.IO) {
            busy = true
            try {
                val response = ApiClient.taskService.addComment(workspaceId, taskId, CreateCommentRequest(body.trim()))
                if (response.isSuccessful) {
                    comments = ApiClient.taskService.getComments(workspaceId, taskId).body() ?: comments
                    error = null
                    launch(Dispatchers.Main) { onDone() }
                } else {
                    error = response.errorMessage("Your comment could not be posted.")
                }
            } catch (e: Exception) {
                error = OFFLINE
            } finally {
                busy = false
            }
        }
    }

    fun deleteComment(commentId: String) {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val response = ApiClient.taskService.deleteComment(workspaceId, taskId, commentId)
                if (response.isSuccessful) {
                    comments = comments.filterNot { it.id == commentId }
                    error = null
                } else {
                    error = response.errorMessage("The comment could not be deleted.")
                }
            } catch (e: Exception) {
                error = OFFLINE
            }
        }
    }
}

private class TaskDetailViewModelFactory(private val app: Application, private val workspaceId: String, private val taskId: String) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = TaskDetailViewModel(app, workspaceId, taskId) as T
}

@Composable
fun TaskDetailScreen(
    workspaceId: String,
    taskId: String,
    canEdit: Boolean,
    canManageComments: Boolean,
    onBack: (changed: Boolean) -> Unit,
) {
    val application = LocalContext.current.applicationContext as Application
    val vm: TaskDetailViewModel = viewModel(key = "task-$taskId", factory = TaskDetailViewModelFactory(application, workspaceId, taskId))
    val c = Taskflow.colors
    val task = vm.task
    var draft by rememberSaveable { mutableStateOf("") }
    var pendingDelete by remember { mutableStateOf<CommentDto?>(null) }

    Column(Modifier.fillMaxSize().background(c.canvas).imePadding()) {
        Row(
            Modifier.fillMaxWidth().background(c.surface).statusBarsPadding().padding(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = { onBack(vm.changed) }) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back to board", tint = c.fgMuted)
            }
            Text("Task", style = MaterialTheme.typography.titleMedium, color = c.fg, modifier = Modifier.weight(1f))
        }
        HorizontalDivider(color = c.line)

        if (vm.loading && task == null) {
            LoadingState("Loading task…")
            return@Column
        }

        LazyColumn(
            Modifier.weight(1f),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            vm.error?.let { item { Banner(it) } }
            if (task != null) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(task.title, style = MaterialTheme.typography.titleLarge, color = c.fg)
                        if (canEdit) {
                            Dropdown(
                                label = "Status",
                                options = Labels.statuses.map { it to Labels.status(it) },
                                selected = task.status,
                                onSelect = vm::changeStatus,
                                enabled = !vm.busy,
                            )
                        } else {
                            Property("Status", Labels.status(task.status))
                        }
                        Property("Priority") { Badge(Labels.priority(task.priority), if (task.priority == 3) Tone.Danger else Tone.Neutral) }
                        Property("Assignee") {
                            val assignee = task.assignee
                            if (assignee != null) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Avatar(assignee.fullName, size = 24)
                                    Spacer(Modifier.width(8.dp))
                                    Text(assignee.fullName, style = MaterialTheme.typography.bodyMedium, color = c.fg)
                                }
                            } else {
                                Text("Unassigned", style = MaterialTheme.typography.bodyMedium, color = c.fgSubtle)
                            }
                        }
                        Property("Due", Dates.dueDate(task.dueDate, task.dueDateIsDateOnly), muted = task.dueDate == null)
                    }
                }
                item {
                    Section("Description") {
                        Text(task.description?.takeIf { it.isNotBlank() } ?: "No description.", style = MaterialTheme.typography.bodyMedium, color = c.fgMuted)
                    }
                }
                item { RiskSection(task, vm.riskStatus) }
                item {
                    Text("Comments  ${vm.comments.size}", style = MaterialTheme.typography.titleSmall, color = c.fg)
                }
                if (vm.comments.isEmpty()) {
                    item { Text("No comments yet.", style = MaterialTheme.typography.bodySmall, color = c.fgSubtle) }
                }
                items(vm.comments, key = { it.id }) { comment ->
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Avatar(comment.author.fullName, size = 28)
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(comment.author.fullName, style = MaterialTheme.typography.labelLarge, color = c.fg)
                                Spacer(Modifier.width(8.dp))
                                Text(Dates.dateTime(comment.createdAt), style = MaterialTheme.typography.labelMedium, color = c.fgSubtle, modifier = Modifier.weight(1f))
                                if (canManageComments || comment.author.id == vm.currentUserId) {
                                    IconButton(onClick = { pendingDelete = comment }, modifier = Modifier.size(32.dp)) {
                                        Icon(Icons.Filled.Delete, contentDescription = "Delete comment", tint = c.fgSubtle, modifier = Modifier.size(18.dp))
                                    }
                                }
                            }
                            Text(comment.body, style = MaterialTheme.typography.bodyMedium, color = c.fg)
                        }
                    }
                }
            }
        }

        if (task != null && canEdit) {
            HorizontalDivider(color = c.line)
            Row(
                Modifier.fillMaxWidth().background(c.surface).navigationBarsPadding().padding(12.dp),
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FormField("Add a comment", draft, { draft = it }, modifier = Modifier.weight(1f), singleLine = false, placeholder = "Write a comment", hideLabel = true)
                PrimaryButton("Post", onClick = { vm.addComment(draft) { draft = "" } }, enabled = draft.isNotBlank(), loading = vm.busy)
            }
        }
    }

    pendingDelete?.let { comment ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("Delete this comment?") },
            text = { Text("This cannot be undone.") },
            confirmButton = {
                GhostButton("Delete comment", color = c.danger, onClick = {
                    vm.deleteComment(comment.id)
                    pendingDelete = null
                })
            },
            dismissButton = { GhostButton("Cancel", color = c.fgMuted, onClick = { pendingDelete = null }) },
            containerColor = c.surface,
            shape = MaterialTheme.shapes.medium,
        )
    }
}

@Composable
private fun Property(label: String, value: String, muted: Boolean = false) {
    val c = Taskflow.colors
    Property(label) { Text(value, style = MaterialTheme.typography.bodyMedium, color = if (muted) c.fgSubtle else c.fg) }
}

@Composable
private fun Property(label: String, content: @Composable () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = Taskflow.colors.fgMuted, modifier = Modifier.width(96.dp))
        content()
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(title, style = MaterialTheme.typography.titleSmall, color = Taskflow.colors.fg)
        content()
    }
}

/** A level only from this workspace's validated model; otherwise an honest state. */
@Composable
private fun RiskSection(task: TaskDetailDto, status: RiskModelStatusDto?) {
    val c = Taskflow.colors
    val level = currentRiskLevel(task.riskAssessments)
    Column(
        Modifier.fillMaxWidth().cardSurface(c, MaterialTheme.shapes.medium).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Delay risk", style = MaterialTheme.typography.titleSmall, color = c.fg, modifier = Modifier.weight(1f))
            if (level != null) Badge(Labels.risk(level), riskTone(level))
        }
        if (level != null) {
            task.riskAssessments?.firstOrNull()?.factors.orEmpty().forEach {
                Text("• ${it.explanation}", style = MaterialTheme.typography.bodySmall, color = c.fgMuted)
            }
        } else {
            Text(
                workspaceRiskMessage(status, anyLevelShown = false) ?: "No prediction for this task yet.",
                style = MaterialTheme.typography.bodySmall,
                color = c.fgMuted,
            )
        }
    }
}
