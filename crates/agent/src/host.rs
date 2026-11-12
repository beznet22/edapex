use std::path::PathBuf;
use std::sync::Arc;

use codex_app_server_client::{
    InProcessAppServerClient, InProcessClientStartArgs, DEFAULT_IN_PROCESS_CHANNEL_CAPACITY,
};
use codex_app_server_protocol::ThreadStartResponse;
use codex_arg0::Arg0DispatchPaths;
use codex_config::{CloudConfigBundleLoader, LoaderOverrides};
use codex_core::config::ConfigBuilder;
use codex_core::init_state_db;
use codex_exec_server::EnvironmentManager;
use codex_feedback::CodexFeedback;
use codex_http_client::{HttpClientFactory, OutboundProxyPolicy};
use codex_protocol::protocol::SessionSource;
use toml::Value as TomlValue;

use crate::error::AgentError;
use crate::protocol::thread_start_request;

pub struct AgentHostOptions {
    pub codex_home: PathBuf,
    pub client_name: String,
    pub mobile_safe: bool,
}

fn mobile_overrides() -> Vec<(String, TomlValue)> {
    let disabled = TomlValue::Boolean(false);
    vec![
        ("features.shell_tool".to_string(), disabled.clone()),
        ("features.unified_exec".to_string(), disabled.clone()),
        ("features.view_image".to_string(), disabled.clone()),
        ("features.code_mode".to_string(), disabled.clone()),
        ("features.multi_agent".to_string(), disabled.clone()),
        ("features.multi_agent_v2".to_string(), disabled),
        (
            "web_search".to_string(),
            TomlValue::String("disabled".to_string()),
        ),
    ]
}

pub struct AgentHost {
    client: InProcessAppServerClient,
    thread_id: String,
}

impl AgentHost {
    pub async fn start(options: AgentHostOptions) -> Result<Self, AgentError> {
        let cli_overrides = if options.mobile_safe {
            mobile_overrides()
        } else {
            Vec::new()
        };
        let config = ConfigBuilder::default()
            .codex_home(options.codex_home.clone())
            .cli_overrides(cli_overrides.clone())
            .build()
            .await
            .map_err(|error| AgentError::Config(format!("{error:?}")))?;
        let config = Arc::new(config);
        let state_db = init_state_db(config.as_ref())
            .await
            .ok_or_else(|| AgentError::Transport("State database is unavailable".to_string()))?;
        let client = InProcessAppServerClient::start(InProcessClientStartArgs {
            required_human_approval: false,
            arg0_paths: Arg0DispatchPaths::default(),
            config,
            cli_overrides,
            loader_overrides: LoaderOverrides::default(),
            strict_config: false,
            cloud_config_bundle: CloudConfigBundleLoader::default(),
            embedded_network_policy: Default::default(),
            feedback: CodexFeedback::new(),
            log_db: None,
            state_db: Some(state_db),
            environment_manager: Arc::new(if options.mobile_safe {
                EnvironmentManager::without_environments(HttpClientFactory::new(
                    OutboundProxyPolicy::ReqwestDefault,
                ))
            } else {
                EnvironmentManager::default_for_tests()
            }),
            config_warnings: Vec::new(),
            session_source: SessionSource::Exec,
            enable_codex_api_key_env: false,
            client_name: options.client_name,
            client_version: env!("CARGO_PKG_VERSION").to_string(),
            experimental_api: true,
            mcp_server_openai_form_elicitation: false,
            opt_out_notification_methods: Vec::new(),
            channel_capacity: DEFAULT_IN_PROCESS_CHANNEL_CAPACITY,
        })
        .await
        .map_err(AgentError::from)?;

        let cwd = options.codex_home.display().to_string();
        let response: ThreadStartResponse = client
            .request_typed(thread_start_request(cwd, 1))
            .await
            .map_err(|error| AgentError::Request(error.to_string()))?;

        Ok(Self {
            client,
            thread_id: response.thread.id,
        })
    }

    pub fn thread_id(&self) -> &str {
        &self.thread_id
    }

    pub async fn shutdown(self) -> Result<(), AgentError> {
        self.client.shutdown().await.map_err(AgentError::from)
    }
}

#[cfg(test)]
mod tests {
    use super::{AgentHost, AgentHostOptions};

    #[test]
    fn desktop_smoke_starts_and_shuts_down() {
        let worker = std::thread::Builder::new()
            .name("edapex-agent-smoke".to_string())
            .stack_size(32 * 1024 * 1024)
            .spawn(|| {
                let runtime = tokio::runtime::Builder::new_multi_thread()
                    .worker_threads(2)
                    .thread_stack_size(32 * 1024 * 1024)
                    .enable_all()
                    .build()
                    .expect("Tokio runtime");
                runtime.block_on(async {
                    for mobile_safe in [false, true] {
                        let codex_home = tempfile::tempdir().expect("temporary Codex home");
                        let host = AgentHost::start(AgentHostOptions {
                            codex_home: codex_home.path().to_path_buf(),
                            client_name: "edapex-agent-smoke".to_string(),
                            mobile_safe,
                        })
                        .await
                        .expect("agent host should start");

                        assert!(!host.thread_id().is_empty());
                        host.shutdown().await.expect("agent host should shut down");
                    }
                });
            })
            .expect("smoke thread");

        worker.join().expect("smoke test should finish");
    }
}
