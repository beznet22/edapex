use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OcrBox {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OcrLine {
    pub text: String,
    pub confidence: f64,
    #[serde(rename = "box")]
    pub bounding_box: Option<OcrBox>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OcrPage {
    pub page_number: u32,
    pub width: u32,
    pub height: u32,
    pub text: String,
    pub mean_confidence: f64,
    pub lines: Vec<OcrLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OcrResult {
    pub engine: String,
    pub engine_version: String,
    pub model_version: String,
    pub pages: Vec<OcrPage>,
    pub mean_confidence: f64,
    pub fallback_recommended: bool,
    pub warnings: Vec<String>,
    pub duration_ms: f64,
}
