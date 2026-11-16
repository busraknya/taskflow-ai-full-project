package com.taskflowai.taskflowai

import android.app.Application
import com.taskflowai.taskflowai.data.remote.ApiClient

class TaskflowApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        ApiClient.init(this)
    }
}
