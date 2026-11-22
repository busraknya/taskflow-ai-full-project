package com.taskflowai.taskflowai.data.remote

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

data class LoginRequest(val email: String, val password: String)
data class RefreshTokenRequest(val refreshToken: String)
data class UserResponse(val id: String, val email: String, val fullName: String)
data class LoginResponse(
    val accessToken: String,
    val refreshToken: String,
    val user: UserResponse,
)
data class TokenPairResponse(val accessToken: String, val refreshToken: String)

interface AuthApiService {
    @POST("auth/mobile/login")
    suspend fun login(@Body request: LoginRequest): Response<LoginResponse>

    @POST("auth/mobile/refresh")
    suspend fun refresh(@Body request: RefreshTokenRequest): Response<TokenPairResponse>

    @POST("auth/mobile/logout")
    suspend fun logout(@Body request: RefreshTokenRequest): Response<Unit>
}
