package com.taskflowai.taskflowai.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

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

    @Query("DELETE FROM pending_operations WHERE id = :id")
    suspend fun deleteOperation(id: String): Int
}