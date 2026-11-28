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

data class MemberUserDto(val id: String, val fullName: String?, val email: String)

data class MemberDto(
    val id: String,
    val role: String,
    val status: String,
    val user: MemberUserDto
)

interface WorkspaceApiService {
    @GET("workspaces")
    suspend fun getWorkspaces(): Response<List<WorkspaceDto>>

    @GET("workspaces/{workspaceId}/projects")
    suspend fun getProjects(
        @Path("workspaceId") workspaceId: String
    ): Response<List<ProjectDto>>

    @GET("workspaces/{workspaceId}/members")
    suspend fun getMembers(
        @Path("workspaceId") workspaceId: String
    ): Response<List<MemberDto>>
}