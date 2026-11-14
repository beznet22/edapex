use crate::types::RunReport;

fn optional(value: Option<f64>, digits: usize) -> String {
    value
        .map(|value| format!("{value:.digits$}"))
        .unwrap_or_else(|| "n/a".to_string())
}

fn mib(bytes: u64) -> String {
    format!("{:.1}", bytes as f64 / (1024.0 * 1024.0))
}

pub fn render_markdown(report: &RunReport) -> String {
    let mut out = String::new();
    out.push_str("# OCR Benchmark\n\n");
    out.push_str(&format!("- Host: {} / {}\n", report.host.os, report.host.arch));
    out.push_str(&format!("- CPU: {}\n", report.host.cpu));
    out.push_str(&format!("- Input: `{}`\n", report.input_dir));
    out.push_str("- Accuracy is scored against the supplied reference transcript; `n/a` means no entry.\n");
    out.push_str("- The Mistral reference column is the existing production OCR output, not human gold.\n");
    out.push_str("- Treat reference-based CER as relative agreement, not absolute accuracy.\n\n");

    out.push_str("| Engine | Images | Mean CER | Mean WER | Numeric recall | p50 ms | p95 ms | Pages/s | Peak RSS MiB | Init ms | Model MiB |\n");
    out.push_str("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n");
    for engine in &report.engines {
        out.push_str(&format!(
            "| {} {} | {} | {} | {} | {} | {:.1} | {:.1} | {:.2} | {:.1} | {:.0} | {} |\n",
            engine.engine,
            engine.version,
            engine.total_pages,
            optional(engine.mean_cer, 4),
            optional(engine.mean_wer, 4),
            optional(engine.mean_numeric_recall, 3),
            engine.p50_ms,
            engine.p95_ms,
            engine.pages_per_second,
            engine.peak_rss_kib as f64 / 1024.0,
            engine.init_ms,
            mib(engine.model_bytes),
        ));
    }
    out.push_str("\n## Per image\n\n");
    for engine in &report.engines {
        out.push_str(&format!("### {}\n\n", engine.engine));
        out.push_str("| Image | Runs | CER | WER | Numeric recall |\n");
        out.push_str("|---|---:|---:|---:|---:|\n");
        for image in &engine.images {
            out.push_str(&format!(
                "| `{}` | {} | {} | {} | {} |\n",
                image.file,
                image.runs_ms.len(),
                optional(image.cer, 4),
                optional(image.wer, 4),
                optional(image.numeric_recall, 3),
            ));
        }
        out.push('\n');
    }
    out
}
