package com.taskflowai.taskflowai.data.local

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

data class AuthSession(val accessToken: String, val userId: String)

class TokenManager(context: Context) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val sharedPreferences = EncryptedSharedPreferences.create(
        context,
        "secure_token_prefs",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    fun saveSession(token: String, userId: String) {
        require(token.isNotBlank()) { "Access token must not be blank." }
        require(userId.isNotBlank()) { "User ID must not be blank." }
        sharedPreferences.edit()
            .putString("access_token", token)
            .putString("user_id", userId)
            .apply()
    }

    fun getSession(): AuthSession? {
        val token = sharedPreferences.getString("access_token", null)
        val userId = sharedPreferences.getString("user_id", null)
        return if (!token.isNullOrBlank() && !userId.isNullOrBlank()) {
            AuthSession(token, userId)
        } else {
            null
        }
    }

    fun getToken(): String? = getSession()?.accessToken

    fun getUserId(): String? = getSession()?.userId

    @Deprecated("Use saveSession so the token is always bound to an account.")
    fun saveToken(token: String) {
        sharedPreferences.edit().putString("access_token", token).remove("user_id").apply()
    }

    fun clearToken() {
        sharedPreferences.edit()
            .remove("access_token")
            .remove("user_id")
            .apply()
    }
}
