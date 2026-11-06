package com.taskflowai.taskflowai.data.remote

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.Path
import retrofit2.http.Query

interface TaskApiService {
    @GET("workspaces/{workspaceId}/tasks")
    suspend fun getTasks(
        @Path("workspaceId") workspaceId: String,
        @Query("projectId") projectId: String? = null
    ): Response<List<TaskDto>>

    @PATCH("workspaces/{workspaceId}/tasks/{taskId}")
    suspend fun updateTaskStatus(
        @Path("workspaceId") workspaceId: String,
        @Path("taskId") taskId: String,
        @Body request: UpdateTaskRequest
    ): Response<TaskDto>
}