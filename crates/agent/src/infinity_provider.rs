use std::collections::BTreeMap;
use std::sync::Arc;

use async_trait::async_trait;
use infinity_agent_core::system::{ModelSource, ResolvedModel};
use infinity_provider_protocol::{
    AssistantContent, CompletionError, CompletionRequest, ErrorClass, FinalResponse, Message,
    ModelEntry, ModelProvider, ModelStream, StreamChunk, ToolFunction, ToolResultContent,
    UserContent,
};
use rap_protocol::ThreadId;

use crate::provider::{ChatMessage, ProviderChunk, ProviderRequest, ProviderToolSpec, ToolCall};
use crate::{AgentError, ProviderClient};

type BoxError = Box<dyn std::error::Error + Send + Sync>;

#[derive(Clone)]
pub struct EdApexModelProvider {
    client: Arc<dyn ProviderClient>,
    model: String,
}

impl EdApexModelProvider {
    pub fn new(client: Arc<dyn ProviderClient>, model: impl Into<String>) -> Self {
        Self {
            client,
            model: model.into(),
        }
    }
}

#[derive(Clone)]
pub struct EdApexModelSource {
    provider: Arc<EdApexModelProvider>,
    model: String,
}

impl EdApexModelSource {
    pub fn new(client: Arc<dyn ProviderClient>, model: impl Into<String>) -> Self {
        let model = model.into();
        Self {
            provider: Arc::new(EdApexModelProvider::new(client, model.clone())),
            model,
        }
    }
}

#[async_trait(?Send)]
impl ModelSource for EdApexModelSource {
    async fn resolve(&self, _thread_id: &ThreadId<str>) -> Result<ResolvedModel, BoxError> {
        Ok(ResolvedModel {
            provider: self.provider.clone(),
            model_id: self.model.clone(),
            context_window: 0,
            supports_image_input: false,
        })
    }
}

#[async_trait]
impl ModelProvider for EdApexModelProvider {
    async fn list_models(&self) -> Result<Vec<ModelEntry>, BoxError> {
        Ok(vec![ModelEntry {
            model_id: self.model.clone(),
            display_name: self.model.clone(),
            context_window: 0,
            max_output_tokens: None,
            supports_image_input: false,
        }])
    }

    async fn invoke_model(
        &self,
        model_id: &str,
        request: CompletionRequest,
    ) -> Result<ModelStream, CompletionError> {
        let request = provider_request(request, model_id)?;
        let mut receiver = self.client.stream_chat(request).map_err(completion_error)?;
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
        Ok(Box::pin(stream))
    }
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

fn completion_error(error: AgentError) -> CompletionError {
    let class = match (error.code, error.retryable) {
        (crate::AgentErrorCode::QuotaExceeded, _) => ErrorClass::Throttled,
        (_, true) => ErrorClass::Transient,
        (_, false) => ErrorClass::Fatal,
    };
    CompletionError::provider(class, error.message)
}

fn provider_request(
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
