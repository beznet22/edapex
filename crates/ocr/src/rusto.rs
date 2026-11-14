use std::path::Path;
use std::time::Instant;

use image::image_dimensions;
use rusto::{
    DetectTextResult, ImageSource, InitializeConfig, OcrRunOptions, RustO, TextResult,
};

use crate::error::OcrError;
use crate::models::{load_models, ModelSet};
use crate::result::{OcrBox, OcrLine, OcrPage, OcrResult};

pub const RUSTO_ENGINE_VERSION: &str = "0.3.2";
pub const LOW_MEAN_CONFIDENCE: f64 = 0.80;
pub const LOW_LINE_CONFIDENCE: f64 = 0.50;

pub struct RustOEngine {
    engine: RustO,
    models: ModelSet,
}

impl RustOEngine {
    pub fn load(models_dir: &Path) -> Result<Self, OcrError> {
        let models = load_models(models_dir)?;
        let engine = RustO::initialize(InitializeConfig::ppv6(
            &models.det,
            &models.rec,
            &models.dict,
        ))
        .map_err(|error| OcrError::Initialize(error.to_string()))?;
        Ok(Self { engine, models })
    }

    pub fn models(&self) -> &ModelSet {
        &self.models
    }

    pub fn extract_path(&mut self, image: &Path) -> Result<OcrResult, OcrError> {
        let (width, height) = image_dimensions(image)
            .map_err(|error| OcrError::ImageMetadata(error.to_string()))?;
        if width == 0 || height == 0 {
            return Err(OcrError::ImageMetadata(
                "image has zero width or height".to_string(),
            ));
        }

        let started = Instant::now();
        let detected = self
            .engine
            .detect_text(
                &ImageSource::Path(image.to_path_buf()),
                &OcrRunOptions::default(),
            )
            .map_err(|error| OcrError::Inference(error.to_string()))?;
        let DetectTextResult::Structured(lines) = detected else {
            return Err(OcrError::UnstructuredOutput);
        };

        let (lines, text, mean_confidence, fallback_recommended, warnings) =
            project_lines(lines, width, height);
        let duration_ms = started.elapsed().as_secs_f64() * 1000.0;

        Ok(OcrResult {
            engine: "rusto".to_string(),
            engine_version: RUSTO_ENGINE_VERSION.to_string(),
            model_version: self.models.version.clone(),
            pages: vec![OcrPage {
                page_number: 1,
                width,
                height,
                text,
                mean_confidence,
                lines,
            }],
            mean_confidence,
            fallback_recommended,
            warnings,
            duration_ms,
        })
    }
}

fn project_lines(
    results: Vec<TextResult>,
    width: u32,
    height: u32,
) -> (Vec<OcrLine>, String, f64, bool, Vec<String>) {
    let page_width = width as f32;
    let page_height = height as f32;
    let mut lines = Vec::with_capacity(results.len());

    for result in results {
        let text = result.text.trim().to_string();
        if text.is_empty() {
            continue;
        }
        let confidence = (result.score as f64).clamp(0.0, 1.0);
        let frame = result.frame;
        let box_geometry = OcrBox {
            x: (frame.left / page_width).clamp(0.0, 1.0) as f64,
            y: (frame.top / page_height).clamp(0.0, 1.0) as f64,
            width: (frame.width / page_width).clamp(0.0, 1.0) as f64,
            height: (frame.height / page_height).clamp(0.0, 1.0) as f64,
        };
        lines.push(OcrLine {
            text,
            confidence,
            bounding_box: Some(box_geometry),
        });
    }

    let text = lines
        .iter()
        .map(|line| line.text.as_str())
        .collect::<Vec<_>>()
        .join("\n");
    let mean_confidence = if lines.is_empty() {
        0.0
    } else {
        lines.iter().map(|line| line.confidence).sum::<f64>() / lines.len() as f64
    };
    let low_line = lines
        .iter()
        .any(|line| line.confidence < LOW_LINE_CONFIDENCE);
    let fallback_recommended = lines.is_empty()
        || mean_confidence < LOW_MEAN_CONFIDENCE
        || low_line;

    let mut warnings = Vec::new();
    if lines.is_empty() {
        warnings.push("no_text".to_string());
    } else {
        if mean_confidence < LOW_MEAN_CONFIDENCE {
            warnings.push("low_confidence".to_string());
        }
        if low_line {
            warnings.push("low_confidence_lines".to_string());
        }
    }

    (lines, text, mean_confidence, fallback_recommended, warnings)
}

#[cfg(test)]
mod tests {
    use rusto::{Frame, TextResult};

    use super::*;

    fn line(text: &str, score: f32, left: f32, top: f32, width: f32, height: f32) -> TextResult {
        TextResult {
            text: text.to_string(),
            score,
            box_points: [(left, top), (left + width, top), (left + width, top + height), (left, top + height)],
            frame: Frame::new(width, height, top, left),
        }
    }

    #[test]
    fn projects_boxes_and_confidence() {
        let (lines, text, mean, fallback, warnings) = project_lines(
            vec![
                line("CA 10", 0.9, 10.0, 20.0, 30.0, 40.0),
                line("EX 5", 0.8, 50.0, 20.0, 20.0, 40.0),
            ],
            100,
            100,
        );
        assert_eq!(text, "CA 10\nEX 5");
        assert_eq!(lines.len(), 2);
        assert!((mean - 0.85).abs() < 1e-6);
        assert!(!fallback);
        assert!(warnings.is_empty());
        let first = &lines[0];
        let box_geometry = first.bounding_box.as_ref().unwrap();
        assert!((box_geometry.x - 0.1).abs() < 0.0001);
        assert!((box_geometry.y - 0.2).abs() < 0.0001);
    }

    #[test]
    fn flags_low_confidence_and_empty_text() {
        let (_, _, _, fallback, warnings) =
            project_lines(vec![line("CA 10", 0.4, 0.0, 0.0, 10.0, 10.0)], 100, 100);
        assert!(fallback);
        assert!(warnings.contains(&"low_confidence".to_string()));
        assert!(warnings.contains(&"low_confidence_lines".to_string()));

        let (_, text, mean, fallback, warnings) = project_lines(Vec::new(), 100, 100);
        assert_eq!(text, "");
        assert_eq!(mean, 0.0);
        assert!(fallback);
        assert_eq!(warnings, vec!["no_text".to_string()]);
    }

    #[test]
    fn serializes_to_the_typescript_contract() {
        let result = OcrResult {
            engine: "rusto".to_string(),
            engine_version: RUSTO_ENGINE_VERSION.to_string(),
            model_version: "pp-ocrv6-tiny".to_string(),
            pages: Vec::new(),
            mean_confidence: 0.0,
            fallback_recommended: true,
            warnings: vec!["no_text".to_string()],
            duration_ms: 1.0,
        };
        let value = serde_json::to_value(result).unwrap();
        assert!(value.get("fallbackRecommended").is_some());
        assert!(value.get("durationMs").is_some());
        assert!(value.get("modelVersion").is_some());
    }

    #[test]
    #[ignore = "requires EDAPEX_OCR_MODELS_DIR and EDAPEX_OCR_TEST_IMAGE"]
    fn extracts_with_local_models() {
        let models_dir = std::env::var("EDAPEX_OCR_MODELS_DIR").unwrap();
        let image = std::env::var("EDAPEX_OCR_TEST_IMAGE").unwrap();
        let mut engine = RustOEngine::load(Path::new(&models_dir)).unwrap();
        let result = engine.extract_path(Path::new(&image)).unwrap();
        assert_eq!(result.engine, "rusto");
        assert!(!result.pages.is_empty());
        assert!(!result.pages[0].text.trim().is_empty());
    }
}
