package com.bronotek.edapex.run

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

/**
 * The five channels, created once and owned here.
 *
 * The ids are a contract with `packages/host` — a notification posted from Rust or from the
 * server names one of these, and a channel that does not exist silently falls back to the
 * default, which is how an approval ends up sharing a toggle with a routine.
 */
object EdApexNotifications {
    const val RUN = "run"
    const val APPROVAL = "approval"
    const val DONE = "done"
    const val ROUTINE = "routine"
    const val SCHOOL = "school"

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return

        manager.createNotificationChannel(
            NotificationChannel(RUN, "Work in progress", NotificationManager.IMPORTANCE_LOW).apply {
                description = "An agent run that is still working. Silent, and it cannot be dismissed while it runs."
                setShowBadge(false)
            }
        )
        manager.createNotificationChannel(
            NotificationChannel(APPROVAL, "Needs your approval", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "An action is waiting for you to allow or deny it."
                enableVibration(true)
            }
        )
        manager.createNotificationChannel(
            NotificationChannel(DONE, "Finished", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "A run completed or failed."
            }
        )
        manager.createNotificationChannel(
            NotificationChannel(ROUTINE, "Routines", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "A routine came due."
            }
        )
        manager.createNotificationChannel(
            NotificationChannel(SCHOOL, "School updates", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Marks published, results ready, and other changes to your school."
            }
        )
    }
}
