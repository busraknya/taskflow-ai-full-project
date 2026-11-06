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
                    // Token kullanıldı, workspaces ekranına yönlendir ve login'i stack'ten temizle
                    navController.navigate("workspaces") {
                        popUpTo("login") { inclusive = true }
                    }
                }
            )
        }
        composable("workspaces") {
            WorkspaceSelectionScreen(
                onWorkspaceSelected = { wsId, _ ->
                    // Seçilen workspace ID'sini tasks ekranına argüman olarak geçir
                    navController.navigate("tasks/$wsId")
                }
            )
        }
        composable("tasks/{workspaceId}") { backStackEntry ->
            val workspaceId = backStackEntry.arguments?.getString("workspaceId") ?: ""
            TaskScreen(workspaceId = workspaceId)
        }
    }
}
