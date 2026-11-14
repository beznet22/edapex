#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${ROOT}/target/release/ocr-bench"
OUT_DIR="${OUT_DIR:-${ROOT}/.kimchi/docs/ocr-benchmark}"
INPUT="${1:-${ROOT}/.workspaces/1/AY4-2025/2026/6-g6_1-a/exams/examType-7/uploads}"
GOLD="${GOLD:-${OUT_DIR}/gold.json}"

if [[ ! -x "$BIN" ]]; then
  echo "missing $BIN; run: cargo +1.94.0 build --release -p ocr-bench" >&2
  exit 1
fi

"$BIN" \
  --input "$INPUT" \
  --gold "$GOLD" \
  --engine ocrs \
  --runs "${RUNS:-3}" \
  --warmup "${WARMUP:-1}" \
  --threads "${THREADS:-4}" \
  --ocrs-det "${OUT_DIR}/models/ocrs/text-detection.onnx" \
  --ocrs-rec "${OUT_DIR}/models/ocrs/text-recognition.onnx" \
  --out "${OUT_DIR}/results-ocrs.json" \
  --text-out "${OUT_DIR}/text-ocrs.jsonl"

"$BIN" \
  --input "$INPUT" \
  --gold "$GOLD" \
  --engine rusto \
  --runs "${RUNS:-3}" \
  --warmup "${WARMUP:-1}" \
  --threads "${THREADS:-4}" \
  --rusto-det "${OUT_DIR}/models/rusto/det.onnx" \
  --rusto-rec "${OUT_DIR}/models/rusto/rec.onnx" \
  --rusto-dict "${OUT_DIR}/models/rusto/dict.txt" \
  --out "${OUT_DIR}/results-rusto.json" \
  --text-out "${OUT_DIR}/text-rusto.jsonl"
