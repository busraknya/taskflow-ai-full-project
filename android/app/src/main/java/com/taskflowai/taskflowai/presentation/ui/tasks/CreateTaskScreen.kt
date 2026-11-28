package com.taskflowai.taskflowai.presentation.ui.tasks

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.taskflowai.taskflowai.data.remote.ApiClient
import com.taskflowai.taskflowai.data.remote.CreateTaskRequest
import com.taskflowai.taskflowai.data.remote.MemberDto
import com.taskflowai.taskflowai.data.remote.errorMessage
import com.taskflowai.taskflowai.presentation.ui.Dates
import com.taskflowai.taskflowai.presentation.ui.Labels
import com.taskflowai.taskflowai.presentation.ui.components.Banner
import com.taskflowai.taskflowai.presentation.ui.components.Dropdown
import com.taskflowai.taskflowai.presentation.ui.components.FormField
import com.taskflowai.taskflowai.presentation.ui.components.GhostButton
import com.taskflowai.taskflowai.presentation.ui.components.PrimaryButton
import com.taskflowai.taskflowai.presentation.ui.theme.Taskflow
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class CreateTaskViewModel(application: Application, private val workspaceId: String) : AndroidViewModel(application) {
    /** Active members only: pending invitees cannot be assigned. */
    var members by mutableStateOf<List<MemberDto>>(emptyList())
        private set
    var saving by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    init {
        viewModelScope.launch(Dispatchers.IO) {
            members = runCatching { ApiClient.workspaceService.getMembers(workspaceId).body() }.getOrNull().orEmpty().filter { it.status == "ACTIVE" }
        }
    }

    fun create(request: CreateTaskRequest, onCreated: () -> Unit) {
        viewModelScope.launch(Dispatchers.IO) {
            saving = true
            try {
                val response = ApiClient.taskService.createTask(workspaceId, request)
                if (response.isSuccessful) {
                    launch(Dispatchers.Main) { onCreated() }
                } else {
                    error = response.errorMessage("The task could not be created.")
                }
            } catch (e: Exception) {
                error = "Cannot reach the server. Check your connection and try again."
            } finally {
                saving = false
            }
        }
    }
}

private class CreateTaskViewModelFactory(private val app: Application, private val workspaceId: String) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = CreateTaskViewModel(app, workspaceId) as T
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateTaskScreen(
    workspaceId: String,
    projectId: String,
    onClose: (created: Boolean) -> Unit,
) {
    val application = LocalContext.current.applicationContext as Application
    val vm: CreateTaskViewModel = viewModel(factory = CreateTaskViewModelFactory(application, workspaceId))
    val c = Taskflow.colors
    var title by rememberSaveable { mutableStateOf("") }
    var description by rememberSaveable { mutableStateOf("") }
    var priority by rememberSaveable { mutableStateOf(0) }
    var assigneeId by rememberSaveable { mutableStateOf("") }
    var dueMillis by rememberSaveable { mutableStateOf<Long?>(null) }
    var pickingDate by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().background(c.canvas).imePadding()) {
        Row(
            Modifier.fillMaxWidth().background(c.surface).statusBarsPadding().padding(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = { onClose(false) }) { Icon(Icons.Filled.Close, contentDescription = "Discard", tint = c.fgMuted) }
            Text("New task", style = MaterialTheme.typography.titleMedium, color = c.fg)
        }
        HorizontalDivider(color = c.line)

        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Banner(vm.error)
            FormField(
                "Title", title, { title = it },
                placeholder = "e.g. Review the onboarding emails",
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Next),
            )
            FormField(
                "Description", description, { description = it },
                hint = "Optional", singleLine = false, minLines = 3,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            )
            Dropdown("Priority", Labels.priorities.map { it to Labels.priority(it) }, priority, { priority = it })
            Dropdown(
                "Assignee",
                listOf("" to "Unassigned") + vm.members.map { it.user.id to (it.user.fullName ?: it.user.email) },
                assigneeId,
                { assigneeId = it },
            )
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Due date", style = MaterialTheme.typography.labelLarge, color = c.fg)
                Box {
                    FormField("Due date", dueMillis?.let(Dates::displayDateFromPicker) ?: "", {}, hideLabel = true, placeholder = "No due date")
                    // The field is display-only; a tap opens the calendar.
                    Box(Modifier.matchParentSize().clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClickLabel = "Choose a due date") { pickingDate = true })
                }
                if (dueMillis != null) GhostButton("Remove due date", onClick = { dueMillis = null }, color = c.fgMuted)
            }
        }

        HorizontalDivider(color = c.line)
        Row(Modifier.fillMaxWidth().background(c.surface).navigationBarsPadding().padding(12.dp), horizontalArrangement = Arrangement.End) {
            PrimaryButton(
                "Create task",
                onClick = {
                    vm.create(
                        CreateTaskRequest(
                            title = title.trim(),
                            projectId = projectId,
                            priority = priority,
                            description = description.trim().ifBlank { null },
                            assigneeId = assigneeId.ifBlank { null },
                            dueDate = dueMillis?.let(Dates::isoDateFromPicker),
                        ),
                    ) { onClose(true) }
                },
                enabled = title.isNotBlank(),
                loading = vm.saving,
            )
        }
    }

    if (pickingDate) {
        val state = rememberDatePickerState(initialSelectedDateMillis = dueMillis)
        DatePickerDialog(
            onDismissRequest = { pickingDate = false },
            confirmButton = {
                GhostButton("Set date", onClick = {
                    dueMillis = state.selectedDateMillis
                    pickingDate = false
                })
            },
            dismissButton = { GhostButton("Cancel", color = c.fgMuted, onClick = { pickingDate = false }) },
        ) { DatePicker(state = state) }
    }
}
