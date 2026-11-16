package com.taskflowai.taskflowai.data.local

import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
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
    fun replacingPendingStatusUpdateKeepsOnlyLatestForTask() = runBlocking {
        dao.insertOperation(operation(id = "first", status = "IN_PROGRESS"))
        dao.replacePendingTaskStatusOperation(operation(id = "second", status = "DONE"))

        val pending = dao.getPendingOperations()
        assertEquals(1, pending.size)
        assertEquals("second", pending.single().id)
        assertEquals("{\"status\":\"DONE\",\"version\":1}", pending.single().payloadJson)
    }

    @Test
    fun newStatusUpdateReplacesOperationBlockedByExpiredSession() = runBlocking {
        dao.insertOperation(operation(id = "blocked", status = "IN_PROGRESS"))
        dao.updateOperationState("blocked", "BLOCKED_AUTH")
        dao.replacePendingTaskStatusOperation(operation(id = "latest", status = "DONE"))

        val pending = dao.getPendingOperations()
        assertEquals(1, pending.size)
        assertEquals("latest", pending.single().id)
    }

    @Test
    fun blockedOperationCanBeRequeuedAfterAuthentication() = runBlocking {
        dao.insertOperation(operation(id = "blocked", status = "DONE"))
        dao.updateOperationState("blocked", "BLOCKED_AUTH")

        assertEquals(0, dao.getPendingOperations().size)

        dao.requeueBlockedOperations()

        assertEquals(1, dao.getPendingOperations().size)
    }

    private fun operation(id: String, status: String) = PendingOperationEntity(
        id = id,
        workspaceId = "workspace-1",
        entityType = "TASK",
        entityId = "task-1",
        operationType = "UPDATE_STATUS",
        payloadJson = """{"status":"$status","version":1}""",
        createdAt = 1L,
    )
}
