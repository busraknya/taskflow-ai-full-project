package com.taskflowai.taskflowai.presentation.ui.tasks

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.taskflowai.taskflowai.data.remote.TaskDto
import com.taskflowai.taskflowai.presentation.ui.Labels
import com.taskflowai.taskflowai.presentation.ui.components.Avatar
import com.taskflowai.taskflowai.presentation.ui.components.Badge
import com.taskflowai.taskflowai.presentation.ui.components.Banner
import com.taskflowai.taskflowai.presentation.ui.components.EmptyState
import com.taskflowai.taskflowai.presentation.ui.components.GhostButton
import com.taskflowai.taskflowai.presentation.ui.components.LoadingState
import com.taskflowai.taskflowai.presentation.ui.components.StatusDot
import com.taskflowai.taskflowai.presentation.ui.components.Tone
import com.taskflowai.taskflowai.presentation.ui.components.cardSurface
import com.taskflowai.taskflowai.presentation.ui.theme.Taskflow

/** Tone per risk level; LOW stays neutral so only real risk draws attention. */
fun riskTone(level: String): Tone = when (level) {
    "HIGH" -> Tone.Danger
    "MEDIUM" -> Tone.Warning
    else -> Tone.Neutral
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskScreen(
    workspaceId: String,
    workspaceName: String,
    canEdit: Boolean,
    /** True after a task was created or changed elsewhere; the board reloads once. */
    changed: Boolean,
    onChangeHandled: () -> Unit,
    onOpenTask: (taskId: String) -> Unit,
    onCreateTask: (projectId: String) -> Unit,
    onBackToWorkspaces: () -> Unit,
) {
    val application = LocalContext.current.applicationContext as Application
    val viewModel: TaskViewModel = viewModel(factory = TaskViewModelFactory(application, workspaceId))
    val c = Taskflow.colors
    var selectedTab by rememberSaveable { mutableIntStateOf(0) }
    val status = Labels.statuses[selectedTab]
    val tasks = viewModel.tasks
    val project = viewModel.selectedProject

    LaunchedEffect(changed) {
        if (changed) {
            viewModel.refresh()
            onChangeHandled()
        }
    }

    Column(Modifier.fillMaxSize().background(c.canvas)) {
        // Header: workspace, project switcher and status tabs.
        Column(Modifier.fillMaxWidth().background(c.surface).statusBarsPadding()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBackToWorkspaces) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "All workspaces", tint = c.fgMuted)
                }
                Column(Modifier.weight(1f)) {
                    Text(project?.name ?: "Board", style = MaterialTheme.typography.titleMedium, color = c.fg, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(workspaceName, style = MaterialTheme.typography.bodySmall, color = c.fgMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            if (viewModel.projects.size > 1) {
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    viewModel.projects.forEach { p ->
                        FilterChip(
                            selected = p.id == project?.id,
                            onClick = { viewModel.selectProject(p) },
                            label = { Text(p.name, style = MaterialTheme.typography.labelLarge) },
                            shape = MaterialTheme.shapes.small,
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = c.accentSoft,
                                selectedLabelColor = c.accent,
                                labelColor = c.fgMuted,
                            ),
                            border = FilterChipDefaults.filterChipBorder(enabled = true, selected = p.id == project?.id, borderColor = c.line, selectedBorderColor = c.accentSoft),
                        )
                    }
                }
            }
            ScrollableTabRow(
                selectedTabIndex = selectedTab,
                containerColor = c.surface,
                contentColor = c.fg,
                edgePadding = 8.dp,
                divider = { HorizontalDivider(color = c.line) },
                indicator = { positions ->
                    TabRowDefaults.SecondaryIndicator(Modifier.tabIndicatorOffset(positions[selectedTab]), height = 2.dp, color = c.accent)
                },
            ) {
                Labels.statuses.forEachIndexed { index, s ->
                    val count = tasks.count { it.status == s }
                    val more = viewModel.nextCursors[s] != null
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        selectedContentColor = c.fg,
                        unselectedContentColor = c.fgMuted,
                        text = {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                StatusDot(s)
                                Text(Labels.status(s), style = MaterialTheme.typography.labelLarge)
                                Text("$count${if (more) "+" else ""}", style = MaterialTheme.typography.labelMedium, color = c.fgSubtle)
                            }
                        },
                    )
                }
            }
        }

        PullToRefreshBox(
            isRefreshing = viewModel.isLoading && tasks.isNotEmpty(),
            onRefresh = viewModel::refresh,
            modifier = Modifier.weight(1f),
        ) {
            val filtered = tasks.filter { it.status == status }
            val hasMore = viewModel.nextCursors[status] != null
            val riskMessage = workspaceRiskMessage(viewModel.riskModelStatus, tasks.any { currentRiskLevel(it.riskAssessments) != null })

            when {
                viewModel.isLoading && tasks.isEmpty() -> LoadingState("Loading tasks…")
                else -> LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    viewModel.errorMessage?.let { message ->
                        item { Banner(message, if (message.startsWith("Offline")) Tone.Warning else Tone.Danger) }
                    }
                    if (project == null && !viewModel.isLoading) {
                        item {
                            EmptyState(
                                "No projects yet",
                                if (canEdit) "Create a project in the TaskFlow web app to start adding tasks." else "An owner or admin needs to create a project first.",
                            )
                        }
                    } else {
                        if (riskMessage != null && tasks.isNotEmpty()) {
                            item { Text(riskMessage, style = MaterialTheme.typography.bodySmall, color = c.fgSubtle) }
                        }
                        if (filtered.isEmpty() && !hasMore) {
                            item { EmptyState("No tasks in ${Labels.status(status).lowercase()}") }
                        }
                        items(filtered, key = { it.id }) { task ->
                            TaskCard(
                                task = task,
                                canMove = canEdit,
                                onOpen = { onOpenTask(task.id) },
                                onMove = { next -> viewModel.updateTaskStatus(task.id, next, task.version) },
                            )
                        }
                        if (hasMore) {
                            item {
                                val loading = viewModel.loadingMoreStatus == status
                                GhostButton(
                                    if (loading) "Loading…" else "Load more",
                                    onClick = { viewModel.loadMore(status) },
                                    enabled = !loading,
                                    modifier = Modifier.fillMaxWidth(),
                                    color = c.fgMuted,
                                )
                            }
                        }
                    }
                }
            }

            if (canEdit && project != null) {
                ExtendedFloatingActionButton(
                    onClick = { onCreateTask(project.id) },
                    icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                    text = { Text("New task", style = MaterialTheme.typography.labelLarge) },
                    containerColor = c.accent,
                    contentColor = c.accentFg,
                    shape = MaterialTheme.shapes.medium,
                    modifier = Modifier.align(Alignment.BottomEnd).navigationBarsPadding().padding(16.dp),
                )
            }
        }
    }
}

@Composable
private fun TaskCard(task: TaskDto, canMove: Boolean, onOpen: () -> Unit, onMove: (String) -> Unit) {
    val c = Taskflow.colors
    val next = if (canMove) Labels.nextStatus(task.status) else null
    val risk = currentRiskLevel(task.riskAssessments)
    Column(
        Modifier
            .fillMaxWidth()
            .cardSurface(c, MaterialTheme.shapes.medium)
            .clickable(onClickLabel = "Open task", onClick = onOpen)
            .padding(start = 14.dp, top = 12.dp, bottom = 12.dp, end = 4.dp),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f).padding(end = 4.dp)) {
                Text(task.title, style = MaterialTheme.typography.titleSmall, color = c.fg)
                if (!task.description.isNullOrBlank()) {
                    Text(task.description, style = MaterialTheme.typography.bodySmall, color = c.fgMuted, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp))
                }
            }
            if (next != null) {
                IconButton(onClick = { onMove(next) }, modifier = Modifier.size(36.dp)) {
                    Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = "Move to ${Labels.status(next)}", tint = c.fgSubtle)
                }
            }
        }
        Spacer(Modifier.size(10.dp))
        Row(Modifier.padding(end = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Badge(Labels.priority(task.priority), if (task.priority == 3) Tone.Danger else Tone.Neutral)
            if (risk != null) Badge(Labels.risk(risk), riskTone(risk))
            Spacer(Modifier.weight(1f))
            task.assignee?.let { Avatar(it.fullName, size = 24) }
        }
    }
}
