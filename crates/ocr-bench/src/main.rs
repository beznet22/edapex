mod engines;
mod metrics;
mod report;
mod types;

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use clap::Parser;
use sha2::{Digest, Sha256};

use crate::engines::ocrs::OcrSEngine;
use crate::engines::rusto::RustOEngine;
use crate::types::{
    Cli, EngineChoice, EngineReport, GoldFile, HostInfo, ImageMetrics, OcrRunner, RunReport,
};

fn main() {
    if let Err(err) = run() {
        eprintln!("ocr-bench: {err}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let cli = Cli::parse();
    if cli.engine == EngineChoice::All {
        return Err("run one engine per process for clean peak RSS: use --engine ocrs or --engine rusto".to_string());
    }
    if cli.runs == 0 {
        return Err("--runs must be at least 1".to_string());
    }
    if !cli.input.is_dir() {
        return Err(format!("input directory not found: {}", cli.input.display()));
    }

    std::env::set_var("RAYON_NUM_THREADS", cli.threads.to_string());
    std::env::set_var("RTEN_NUM_THREADS", cli.threads.to_string());

    let images = discover_images(&cli.input, cli.limit)?;
    if images.is_empty() {
        return Err(format!("no JPEG/PNG images in {}", cli.input.display()));
    }
    let gold = load_gold(cli.gold.as_deref())?;

    let init_start = Instant::now();
    let mut runner: Box<dyn OcrRunner> = match cli.engine {
        EngineChoice::OcrS => {
            let det = cli
                .ocrs_det
                .ok_or_else(|| "--ocrs-det is required for ocrs".to_string())?;
            let rec = cli
                .ocrs_rec
                .ok_or_else(|| "--ocrs-rec is required for ocrs".to_string())?;
            Box::new(OcrSEngine::new(det, rec)?)
        }
        EngineChoice::RustO => {
            let det = cli
                .rusto_det
                .ok_or_else(|| "--rusto-det is required for rusto".to_string())?;
            let rec = cli
                .rusto_rec
                .ok_or_else(|| "--rusto-rec is required for rusto".to_string())?;
            let dict = cli
                .rusto_dict
                .ok_or_else(|| "--rusto-dict is required for rusto".to_string())?;
            Box::new(RustOEngine::new(det, rec, dict)?)
        }
        EngineChoice::All => unreachable!(),
    };
    let init_ms = init_start.elapsed().as_secs_f64() * 1000.0;

    let first = images
        .first()
        .ok_or_else(|| "no images to warm up".to_string())?;
    for _ in 0..cli.warmup {
        let _ = runner.run(first)?;
    }

    let mut image_metrics = Vec::with_capacity(images.len());
    let mut text_records: Vec<serde_json::Value> = Vec::with_capacity(images.len());
    for image in &images {
        let mut runs_ms = Vec::with_capacity(cli.runs);
        let mut first_text = String::new();
        for index in 0..cli.runs {
            let start = Instant::now();
            let output = runner.run(image)?;
            runs_ms.push(start.elapsed().as_secs_f64() * 1000.0);
            if index == 0 {
                first_text = output.text;
            }
        }

        let (width, height) = image::image_dimensions(image)
            .map_err(|err| format!("read dimensions for {}: {err}", image.display()))?;
        let sha256 = sha256_file(image)?;
        let file = image
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| format!("invalid image filename: {}", image.display()))?
            .to_string();
        let gold_text = gold
            .as_ref()
            .and_then(|gold| gold.images.get(&file))
            .map(|entry| entry.text.as_str());
        let mistral_text = load_mistral_reference(cli.mistral_dir.as_deref(), &file);

        let cer = gold_text.and_then(|reference| metrics::cer(reference, &first_text));
        let wer = gold_text.and_then(|reference| metrics::wer(reference, &first_text));
        let numeric_recall =
            gold_text.and_then(|reference| metrics::numeric_recall(reference, &first_text));
        let mistral_reference_cer = gold_text
            .zip(mistral_text.as_deref())
            .and_then(|(gold, reference)| metrics::cer(gold, reference));

        image_metrics.push(ImageMetrics {
            file: file.clone(),
            sha256,
            width,
            height,
            runs_ms,
            text: first_text.clone(),
            gold_chars: gold_text.map(|text| metrics::normalize_text(text).chars().count()),
            cer,
            wer,
            numeric_recall,
            mistral_reference_cer,
        });
        text_records.push(serde_json::json!({
            "file": file,
            "engine": engine_name(cli.engine),
            "text": first_text,
        }));
    }

    let all_run_ms: Vec<f64> = image_metrics
        .iter()
        .flat_map(|image| image.runs_ms.iter().copied())
        .collect();
    let total_run_ms: f64 = all_run_ms.iter().sum();
    let model_files: Vec<PathBuf> = runner.model_files();
    let model_bytes = metrics::dir_bytes(&model_files);
    let report = RunReport {
        generated_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs().to_string())
            .unwrap_or_else(|_| "0".to_string()),
        host: host_info(),
        input_dir: cli.input.display().to_string(),
        engines: vec![EngineReport {
            engine: engine_name(cli.engine).to_string(),
            version: runner.version().to_string(),
            model_files: model_files
                .iter()
                .map(|path| path.display().to_string())
                .collect(),
            model_bytes,
            init_ms,
            threads: cli.threads,
            total_pages: image_metrics.len(),
            total_run_ms,
            pages_per_second: if total_run_ms > 0.0 {
                (image_metrics.len() * cli.runs) as f64 / (total_run_ms / 1000.0)
            } else {
                0.0
            },
            p50_ms: metrics::quantile(&all_run_ms, 0.5),
            p95_ms: metrics::quantile(&all_run_ms, 0.95),
            peak_rss_kib: peak_rss_kib(),
            mean_cer: metrics::mean(image_metrics.iter().filter_map(|image| image.cer)),
            mean_wer: metrics::mean(image_metrics.iter().filter_map(|image| image.wer)),
            mean_numeric_recall: metrics::mean(
                image_metrics.iter().filter_map(|image| image.numeric_recall),
            ),
            mean_mistral_reference_cer: metrics::mean(
                image_metrics
                    .iter()
                    .filter_map(|image| image.mistral_reference_cer),
            ),
            images: image_metrics,
        }],
    };

    if let Some(parent) = cli.out.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("create output dir: {err}"))?;
    }
    fs::write(&cli.out, serde_json::to_vec_pretty(&report).map_err(|err| err.to_string())?)
        .map_err(|err| format!("write {}: {err}", cli.out.display()))?;

    if let Some(path) = cli.text_out {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|err| format!("create text dir: {err}"))?;
        }
        let mut lines = String::new();
        for record in text_records {
            lines.push_str(&serde_json::to_string(&record).map_err(|err| err.to_string())?);
            lines.push('\n');
        }
        fs::write(&path, lines).map_err(|err| format!("write {}: {err}", path.display()))?;
    }

    let markdown = report::render_markdown(&report);
    println!("{markdown}");
    Ok(())
}

fn engine_name(choice: EngineChoice) -> &'static str {
    match choice {
        EngineChoice::OcrS => "ocrs",
        EngineChoice::RustO => "rusto",
        EngineChoice::All => "all",
    }
}

fn discover_images(dir: &Path, limit: usize) -> Result<Vec<PathBuf>, String> {
    let mut images = Vec::new();
    let entries = fs::read_dir(dir).map_err(|err| format!("read {}: {err}", dir.display()))?;
    for entry in entries {
        let entry = entry.map_err(|err| err.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .map(str::to_ascii_lowercase);
        if matches!(extension.as_deref(), Some("jpg" | "jpeg" | "png")) {
            images.push(path);
        }
    }
    images.sort();
    images.truncate(limit);
    Ok(images)
}

fn load_gold(path: Option<&Path>) -> Result<Option<GoldFile>, String> {
    let Some(path) = path else {
        return Ok(None);
    };
    let bytes = fs::read(path).map_err(|err| format!("read gold {}: {err}", path.display()))?;
    let gold: GoldFile =
        serde_json::from_slice(&bytes).map_err(|err| format!("parse gold: {err}"))?;
    if gold.images.is_empty() {
        return Err("gold file has no images".to_string());
    }
    Ok(Some(gold))
}

fn load_mistral_reference(dir: Option<&Path>, file: &str) -> Option<String> {
    let dir = dir?;
    fs::read_to_string(dir.join(format!("{file}.md"))).ok()
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|err| format!("read {}: {err}", path.display()))?;
    let digest = Sha256::digest(&bytes);
    Ok(format!("{digest:x}"))
}

fn peak_rss_kib() -> u64 {
    let Ok(status) = fs::read_to_string("/proc/self/status") else {
        return 0;
    };
    status
        .lines()
        .find_map(|line| {
            let rest = line.strip_prefix("VmHWM:")?;
            rest.split_whitespace().next()?.parse::<u64>().ok()
        })
        .unwrap_or(0)
}

fn host_info() -> HostInfo {
    let cpu = fs::read_to_string("/proc/cpuinfo")
        .ok()
        .and_then(|contents| {
            contents.lines().find_map(|line| {
                line.strip_prefix("model name")
                    .and_then(|rest| rest.split_once(':'))
                    .map(|(_, value)| value.trim().to_string())
            })
        })
        .unwrap_or_else(|| "unknown".to_string());
    HostInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        cpu,
    }
}

