package com.bronotek.edapex

import android.os.Bundle
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import kotlin.math.roundToInt

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
    @Volatile private var pagePainted = false
    private var bootDeadline = 0L

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
        /*
         * Hold the splash until the page has painted its own first frame.
         *
         * The system would otherwise hand over as soon as the activity was ready — before the
         * bundle had run — and the WebView's default white background showed through the 150ms
         * fade. The page calls `bootReady()` after two `requestAnimationFrame`s, which is the
         * first moment the veil is on screen rather than merely parsed.
         *
         * The deadline is not decoration: a bundle that fails to load must not leave the splash
         * holding the screen. After `BOOT_TIMEOUT_MS` the condition stops being true whatever
         * the page did.
         */
        bootDeadline = SystemClock.uptimeMillis() + BOOT_TIMEOUT_MS
        splash.setKeepOnScreenCondition {
            !pagePainted && SystemClock.uptimeMillis() < bootDeadline
        }

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
        restoreEdgeToEdge()
        // A cold start can finish `onCreate` before the WebView is attached; a resume is the
        // last chance to catch one that appeared late.
        attachHostBridge()
        applyInsets()
    }

    /**
     * Edge-to-edge is not sticky across a screen lock.
     *
     * `enableEdgeToEdge()` runs once in `onCreate`, but some OEMs — this Samsung among them —
     * restore decor fitting when the app comes back from the keyguard. The WebView is then
     * laid out *inside* the status and navigation bars while the page still reserves those
     * insets in CSS, so the space is counted twice and the content loses height at both ends
     * until the activity is recreated. Re-asserting it on every resume and focus makes the
     * two agree again.
     */
    private fun restoreEdgeToEdge() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
    }

    /**
     * Wry hands the WebView over here, before the document is created. Walking the view tree
     * from `onCreate`/`onResume` never found it: the bridge was undefined and, because the
     * inset writer also needs the handle, `--platform-inset-*` stayed empty. This callback is
     * the only lookup that is guaranteed to run.
     */
    override fun onWebViewCreate(webView: WebView) {
        super.onWebViewCreate(webView)
        /*
         * The WebView's own default is white, and it is what showed between the splash leaving
         * and the bundle's first frame. Painting it with the same night-aware resource the
         * splash uses means the seam has nothing to reveal, even if the hand-off is late.
         */
        webView.setBackgroundColor(ContextCompat.getColor(this, R.color.splash_background))
        attachHostBridge(webView)
        // Armed here rather than at turn start: without a foreground service this job is the only
        // thing that picks up a turn whose process died, and it must exist before that happens.
        com.bronotek.edapex.run.RunBridge.init(this)
        com.bronotek.edapex.run.RunScheduler.ensureScheduled(this)
        // Channels before anything can post: a notification naming a channel that does not exist
        // falls back to the default, which is how an approval ends up sharing a toggle with a
        // routine. Creation is idempotent and runs once per process.
        com.bronotek.edapex.run.EdApexNotifications.ensureChannels(this)
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
            restoreEdgeToEdge()
            attachHostBridge()
            applyInsets()
        }
    }

    /** Physical pixels to the page's unit. A WebView CSS pixel is one dp, not one device pixel. */
    private fun Int.toCssPx(): Int = (this / resources.displayMetrics.density).roundToInt()

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

            /*
             * The bars are where the system *is*, not where the page starts.
             *
             * If the WebView already sits below the status bar — which is what some OEMs do
             * after the keyguard is dismissed, whatever edge-to-edge was asked for — then the
             * page must not reserve that strip again. Measured against the WebView's real
             * frame, the page pads only the part the WebView does not cover, so the layout is
             * correct whether or not the window is edge-to-edge.
             */
            val target = webView
            val location = IntArray(2)
            target?.getLocationOnScreen(location)
            val displayHeight = view.height
            val top = target?.let {
                ((bars.top + caption.top) - location[1]).coerceAtLeast(0)
            } ?: (bars.top + caption.top)
            val gapBelow = target?.let {
                displayHeight - (location[1] + it.height)
            } ?: 0
            val bottom = (bars.bottom - gapBelow).coerceAtLeast(0)
            val keyboardInset = (keyboard.bottom - gapBelow).coerceAtLeast(0)

            /*
             * Insets arrive in **physical pixels**; the page's unit is the CSS pixel, which in
             * a WebView is a dp. Writing the raw values tripled every inset on a 3× screen —
             * 88px of status bar became 88dp against a 29dp bar, and 48dp of navigation bar
             * became 144dp. That is the empty band at the top and bottom of every screen.
             */
            target?.evaluateJavascript(
                """
                document.documentElement.style.setProperty('--platform-inset-top', '${top.toCssPx()}px');
                document.documentElement.style.setProperty('--platform-inset-bottom', '${bottom.toCssPx()}px');
                document.documentElement.style.setProperty('--platform-inset-left', '${bars.left.toCssPx()}px');
                document.documentElement.style.setProperty('--platform-inset-right', '${bars.right.toCssPx()}px');
                document.documentElement.style.setProperty('--platform-keyboard-inset', '${keyboardInset.toCssPx()}px');
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
        fun bootReady() {
            pagePainted = true
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

        /** A bundle that never loads must not leave the splash holding the screen. */
        const val BOOT_TIMEOUT_MS = 4_000L
    }
}
