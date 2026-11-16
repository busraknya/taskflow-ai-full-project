package com.taskflowai.taskflowai.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction

@Dao
interface OperationDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOperation(operation: PendingOperationEntity): Long

    @Query("""
        SELECT * FROM pending_operations
        WHERE state = 'PENDING'
        ORDER BY createdAt ASC
    """)
    suspend fun getPendingOperations(): List<PendingOperationEntity>

    @Query("""
        DELETE FROM pending_operations
        WHERE workspaceId = :workspaceId
          AND entityId = :taskId
          AND entityType = 'TASK'
          AND operationType = 'UPDATE_STATUS'
          AND state IN ('PENDING', 'BLOCKED_AUTH')
    """)
    suspend fun deletePendingTaskStatusOperations(workspaceId: String, taskId: String): Int

    @Transaction
    suspend fun replacePendingTaskStatusOperation(operation: PendingOperationEntity) {
        deletePendingTaskStatusOperations(operation.workspaceId, operation.entityId)
        insertOperation(operation)
    }

    @Query("UPDATE pending_operations SET state = :state WHERE id = :id")
    suspend fun updateOperationState(id: String, state: String): Int

    @Query("UPDATE pending_operations SET state = 'PENDING' WHERE state = 'BLOCKED_AUTH'")
    suspend fun requeueBlockedOperations(): Int

    @Query("DELETE FROM pending_operations WHERE id = :id")
    suspend fun deleteOperation(id: String): Int
}
