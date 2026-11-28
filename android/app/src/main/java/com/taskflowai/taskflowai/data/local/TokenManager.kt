package com.taskflowai.taskflowai.data.local

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

data class AuthSession(
    val accessToken: String,
    val refreshToken: String,
    val userId: String,
)

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

    fun saveSession(accessToken: String, refreshToken: String, userId: String) {
        require(accessToken.isNotBlank()) { "Access token must not be blank." }
        require(refreshToken.isNotBlank()) { "Refresh token must not be blank." }
        require(userId.isNotBlank()) { "User ID must not be blank." }
        sharedPreferences.edit()
            .putString("access_token", accessToken)
            .putString("refresh_token", refreshToken)
            .putString("user_id", userId)
            .apply()
    }

    fun getSession(): AuthSession? {
        val accessToken = sharedPreferences.getString("access_token", null)
        val refreshToken = sharedPreferences.getString("refresh_token", null)
        val userId = sharedPreferences.getString("user_id", null)
        return if (!accessToken.isNullOrBlank() &&
            !refreshToken.isNullOrBlank() &&
            !userId.isNullOrBlank()
        ) {
            AuthSession(accessToken, refreshToken, userId)
        } else {
            null
        }
    }

    fun getToken(): String? = getSession()?.accessToken
    fun getRefreshToken(): String? = getSession()?.refreshToken
    fun getUserId(): String? = getSession()?.userId

    fun clearToken() {
        sharedPreferences.edit()
            .remove("access_token")
            .remove("refresh_token")
            .remove("user_id")
            .apply()
    }
}
