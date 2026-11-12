use codex_app_server_protocol::{ClientRequest, RequestId, ThreadStartParams};

pub const AGENT_CLIENT_NAME: &str = "edapex-agent";

pub fn thread_start_request(cwd: String, request_id: i64) -> ClientRequest {
    ClientRequest::ThreadStart {
        request_id: RequestId::Integer(request_id),
        params: ThreadStartParams {
            cwd: Some(cwd),
            ephemeral: Some(true),
            ..ThreadStartParams::default()
        },
    }
}
