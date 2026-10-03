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

@Composable
fun TaskScreen(viewModel: TaskViewModel = androidx.lifecycle.viewmodel.compose.viewModel()) {
    val tasks = viewModel.tasks

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF09090B))
            .padding(16.dp)
    ) {
        Text(
            text = "Project Tasks (Offline-First)",
            color = Color.White,
            fontSize = 20.sp,
            style = MaterialTheme.typography.titleLarge
        )
        Spacer(modifier = Modifier.height(16.dp))

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(tasks) { task ->
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF18181B)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(text = task.title, color = Color.White, fontSize = 16.sp)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(text = "Status: ${task.status}", color = Color(0xFFA1A1AA), fontSize = 12.sp)
                        Spacer(modifier = Modifier.height(8.dp))

                        Button(
                            onClick = {
                                val nextStatus = if (task.status == "TODO") "IN_PROGRESS" else "DONE"
                                viewModel.updateTaskStatus(task.id, nextStatus, task.version)
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color.White)
                        ) {
                            Text(text = "Move Forward", color = Color.Black, fontSize = 12.sp)
                        }
                    }
                }
            }
        }
    }
}