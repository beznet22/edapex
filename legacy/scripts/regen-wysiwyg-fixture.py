#!/usr/bin/env python3
"""scripts/regen-wysiwyg-fixture.py

Regenerate tests/fixtures/wysiwyg-selectors.txt from the pre-split inline
`<style>` block of `WysiwygEditor.svelte` (currently at git HEAD).

Run this ONLY when an intentional style change is being committed. The
selector-diff verifier (scripts/verify-css-split.sh) compares this fixture
against the post-split partials under src/lib/components/editor/styles/.

Usage:
    python3 scripts/regen-wysiwyg-fixture.py
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
FIXTURE = REPO_ROOT / "tests/fixtures/wysiwyg-selectors.txt"
COMPONENT = REPO_ROOT / "src/lib/components/editor/WysiwygEditor.svelte"

KEYFRAME_TARGET_RE = re.compile(r"^(from|to|\d+(\.\d+)?%)$")


def normalize(sel: str) -> str | None:
    """Collapse internal whitespace; skip empty / keyframe targets."""
    if not sel:
        return None
    s = re.sub(r"\s+", " ", sel).strip()
    if not s:
        return None
    if KEYFRAME_TARGET_RE.match(s):
        return None
    return s


def extract_global_selectors(css_text: str) -> set[str]:
    """Extract every `:global(SELECTOR)` block respecting balanced parens.

    Multi-line `:global(...)` bodies are common (each selector piece on its
    own line). The script normalizes whitespace so all equivalent selectors
    compare equal.
    """
    out: set[str] = set()
    # Strip CSS comments so `:global(...)` mentions inside /* ... */ don't count.
    css_text = re.sub(r"/\*.*?\*/", "", css_text, flags=re.DOTALL)
    i = 0
    needle = ":global("
    while True:
        j = css_text.find(needle, i)
        if j < 0:
            break
        depth = 1
        k = j + len(needle)
        while k < len(css_text) and depth > 0:
            if css_text[k] == "(":
                depth += 1
            elif css_text[k] == ")":
                depth -= 1
            k += 1
        selector = css_text[j + len(needle) : k - 1]
        ns = normalize(selector)
        if ns:
            out.add(ns)
        i = k
    return out


def main() -> int:
    original = subprocess.run(
        ["git", "show", f"HEAD:{COMPONENT.relative_to(REPO_ROOT).as_posix()}"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout

    selectors = extract_global_selectors(original)
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text("\n".join(sorted(selectors)) + "\n")
    print(f"Wrote {len(selectors)} unique selectors to {FIXTURE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
