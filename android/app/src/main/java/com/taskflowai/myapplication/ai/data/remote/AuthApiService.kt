package com.taskflowai.myapplication.ai.data.remote

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

data class LoginRequest(val email: String, val password: String)
data class UserResponse(val id: String, val email: String, val fullName: String)
data class LoginResponse(val accessToken: String, val user: UserResponse)

interface AuthApiService {
    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): Response<LoginResponse>
}