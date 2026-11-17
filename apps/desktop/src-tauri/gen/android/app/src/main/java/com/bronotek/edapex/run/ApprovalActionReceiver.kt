package com.bronotek.edapex.run

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.bronotek.edapex.MainActivity
import android.net.Uri

/**
 * Allow and Deny, straight off the notification.
 *
 * The answer goes to the waiting turn first, because that is the only thing that keeps the run
 * alive; opening the app is for the case where there is nothing to answer — the process was
 * recycled, or the deadline passed — and a silent tap would otherwise look like a bug.
 */
class ApprovalActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val approvalId = intent.getStringExtra(EXTRA_ID) ?: return
        val allow = intent.getBooleanExtra(EXTRA_ALLOW, false)
        val answered = RunBridge.decide(approvalId, allow)
        EdApexNotifications.clearApproval(context, approvalId)
        if (!answered) {
            val expired = Intent(context, MainActivity::class.java).apply {
                data = Uri.parse("edapex://approval/$approvalId")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            context.startActivity(expired)
        }
    }

    companion object {
        const val ACTION_APPROVE = "com.bronotek.edapex.run.APPROVE"
        const val ACTION_DENY = "com.bronotek.edapex.run.DENY"
        const val EXTRA_ID = "approval_id"
        const val EXTRA_ALLOW = "allow"

        fun intent(context: Context, approvalId: String, allow: Boolean): PendingIntent {
            val action = Intent(context, ApprovalActionReceiver::class.java).apply {
                this.action = if (allow) ACTION_APPROVE else ACTION_DENY
                putExtra(EXTRA_ID, approvalId)
                putExtra(EXTRA_ALLOW, allow)
            }
            // The id is in the request code: two approvals must not share a PendingIntent, or
            // allowing one would answer the other.
            val requestCode = (approvalId.hashCode() * 31) + if (allow) 1 else 0
            return PendingIntent.getBroadcast(
                context,
                requestCode,
                action,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
        }
    }
}
