//! EdApex local OCR.
//!
//! RustO is the default on-device engine. The crate validates pinned models
//! before initializing inference and never performs a network request.

pub mod error;
pub mod models;
pub mod result;
pub mod rusto;

pub use error::OcrError;
pub use models::{load_models, ModelFile, ModelManifest, ModelSet};
pub use result::{OcrBox, OcrLine, OcrPage, OcrResult};
pub use rusto::{RustOEngine, LOW_LINE_CONFIDENCE, LOW_MEAN_CONFIDENCE, RUSTO_ENGINE_VERSION};
