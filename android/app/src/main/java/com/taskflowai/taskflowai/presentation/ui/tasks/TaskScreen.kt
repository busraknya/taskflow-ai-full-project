package com.taskflowai.taskflowai.presentation.ui.tasks

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.*


@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskScreen(
    workspaceId: String,
    onBackToWorkspaces: () -> Unit,
    onLogout: () -> Unit,
    viewModel: TaskViewModel = androidx.lifecycle.viewmodel.compose.viewModel(
        factory = TaskViewModelFactory(workspaceId)
    )
) {
    val projects = viewModel.projects
    val selectedProject = viewModel.selectedProject
    val tasks = viewModel.tasks
    val isLoading = viewModel.isLoading

    // Tabs for state: 0: To Do, 1: In Progress, 2: In Review, 3: Done
    var selectedTab by remember { mutableStateOf(0) }
    val tabs = listOf("To Do", "In Progress", "In Review", "Done")
    val statusMapping = listOf("TODO", "IN_PROGRESS", "IN_REVIEW", "DONE")

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("TaskFlow AI", color = Color.White, fontSize = 16.sp) },
                navigationIcon = {
                    TextButton(onClick = onBackToWorkspaces) {
                        Text("← Workspaces", color = Color(0xFFA1A1AA), fontSize = 12.sp)
                    }
                },
                actions = {
                    TextButton(onClick = onLogout) {
                        Text("Logout", color = Color(0xFFEF4444), fontSize = 12.sp)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xFF18181B))
            )
        },
        containerColor = Color(0xFF09090B)
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp)
        ) {
            // 1. Proje Seçici (Project Selector Dropdown / Row)
            if (projects.isNotEmpty()) {
                Text(text = "PROJECT", color = Color(0xFFA1A1AA), fontSize = 10.sp)
                Spacer(modifier = Modifier.height(4.dp))

                // Basit bir Proje Seçim Alanı
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    projects.forEach { proj ->
                        val isSelected = proj.id == selectedProject?.id
                        Button(
                            onClick = { viewModel.selectProject(proj) },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (isSelected) Color.White else Color(0xFF18181B)
                            ),
                            shape = MaterialTheme.shapes.small
                        ) {
                            Text(
                                text = proj.name,
                                color = if (isSelected) Color.Black else Color.White,
                                fontSize = 12.sp
                            )
                        }
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
            }

            // 2. Sekmeler (Linear Mobile Tarzı Tabs)
            ScrollableTabRow(
                selectedTabIndex = selectedTab,
                containerColor = Color(0xFF18181B),
                contentColor = Color.White,
                edgePadding = 0.dp
            ) {
                tabs.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        text = { Text(text = title, fontSize = 12.sp) }
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // 3. Seçilen Sekmedeki Görevler (Tasks List)
            val currentStatus = statusMapping[selectedTab]
            val filteredTasks = tasks.filter { it.status == currentStatus }

            if (isLoading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Color.White)
                }
            } else if (filteredTasks.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(text = "No tasks in this section.", color = Color(0xFFA1A1AA), fontSize = 12.sp)
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(filteredTasks) { task ->
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF18181B)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text(text = task.title, color = Color.White, fontSize = 14.sp)
                                if (!task.description.isNullOrEmpty()) {
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text(text = task.description!!, color = Color(0xFFA1A1AA), fontSize = 11.sp)
                                }
                                Spacer(modifier = Modifier.height(8.dp))

                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(text = "Priority: P${task.priority}", color = Color(0xFFA1A1AA), fontSize = 10.sp)

                                    // İleri taşıma butonu
                                    if (currentStatus != "DONE") {
                                        Button(
                                            onClick = {
                                                val nextStatus = when (currentStatus) {
                                                    "TODO" -> "IN_PROGRESS"
                                                    "IN_PROGRESS" -> "IN_REVIEW"
                                                    else -> "DONE"
                                                }
                                                viewModel.updateTaskStatus(task.id, nextStatus, task.version)
                                            },
                                            colors = ButtonDefaults.buttonColors(containerColor = Color.White),
                                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)
                                        ) {
                                            Text(text = "Move →", color = Color.Black, fontSize = 10.sp)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}