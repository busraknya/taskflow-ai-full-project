package com.taskflowai.taskflowai.data.remote

import android.content.Context
import com.taskflowai.taskflowai.BuildConfig
import com.taskflowai.taskflowai.data.local.TokenManager
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object ApiClient {
    private val baseUrl = BuildConfig.API_BASE_URL.also {
        require(it.endsWith("/")) { "API_BASE_URL must end with '/'" }
    }
    private lateinit var tokenManager: TokenManager

    fun init(context: Context) {
        tokenManager = TokenManager(context.applicationContext)
    }

    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        redactHeader("Authorization")
        redactHeader("Cookie")
        level = if (BuildConfig.DEBUG) {
            HttpLoggingInterceptor.Level.BASIC
        } else {
            HttpLoggingInterceptor.Level.NONE
        }
    }

    private val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .addInterceptor { chain ->
                val originalRequest = chain.request()
                val requestWithAuth = if (originalRequest.header("Authorization") == null) {
                    val token = if (::tokenManager.isInitialized) tokenManager.getToken() else null
                    if (!token.isNullOrEmpty()) {
                        originalRequest.newBuilder()
                            .header("Authorization", "Bearer $token")
                            .build()
                    } else {
                        originalRequest
                    }
                } else {
                    originalRequest
                }
                chain.proceed(requestWithAuth)
            }
            .addInterceptor(loggingInterceptor)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    val retrofitService: AuthApiService by lazy {
        Retrofit.Builder().baseUrl(baseUrl).client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build().create(AuthApiService::class.java)
    }

    val taskService: TaskApiService by lazy {
        Retrofit.Builder().baseUrl(baseUrl).client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build().create(TaskApiService::class.java)
    }

    val workspaceService: WorkspaceApiService by lazy {
        Retrofit.Builder().baseUrl(baseUrl).client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build().create(WorkspaceApiService::class.java)
    }
}
