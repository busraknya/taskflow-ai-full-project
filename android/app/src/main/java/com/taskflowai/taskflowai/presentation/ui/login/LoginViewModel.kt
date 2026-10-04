package com.taskflowai.taskflowai.presentation.ui.login

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.taskflowai.taskflowai.data.remote.ApiClient
import com.taskflowai.taskflowai.data.remote.LoginRequest
import kotlinx.coroutines.launch

sealed class LoginState {
    object Idle : LoginState()
    object Loading : LoginState()
    data class Success(val token: String) : LoginState()
    data class Error(val message: String) : LoginState()
}

class LoginViewModel : ViewModel() {
    var uiState: LoginState by mutableStateOf(LoginState.Idle)
        private set

    fun login(email: String, pass: String, onTokenReceived: (String) -> Unit) {
        viewModelScope.launch {
            uiState = LoginState.Loading
            try {
                val response = ApiClient.retrofitService.login(LoginRequest(email, pass))
                if (response.isSuccessful && response.body() != null) {
                    val token = response.body()!!.accessToken
                    onTokenReceived(token) // Token'ı dışarıya (Activity/UI katmanına) bildir
                    uiState = LoginState.Success(token)
                } else {
                    uiState = LoginState.Error("Invalid email or password.")
                }
            } catch (e: Exception) {
                uiState = LoginState.Error(e.localizedMessage ?: "Network error occurred.")
            }
        }
    }
}