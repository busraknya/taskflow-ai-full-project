package com.taskflowai.taskflowai.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "pending_operations")
data class PendingOperationEntity(
    @PrimaryKey val id: String,             // Client-side üretilen UUID
    val workspaceId: String,
    val entityType: String,                 // Örn: "TASK"
    val entityId: String,
    val operationType: String,              // Örn: "UPDATE_STATUS"
    val payloadJson: String,                // Güncellenen verinin JSON hali
    val createdAt: Long,
    val retryCount: Int = 0,
    val state: String = "PENDING"           // "PENDING", "IN_FLIGHT", "FAILED_RETRYABLE"
)