package com.bronotek.edapex

import android.content.Context
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * Keeps the resume job armed.
 *
 * Periodic rather than one-shot: WorkManager persists the request across a reboot and re-arms it
 * after it runs, so a run abandoned today is picked up after tonight's restart. The interval is
 * the platform's floor; `ExistingPeriodicWorkPolicy.KEEP` means every launch does not push the next
 * attempt further out.
 */
object RunScheduler {
    private const val WORK = "edapex-run-resume"

    fun ensureScheduled(context: Context) {
        val workManager = WorkManager.getInstance(context)
        // Immediately on launch: a person reopening the app is the strongest signal that a run
        // was interrupted, and waiting up to fifteen minutes for the backstop is a bad answer.
        // `KEEP` means a second launch while one is still pending does not queue another.
        workManager.enqueueUniqueWork(
            "$WORK-now",
            ExistingWorkPolicy.KEEP,
            OneTimeWorkRequestBuilder<RunWorker>().build()
        )
        // The backstop: persisted across a reboot, re-armed after every run, so an app that is
        // never opened again still picks the run up.
        val periodic = PeriodicWorkRequestBuilder<RunWorker>(15, TimeUnit.MINUTES).build()
        workManager.enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP, periodic)
    }
}
