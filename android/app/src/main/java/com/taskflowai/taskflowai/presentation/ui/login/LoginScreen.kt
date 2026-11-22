package com.taskflowai.taskflowai.presentation.ui.login

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.taskflowai.taskflowai.data.local.TokenManager
import com.taskflowai.taskflowai.data.local.AppDatabase
import com.taskflowai.taskflowai.sync.SyncScheduler

@Composable
fun LoginScreen(
    viewModel: LoginViewModel = viewModel(),
    onLoginSuccess: (String) -> Unit
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    val state = viewModel.uiState
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    Box(
        modifier = Modifier.fillMaxSize().background(Color(0xFF09090B)),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("TaskFlow AI", color = Color.White, fontSize = 24.sp,
                style = MaterialTheme.typography.headlineMedium)
            Spacer(modifier = Modifier.height(8.dp))
            Text("Sign in to your workspace.", color = Color(0xFFA1A1AA), fontSize = 14.sp)
            Spacer(modifier = Modifier.height(32.dp))

            OutlinedTextField(
                value = email, onValueChange = { email = it },
                label = { Text("Email address") }, modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Color.White, unfocusedBorderColor = Color(0xFF27272A),
                    focusedLabelColor = Color.White, unfocusedLabelColor = Color(0xFFA1A1AA),
                    focusedTextColor = Color.White, unfocusedTextColor = Color.White
                )
            )
            Spacer(modifier = Modifier.height(16.dp))
            OutlinedTextField(
                value = password, onValueChange = { password = it },
                label = { Text("Password") }, modifier = Modifier.fillMaxWidth(),
                singleLine = true, visualTransformation = PasswordVisualTransformation(),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Color.White, unfocusedBorderColor = Color(0xFF27272A),
                    focusedLabelColor = Color.White, unfocusedLabelColor = Color(0xFFA1A1AA),
                    focusedTextColor = Color.White, unfocusedTextColor = Color.White
                )
            )
            Spacer(modifier = Modifier.height(24.dp))
            Button(
                onClick = {
                    viewModel.login(email, password) { token, refreshToken, userId ->
                        TokenManager(context).saveSession(token, refreshToken, userId)
                        scope.launch {
                            AppDatabase.getDatabase(context).operationDao()
                                .requeueBlockedOperations(userId)
                            SyncScheduler.enqueue(context)
                        }
                        onLoginSuccess(token)
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = Color.White),
                shape = MaterialTheme.shapes.small
            ) {
                if (state is LoginState.Loading) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Color.Black)
                } else {
                    Text("Sign in", color = Color.Black)
                }
            }
            if (state is LoginState.Error) {
                Spacer(modifier = Modifier.height(16.dp))
                Text(state.message, color = Color(0xFFEF4444), fontSize = 12.sp)
            }
        }
    }
}
