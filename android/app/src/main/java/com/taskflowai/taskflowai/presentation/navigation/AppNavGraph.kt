package com.taskflowai.taskflowai.presentation.navigation

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.taskflowai.taskflowai.data.local.TokenManager
import com.taskflowai.taskflowai.presentation.ui.login.LoginScreen
import com.taskflowai.taskflowai.presentation.ui.tasks.TaskScreen
import com.taskflowai.taskflowai.presentation.ui.workspaces.WorkspaceSelectionScreen

sealed class Screen(val route: String) {
    object Login : Screen("login")
    object Tasks : Screen("tasks")
}

@Composable
fun AppNavGraph() {
    val navController = rememberNavController()
    val context = LocalContext.current.applicationContext

    NavHost(navController = navController, startDestination = "login") {
        composable("login") {
            LoginScreen(
                onLoginSuccess = { _ ->
                    navController.navigate("workspaces") {
                        popUpTo("login") { inclusive = true }
                    }
                }
            )
        }
        composable("workspaces") {
            WorkspaceSelectionScreen(
                onWorkspaceSelected = { wsId, _ ->
                    navController.navigate("tasks/$wsId")
                }
            )
        }
        composable("tasks/{workspaceId}") { backStackEntry ->
            val workspaceId = backStackEntry.arguments?.getString("workspaceId") ?: ""
            TaskScreen(
                workspaceId = workspaceId,
                onBackToWorkspaces = {
                    navController.navigate("workspaces") {
                        popUpTo("workspaces") { inclusive = true }
                    }
                },
                onLogout = {
                    TokenManager(context).clearToken()
                    navController.navigate("login") {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }
    }
}
