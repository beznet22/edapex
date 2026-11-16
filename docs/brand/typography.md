# Typography

The wordmark is set, not drawn. This document records the choice, the file it comes from, the
numbers the compositions are built on, and what to do when it changes.

## The typeface

**Plus Jakarta Sans SemiBold** (weight 600), designed by Gumpita Rahayu for Tokotype.

It was chosen against the four things the brief asked the type to say:

| Asked for | Why this face carries it |
|---|---|
| Intelligence, technology | Geometric skeleton, monolinear contrast, open counters — it reads as engineered rather than drawn. |
| Education | Softer terminals and a slightly taller x-height than a pure grotesque; it is legible at small sizes and not austere. |
| Trustworthiness | No novelty detailing. Nothing in the letterforms has to be explained. |
| Modernity | Contemporary proportions rather than a revival; the 2020 revision means the shapes are current. |

Rejected: **Inter** — the token sheet already assumes Inter's stylistic sets (`ss01`, `ss02`,
`cv01`), so it would have been coherent, but a wordmark set in the same face as the UI reads as a
label rather than a logo. **Manrope** — more overtly technical, and colder than a mark built from a
rounded book. Neither is a bad face; both were judged against this mark rather than in the
abstract.

## The file

| | |
|---|---|
| Path | `brand/source/fonts/PlusJakartaSans-SemiBold.ttf` |
| Release | 2.7.1, from `tokotype/PlusJakartaSans` |
| Licence | SIL Open Font License 1.1 — the full text ships beside it as `brand/source/fonts/OFL.txt` |
| SHA-256 | `de75ddb3917c5a3f2b7d0cd65fcf63795710f2e1fd944199a73a01731e66fd43` |
| Committed | Unmodified, one static weight. It is redistributed under the OFL with its licence, not renamed, not subset, so no Reserved Font Name question arises. |

`brand.tokens.json` records this under `typography`, including the hash. `brand:validate`
re-derives it, so replacing the file without updating the release notes is a failing check.

One naming quirk worth knowing before you install it for editing: this static build names the
weight into the family, so the installed family is **Plus Jakarta Sans SemiBold** with style
Regular, not "Plus Jakarta Sans" at weight 600. The editable sources list both, in that order.

## Metrics

Measured from the file, not copied from a specimen.

| Metric | Units (per 1000 em) |
|---|---|
| Units per em | 1000 |
| Cap height | 745 |
| x-height | 541 |
| Ascender | 972 |
| Descender | −228 |

Every proportion in a composition is a fraction of **745**, the cap height. That is the number
that ties the wordmark to the symbol: `lockup.symbolHeight` is 1.60 of it, `lockup.gap` is 0.50,
and the clear space is 0.50.

## The two settings

| Variant | String | Tracking | Cap height |
|---|---|---|---|
| Default | `Edapex` | −0.01em | 745 (1.0) |
| Uppercase | `EDAPEX` | +0.06em | 700 (0.94) |

`Edapex` is the identity. `EDAPEX` exists only for contexts where uppercase typography is the
surrounding convention; it is tracked out because all-caps at mixed-case spacing reads cramped,
and set at 94% of the mixed-case cap height because all-caps at the same size reads heavier.

`EdAPEX` is not a spelling this project produces. Neither is `EdApex`.

## How the outlines are produced

The editable source is real text:

- `brand/source/wordmark/edapex.svg`
- `brand/source/wordmark/edapex-caps.svg`

Each declares its family, weight, size, tracking and frame, and shows the string as `<text>`.
Open one with the font installed and it renders as the wordmark.

The exports under `brand/dist/logo/` are the same geometry converted to outlines by
`scripts/brand/core/type.mjs`, which lays the string out with **fontkit** against the committed
TTF and flips font space (y-up) into SVG space. That is why:

- no consumer needs the font installed;
- the same font produces identical paths on any machine, with no fontconfig dependency;
- kerning between `E` and `d` comes from the font's own GPOS table.

The trade is that the export is not hand-editable. Edit the source, then run
`pnpm brand:compositions`; `brand:validate` fails if a source and its outlines disagree about the
frame.

## Clear space and minimum size

Clear space is **0.50 × cap height** on all four sides of every composition, and it is baked into
each viewBox — the drawing already carries its margin, so a layout that places the file with no
extra padding still has it.

Minimum width, from the exported sizes and what the mark survives:

| Composition | Smallest sensible width |
|---|---|
| Horizontal lockup | 160px (below that the eye knockouts go) |
| Stacked lockup | 120px |
| Wordmark only | 96px |
| Symbol only | 24px |

## What not to do

- Do not stretch, condense, or re-track by hand. Change the tracking token and regenerate.
- Do not set the wordmark in another face to "match" a surface. The font is the identity.
- Do not put a lockup in a launcher icon. The adaptive mask shows 66dp of 108; a wordmark there is
  a smudge. Launcher icons are symbol-only, always.
- Do not outline the source by hand. The pipeline does it with the committed font, which is the
  only way the result stays reproducible.
- Do not ship the TTF to the browser as a webfont without a decision about payload size — 132KB
  for one weight, and nothing in the UI needs it yet.

## Changing the typeface

1. Drop the new `*-SemiBold.ttf` into `brand/source/fonts/`, with its licence beside it.
2. Update `FONT` in `scripts/brand/core/type.mjs`: file, family, release, foundry, licence.
3. Re-run `pnpm brand:build`. The cap height, x-height and every composition follow from the file.
4. Re-set the two source SVGs' frames — `wordmark-source.test.mjs` tells you the exact numbers to
   use when the frame no longer matches the outlines.
5. Inspect `brand/dist/preview/logo-compositions.png` before committing. The proportions in
   `lockup` were tuned against this face and may want a second look against another.
