package com.bronotek.edapex

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The session token, encrypted at rest with a key the app cannot read out of the Keystore.
 *
 * Rust's `keyring` crate has no Android backend — it silently uses an in-memory store, so a
 * native session used to end with the process. This is that missing backend: AES-GCM under a
 * non-exportable `AndroidKeyStore` key, ciphertext in the app's private preferences.
 *
 * `setUserAuthenticationRequired(false)` is deliberate. Requiring the lockscreen to unlock
 * storage would expire the session whenever the person changes their PIN, and the threat
 * this defends against is another app or a pulled file, not the owner holding the phone.
 */
object SessionStore {
    private const val PREFS = "edapex.session"
    private const val ENTRY = "session"
    private const val ALIAS = "edapex.session.key"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val TAG_BITS = 128

    private lateinit var app: Context

    fun attach(context: Context) {
        app = context.applicationContext
    }

    private fun prefs() = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setUserAuthenticationRequired(false)
                .build()
        )
        return generator.generateKey()
    }

    @JvmStatic
    fun save(token: String) {
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, key()) }
        val ciphertext = cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        val encoded = Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" +
            Base64.encodeToString(ciphertext, Base64.NO_WRAP)
        prefs().edit().putString(ENTRY, encoded).apply()
    }

    /** Empty means "no session". A corrupted entry is cleared rather than wedging sign-in. */
    @JvmStatic
    fun read(): String {
        val encoded = prefs().getString(ENTRY, null) ?: return ""
        return try {
            val parts = encoded.split(":")
            if (parts.size != 2) return "".also { clear() }
            val iv = Base64.decode(parts[0], Base64.NO_WRAP)
            val ciphertext = Base64.decode(parts[1], Base64.NO_WRAP)
            val cipher = Cipher.getInstance(TRANSFORMATION).apply {
                init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, iv))
            }
            String(cipher.doFinal(ciphertext), Charsets.UTF_8)
        } catch (error: Exception) {
            clear()
            ""
        }
    }

    @JvmStatic
    fun clear() {
        prefs().edit().remove(ENTRY).apply()
    }
}
