package com.bronotek.edapex

import android.app.Activity
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * "Continue with Google" without leaving the app.
 *
 * Credential Manager shows Google's own account sheet as a system bottom sheet and returns
 * an ID token. The audience is the **web** client id — that is the value the server verifies
 * against — so the same Google project serves the browser flow and this one.
 */
object GoogleSignIn {
    // Public by design: an OAuth client id identifies the client, it does not authorise it.
    private const val SERVER_CLIENT_ID =
        "425439137661-vaq36abmgk2i0hqhk9oeqdslf0aidkd5.apps.googleusercontent.com"

    fun start(activity: Activity) {
        val option = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setAutoSelectEnabled(false)
            .setServerClientId(SERVER_CLIENT_ID)
            .build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        val manager = CredentialManager.create(activity)

        CoroutineScope(Dispatchers.Main).launch {
            try {
                val result = manager.getCredential(activity, request)
                val token = GoogleIdTokenCredential.createFrom(result.credential.data).idToken
                NativeAuth.exchange(token)
            } catch (cancelled: GetCredentialCancellationException) {
                // Closing the sheet is a decision, not a failure: back to the button.
                NativeAuth.failed("Sign-in was cancelled")
            } catch (error: GetCredentialException) {
                NativeAuth.failed(error.message ?: "Google sign-in could not start")
            }
        }
    }
}
