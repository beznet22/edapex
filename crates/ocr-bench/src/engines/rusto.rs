use std::path::PathBuf;

use rusto::{DetectTextResult, ImageSource, InitializeConfig, OcrRunOptions, RustO};

use crate::types::{EngineOutput, OcrRunner};

pub struct RustOEngine {
    engine: RustO,
    model_files: Vec<PathBuf>,
}

impl RustOEngine {
    pub fn new(det: PathBuf, rec: PathBuf, dict: PathBuf) -> Result<Self, String> {
        let engine = RustO::initialize(InitializeConfig::ppv6(&det, &rec, &dict))
            .map_err(|err| format!("create RustO engine: {err}"))?;
        Ok(Self {
            engine,
            model_files: vec![det, rec, dict],
        })
    }
}

impl OcrRunner for RustOEngine {
    fn version(&self) -> &'static str {
        "0.3.2"
    }

    fn model_files(&self) -> Vec<PathBuf> {
        self.model_files.clone()
    }

    fn run(&mut self, image: &std::path::Path) -> Result<EngineOutput, String> {
        let result = self
            .engine
            .detect_text(
                &ImageSource::Path(image.to_path_buf()),
                &OcrRunOptions::default(),
            )
            .map_err(|err| format!("RustO inference: {err}"))?;
        let DetectTextResult::Structured(lines) = result else {
            return Err("RustO returned unstructured output".to_string());
        };
        Ok(EngineOutput {
            text: lines
                .into_iter()
                .map(|line| line.text)
                .collect::<Vec<_>>()
                .join("\n"),
        })
    }
}
