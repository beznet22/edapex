use std::time::Duration;

use edapex_agent::{
    tool_spec_json, AgentError, ChatMessage, ProviderChunk, ProviderClient, ProviderRequest,
};
use serde_json::{json, Value};
use tokio::sync::mpsc;

/// Where model traffic goes. Never a provider: `model-router` holds the provider
/// credential and is the only process allowed to reach AI Gateway.
const MODEL_ROUTER_PATH: &str = "/api/v1/agent/model/v1/chat/completions";

/// The model transport.
///
/// This holds an **EdApex session token**, never a provider key. Provider
/// credentials live in AI Gateway (BYOK) and are used only by
/// `services/model-router`, so a compromised desktop holds nothing worth
/// stealing beyond a revocable session.
pub struct ModelRouterProvider {
    session_token: String,
    client: reqwest::Client,
    base_url: String,
}

impl ModelRouterProvider {
    pub fn new(session_token: String) -> Self {
        let base_url = crate::auth::api_base();
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .unwrap_or_default();
        Self {
            session_token,
            client,
            base_url,
        }
    }
}

impl ProviderClient for ModelRouterProvider {
    fn stream_chat(
        &self,
        request: ProviderRequest,
    ) -> Result<mpsc::Receiver<ProviderChunk>, AgentError> {
        let (sender, receiver) = mpsc::channel(64);
        let client = self.client.clone();
        let session_token = self.session_token.clone();
        let base_url = self.base_url.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(error) =
                stream_model(&client, &base_url, &session_token, request, &sender).await
            {
                let _ = sender.send(ProviderChunk::Failed(error)).await;
            }
        });
        Ok(receiver)
    }
}

fn message_json(message: &ChatMessage) -> Value {
    let mut object = serde_json::Map::new();
    object.insert("role".to_string(), json!(message.role.as_str()));
    object.insert(
        "content".to_string(),
        message
            .content
            .as_ref()
            .map(|content| json!(content))
            .unwrap_or(Value::Null),
    );
    if !message.tool_calls.is_empty() {
        let tool_calls: Vec<Value> = message
            .tool_calls
            .iter()
            .map(|call| {
                json!({
                    "id": call.id,
                    "type": "function",
                    "function": {
                        "name": call.name,
                        "arguments": call.arguments,
                    }
                })
            })
            .collect();
        object.insert("tool_calls".to_string(), Value::Array(tool_calls));
    }
    if let Some(tool_call_id) = &message.tool_call_id {
        object.insert("tool_call_id".to_string(), json!(tool_call_id));
    }
    Value::Object(object)
}

async fn stream_model(
    client: &reqwest::Client,
    base_url: &str,
    session_token: &str,
    request: ProviderRequest,
    sender: &mpsc::Sender<ProviderChunk>,
) -> Result<(), AgentError> {
    let messages: Vec<Value> = request.messages.iter().map(message_json).collect();
    let tools: Vec<Value> = request
        .tools
        .iter()
        .map(|spec| tool_spec_json(spec))
        .collect();
    let mut body = json!({
        "model": request.model,
        "messages": messages,
        "tools": tools,
        "stream": true,
    });
    if let Some(temperature) = request.temperature {
        body["temperature"] = json!(temperature);
    }

    let response = client
        .post(format!("{base_url}{MODEL_ROUTER_PATH}"))
        .bearer_auth(session_token)
        .json(&body)
        .send()
        .await
        .map_err(|error| AgentError::provider(format!("Model request: {error}")))?;

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        let message: String = text.chars().take(300).collect();
        return Err(AgentError::provider(format!(
            "The model router returned {status}: {message}"
        )));
    }

    let mut response = response;
    let mut buffer = String::new();
    let mut decoder = edapex_agent::Utf8StreamDecoder::new();
    loop {
        let chunk = response
            .chunk()
            .await
            .map_err(|error| AgentError::provider(format!("Model stream: {error}")))?;
        let Some(chunk) = chunk else {
            break;
        };
        buffer.push_str(&decoder.push(&chunk));
        while let Some(event) = edapex_agent::take_sse_event(&mut buffer) {
            if process_sse_event(&event, sender).await? {
                return Ok(());
            }
        }
    }
    buffer.push_str(&decoder.finish());
    if !buffer.trim().is_empty() {
        process_sse_event(&buffer, sender).await?;
    }
    let _ = sender
        .send(ProviderChunk::Done {
            finish_reason: None,
        })
        .await;
    Ok(())
}

async fn process_sse_event(
    event: &str,
    sender: &mpsc::Sender<ProviderChunk>,
) -> Result<bool, AgentError> {
    let Some(data) = edapex_agent::sse_data_line(event) else {
        return Ok(false);
    };
    for chunk in edapex_agent::parse_openai_sse_data(data)? {
        if sender.send(chunk).await.is_err() {
            return Ok(true);
        }
    }
    Ok(false)
}
