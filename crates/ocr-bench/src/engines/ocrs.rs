use std::path::PathBuf;

use ocrs::{ImageSource, OcrEngine, OcrEngineParams};
use rten::Model;

use crate::types::{EngineOutput, OcrRunner};

pub struct OcrSEngine {
    engine: OcrEngine,
    model_files: Vec<PathBuf>,
}

impl OcrSEngine {
    pub fn new(det: PathBuf, rec: PathBuf) -> Result<Self, String> {
        let detection_model = Model::load_file(&det)
            .map_err(|err| format!("load ocrs detection model {}: {err}", det.display()))?;
        let recognition_model = Model::load_file(&rec)
            .map_err(|err| format!("load ocrs recognition model {}: {err}", rec.display()))?;
        let engine = OcrEngine::new(OcrEngineParams {
            detection_model: Some(detection_model),
            recognition_model: Some(recognition_model),
            ..Default::default()
        })
        .map_err(|err| format!("create ocrs engine: {err}"))?;
        Ok(Self {
            engine,
            model_files: vec![det, rec],
        })
    }
}

impl OcrRunner for OcrSEngine {
    fn version(&self) -> &'static str {
        "0.14.0"
    }

    fn model_files(&self) -> Vec<PathBuf> {
        self.model_files.clone()
    }

    fn run(&mut self, image: &std::path::Path) -> Result<EngineOutput, String> {
        let image = image::open(image)
            .map_err(|err| format!("open image: {err}"))?
            .into_rgb8();
        let source = ImageSource::from_bytes(image.as_raw(), image.dimensions())
            .map_err(|err| format!("prepare ocrs image: {err}"))?;
        let input = self
            .engine
            .prepare_input(source)
            .map_err(|err| format!("prepare ocrs input: {err}"))?;
        let text = self
            .engine
            .get_text(&input)
            .map_err(|err| format!("ocrs inference: {err}"))?;
        Ok(EngineOutput { text })
    }
}
