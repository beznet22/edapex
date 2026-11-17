package com.bronotek.edapex

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * FCM's entry point into the process.
 *
 * `onNewToken` fires on first launch and whenever Firebase rotates the token; both are the
 * only moments a new token can be learned, which is why the cache is written here rather
 * than pulled on demand.
 *
 * `onMessageReceived` is not where a notification is drawn. A `notification` payload is drawn
 * by the system while the app is backgrounded, and in the foreground the surface owns the
 * screen — drawing here as well is how one event becomes two notifications.
 */
class PushMessagingService : FirebaseMessagingService() {
    @Suppress("OVERRIDE_DEPRECATION") // The pinned BoM deprecates the override without a replacement.
    override fun onNewToken(token: String) {
        PushTokenStore.save(this, token)
        Log.i("EdApexPush", "token refreshed (${token.length} chars)")
    }

    @Suppress("OVERRIDE_DEPRECATION") // The pinned BoM deprecates the override without a replacement.
    override fun onMessageReceived(message: RemoteMessage) {
        val kind = message.data["kind"] ?: "unknown"
        Log.i("EdApexPush", "message ${message.messageId ?: "?"} kind=$kind")
    }
}
