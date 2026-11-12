use serde::Deserialize;
use serde_json::Value;
use tokio::sync::mpsc;

use crate::protocol::{AgentError, DynamicToolSpec};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    System,
    User,
    Assistant,
    Tool,
}

impl Role {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::System => "system",
            Self::User => "user",
            Self::Assistant => "assistant",
            Self::Tool => "tool",
        }
    }
}

#[derive(Debug, Clone)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Clone)]
pub struct ChatMessage {
    pub role: Role,
    pub content: Option<String>,
    pub tool_calls: Vec<ToolCall>,
    pub tool_call_id: Option<String>,
}

impl ChatMessage {
    pub fn system(text: impl Into<String>) -> Self {
        Self {
            role: Role::System,
            content: Some(text.into()),
            tool_calls: Vec::new(),
            tool_call_id: None,
        }
    }

    pub fn user(text: impl Into<String>) -> Self {
        Self {
            role: Role::User,
            content: Some(text.into()),
            tool_calls: Vec::new(),
            tool_call_id: None,
        }
    }

    pub fn assistant(text: Option<String>, tool_calls: Vec<ToolCall>) -> Self {
        Self {
            role: Role::Assistant,
            content: text,
            tool_calls,
            tool_call_id: None,
        }
    }

    pub fn tool(tool_call_id: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            role: Role::Tool,
            content: Some(content.into()),
            tool_calls: Vec::new(),
            tool_call_id: Some(tool_call_id.into()),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ProviderRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub tools: Vec<DynamicToolSpec>,
    pub temperature: Option<f32>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ProviderChunk {
    Text(String),
    Reasoning(String),
    ToolCallDelta {
        index: usize,
        id: Option<String>,
        name: Option<String>,
        arguments: String,
    },
    Done {
        finish_reason: Option<String>,
    },
    Failed(AgentError),
}

/// The host injects the HTTP transport. The core never carries a TLS stack.
pub trait ProviderClient: Send + Sync {
    fn stream_chat(
        &self,
        request: ProviderRequest,
    ) -> Result<mpsc::Receiver<ProviderChunk>, AgentError>;
}

#[derive(Debug, Deserialize)]
struct OpenAiChunk {
    #[serde(default)]
    choices: Vec<OpenAiChoice>,
}

#[derive(Debug, Deserialize)]
struct OpenAiChoice {
    #[serde(default)]
    delta: Option<OpenAiDelta>,
    #[serde(default)]
    finish_reason: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct OpenAiDelta {
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    reasoning: Option<String>,
    #[serde(default)]
    tool_calls: Vec<OpenAiToolCall>,
}

#[derive(Debug, Deserialize)]
struct OpenAiToolCall {
    #[serde(default)]
    index: usize,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    function: Option<OpenAiFunction>,
}

#[derive(Debug, Default, Deserialize)]
struct OpenAiFunction {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    arguments: Option<String>,
}

/// Parse one OpenAI-compatible SSE `data:` payload into normalized chunks.
pub fn parse_openai_sse_data(data: &str) -> Result<Vec<ProviderChunk>, AgentError> {
    let chunk: OpenAiChunk = serde_json::from_str(data)
        .map_err(|error| AgentError::provider(format!("Malformed provider stream: {error}")))?;
    let mut chunks = Vec::new();
    for choice in chunk.choices {
        if let Some(delta) = choice.delta {
            if let Some(text) = delta.content {
                if !text.is_empty() {
                    chunks.push(ProviderChunk::Text(text));
                }
            }
            if let Some(reasoning) = delta.reasoning {
                if !reasoning.is_empty() {
                    chunks.push(ProviderChunk::Reasoning(reasoning));
                }
            }
            for call in delta.tool_calls {
                chunks.push(ProviderChunk::ToolCallDelta {
                    index: call.index,
                    id: call.id,
                    name: call.function.as_ref().and_then(|f| f.name.clone()),
                    arguments: call
                        .function
                        .as_ref()
                        .and_then(|f| f.arguments.clone())
                        .unwrap_or_default(),
                });
            }
        }
        if let Some(reason) = choice.finish_reason {
            chunks.push(ProviderChunk::Done {
                finish_reason: Some(reason),
            });
        }
    }
    Ok(chunks)
}

/// Serialize a tool spec to the OpenAI-compatible function shape.
pub fn tool_spec_json(spec: &DynamicToolSpec) -> Value {
    serde_json::json!({
        "type": "function",
        "function": {
            "name": spec.name.as_str(),
            "description": spec.description,
            "parameters": spec.input_schema,
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_text_reasoning_and_tool_deltas() {
        let data = r#"{
            "choices": [{
                "delta": {
                    "content": "hello",
                    "reasoning": "thinking",
                    "tool_calls": [{
                        "index": 0,
                        "id": "call_1",
                        "function": {"name": "web_search", "arguments": "{\"query\""}
                    }]
                },
                "finish_reason": null
            }]
        }"#;
        let chunks = parse_openai_sse_data(data).expect("valid chunk");
        assert_eq!(chunks[0], ProviderChunk::Text("hello".to_string()));
        assert_eq!(chunks[1], ProviderChunk::Reasoning("thinking".to_string()));
        assert_eq!(
            chunks[2],
            ProviderChunk::ToolCallDelta {
                index: 0,
                id: Some("call_1".to_string()),
                name: Some("web_search".to_string()),
                arguments: "{\"query\"".to_string(),
            }
        );
    }

    #[test]
    fn parses_finish_reason() {
        let chunks =
            parse_openai_sse_data(r#"{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}"#)
                .expect("valid chunk");
        assert_eq!(
            chunks,
            vec![ProviderChunk::Done {
                finish_reason: Some("tool_calls".to_string())
            }]
        );
    }

    #[test]
    fn rejects_malformed_json() {
        let error = parse_openai_sse_data("not json").expect_err("must fail");
        assert_eq!(
            error.code,
            crate::protocol::AgentErrorCode::ProviderUnavailable
        );
    }
}
