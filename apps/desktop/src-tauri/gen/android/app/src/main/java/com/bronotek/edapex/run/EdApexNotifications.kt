package com.bronotek.edapex.run

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.bronotek.edapex.MainActivity
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

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

    private const val APPROVAL_TAG = "approval"

    /**
     * Asks a person to allow or deny, from a worker with no UI.
     *
     * Copy comes from Rust, which has the tool name and the risk; this only lays out the two
     * actions. Tapping the body opens `edapex://approval/<id>` so the surface can show the same
     * request with its context.
     */
    fun postApproval(context: Context, approvalId: String, title: String, body: String) {
        ensureChannels(context)
        val manager = NotificationManagerCompat.from(context)
        if (!manager.areNotificationsEnabled()) return

        val open = Intent(context, MainActivity::class.java).apply {
            data = Uri.parse("edapex://approval/$approvalId")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val content = PendingIntent.getActivity(
            context,
            approvalId.hashCode(),
            open,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val notification = NotificationCompat.Builder(context, APPROVAL)
            .setSmallIcon(context.applicationInfo.icon)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(false)
            .setOngoing(true)
            .setContentIntent(content)
            .addAction(0, "Deny", ApprovalActionReceiver.intent(context, approvalId, false))
            .addAction(0, "Allow", ApprovalActionReceiver.intent(context, approvalId, true))
            .build()
        manager.notify(APPROVAL_TAG, approvalId.hashCode(), notification)
    }

    fun clearApproval(context: Context, approvalId: String) {
        NotificationManagerCompat.from(context).cancel(APPROVAL_TAG, approvalId.hashCode())
    }

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
