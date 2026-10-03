package com.taskflowai.taskflowai.presentation.ui.tasks

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.google.gson.Gson
import com.taskflowai.taskflowai.data.local.AppDatabase
import com.taskflowai.taskflowai.data.local.PendingOperationEntity
import com.taskflowai.taskflowai.sync.SyncWorker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.UUID

data class MobileTask(
    val id: String,
    val title: String,
    val status: String,
    val version: Int
)

class TaskViewModel(application: Application) : AndroidViewModel(application) {
    var tasks by mutableStateOf<List<MobileTask>>(emptyList())
        private set

    private val operationDao = AppDatabase.getDatabase(application).operationDao()

    init {
        // Test için başlangıç verisi (Gerçekte Retrofit ile backend'den çekilir)
        tasks = listOf(
            MobileTask("1", "Setup Android Project", "TODO", 0),
            MobileTask("2", "Implement Offline Sync", "IN_PROGRESS", 0)
        )
    }

    // Task Durum Güncelleme (Offline-First Prensibi - Master Invariant #4)
    fun updateTaskStatus(taskId: String, newStatus: String, currentVersion: Int) {
        viewModelScope.launch(Dispatchers.IO) {
            // 1. UI State'ini hemen güncelle (Optimistic Update)
            tasks = tasks.map { if (it.id == taskId) it.copy(status = newStatus) else it }

            try {
                // 2. Önce ağ üzerinden sunucuya gitmeyi dene (Retrofit PATCH)
                // val response = ApiClient.retrofitService.updateTask(...)
                // if (!response.isSuccessful) throw Exception("Network error")
            } catch (e: Exception) {
                // 3. Ağ hatası veya internet yoksa -> Room Kuyruğuna Ekle (Master Invariant #4)
                val operationId = UUID.randomUUID().toString()
                val payload = Gson().toJson(mapOf("status" to newStatus, "version" to currentVersion))

                val pendingOp = PendingOperationEntity(
                    id = operationId,
                    workspaceId = "dummy_ws_id",
                    entityType = "TASK",
                    entityId = taskId,
                    operationType = "UPDATE_STATUS",
                    payloadJson = payload,
                    createdAt = System.currentTimeMillis()
                )
                operationDao.insertOperation(pendingOp)

                // 4. WorkManager'a "İnternet gelince bu işi senkronize et" emri ver
                val constraints = Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()

                val syncRequest = OneTimeWorkRequestBuilder<SyncWorker>()
                    .setConstraints(constraints)
                    .build()

                WorkManager.getInstance(getApplication()).enqueue(syncRequest)
            }
        }
    }
}