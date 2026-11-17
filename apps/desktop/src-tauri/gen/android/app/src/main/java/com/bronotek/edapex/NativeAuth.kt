package com.bronotek.edapex

/**
 * The bridge to Rust for a native sign-in.
 *
 * The ID token is a credential, not a session: Rust exchanges it immediately and writes the
 * session to the keychain, so nothing durable passes through the page. The page only learns
 * that the state changed.
 */
object NativeAuth {
    @JvmStatic
    external fun exchange(idToken: String)

    @JvmStatic
    external fun failed(message: String)
}
