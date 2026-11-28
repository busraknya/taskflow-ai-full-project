package com.taskflowai.taskflowai.data.remote

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface TaskApiService {
    @GET("workspaces/{workspaceId}/tasks")
    suspend fun getTasks(
        @Path("workspaceId") workspaceId: String,
        @Query("projectId") projectId: String? = null,
        @Query("status") status: String? = null,
        @Query("cursor") cursor: String? = null
    ): Response<TaskPageDto>

    @GET("workspaces/{workspaceId}/tasks/{taskId}")
    suspend fun getTask(
        @Path("workspaceId") workspaceId: String,
        @Path("taskId") taskId: String
    ): Response<TaskDetailDto>

    @POST("workspaces/{workspaceId}/tasks")
    suspend fun createTask(
        @Path("workspaceId") workspaceId: String,
        @Body request: CreateTaskRequest
    ): Response<TaskDto>

    @GET("workspaces/{workspaceId}/tasks/{taskId}/comments")
    suspend fun getComments(
        @Path("workspaceId") workspaceId: String,
        @Path("taskId") taskId: String
    ): Response<List<CommentDto>>

    @POST("workspaces/{workspaceId}/tasks/{taskId}/comments")
    suspend fun addComment(
        @Path("workspaceId") workspaceId: String,
        @Path("taskId") taskId: String,
        @Body request: CreateCommentRequest
    ): Response<CommentDto>

    @DELETE("workspaces/{workspaceId}/tasks/{taskId}/comments/{commentId}")
    suspend fun deleteComment(
        @Path("workspaceId") workspaceId: String,
        @Path("taskId") taskId: String,
        @Path("commentId") commentId: String
    ): Response<Unit>

    @GET("workspaces/{workspaceId}/risk-model")
    suspend fun getRiskModelStatus(
        @Path("workspaceId") workspaceId: String
    ): Response<RiskModelStatusDto>

    @PATCH("workspaces/{workspaceId}/tasks/{taskId}")
    suspend fun updateTaskStatus(
        @Path("workspaceId") workspaceId: String,
        @Path("taskId") taskId: String,
        @Body request: UpdateTaskRequest,
        @Header("Authorization") authorization: String? = null
    ): Response<TaskDto>
}
