use std::sync::mpsc;
use std::time::Duration;

use edapex_agent::{AgentHost, AgentHostOptions};
use tauri::Manager;

use crate::state::HostError;

pub struct AgentSession {
    #[allow(dead_code)]
    host: AgentHost,
    #[allow(dead_code)]
    runtime: tokio::runtime::Runtime,
}

pub fn start(app: &tauri::AppHandle) -> Result<AgentSession, HostError> {
    let codex_home = app
        .path()
        .app_data_dir()
        .map_err(|error| HostError::new("internal_error", format!("App data directory: {error}"), false))?;
    std::fs::create_dir_all(&codex_home).map_err(|error| {
        HostError::new(
            "internal_error",
            format!("Create agent data directory: {error}"),
            false,
        )
    })?;

    let mobile_safe = cfg!(any(target_os = "android", target_os = "ios"));
    let (sender, receiver) = mpsc::sync_channel(1);

    std::thread::Builder::new()
        .name("edapex-agent".to_string())
        .stack_size(32 * 1024 * 1024)
        .spawn(move || {
            let runtime = match tokio::runtime::Builder::new_multi_thread()
                .worker_threads(2)
                .thread_stack_size(32 * 1024 * 1024)
                .enable_all()
                .build()
            {
                Ok(runtime) => runtime,
                Err(error) => {
                    let _ = sender.send(Err(HostError::new(
                        "internal_error",
                        format!("Agent runtime: {error}"),
                        false,
                    )));
                    return;
                }
            };

            let result = runtime.block_on(AgentHost::start(AgentHostOptions {
                codex_home,
                client_name: "edapex-work".to_string(),
                mobile_safe,
            }));
            let _ = sender.send(match result {
                Ok(host) => Ok(AgentSession { host, runtime }),
                Err(error) => Err(HostError::new(
                    "internal_error",
                    format!("Start agent: {error}"),
                    false,
                )),
            });
        })
        .map_err(|error| {
            HostError::new(
                "internal_error",
                format!("Spawn agent thread: {error}"),
                false,
            )
        })?;

    receiver
        .recv_timeout(Duration::from_secs(60))
        .map_err(|_| HostError::new("internal_error", "Agent start timed out", true))?
}
