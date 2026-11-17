package com.bronotek.edapex

import android.content.Context

/**
 * The FCM registration token, cached where the page can ask for it.
 *
 * Never logged in full: a registration token delivers to this device until it is retired,
 * so it is treated like the session token even though it grants less.
 */
object PushTokenStore {
    private const val PREFS = "edapex.push"
    private const val TOKEN = "fcm_token"

    fun save(context: Context, token: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(TOKEN, token)
            .apply()
    }

    fun read(context: Context): String =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(TOKEN, "") ?: ""
}
