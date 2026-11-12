use std::path::PathBuf;

use edapex_ocr::{OcrError, OcrResult, RustOEngine};
use tauri::{AppHandle, Manager, State};

use crate::state::{HostError, HostState};

fn models_dir(app: &AppHandle) -> Result<PathBuf, HostError> {
    if let Ok(path) = std::env::var("EDAPEX_OCR_MODELS_DIR") {
        return Ok(PathBuf::from(path));
    }
    if let Ok(resource) = app.path().resource_dir() {
        let bundled = resource.join("ocr");
        if bundled.join("manifest.json").is_file() {
            return Ok(bundled);
        }
    }
    let development = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/ocr");
    if development.join("manifest.json").is_file() {
        return Ok(development);
    }
    Err(HostError::new(
        "model_missing",
        "RustO OCR models are not installed; run scripts/fetch-rusto-models.mjs",
        false,
    ))
}

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

#[tauri::command]
pub async fn ocr_extract(
    app: AppHandle,
    state: State<'_, HostState>,
    capture_id: String,
) -> Result<OcrResult, HostError> {
    let path = state.capture_path(&capture_id)?;
    let models = models_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut engine = RustOEngine::load(&models).map_err(map_ocr_error)?;
        engine.extract_path(&path).map_err(map_ocr_error)
    })
    .await
    .map_err(|error| HostError::new("internal_error", format!("OCR task: {error}"), true))?
}
