use std::collections::BTreeMap;
use std::path::PathBuf;

use clap::{Parser, ValueEnum};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
pub enum EngineChoice {
    All,
    #[value(name = "ocrs", alias = "ocr-s")]
    OcrS,
    #[value(name = "rusto", alias = "rust-o")]
    RustO,
}

#[derive(Debug, Parser)]
#[command(name = "ocr-bench")]
#[command(about = "CPU OCR benchmark for EdApex exam uploads")]
pub struct Cli {
    /// Directory containing JPEG/PNG exam images.
    #[arg(long)]
    pub input: PathBuf,

    /// Optional human gold JSON. Without it, only latency and text output are produced.
    #[arg(long)]
    pub gold: Option<PathBuf>,

    /// Directory containing Mistral OCR markdown named <image>.md.
    #[arg(long)]
    pub mistral_dir: Option<PathBuf>,

    /// Which engine to run. Each invocation should contain one engine for clean RSS.
    #[arg(long, value_enum, default_value_t = EngineChoice::OcrS)]
    pub engine: EngineChoice,

    #[arg(long, default_value_t = 3)]
    pub runs: usize,

    #[arg(long, default_value_t = 1)]
    pub warmup: usize,

    #[arg(long, default_value_t = 4)]
    pub threads: usize,

    #[arg(long, default_value_t = usize::MAX)]
    pub limit: usize,

    #[arg(long)]
    pub out: PathBuf,

    #[arg(long)]
    pub text_out: Option<PathBuf>,

    #[arg(long)]
    pub ocrs_det: Option<PathBuf>,

    #[arg(long)]
    pub ocrs_rec: Option<PathBuf>,

    #[arg(long)]
    pub rusto_det: Option<PathBuf>,

    #[arg(long)]
    pub rusto_rec: Option<PathBuf>,

    #[arg(long)]
    pub rusto_dict: Option<PathBuf>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct GoldFile {
    pub images: BTreeMap<String, GoldEntry>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct GoldEntry {
    pub text: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct ImageMetrics {
    pub file: String,
    pub sha256: String,
    pub width: u32,
    pub height: u32,
    pub runs_ms: Vec<f64>,
    pub text: String,
    pub gold_chars: Option<usize>,
    pub cer: Option<f64>,
    pub wer: Option<f64>,
    pub numeric_recall: Option<f64>,
    pub mistral_reference_cer: Option<f64>,
}

#[derive(Clone, Debug, Serialize)]
pub struct EngineReport {
    pub engine: String,
    pub version: String,
    pub model_files: Vec<String>,
    pub model_bytes: u64,
    pub init_ms: f64,
    pub threads: usize,
    pub images: Vec<ImageMetrics>,
    pub total_pages: usize,
    pub total_run_ms: f64,
    pub pages_per_second: f64,
    pub p50_ms: f64,
    pub p95_ms: f64,
    pub peak_rss_kib: u64,
    pub mean_cer: Option<f64>,
    pub mean_wer: Option<f64>,
    pub mean_numeric_recall: Option<f64>,
    pub mean_mistral_reference_cer: Option<f64>,
}

#[derive(Clone, Debug, Serialize)]
pub struct RunReport {
    pub generated_at: String,
    pub host: HostInfo,
    pub input_dir: String,
    pub engines: Vec<EngineReport>,
}

#[derive(Clone, Debug, Serialize)]
pub struct HostInfo {
    pub os: String,
    pub arch: String,
    pub cpu: String,
}

#[derive(Clone, Debug)]
pub struct EngineOutput {
    pub text: String,
}

pub trait OcrRunner {
    fn version(&self) -> &'static str;
    fn model_files(&self) -> Vec<PathBuf>;
    fn run(&mut self, image: &std::path::Path) -> Result<EngineOutput, String>;
}
