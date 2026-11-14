use std::path::PathBuf;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum OcrError {
    #[error("OCR model directory is missing: {0}")]
    ModelsMissing(PathBuf),

    #[error("OCR model manifest is invalid: {0}")]
    ManifestInvalid(String),

    #[error("OCR model file is missing: {0}")]
    ModelFileMissing(PathBuf),

    #[error("OCR model file path is not allowed: {0}")]
    InvalidModelPath(String),

    #[error(
        "OCR model {file} checksum mismatch (expected {expected}, got {actual})"
    )]
    ModelChecksumMismatch {
        file: String,
        expected: String,
        actual: String,
    },

    #[error("OCR model {file} size mismatch (expected {expected} bytes, got {actual})")]
    ModelSizeMismatch {
        file: String,
        expected: u64,
        actual: u64,
    },

    #[error("could not read image metadata: {0}")]
    ImageMetadata(String),

    #[error("could not initialize the OCR engine: {0}")]
    Initialize(String),

    #[error("OCR inference failed: {0}")]
    Inference(String),

    #[error("OCR returned unstructured output")]
    UnstructuredOutput,

    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
}
