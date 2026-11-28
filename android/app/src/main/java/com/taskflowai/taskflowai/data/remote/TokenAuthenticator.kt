package com.taskflowai.taskflowai.data.remote

import com.taskflowai.taskflowai.BuildConfig
import com.taskflowai.taskflowai.data.local.TokenManager
import okhttp3.Authenticator
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.Route
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Refreshes an expired access token once after a 401 response.
 * A separate OkHttp client prevents the refresh request from recursively
 * invoking this authenticator.
 */
class TokenAuthenticator(
    private val tokenManager: TokenManager,
) : Authenticator {
    private val refreshLock = Any()
    private val refreshClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    override fun authenticate(route: Route?, response: Response): Request? {
        if (responseCount(response) >= 2) return null

        synchronized(refreshLock) {
            val session = tokenManager.getSession() ?: return null

            // Another request may already have refreshed the shared session.
            val requestToken = response.request.header("Authorization")
                ?.removePrefix("Bearer ")
            if (requestToken != session.accessToken) {
                return response.request.newBuilder()
                    .header("Authorization", "Bearer ${session.accessToken}")
                    .build()
            }

            return try {
                val json = JSONObject().put("refreshToken", session.refreshToken).toString()
                val request = Request.Builder()
                    .url(BuildConfig.API_BASE_URL + "auth/mobile/refresh")
                    .post(json.toRequestBody("application/json".toMediaType()))
                    .build()

                refreshClient.newCall(request).execute().use { refreshResponse ->
                    if (!refreshResponse.isSuccessful) {
                        // A rejected refresh token means the session cannot be renewed.
                        // Server errors and rate limits are temporary; keep the session
                        // so the user can retry when the service is available again.
                        if (refreshResponse.code == 401 || refreshResponse.code == 403) {
                            tokenManager.clearToken()
                        }
                        return null
                    }

                    val body = refreshResponse.body?.string()
                        ?: throw IOException("Empty refresh response")
                    val tokens = JSONObject(body)
                    val newAccessToken = tokens.getString("accessToken")
                    val newRefreshToken = tokens.getString("refreshToken")
                    tokenManager.saveSession(newAccessToken, newRefreshToken, session.userId)

                    response.request.newBuilder()
                        .header("Authorization", "Bearer $newAccessToken")
                        .build()
                }
            } catch (_: Exception) {
                // Network failures and malformed/transient responses must not erase
                // a potentially valid session. A later request can retry the refresh.
                null
            }
        }
    }

    private fun responseCount(response: Response): Int {
        var result = 1
        var prior = response.priorResponse
        while (prior != null) {
            result++
            prior = prior.priorResponse
        }
        return result
    }
}
