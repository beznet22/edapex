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
    private var bridgeAttached = false
    private var reloadedForBridge = false
    private var insetsInstalled = false

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
        /*
         * The interface has to exist before the document does. `addJavascriptInterface`
         * injects into the JS context at page load, so registering it from `onResume` — after
         * the bundle has run — left `window.EdApexHost` undefined and every `setBackEnabled`
         * call a silent no-op: the app exited on back with a sheet open. This was measured,
         * not assumed: CDP reported `typeof window.EdApexHost === "undefined"` while
         * `window.__edapexBack` was already a function.
         */
        attachHostBridge()
    }

    /**
     * `super.onCreate` starts the page load, but the WebView is not necessarily in the view tree
     * yet — a lookup here can miss it, and `onResume` can too. `decorView.post` runs after the
     * first layout, which is the first moment the lookup is guaranteed to succeed.
     */
    override fun onPostCreate(savedInstanceState: Bundle?) {
        super.onPostCreate(savedInstanceState)
        window.decorView.post {
            attachHostBridge()
            applyInsets()
        }
    }

    override fun onResume() {
        super.onResume()
        // A cold start can finish `onCreate` before the WebView is attached; a resume is the
        // last chance to catch one that appeared late.
        attachHostBridge()
        applyInsets()
    }

    /**
     * Wry hands the WebView over here, before the document is created. Walking the view tree
     * from `onCreate`/`onResume` never found it: the bridge was undefined and, because the
     * inset writer also needs the handle, `--platform-inset-*` stayed empty. This callback is
     * the only lookup that is guaranteed to run.
     */
    override fun onWebViewCreate(webView: WebView) {
        super.onWebViewCreate(webView)
        attachHostBridge(webView)
    }

    private fun attachHostBridge(created: WebView? = null) {
        if (bridgeAttached) return
        val target = created ?: webView ?: findViewById<ViewGroup>(android.R.id.content)
            ?.let { findWebView(it) }
            ?.also { webView = it }
            ?: return
        webView = target
        target.addJavascriptInterface(HostBridge(), "EdApexHost")
        bridgeAttached = true
        /*
         * The interface is injected when the document loads. If the bundle had already run by
         * the time we found the WebView, the page will never see it — so ask the page, and
         * reload exactly once if it is missing. Without this the setter is silently absent and
         * back exits the app with a sheet open.
         */
        target.evaluateJavascript("typeof window.EdApexHost") { result ->
            if (!result.contains("object") && !reloadedForBridge) {
                reloadedForBridge = true
                target.reload()
            }
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            attachHostBridge()
            applyInsets()
        }
    }

    /** Fallback only: `onWebViewCreate` is the hook that always fires. */
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
        if (webView == null) return
        if (!insetsInstalled) {
            insetsInstalled = true
            window.decorView.setOnApplyWindowInsetsListener { view, windowInsets ->
            val bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            val caption = windowInsets.getInsets(WindowInsetsCompat.Type.captionBar())
            val keyboard = windowInsets.getInsets(WindowInsetsCompat.Type.ime())

            webView?.evaluateJavascript(
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
