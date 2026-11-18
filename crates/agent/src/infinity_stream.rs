//! Translation between Infinity's provider protocol and EdApex's wire shapes.
//!
//! Shared by every host on purpose. The native hosts call it from a
//! `ModelProvider` impl; the browser calls the same functions from its own, so a
//! tool call that survives one host's stream survives the other's. Only the way
//! the chunks arrive differs — a Rust client natively, a JavaScript fetch in the
//! browser — and that is the one thing this module does not know about.
//!
//! It owns no transport, so it compiles for wasm unchanged.

use std::collections::BTreeMap;
use std::sync::Arc;

use infinity_provider_protocol::{
    AssistantContent, CompletionError, CompletionRequest, ErrorClass, FinalResponse, Message,
    ModelStream, StreamChunk, ToolFunction, ToolResultContent, UserContent,
};
use tokio::sync::mpsc;

use crate::provider::{ChatMessage, ProviderChunk, ProviderRequest, ProviderToolSpec, ToolCall};
use crate::AgentError;

/// Classify an EdApex error the way a provider protocol expects.
pub fn completion_error(error: AgentError) -> CompletionError {
    let class = match (error.code, error.retryable) {
        (crate::AgentErrorCode::QuotaExceeded, _) => ErrorClass::Throttled,
        (_, true) => ErrorClass::Transient,
        (_, false) => ErrorClass::Fatal,
    };
    CompletionError::provider(class, error.message)
}

/// Turn Infinity's completion request into the request EdApex's transports speak.
pub fn provider_request(
    request: CompletionRequest,
    model_id: &str,
) -> Result<ProviderRequest, CompletionError> {
    let mut messages = request
        .preamble
        .map(|preamble| vec![ChatMessage::system(preamble)])
        .unwrap_or_default();
    for message in request.chat_history {
        match message {
            Message::User { content } => messages.extend(user_messages(content)),
            Message::Assistant { content } => messages.push(assistant_message(content)),
        }
    }
    Ok(ProviderRequest {
        model: model_id.to_string(),
        messages: messages.into(),
        tools: request
            .tools
            .into_iter()
            .map(|tool| ProviderToolSpec {
                name: tool.name,
                description: tool.description,
                input_schema: tool.parameters,
            })
            .collect(),
        temperature: None,
    })
}

/// Map a chunk channel onto Infinity's stream.
///
/// Tool calls are accumulated per index and emitted only once complete: the
/// pinned core does not assemble incremental arguments itself, so a partial call
/// would reach the model as malformed JSON.
pub fn chunk_stream(mut receiver: mpsc::Receiver<ProviderChunk>) -> ModelStream {
    let stream = async_stream::try_stream! {
        let mut pending_tools = BTreeMap::new();
        while let Some(chunk) = receiver.recv().await {
            match chunk {
                ProviderChunk::Text(text) => yield StreamChunk::Text(text),
                ProviderChunk::Reasoning(text) => {
                    yield StreamChunk::ReasoningDelta { id: None, text };
                }
                ProviderChunk::ToolCallDelta { index, id, name, arguments } => {
                    let pending = pending_tools.entry(index).or_insert_with(|| PendingToolCall {
                        id: format!("call_{index}"),
                        name: None,
                        arguments: String::new(),
                    });
                    if let Some(id) = id {
                        pending.id = id;
                    }
                    if let Some(name) = name {
                        pending.name = Some(name);
                    }
                    pending.arguments.push_str(&arguments);
                }
                ProviderChunk::Done { .. } => {
                    for (_, call) in std::mem::take(&mut pending_tools) {
                        yield StreamChunk::ToolCall(call.complete()?);
                    }
                    yield StreamChunk::Final(FinalResponse { usage: None });
                }
                ProviderChunk::Failed(error) => Err(completion_error(error))?,
            }
        }
        if !pending_tools.is_empty() {
            Err(CompletionError::ResponseError(
                "The provider ended with an unfinished tool call".to_string(),
            ))?;
        }
    };
    Box::pin(stream)
}

struct PendingToolCall {
    id: String,
    name: Option<String>,
    arguments: String,
}

impl PendingToolCall {
    fn complete(self) -> Result<infinity_provider_protocol::ToolCall, CompletionError> {
        let name = self.name.ok_or_else(|| {
            CompletionError::ResponseError("A tool call had no function name".to_string())
        })?;
        let arguments = if self.arguments.trim().is_empty() {
            serde_json::json!({})
        } else {
            serde_json::from_str(&self.arguments).map_err(CompletionError::JsonError)?
        };
        Ok(infinity_provider_protocol::ToolCall {
            id: self.id,
            call_id: None,
            function: ToolFunction { name, arguments },
        })
    }
}

fn user_messages(content: Vec<UserContent>) -> Vec<ChatMessage> {
    let mut messages = Vec::new();
    let mut text = Vec::new();
    for block in content {
        match block {
            UserContent::Text(part) => text.push(part.text),
            UserContent::Image(_) => {
                text.push("[Image input is unavailable on this model]".to_string())
            }
            UserContent::ToolResult(result) => {
                if !text.is_empty() {
                    messages.push(ChatMessage::user(text.join("\n")));
                    text = Vec::new();
                }
                let content = result
                    .content
                    .into_iter()
                    .map(|part| match part {
                        ToolResultContent::Text(text) => text.text,
                        ToolResultContent::Image(_) => "[Image tool result]".to_string(),
                    })
                    .collect::<Vec<_>>()
                    .join("\n");
                messages.push(ChatMessage::tool(result.id, content));
            }
        }
    }
    if !text.is_empty() {
        messages.push(ChatMessage::user(text.join("\n")));
    }
    messages
}

fn assistant_message(content: Vec<AssistantContent>) -> ChatMessage {
    let mut text = Vec::new();
    let mut calls = Vec::new();
    for block in content {
        match block {
            AssistantContent::Text(part) => text.push(part.text),
            AssistantContent::Reasoning(_) => {}
            AssistantContent::ToolCall(call) => calls.push(ToolCall {
                id: call.id,
                name: call.function.name,
                arguments: call.function.arguments.to_string(),
            }),
        }
    }
    let content = if text.is_empty() {
        None
    } else {
        Some(text.join("\n"))
    };
    ChatMessage::assistant(content.map(Arc::from), calls)
}
