package com.taskflowai.taskflowai.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "pending_operations")
data class PendingOperationEntity(
    @PrimaryKey val id: String,
    val workspaceId: String,
    val entityType: String,
    val entityId: String,
    val operationType: String,
    val payloadJson: String,
    val createdAt: Long,
    val retryCount: Int = 0,
    // PENDING, BLOCKED_AUTH, CONFLICT or FAILED
    val state: String = "PENDING"
)
