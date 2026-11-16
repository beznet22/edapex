package com.bronotek.edapex.run

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

    external fun nativeCancel(runId: String): Int

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
