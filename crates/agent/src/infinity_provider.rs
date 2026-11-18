//! The native `ModelProvider`: EdApex's transport behind Infinity's model seam.
//!
//! Everything here is glue. The request translation and the chunk mapping live in
//! [`crate::infinity_stream`] because the browser needs them too, and a second
//! copy of the tool-call assembly rules is a second set of bugs.

use std::sync::Arc;

use async_trait::async_trait;
use infinity_agent_core::system::{ModelSource, ResolvedModel};
use infinity_provider_protocol::{
    CompletionError, CompletionRequest, ModelEntry, ModelProvider, ModelStream,
};
use rap_protocol::ThreadId;

use crate::infinity_stream::{chunk_stream, completion_error, provider_request};
use crate::ProviderClient;

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
        // `stream_chat` is synchronous by contract: it hands back the channel the
        // transport fills, so nothing host-owned is held across an await here.
        let receiver = self.client.stream_chat(request).map_err(completion_error)?;
        Ok(chunk_stream(receiver))
    }
}
