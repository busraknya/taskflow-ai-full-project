package com.taskflowai.taskflowai.data.local

import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class OperationDaoTest {
    private lateinit var database: AppDatabase
    private lateinit var dao: OperationDao

    @Before
    fun setUp() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        database = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        dao = database.operationDao()
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun replacingPendingStatusUpdateKeepsOnlyLatestForTaskAndAccount() = runBlocking {
        dao.insertOperation(operation(id = "first", status = "IN_PROGRESS"))
        dao.replacePendingTaskStatusOperation(operation(id = "second", status = "DONE"))

        val pending = dao.getPendingOperations("user-1")
        assertEquals(1, pending.size)
        assertEquals("second", pending.single().id)
        assertEquals("{\"status\":\"DONE\",\"version\":1}", pending.single().payloadJson)
    }

    @Test
    fun sameTaskOperationsFromDifferentAccountsRemainIsolated() = runBlocking {
        dao.insertOperation(operation(id = "user-1-op", status = "IN_PROGRESS", ownerUserId = "user-1"))
        dao.insertOperation(operation(id = "user-2-op", status = "DONE", ownerUserId = "user-2"))

        assertEquals(listOf("user-1-op"), dao.getPendingOperations("user-1").map { it.id })
        assertEquals(listOf("user-2-op"), dao.getPendingOperations("user-2").map { it.id })

        dao.replacePendingTaskStatusOperation(
            operation(id = "user-1-latest", status = "DONE", ownerUserId = "user-1")
        )

        assertEquals(listOf("user-1-latest"), dao.getPendingOperations("user-1").map { it.id })
        assertEquals(listOf("user-2-op"), dao.getPendingOperations("user-2").map { it.id })
    }

    @Test
    fun newStatusUpdateReplacesOperationBlockedByExpiredSessionForSameAccount() = runBlocking {
        dao.insertOperation(operation(id = "blocked", status = "IN_PROGRESS"))
        dao.updateOperationState("blocked", "user-1", "BLOCKED_AUTH")
        dao.replacePendingTaskStatusOperation(operation(id = "latest", status = "DONE"))

        val pending = dao.getPendingOperations("user-1")
        assertEquals(1, pending.size)
        assertEquals("latest", pending.single().id)
    }

    @Test
    fun blockedOperationCanBeRequeuedOnlyForItsAccount() = runBlocking {
        dao.insertOperation(operation(id = "user-1-blocked", status = "DONE", ownerUserId = "user-1"))
        dao.insertOperation(operation(id = "user-2-blocked", status = "DONE", ownerUserId = "user-2"))
        dao.updateOperationState("user-1-blocked", "user-1", "BLOCKED_AUTH")
        dao.updateOperationState("user-2-blocked", "user-2", "BLOCKED_AUTH")

        assertTrue(dao.getPendingOperations("user-1").isEmpty())
        dao.requeueBlockedOperations("user-1")

        assertEquals(listOf("user-1-blocked"), dao.getPendingOperations("user-1").map { it.id })
        assertTrue(dao.getPendingOperations("user-2").isEmpty())
    }

    private fun operation(
        id: String,
        status: String,
        ownerUserId: String = "user-1"
    ) = PendingOperationEntity(
        id = id,
        ownerUserId = ownerUserId,
        workspaceId = "workspace-1",
        entityType = "TASK",
        entityId = "task-1",
        operationType = "UPDATE_STATUS",
        payloadJson = """{"status":"$status","version":1}""",
        createdAt = 1L,
    )
}
