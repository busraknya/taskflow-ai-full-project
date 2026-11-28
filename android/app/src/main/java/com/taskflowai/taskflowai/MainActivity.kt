package com.taskflowai.taskflowai

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import com.taskflowai.taskflowai.data.remote.ApiClient
import com.taskflowai.taskflowai.presentation.navigation.AppNavGraph
import com.taskflowai.taskflowai.presentation.ui.theme.Taskflow
import com.taskflowai.taskflowai.presentation.ui.theme.TaskflowaiTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ApiClient.init(applicationContext)
        enableEdgeToEdge()
        setContent {
            TaskflowaiTheme {
                // Screens draw edge to edge and pad themselves for the system bars.
                Box(Modifier.fillMaxSize().background(Taskflow.colors.canvas)) {
                    AppNavGraph()
                }
            }
        }
    }
}
