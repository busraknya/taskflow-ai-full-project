package com.taskflowai.taskflowai.presentation.ui.login

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.taskflowai.taskflowai.data.local.AppDatabase
import com.taskflowai.taskflowai.data.local.TokenManager
import com.taskflowai.taskflowai.presentation.ui.components.Banner
import com.taskflowai.taskflowai.presentation.ui.components.FormField
import com.taskflowai.taskflowai.presentation.ui.components.GhostButton
import com.taskflowai.taskflowai.presentation.ui.components.PrimaryButton
import com.taskflowai.taskflowai.presentation.ui.components.cardSurface
import com.taskflowai.taskflowai.presentation.ui.theme.Taskflow
import com.taskflowai.taskflowai.sync.SyncScheduler
import kotlinx.coroutines.launch

/** Sign in, or create an account when [registering] is true. */
@Composable
fun LoginScreen(
    viewModel: LoginViewModel = viewModel(),
    onLoginSuccess: (String) -> Unit,
) {
    var registering by rememberSaveable { mutableStateOf(false) }
    var fullName by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    val state = viewModel.uiState
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val c = Taskflow.colors

    val onSession: (String, String, String) -> Unit = { token, refreshToken, userId ->
        TokenManager(context).saveSession(token, refreshToken, userId)
        scope.launch {
            AppDatabase.getDatabase(context).operationDao().requeueBlockedOperations(userId)
            SyncScheduler.enqueue(context)
        }
        onLoginSuccess(token)
    }
    val submit = {
        if (registering) viewModel.register(fullName, email, password, onSession) else viewModel.login(email, password, onSession)
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(c.canvas)
            .systemBarsPadding()
            .imePadding(),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier
                .widthIn(max = 420.dp)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 32.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            BrandRow()
            Column(
                Modifier
                    .fillMaxWidth()
                    .cardSurface(c, MaterialTheme.shapes.medium)
                    .padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(if (registering) "Create your account" else "Sign in", style = MaterialTheme.typography.titleLarge, color = c.fg)
                    Text(
                        if (registering) "You can join a workspace right after." else "Welcome back. Sign in to your workspaces.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = c.fgMuted,
                    )
                }
                Banner((state as? LoginState.Error)?.message)
                if (registering) {
                    FormField("Full name", fullName, { fullName = it }, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next))
                }
                FormField(
                    "Email", email, { email = it },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                )
                FormField(
                    "Password", password, { password = it },
                    hint = if (registering) "At least 8 characters, including a number." else null,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                )
                PrimaryButton(
                    text = if (registering) "Create account" else "Sign in",
                    onClick = submit,
                    loading = state is LoginState.Loading,
                    enabled = email.isNotBlank() && password.isNotBlank() && (!registering || fullName.isNotBlank()),
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                )
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                Text(if (registering) "Already have an account?" else "New to TaskFlow?", style = MaterialTheme.typography.bodyMedium, color = c.fgMuted)
                GhostButton(if (registering) "Sign in" else "Create an account", onClick = {
                    registering = !registering
                    viewModel.clearError()
                })
            }
        }
    }
}

/** The TaskFlow mark (a narrowing task list) and name, as on the web. */
@Composable
fun BrandRow() {
    val c = Taskflow.colors
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier
                .size(24.dp)
                .drawBehind {
                    drawRoundRect(c.accent, cornerRadius = CornerRadius(6.dp.toPx()))
                    val stroke = 2.dp.toPx()
                    val left = 7.dp.toPx()
                    listOf(8f to 17f, 12f to 14f, 16f to 11f).forEach { (y, right) ->
                        drawLine(c.accentFg, Offset(left, y.dp.toPx()), Offset(right.dp.toPx(), y.dp.toPx()), stroke, StrokeCap.Round)
                    }
                },
        )
        Spacer(Modifier.size(8.dp))
        Text("TaskFlow AI", style = MaterialTheme.typography.titleMedium, color = c.fg)
    }
}
