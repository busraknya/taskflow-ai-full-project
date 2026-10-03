package com.taskflowai.taskflowai

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.ui.Modifier
import com.taskflowai.taskflowai.presentation.ui.login.LoginScreen
import com.taskflowai.taskflowai.presentation.ui.theme.TaskflowaiTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            TaskflowaiTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    Box(modifier = Modifier.padding(innerPadding).fillMaxSize()) {
                        LoginScreen(
                            onLoginSuccess = { token ->
                                // Başarılı giriş sonrası yapılacaklar
                            }
                        )
                    }
                }
            }
        }
    }
}
