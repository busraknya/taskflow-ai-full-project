package com.taskflowai.taskflowai.data.remote

import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Path

data class WorkspaceDto(
    val id: String,
    val name: String,
    val slug: String,
    val role: String
)

data class ProjectDto(
    val id: String,
    val name: String,
    val description: String?
)

interface WorkspaceApiService {
    @GET("workspaces")
    suspend fun getWorkspaces(): Response<List<WorkspaceDto>>

    @GET("workspaces/{workspaceId}/projects")
    suspend fun getProjects(
        @Path("workspaceId") workspaceId: String
    ): Response<List<ProjectDto>>
}