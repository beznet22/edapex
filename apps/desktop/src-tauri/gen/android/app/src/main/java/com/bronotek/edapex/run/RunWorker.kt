package com.bronotek.edapex.run

import android.content.Context
import android.util.Log
import androidx.work.Worker
import androidx.work.WorkerParameters

/**
 * Resumes unfinished runs with no UI at all.
 *
 * WorkManager is the durable scheduler: it survives the app being killed and the phone being
 * rebooted, which is the half of "it finishes" a foreground service cannot provide on its own.
 */
class RunWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        val finished = RunBridge.resume(applicationContext)
        if (finished == AUTH_REQUIRED) {
            // Signed out: there is nothing a worker could safely resume.
            Log.i(TAG, "no session; nothing to resume")
            return Result.success()
        }
        if (finished < 0) {
            Log.w(TAG, "resume failed with $finished; WorkManager will back off and retry")
            return Result.retry()
        }
        Log.i(TAG, "resumed and finished $finished run(s)")
        return Result.success()
    }

    private companion object {
        const val TAG = "EdApexRun"
        const val AUTH_REQUIRED = -4
    }
}
