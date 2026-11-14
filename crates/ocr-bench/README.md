# OCR Benchmark

Standalone CPU benchmark for comparing local OCR engines on the AY4 exam uploads.

## Privacy

Exam images and transcripts are student PII. They must stay under `.kimchi/docs/ocr-benchmark/` or `.workspaces/`; both are gitignored. Do not commit images, gold text or per-image OCR text. The tracked report contains aggregate metrics only.

## Models

- `ocrs 0.14.0`: text-detection and text-recognition ONNX models from `ocrs-models`.
- `rusto-rs 0.3.2`: PP-OCRv6 tiny detection, recognition and dictionary from ModelScope.

## Run

Build with Rust 1.94 or newer because `rten 0.28` requires it:

```bash
cargo +1.94.0 build --release -p ocr-bench
```

Run each engine in its own process so `VmHWM` is not contaminated:

```bash
target/release/ocr-bench \
  --input .workspaces/1/AY4-2025/2026/6-g6_1-a/exams/examType-7/uploads \
  --gold .kimchi/docs/ocr-benchmark/gold.json \
  --engine rusto --runs 3 --warmup 1 --threads 4 \
  --rusto-det .kimchi/docs/ocr-benchmark/models/rusto/det.onnx \
  --rusto-rec .kimchi/docs/ocr-benchmark/models/rusto/rec.onnx \
  --rusto-dict .kimchi/docs/ocr-benchmark/models/rusto/dict.txt \
  --out .kimchi/docs/ocr-benchmark/results-rusto.json
```

```bash
target/release/ocr-bench \
  --input .workspaces/1/AY4-2025/2026/6-g6_1-a/exams/examType-7/uploads \
  --gold .kimchi/docs/ocr-benchmark/gold.json \
  --engine ocrs --runs 3 --warmup 1 --threads 4 \
  --ocrs-det .kimchi/docs/ocr-benchmark/models/ocrs/text-detection.onnx \
  --ocrs-rec .kimchi/docs/ocr-benchmark/models/ocrs/text-recognition.onnx \
  --out .kimchi/docs/ocr-benchmark/results-ocrs.json
```

## Metrics

- CER and WER after NFKC normalization, uppercase conversion, punctuation removal and whitespace collapse.
- Numeric recall: every number in the reference must appear in the hypothesis.
- p50/p95 over all measured runs.
- Peak RSS from `/proc/self/status` `VmHWM`.
- Model size from the on-disk model files.

## Reference limitation

The first run used the existing Mistral markdown as a reference transcript because no complete human gold set existed. These numbers measure **agreement with the current production OCR**, not absolute accuracy. The first page was manually checked to confirm the Mistral reference and the numeric sequence; do not extend that to all 16 pages without a full human review.

## Measured result

On the 16-image `6-g6_1-a` set, 4 threads, 3 runs per image:

| Engine | Mean CER | Mean WER | Numeric recall | p50 | p95 | Peak RSS | Model |
|---|---:|---:|---:|---:|---:|---:|---:|
| RustO 0.3.2 / PP-OCRv6 tiny | 0.148 | 0.223 | 0.925 | 1219 ms | 1289 ms | 257 MiB | 6.1 MiB |
| ocrs 0.14.0 | 0.365 | 0.635 | 0.254 | 1073 ms | 1226 ms | 328 MiB | 11.6 MiB |

RustO is the only engine that is close enough to be a local prefill. Neither engine is accurate enough to replace Mistral for handwritten marksheets without field validation.
