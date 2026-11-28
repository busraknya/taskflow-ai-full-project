package com.taskflowai.taskflowai.presentation.ui.workspaces

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.taskflowai.taskflowai.data.remote.WorkspaceDto
import com.taskflowai.taskflowai.presentation.ui.Labels
import com.taskflowai.taskflowai.presentation.ui.components.Badge
import com.taskflowai.taskflowai.presentation.ui.components.Banner
import com.taskflowai.taskflowai.presentation.ui.components.EmptyState
import com.taskflowai.taskflowai.presentation.ui.components.GhostButton
import com.taskflowai.taskflowai.presentation.ui.components.LoadingState
import com.taskflowai.taskflowai.presentation.ui.components.cardSurface
import com.taskflowai.taskflowai.presentation.ui.login.BrandRow
import com.taskflowai.taskflowai.presentation.ui.theme.Taskflow

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkspaceSelectionScreen(
    viewModel: WorkspaceSelectionViewModel = viewModel(),
    onWorkspaceSelected: (WorkspaceDto) -> Unit,
    onLogout: () -> Unit,
) {
    val c = Taskflow.colors
    val workspaces = viewModel.workspaces

    Column(Modifier.fillMaxSize().background(c.canvas)) {
        Row(
            Modifier.fillMaxWidth().background(c.surface).statusBarsPadding().padding(start = 16.dp, end = 4.dp).padding(vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BrandRow()
            Spacer(Modifier.weight(1f))
            GhostButton("Sign out", onClick = onLogout, color = c.fgMuted)
        }
        HorizontalDivider(color = c.line)

        PullToRefreshBox(isRefreshing = viewModel.isRefreshing && workspaces != null, onRefresh = viewModel::fetchWorkspaces, modifier = Modifier.fillMaxSize()) {
            if (workspaces == null) {
                LoadingState("Loading workspaces…")
            } else {
                LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    item {
                        Column(Modifier.padding(top = 8.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("Workspaces", style = MaterialTheme.typography.titleLarge, color = c.fg)
                            Text("Choose where you want to work.", style = MaterialTheme.typography.bodyMedium, color = c.fgMuted)
                        }
                    }
                    viewModel.errorMessage?.let { message -> item { Banner(message) } }
                    if (workspaces.isEmpty() && viewModel.errorMessage == null) {
                        item {
                            EmptyState(
                                title = "No workspaces yet",
                                description = "Create a workspace in the TaskFlow web app, or ask an admin to invite you.",
                            )
                        }
                    }
                    items(workspaces, key = { it.id }) { ws -> WorkspaceRow(ws) { onWorkspaceSelected(ws) } }
                }
            }
        }
    }
}

@Composable
private fun WorkspaceRow(workspace: WorkspaceDto, onClick: () -> Unit) {
    val c = Taskflow.colors
    Row(
        Modifier
            .fillMaxWidth()
            .cardSurface(c, MaterialTheme.shapes.medium)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(36.dp).background(c.accentSoft, MaterialTheme.shapes.small), contentAlignment = Alignment.Center) {
            Text(workspace.name.trim().take(1).uppercase(), style = MaterialTheme.typography.titleSmall, color = c.accent)
        }
        Column(Modifier.weight(1f)) {
            Text(workspace.name, style = MaterialTheme.typography.titleSmall, color = c.fg, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("/${workspace.slug}", style = MaterialTheme.typography.bodySmall, color = c.fgSubtle, fontFamily = FontFamily.Monospace, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Badge(Labels.role(workspace.role))
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = c.fgSubtle)
    }
}
