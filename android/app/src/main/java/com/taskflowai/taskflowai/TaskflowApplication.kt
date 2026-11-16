package com.taskflowai.taskflowai

import android.app.Application
import com.taskflowai.taskflowai.data.remote.ApiClient
import com.taskflowai.taskflowai.sync.SyncScheduler

class TaskflowApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        ApiClient.init(this)
        SyncScheduler.enqueue(this)
    }
}
