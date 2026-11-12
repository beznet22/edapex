# edapex-ocr

Local OCR for EdApex Work. RustO 0.3.2 / PP-OCRv6 tiny is the default engine; Mistral OCR is an explicit API-side fallback and is not implemented in this crate.

## Model layout

```text
models/
  manifest.json
  det.onnx
  rec.onnx
  dict.txt
```

`manifest.json` pins the version, source URLs, byte lengths and SHA-256 for each file. `load_models` fails closed on a missing file, a size mismatch, a checksum mismatch or an unsafe path. The crate never downloads models at runtime.

Fetch and verify the models:

```bash
node scripts/fetch-rusto-models.mjs
```

The default destination is `apps/desktop/src-tauri/resources/ocr`. Model binaries are gitignored; only the manifest is committed.

## Usage

```rust
use edapex_ocr::RustOEngine;

let mut engine = RustOEngine::load(std::path::Path::new("models"))?;
let result = engine.extract_path(std::path::Path::new("capture.jpg"))?;
```

The result carries page text, lines, confidence, normalized boxes, warnings, duration and `fallbackRecommended`. A low-confidence result is prefill only; it never writes a marksheet.

## Tests

```bash
cargo test -p edapex-ocr
```

The real-engine test is ignored because models and a tenant-safe image are not committed:

```bash
EDAPEX_OCR_MODELS_DIR=... EDAPEX_OCR_TEST_IMAGE=... \
  cargo test -p edapex-ocr extracts_with_local_models -- --ignored
```

Benchmark evidence is in `.kimchi/docs/ocr-benchmark/` and is not committed. Current desktop baseline: CER 0.1479, numeric recall 0.9251, p95 1,289 ms, peak RSS 256.5 MiB, 6.1 MiB models.
