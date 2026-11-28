package com.taskflowai.taskflowai.presentation.navigation

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.taskflowai.taskflowai.data.local.TokenManager
import com.taskflowai.taskflowai.data.remote.ApiClient
import com.taskflowai.taskflowai.data.remote.RefreshTokenRequest
import com.taskflowai.taskflowai.presentation.ui.login.LoginScreen
import com.taskflowai.taskflowai.presentation.ui.tasks.CreateTaskScreen
import com.taskflowai.taskflowai.presentation.ui.tasks.TaskDetailScreen
import com.taskflowai.taskflowai.presentation.ui.tasks.TaskScreen
import com.taskflowai.taskflowai.presentation.ui.workspaces.WorkspaceSelectionScreen
import kotlinx.coroutines.launch

private const val CHANGED = "changed"

/** Returns to the previous screen and tells it whether data changed. */
private fun NavHostController.back(changed: Boolean) {
    if (changed) previousBackStackEntry?.savedStateHandle?.set(CHANGED, true)
    popBackStack()
}

@Composable
fun AppNavGraph() {
    val navController = rememberNavController()
    val context = LocalContext.current.applicationContext
    val scope = rememberCoroutineScope()
    // A stored session survives app restarts; expired tokens are refreshed on use.
    val start = remember { if (TokenManager(context).getSession() != null) "workspaces" else "login" }

    val logout: () -> Unit = {
        val tokenManager = TokenManager(context)
        val refreshToken = tokenManager.getRefreshToken()
        tokenManager.clearToken()
        if (!refreshToken.isNullOrBlank()) {
            scope.launch { runCatching { ApiClient.retrofitService.logout(RefreshTokenRequest(refreshToken)) } }
        }
        navController.navigate("login") { popUpTo(0) { inclusive = true } }
    }

    NavHost(navController = navController, startDestination = start) {
        composable("login") {
            LoginScreen(onLoginSuccess = {
                navController.navigate("workspaces") { popUpTo("login") { inclusive = true } }
            })
        }
        composable("workspaces") {
            WorkspaceSelectionScreen(
                onWorkspaceSelected = { ws ->
                    navController.navigate("board/${ws.id}?name=${Uri.encode(ws.name)}&role=${ws.role}")
                },
                onLogout = logout,
            )
        }
        composable(
            "board/{workspaceId}?name={name}&role={role}",
            arguments = listOf(
                navArgument("name") { type = NavType.StringType; defaultValue = "" },
                navArgument("role") { type = NavType.StringType; defaultValue = "VIEWER" },
            ),
        ) { entry ->
            val workspaceId = entry.arguments?.getString("workspaceId").orEmpty()
            val role = entry.arguments?.getString("role") ?: "VIEWER"
            val changed by entry.savedStateHandle.getStateFlow(CHANGED, false).collectAsState()
            val canEdit = role != "VIEWER"
            val canManage = role == "OWNER" || role == "ADMIN"
            TaskScreen(
                workspaceId = workspaceId,
                workspaceName = entry.arguments?.getString("name").orEmpty(),
                canEdit = canEdit,
                changed = changed,
                onChangeHandled = { entry.savedStateHandle[CHANGED] = false },
                onOpenTask = { taskId -> navController.navigate("task/$workspaceId/$taskId?edit=$canEdit&manage=$canManage") },
                onCreateTask = { projectId -> navController.navigate("newtask/$workspaceId/$projectId") },
                onBackToWorkspaces = { navController.popBackStack() },
            )
        }
        composable(
            "task/{workspaceId}/{taskId}?edit={edit}&manage={manage}",
            arguments = listOf(
                navArgument("edit") { type = NavType.BoolType; defaultValue = false },
                navArgument("manage") { type = NavType.BoolType; defaultValue = false },
            ),
        ) { entry ->
            TaskDetailScreen(
                workspaceId = entry.arguments?.getString("workspaceId").orEmpty(),
                taskId = entry.arguments?.getString("taskId").orEmpty(),
                canEdit = entry.arguments?.getBoolean("edit") ?: false,
                canManageComments = entry.arguments?.getBoolean("manage") ?: false,
                onBack = navController::back,
            )
        }
        composable("newtask/{workspaceId}/{projectId}") { entry ->
            CreateTaskScreen(
                workspaceId = entry.arguments?.getString("workspaceId").orEmpty(),
                projectId = entry.arguments?.getString("projectId").orEmpty(),
                onClose = navController::back,
            )
        }
    }
}
