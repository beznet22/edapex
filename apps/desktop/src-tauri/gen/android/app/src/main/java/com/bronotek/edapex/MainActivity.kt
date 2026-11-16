package com.bronotek.edapex

import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

/**
 * The Android host.
 *
 * Three jobs, all of them things the WebView cannot do for itself:
 *
 * 1. **Hand the splash over without a seam.** The splash theme paints the token background
 *    over the system icon; this fades that view out over 150ms and removes it. The React
 *    boot veil underneath uses the identical colour, so what a person sees is one surface
 *    that settles rather than two that swap.
 * 2. **Tell the WebView about the window.** `env(safe-area-inset-*)` reaches a WebView from
 *    M136 (fullscreen) or M144 (all), and the app ships to older devices. The insets are
 *    written as CSS custom properties; the token sheet takes `max()` of the two, so neither
 *    can subtract from the other.
 * 3. **Own the back gesture.** A fullscreen app with no app bar has no way out of a sheet
 *    except the gesture that also exits it, so back is routed through the page: if the app
 *    says it can consume it, it does; otherwise the system gets it.
 *
 * The page talks back through one small JS interface. It carries two booleans and exposes
 * nothing else — no data, no token, no resource handle.
 */
class MainActivity : TauriActivity() {
    private var webView: WebView? = null
    private var backConsumable = false

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()

        /*
         * The exit, not the icon. `setOnExitAnimationListener` is the only splash animation
         * the platform lets an app own, and it is the one a person actually perceives: the
         * icon has already been showing while the process started.
         *
         * Opacity only. A scale or a slide here would move the mark relative to the veil
         * behind it, drawing the eye to the seam this exists to hide.
         */
        splash.setOnExitAnimationListener { provider ->
            val view = provider.view
            view.animate()
                .alpha(0f)
                .setDuration(SPLASH_EXIT_MS)
                .withEndAction { provider.remove() }
                .start()
        }

        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        installBackHandler()
    }

    override fun onResume() {
        super.onResume()
        // The WebView exists only after `super.onCreate` has built the Tauri bridge, so the
        // lookup happens here rather than in onCreate.
        if (webView == null) {
            webView = findViewById<ViewGroup>(android.R.id.content)?.let { findWebView(it) }
            webView?.addJavascriptInterface(HostBridge(), "EdApexHost")
        }
        applyInsets()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) applyInsets()
    }

    /** Walks the view tree rather than relying on a Tauri-internal handle. */
    private fun findWebView(view: View): WebView? = when (view) {
        is WebView -> view
        is ViewGroup -> (0 until view.childCount).firstNotNullOfOrNull { index ->
            view.getChildAt(index)?.let { findWebView(it) }
        }
        else -> null
    }

    /**
     * Re-apply on every inset change: the keyboard, the status bar, a fold and the desktop
     * windowing caption bar all arrive through this path.
     */
    private fun applyInsets() {
        val target = webView ?: return
        val insets = WindowCompat.getInsetsController(window, window.decorView)
        insets.systemBarsBehavior = insets.systemBarsBehavior

        window.decorView.setOnApplyWindowInsetsListener { view, windowInsets ->
            val bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            val caption = windowInsets.getInsets(WindowInsetsCompat.Type.captionBar())
            val keyboard = windowInsets.getInsets(WindowInsetsCompat.Type.ime())

            target.evaluateJavascript(
                """
                document.documentElement.style.setProperty('--platform-inset-top', '${bars.top + caption.top}px');
                document.documentElement.style.setProperty('--platform-inset-bottom', '${bars.bottom}px');
                document.documentElement.style.setProperty('--platform-inset-left', '${bars.left}px');
                document.documentElement.style.setProperty('--platform-inset-right', '${bars.right}px');
                document.documentElement.style.setProperty('--platform-keyboard-inset', '${keyboard.bottom}px');
                """.trimIndent(),
                null
            )
            // Do not consume: the WebView still needs the insets for its own viewport maths,
            // and consuming them is how an app ends up with ghost padding after the keyboard
            // closes.
            view.onApplyWindowInsets(windowInsets)
            windowInsets
        }
        window.decorView.requestApplyInsets()
    }

    private fun installBackHandler() {
        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (!backConsumable) {
                        // Nothing in the page wants it: let the system close the task.
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                        isEnabled = true
                        return
                    }
                    webView?.evaluateJavascript("window.__edapexBack && window.__edapexBack()", null)
                }
            }
        )
    }

    /**
     * The page's half of the contract. Two setters, no getters, no data.
     *
     * `setDarkTheme` exists because `uiMode` is in `configChanges`: the activity is never
     * recreated on a theme change, so the status-bar icon tint has to be told what the app
     * chose rather than reading the system's.
     */
    inner class HostBridge {
        @JavascriptInterface
        fun setBackEnabled(enabled: Boolean) {
            backConsumable = enabled
        }

        @JavascriptInterface
        fun setDarkTheme(dark: Boolean) {
            runOnUiThread {
                WindowCompat.getInsetsController(window, window.decorView).apply {
                    isAppearanceLightStatusBars = !dark
                    isAppearanceLightNavigationBars = !dark
                }
            }
        }
    }

    private companion object {
        const val SPLASH_EXIT_MS = 150L
    }
}
