package com.taskflowai.taskflowai.presentation.ui.login

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.taskflowai.taskflowai.data.remote.ApiClient
import com.taskflowai.taskflowai.data.remote.LoginRequest
import com.taskflowai.taskflowai.data.remote.RegisterRequest
import com.taskflowai.taskflowai.data.remote.errorMessage
import kotlinx.coroutines.launch

sealed class LoginState {
    object Idle : LoginState()
    object Loading : LoginState()
    data class Success(val token: String) : LoginState()
    data class Error(val message: String) : LoginState()
}

/** Sign-in and sign-up; a new account is signed in right away. */
class LoginViewModel : ViewModel() {
    var uiState: LoginState by mutableStateOf(LoginState.Idle)
        private set

    fun login(
        email: String,
        pass: String,
        onTokenReceived: (String, String, String) -> Unit,
    ) {
        viewModelScope.launch {
            uiState = LoginState.Loading
            uiState = signIn(email, pass, onTokenReceived)
        }
    }

    fun register(
        fullName: String,
        email: String,
        pass: String,
        onTokenReceived: (String, String, String) -> Unit,
    ) {
        viewModelScope.launch {
            uiState = LoginState.Loading
            uiState = try {
                val response = ApiClient.retrofitService.register(RegisterRequest(fullName.trim(), email.trim(), pass))
                if (response.isSuccessful) {
                    signIn(email, pass, onTokenReceived)
                } else {
                    LoginState.Error(response.errorMessage("Your account could not be created."))
                }
            } catch (e: Exception) {
                LoginState.Error(NETWORK_ERROR)
            }
        }
    }

    fun clearError() {
        if (uiState is LoginState.Error) uiState = LoginState.Idle
    }

    private suspend fun signIn(
        email: String,
        pass: String,
        onTokenReceived: (String, String, String) -> Unit,
    ): LoginState = try {
        val response = ApiClient.retrofitService.login(LoginRequest(email.trim(), pass))
        val body = response.body()
        if (response.isSuccessful && body != null && body.user.id.isNotBlank() && body.refreshToken.isNotBlank()) {
            onTokenReceived(body.accessToken, body.refreshToken, body.user.id)
            LoginState.Success(body.accessToken)
        } else {
            LoginState.Error(response.errorMessage("Invalid email or password."))
        }
    } catch (e: Exception) {
        LoginState.Error(NETWORK_ERROR)
    }

    private companion object {
        const val NETWORK_ERROR = "Cannot reach the server. Check your connection and try again."
    }
}
