package com.bronotek.edapex

import android.content.Context
import java.io.File

/**
 * The Rust side of a headless run.
 *
 * A worker process has no Activity, so it has no Tauri app either: the Rust entry point builds
 * its own environment from these three paths and brings up a runtime. The library is the one the
 * app already loads — `edapex_desktop_lib` — because the JNI symbols compile into it.
 */
object RunBridge {
    init {
        System.loadLibrary("edapex_desktop_lib")
    }

    /** Returns how many turns finished, or a negative code the worker treats as retryable. */
    external fun nativeResumeRuns(cacheDir: String, dataDir: String, resourceDir: String): Int

    /**
     * Hands the application context to Rust, which needs it to post an approval: a run that
     * waits for a person has to reach them through a notification, and only Kotlin can post.
     */
    external fun nativeInit(context: Context)

    /** True when something was still waiting; false means the run already gave up. */
    external fun nativeDecide(approvalId: String, allow: Boolean): Boolean

    fun init(context: Context) = nativeInit(context.applicationContext)

    fun decide(approvalId: String, allow: Boolean): Boolean = nativeDecide(approvalId, allow)

    fun resume(context: Context): Int {
        val dataDir = context.filesDir.also { it.mkdirs() }
        return nativeResumeRuns(
            context.cacheDir.absolutePath,
            dataDir.absolutePath,
            // No bundled resource tree on this host yet; OCR in a worker reports model_missing
            // rather than guessing a path.
            File(dataDir, "resources").absolutePath
        )
    }
}
