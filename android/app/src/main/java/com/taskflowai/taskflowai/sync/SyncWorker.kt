package com.taskflowai.taskflowai.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.google.gson.JsonParser
import com.taskflowai.taskflowai.data.local.AppDatabase
import com.taskflowai.taskflowai.data.local.TokenManager
import com.taskflowai.taskflowai.data.remote.ApiClient
import com.taskflowai.taskflowai.data.remote.UpdateTaskRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class SyncWorker(
    appContext: Context,
    workerParams: WorkerParameters,
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val session = TokenManager(applicationContext).getSession() ?: return@withContext Result.success()
        val dao = AppDatabase.getDatabase(applicationContext).operationDao()
        val pendingOperations = dao.getPendingOperations(session.userId)

        for (operation in pendingOperations) {
            if (operation.ownerUserId != session.userId) continue

            if (operation.entityType != "TASK" || operation.operationType != "UPDATE_STATUS") {
                dao.updateOperationState(operation.id, session.userId, "FAILED")
                continue
            }

            val payload = try {
                JsonParser().parse(operation.payloadJson).asJsonObject
            } catch (_: Exception) {
                dao.updateOperationState(operation.id, session.userId, "FAILED")
                continue
            }

            val status = payload.get("status")?.takeUnless { it.isJsonNull() }?.getAsString()
            val version = payload.get("version")?.takeUnless { it.isJsonNull() }?.getAsInt()
            if (status.isNullOrBlank() || version == null) {
                dao.updateOperationState(operation.id, session.userId, "FAILED")
                continue
            }

            try {
                val response = ApiClient.taskService.updateTaskStatus(
                    workspaceId = operation.workspaceId,
                    taskId = operation.entityId,
                    request = UpdateTaskRequest(status = status, version = version),
                    authorization = "Bearer ${session.accessToken}",
                )
                when {
                    response.isSuccessful -> dao.deleteOperation(operation.id, session.userId)
                    response.code() == 401 ->
                        dao.updateOperationState(operation.id, session.userId, "BLOCKED_AUTH")
                    response.code() == 403 ->
                        dao.updateOperationState(operation.id, session.userId, "FAILED")
                    response.code() == 409 ->
                        dao.updateOperationState(operation.id, session.userId, "CONFLICT")
                    response.code() == 408 || response.code() == 429 || response.code() >= 500 ->
                        return@withContext Result.retry()
                    else -> dao.updateOperationState(operation.id, session.userId, "FAILED")
                }
            } catch (_: Exception) {
                return@withContext Result.retry()
            }
        }
        Result.success()
    }
}
