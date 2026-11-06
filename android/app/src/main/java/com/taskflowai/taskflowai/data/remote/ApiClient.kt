package com.taskflowai.taskflowai.data.remote

import android.content.Context
import com.taskflowai.taskflowai.data.local.TokenManager
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object ApiClient {
    private const val BASE_URL = "http://10.0.2.2:4000/api/v1/"
    private lateinit var tokenManager: TokenManager

    fun init(context: Context) {
        tokenManager = TokenManager(context)
    }

    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.HEADERS
    }

    // OkHttp Client içine AuthInterceptor'ı doğrudan bağlıyoruz!
    private val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .addInterceptor { chain ->
                val originalRequest = chain.request()
                // Eğer TokenManager başlatıldıysa token'ı al
                val token = if (::tokenManager.isInitialized) tokenManager.getToken() else null

                val requestWithAuth = if (!token.isNullOrEmpty()) {
                    originalRequest.newBuilder()
                        .header("Authorization", "Bearer $token")
                        .build()
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
        Retrofit.Builder().baseUrl(BASE_URL).client(client).addConverterFactory(GsonConverterFactory.create()).build().create(AuthApiService::class.java)
    }

    val taskService: TaskApiService by lazy {
        Retrofit.Builder().baseUrl(BASE_URL).client(client).addConverterFactory(GsonConverterFactory.create()).build().create(TaskApiService::class.java)
    }

    val workspaceService: WorkspaceApiService by lazy {
        Retrofit.Builder().baseUrl(BASE_URL).client(client).addConverterFactory(GsonConverterFactory.create()).build().create(WorkspaceApiService::class.java)
    }
}