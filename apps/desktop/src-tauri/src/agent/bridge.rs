//! The JNI entry points a WorkManager worker calls.
//!
//! A worker process has no Activity and therefore no Tauri app: these build a
//! `HostEnv` from the paths Kotlin passes, bring up a tokio runtime (there is
//! none in a bare worker), and block on the resume engine. One entry point per
//! direction, one integer exit code each — progress belongs in the journal.
//!
//! The exception is an approval: a turn that waits has to ask a person, and a
//! person is on the other side of a notification. That needs the `Context`
//! Kotlin holds, so the Activity hands it over on the first call.

use std::path::PathBuf;
use std::sync::{Arc, OnceLock};

use edapex_agent::{ApprovalDecision, ApprovalRequest};
use jni::objects::{GlobalRef, JClass, JObject, JString, JValue};
use jni::sys::{jboolean, jint};
use jni::{JNIEnv, JavaVM};

use super::{headless, ApprovalRegistry, HostEnv};

const ERR_PATH: jint = -1;
const ERR_RUNTIME: jint = -2;
const ERR_RESUME: jint = -3;
/// No session on this device: nothing to resume until someone signs in, so the
/// worker must not treat it as a failure and retry forever.
const ERR_AUTH: jint = -4;

/// The application context, captured once so a worker can post.
static CONTEXT: OnceLock<(JavaVM, GlobalRef)> = OnceLock::new();

/// The registry a headless turn is blocked on, so an answer that arrives by
/// notification reaches the waiter holding the run open.
static HEADLESS: OnceLock<Arc<ApprovalRegistry>> = OnceLock::new();

fn path(env: &mut JNIEnv, value: &JString) -> Option<PathBuf> {
    env.get_string(value)
        .ok()
        .map(|text| PathBuf::from(text.to_string_lossy().as_ref()))
}

/// Posts an approval from whatever thread the turn is on.
///
/// A failed post does not fail the turn: the deadline still applies, so a person
/// who never sees the notification gets the same fail-closed answer.
fn post_approval(request: &ApprovalRequest) {
    let Some((vm, context)) = CONTEXT.get() else {
        return;
    };
    let Ok(mut env) = vm.attach_current_thread_permanently() else {
        return;
    };
    let id = env.new_string(&request.approval_request_id);
    let title = env.new_string(&request.title);
    let body = env.new_string(&request.description);
    let (Ok(id), Ok(title), Ok(body)) = (id, title, body) else {
        return;
    };
    if let Err(error) = env.call_static_method(
        "com/bronotek/edapex/EdApexNotifications",
        "postApproval",
        "(Landroid/content/Context;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V",
        &[
            JValue::Object(context.as_obj()),
            JValue::Object(&id),
            JValue::Object(&title),
            JValue::Object(&body),
        ],
    ) {
        eprintln!("approval notification failed: {error}");
    }
}

/// `RunBridge.nativeInit(context)` — hands the application context to Rust.
#[no_mangle]
pub extern "system" fn Java_com_bronotek_edapex_RunBridge_nativeInit(
    mut env: JNIEnv,
    _class: JClass,
    context: JObject,
) {
    if CONTEXT.get().is_some() {
        return;
    }
    let Ok(vm) = env.get_java_vm() else { return };
    let Ok(global) = env.new_global_ref(context) else {
        return;
    };
    let _ = CONTEXT.set((vm, global));
}

/// `RunBridge.nativeDecide(approvalId, allow)` — the answer from a notification.
///
/// False means nothing was waiting: the process was recycled, or the run already
/// hit its deadline. The caller opens the app either way, because an expired
/// approval has to be visible rather than silent.
#[no_mangle]
pub extern "system" fn Java_com_bronotek_edapex_RunBridge_nativeDecide(
    mut env: JNIEnv,
    _class: JClass,
    approval_id: JString,
    allow: jboolean,
) -> jboolean {
    let (Some(registry), Some(id)) = (HEADLESS.get(), path(&mut env, &approval_id)) else {
        return 0;
    };
    let decision = if allow != 0 {
        ApprovalDecision::AllowOnce
    } else {
        ApprovalDecision::Deny
    };
    match registry.resolve(&id.to_string_lossy(), decision) {
        Ok(()) => 1,
        Err(_) => 0,
    }
}

/// `RunBridge.nativeResumeRuns(cacheDir, dataDir, resourceDir)`.
#[no_mangle]
pub extern "system" fn Java_com_bronotek_edapex_RunBridge_nativeResumeRuns(
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

    let approvals = Arc::new(ApprovalRegistry::with_notifier(Box::new(|request| {
        post_approval(request)
    })));
    // Held for the life of the process: the notification action starts the
    // Activity, and that Activity must find the waiter it is answering.
    let _ = HEADLESS.set(approvals.clone());

    let host_env = HostEnv::new(cache, data, resource);
    match runtime.block_on(headless::run_open_runs(&host_env, approvals)) {
        Ok(finished) => finished as jint,
        Err(error) if error.code == "auth_required" => ERR_AUTH,
        Err(error) => {
            eprintln!("run resume failed: {} {}", error.code, error.message);
            ERR_RESUME
        }
    }
}
