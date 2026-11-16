use std::path::PathBuf;

use edapex_ocr::{OcrError, OcrResult, RustOEngine};
use tauri::{AppHandle, State};

use crate::agent::HostEnv;
use crate::state::{HostError, HostState};

fn map_ocr_error(error: OcrError) -> HostError {
    match error {
        OcrError::ModelsMissing(_)
        | OcrError::ManifestInvalid(_)
        | OcrError::ModelFileMissing(_)
        | OcrError::ModelChecksumMismatch { .. }
        | OcrError::ModelSizeMismatch { .. } => {
            HostError::new("model_missing", error.to_string(), false)
        }
        OcrError::InvalidModelPath(_) | OcrError::ImageMetadata(_) => {
            HostError::new("invalid_input", error.to_string(), false)
        }
        OcrError::Initialize(_) | OcrError::Inference(_) | OcrError::UnstructuredOutput => {
            HostError::new("internal_error", error.to_string(), true)
        }
        OcrError::Io(_) => HostError::new("internal_error", error.to_string(), true),
    }
}

pub(crate) async fn extract_path(env: &HostEnv, path: PathBuf) -> Result<OcrResult, HostError> {
    let models = env.models_dir()?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut engine = RustOEngine::load(&models).map_err(map_ocr_error)?;
        engine.extract_path(&path).map_err(map_ocr_error)
    })
    .await
    .map_err(|error| HostError::new("internal_error", format!("OCR task: {error}"), true))?
}

#[tauri::command]
pub async fn ocr_extract(
    app: AppHandle,
    state: State<'_, HostState>,
    capture_id: String,
) -> Result<OcrResult, HostError> {
    let path = state.capture_path(&capture_id)?;
    extract_path(&HostEnv::from_app(&app)?, path).await
}
