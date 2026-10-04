package com.taskflowai.taskflowai.presentation.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.taskflowai.taskflowai.presentation.ui.login.LoginScreen
import com.taskflowai.taskflowai.presentation.ui.tasks.TaskScreen

sealed class Screen(val route: String) {
    object Login : Screen("login")
    object Tasks : Screen("tasks")
}

@Composable
fun AppNavGraph() {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = Screen.Login.route) {
        composable(Screen.Login.route) {
            LoginScreen(
                onLoginSuccess = { token ->
                    // Başarılı giriş sonrası Task ekranına git ve geri dönüşü engelle (popUpTo)
                    navController.navigate(Screen.Tasks.route) {
                        popUpTo(Screen.Login.route) { inclusive = true }
                    }
                }
            )
        }
        composable(Screen.Tasks.route) {
            TaskScreen()
        }
    }
}