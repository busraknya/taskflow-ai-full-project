package com.taskflowai.taskflowai.presentation.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
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
                onWorkspaceSelected = { wsId, wsSlug ->
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
                    navController.navigate("login") {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }
    }
}
