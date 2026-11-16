#!/usr/bin/env bash
# scripts/verify-css-split.sh
#
# Verify that the CSS-split refactor of WysiwygEditor.svelte preserved every
# `:global(SELECTOR)` selector byte-for-byte from the pre-split inline <style>
# block to the post-split partial files under src/lib/components/editor/styles/.
#
# How it works:
#   1. The fixture tests/fixtures/wysiwyg-selectors.txt contains the original
#      selectors (one per line, sorted, deduplicated, normalized). It is the
#      source of truth for "what selectors existed before the split".
#   2. We extract every CSS rule selector from the six partial files, apply
#      the same normalization, sort and dedupe them.
#   3. We diff the two sorted sets.
#
# Normalization (applied to BOTH sides so they compare correctly):
#   - Strip leading/trailing whitespace.
#   - Collapse runs of whitespace inside the selector to a single space.
#   - Filter out keyframe targets ("to", "from", "0%"-"100%") which are not
#     real selectors — they appear inside @keyframes blocks.
#
# Exits 0 on byte-for-byte match, 1 on any delta, 2 on missing fixture/partials.
#
# To regenerate the fixture after an intentional style change:
#   python3 scripts/regen-wysiwyg-fixture.py

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURE="$REPO_ROOT/tests/fixtures/wysiwyg-selectors.txt"
PARTIALS_DIR="$REPO_ROOT/src/lib/components/editor/styles"

if [[ ! -f "$FIXTURE" ]]; then
    echo "FATAL: fixture not found at $FIXTURE" >&2
    echo "  Regenerate from git HEAD — see header comment of this script." >&2
    exit 2
fi

if [[ ! -d "$PARTIALS_DIR" ]]; then
    echo "FATAL: partials dir not found at $PARTIALS_DIR" >&2
    exit 2
fi

# Single Python extractor that handles both sides. Pass the file paths via
# stdin: line 1 = fixture, line 2 = partials dir.
PARTIAL_SELECTORS="$(python3 - "$PARTIALS_DIR" <<'PYEOF'
import re
import sys
from pathlib import Path

partials_dir = Path(sys.argv[1])

KEYFRAME_TARGET_RE = re.compile(r'^(from|to|\d+(\.\d+)?%)$')

# At-rules whose bodies should be recursed INTO (selector-bearing).
RECURSE_INTO = {'@media', '@supports', '@container', '@layer'}
# At-rules whose bodies should NOT be recursed into (no real selectors).
SKIP_INTO = {'@keyframes', '@font-face', '@page', '@charset', '@namespace'}


def normalize(sel: str) -> str | None:
    """Collapse internal whitespace; skip empty / keyframe targets."""
    if not sel:
        return None
    s = re.sub(r'\s+', ' ', sel).strip()
    if not s:
        return None
    if KEYFRAME_TARGET_RE.match(s):
        return None
    return s


def find_matching_brace(text: str, open_idx: int) -> int:
    depth = 1
    i = open_idx + 1
    n = len(text)
    while i < n and depth > 0:
        if text[i] == '{':
            depth += 1
        elif text[i] == '}':
            depth -= 1
        i += 1
    return i - 1


def extract_selectors(css_text: str) -> set[str]:
    selectors: set[str] = set()
    css_text = re.sub(r'/\*.*?\*/', '', css_text, flags=re.DOTALL)
    css_text = re.sub(r'@import\s+[^;]+;', '', css_text)

    def walk(text: str) -> None:
        i = 0
        n = len(text)
        depth = 0
        head_start = 0
        while i < n:
            ch = text[i]
            if ch == '{':
                if depth == 0:
                    head = text[head_start:i].strip()
                    close = find_matching_brace(text, i)
                    body = text[i + 1:close]
                    head_lower = head.lower()
                    if any(head_lower.startswith(r) for r in RECURSE_INTO):
                        walk(body)
                    elif not any(head_lower.startswith(r) for r in SKIP_INTO):
                        for sel in head.split(','):
                            ns = normalize(sel)
                            if ns:
                                selectors.add(ns)
                    head_start = close + 1
                    i = close + 1
                    continue
                depth += 1
            elif ch == '}':
                depth -= 1
            i += 1

    walk(css_text)
    return selectors


all_selectors: set[str] = set()
for css_path in sorted(partials_dir.glob("*.css")):
    all_selectors |= extract_selectors(css_path.read_text())

for sel in sorted(all_selectors):
    print(sel)
PYEOF
)"

FIXTURE_SELECTORS="$(python3 - "$FIXTURE" <<'PYEOF'
import re
import sys

KEYFRAME_TARGET_RE = re.compile(r'^(from|to|\d+(\.\d+)?%)$')


def normalize(sel: str) -> str | None:
    if not sel:
        return None
    s = re.sub(r'\s+', ' ', sel).strip()
    if not s:
        return None
    if KEYFRAME_TARGET_RE.match(s):
        return None
    return s


fixture_path = sys.argv[1]
selectors = set()
with open(fixture_path) as f:
    for line in f:
        ns = normalize(line)
        if ns:
            selectors.add(ns)

for sel in sorted(selectors):
    print(sel)
PYEOF
)"

DIFF_OUTPUT="$(diff <(echo "$FIXTURE_SELECTORS") <(echo "$PARTIAL_SELECTORS") || true)"

if [[ -n "$DIFF_OUTPUT" ]]; then
    echo "FAIL: CSS split introduced selector drift between fixture and partials." >&2
    echo "" >&2
    echo "$DIFF_OUTPUT" >&2
    FIXTURE_COUNT=$(echo "$FIXTURE_SELECTORS" | wc -l)
    PARTIAL_COUNT=$(echo "$PARTIAL_SELECTORS" | wc -l)
    echo "" >&2
    echo "Fixture selectors (normalized): $FIXTURE_COUNT" >&2
    echo "Partial selectors (normalized): $PARTIAL_COUNT" >&2
    exit 1
fi

COUNT=$(echo "$FIXTURE_SELECTORS" | wc -l)
echo "OK: $COUNT selectors preserved byte-for-byte across the CSS split."
