//! The JNI entry points a WorkManager worker calls.
//!
//! A worker process has no Activity and therefore no Tauri app: these build a
//! `HostEnv` from the paths Kotlin passes, bring up a tokio runtime (there is
//! none in a bare worker), and block on the resume engine. One entry point per
//! direction, one integer exit code each — progress belongs in the journal, not
//! in a JNI callback.

use std::path::PathBuf;
use std::sync::Arc;

use jni::objects::{JClass, JString};
use jni::sys::jint;
use jni::JNIEnv;

use super::{headless, ApprovalRegistry, HostEnv};

/// Returns the number of turns finished, or a negative code.
const ERR_PATH: jint = -1;
const ERR_RUNTIME: jint = -2;
const ERR_RESUME: jint = -3;
/// No session on this device: there is nothing to resume until someone signs in,
/// so the worker must not treat it as a failure and retry forever.
const ERR_AUTH: jint = -4;

fn path(env: &mut JNIEnv, value: &JString) -> Option<PathBuf> {
    env.get_string(value)
        .ok()
        .map(|text| PathBuf::from(text.to_string_lossy().as_ref()))
}

/// `RunBridge.nativeResumeRuns(cacheDir, dataDir, resourceDir)`.
///
/// The JNI name mirrors the Kotlin package: `com.bronotek.edapex.run.RunBridge`.
#[no_mangle]
pub extern "system" fn Java_com_bronotek_edapex_run_RunBridge_nativeResumeRuns(
    mut env: JNIEnv,
    _class: JClass,
    cache: JString,
    data: JString,
    resource: JString,
) -> jint {
    let (Some(cache), Some(data), Some(resource)) = (
        path(&mut env, &cache),
        path(&mut env, &data),
        path(&mut env, &resource),
    ) else {
        return ERR_PATH;
    };

    let Ok(runtime) = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    else {
        return ERR_RUNTIME;
    };

    let host_env = HostEnv::new(cache, data, resource);
    let approvals = Arc::new(ApprovalRegistry::default());
    match runtime.block_on(headless::run_open_runs(&host_env, approvals)) {
        Ok(finished) => finished as jint,
        Err(error) if error.code == "auth_required" => ERR_AUTH,
        Err(error) => {
            eprintln!("run resume failed: {} {}", error.code, error.message);
            ERR_RESUME
        }
    }
}

/// `RunBridge.nativeCancel()` — stops work this process has queued.
///
/// Nothing is running yet in a fresh worker, so this is the hook a Stop action
/// will use once the notification decision path lands.
#[no_mangle]
pub extern "system" fn Java_com_bronotek_edapex_run_RunBridge_nativeCancel(
    _env: JNIEnv,
    _class: JClass,
    _run_id: JString,
) -> jint {
    0
}
