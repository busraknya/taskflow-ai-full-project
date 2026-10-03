package com.taskflowai.taskflowai.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.taskflowai.taskflowai.data.local.AppDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class SyncWorker(appContext: Context, workerParams: WorkerParameters) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val db = AppDatabase.getDatabase(applicationContext)
        val dao = db.operationDao()

        val pendingOps = dao.getPendingOperations()
        if (pendingOps.isEmpty()) return@withContext Result.success()

        for (op in pendingOps) {
            try {
                // Şimdilik sadece Task status güncelleme simülasyonu
                // Gerçek projede operationType ve payloadJson parse edilerek Retrofit ile backend'e atılır.
                if (op.operationType == "UPDATE_STATUS") {
                    // val response = ApiClient.retrofitService.updateTaskStatus(...)
                    // Başarılı olursa kuyruktan sil:
                    dao.deleteOperation(op.id)
                }
            } catch (e: Exception) {
                // Ağ hatası durumunda döngü durur, WorkManager exponential backoff ile tekrar dener
                return@withContext Result.retry()
            }
        }

        Result.success()
    }
}