# Brand assets

One canonical mark, one pipeline, and a table that says where every generated file belongs.
Nothing in this pipeline writes into an application tree — `brand/dist/placement.json` is the
handoff, and applying it is a separate, reviewable step.

**Applying the assets?** Read [`brand/README.md`](../brand/README.md) instead — it has the copy
command, the follow-ups a copy cannot do, and the verification to run afterwards. This document is
the operator's manual for the pipeline itself.

## Source of truth

| File | Role |
|---|---|
| `apps/web/public/brand/edapex_brand_mark.svg` | **The mark.** Three paths, `viewBox 0 0 588 517`, transparent, black fill. The only editable artwork. |
| `apps/web/public/brand/edapex_brand_mark_black_transparent.png` | Committed raster reference the validator measures against. |
| `apps/web/public/brand/edapex_brand_mark_white_transparent.png` | The same silhouette in white, for dark surfaces. |
| `packages/tokens/tokens.css` | **The palette.** Every colour in `scripts/brand/brand.tokens.json` is derived from its `:root` and `.dark` blocks. |
| `brand/source/wordmark/edapex.svg`, `edapex-caps.svg` | **The wordmark, as editable text.** Plus Jakarta Sans SemiBold, with the family, tracking and frame declared in the file. |
| `brand/source/fonts/PlusJakartaSans-SemiBold.ttf` | The typeface, unmodified, from release 2.7.1, with `OFL.txt` beside it. Its SHA-256 is recorded in the token sheet. See [`typography.md`](typography.md). |

`scripts/brand/brand.tokens.json` is generated, committed, and re-derived by `brand:validate`.
It holds the resolved sRGB palette, the mark's viewBox and measured ink radius, the icon safe-zone
ratios and the size tables every generator reads. Edit the token sheet or the SVG, never this file.

## Outputs

Everything is written under `brand/dist/`, grouped by family, and committed:

| Directory | What |
|---|---|
| `brand/dist/logo/` | black, white and primary variants at 256–2048 as PNG and lossless WebP, plus the optimised SVG. Reference art; not packaged. |
| `brand/dist/logo/lockup-*`, `wordmark-*` | the four compositions — horizontal, stacked, `Edapex`, `EDAPEX` — as outlines, on light and on dark, each as SVG plus 1024/2048 PNG and 1024 WebP. |
| `brand/dist/web/` | theme-aware `favicon.svg`, `favicon.ico` (16/32/48), favicon PNGs, a 180px apple-touch icon, and a 1200×630 share card as PNG and WebP. |
| `brand/dist/pwa/` | 192 and 512 install icons plus a 512 maskable icon held inside the safe circle. |
| `brand/dist/desktop/` | the Tauri PNG grid, `icon.ico`, `icon.icns` and the Windows Store logos. |
| `brand/dist/android/` | four launcher layers per density, the adaptive-icon XML pair, the background colour resource, and copies of the splash vector and mobile mark. |
| `brand/dist/ios/` | Tauri's 18-slot per-size set, plus a single-size `AppIcon.appiconset` (one universal 1024). Every file is opaque. |
| `brand/dist/macos/` | `icon.iconset/` in `iconutil` naming, and `icon.icns` packed from the same buffers. |
| `brand/dist/social/` | a 1024 square avatar and a 1500×500 cover. Marketing; not packaged. |
| `brand/dist/preview/` | five contact sheets, described below. Not mapped; not packaged. |
| `brand/dist/placement.json` | the destination table. |

## Toolchain

`sharp` (pinned in the root `devDependencies`) renders, fits, recolours and encodes. **`fontkit`**
(3.0.0, MIT) lays the wordmark out against the committed TTF and returns glyph outlines, so the
exports need no font installed and no fontconfig anywhere; the alternative — `<text>` rendered by
librsvg or Inkscape — would depend on what the machine happens to have. ICO and ICNS
containers are written by `scripts/brand/core/ico.mjs` and `icns.mjs` rather than by `tauri icon`,
because `tauri icon --output` still writes mobile icons into `gen/android` as a side effect, and
this pipeline must not touch an application tree.

The legacy `scripts/build-brand-mark.mjs` still owns the Android splash vector and the mobile
mark. It is **not** part of `brand:build`, because it writes into `gen/android` and
`apps/desktop/mobile/src/assets`. Run it as `pnpm brand:mark` when you intend to write those.

```bash
pnpm install            # resolves sharp from the lockfile
node --version          # 22.18 or newer
```

`svgo` is optional: if it is not on `PATH`, the logo SVG is copied unoptimised and the run says so.

## Commands

| Command | Writes |
|---|---|
| `pnpm brand:tokens` | `scripts/brand/brand.tokens.json` |
| `pnpm brand:logos` | `brand/dist/logo/` |
| `pnpm brand:compositions` | the lockups and wordmarks in `brand/dist/logo/` |
| `pnpm brand:desktop` | `brand/dist/desktop/` |
| `pnpm brand:android` | `brand/dist/android/` |
| `pnpm brand:ios` | `brand/dist/ios/` |
| `pnpm brand:macos` | `brand/dist/macos/` |
| `pnpm brand:web` | `brand/dist/web/` |
| `pnpm brand:pwa` | `brand/dist/pwa/` |
| `pnpm brand:social` | `brand/dist/social/` |
| `pnpm brand:icons` | desktop and Android icons |
| `pnpm brand:placement` | `brand/dist/placement.json` |
| `pnpm brand:preview` | `brand/dist/preview/` |
| `pnpm brand:build` | everything above, then validation |
| `pnpm brand:validate` | nothing; exits non-zero on a problem |
| `pnpm brand:test` | nothing; the unit tests |
| `pnpm brand:mark` | the legacy splash vector and mobile mark |
| `pnpm brand:verify` | nothing; the four legacy mark checks |

Every command prints one line per family with a file count, or `SKIP` with the reason. A family
that generated nothing is a failure, not a tidy run.

## Updating the logo

1. Edit `apps/web/public/brand/edapex_brand_mark.svg`. Keep the geometry: this pipeline preserves
   the mark, it does not redraw it.
2. `pnpm brand:build`. The ink radius and centre are re-measured, so every fitted asset follows.
3. `pnpm brand:verify` for the legacy mark checks, then look at `brand/dist/preview/`.
4. Commit `brand/dist/` with the source change.

If the mark's aspect changes, `brand:validate` will notice the exports no longer match the
reference raster and fail — that is the reference PNG being stale, not the pipeline.

## Validating

`pnpm brand:validate` runs seven checks and exits non-zero:

- **coverage** — every file in `brand/dist/` has exactly one placement row, every row's file
  exists, and no two rows claim one destination.
- **tokens** — `brand.tokens.json` is byte-identical to a fresh derivation.
- **sizes** — declared pixels against actual pixels, including the entries inside ICO and ICNS.
- **geometry** — transparent where the mark is art, opaque where it is a plate; the maskable ink
  inside the 40% safe circle; the adaptive foreground inside the guaranteed-visible 66/108 circle;
  every logo export the mark's aspect.
- **silhouette** — full-size exports compared pixel against pixel with the reference raster, and
  every family's smallest icon compared by shape. Below roughly 64px this mark's eye knockouts are
  sub-pixel, so a per-pixel comparison would measure antialiasing; the shape fingerprint still
  rejects the Tauri default icon (aspect 1.00, fill 0.96) and the placeholder letter.
- **logo compositions** — reads the written lockups, parses each group's transform and recomputes
  where the ink lands: the symbol carried verbatim, no `<text>` left in the export, the clear space
  on all four sides, the word sitting on the symbol's mass for the horizontal lockup and centred
  for the stacked one, and every PNG's height matching its declared width.
- **platform icons** — every iOS slot at its declared pixel size and fully opaque (App Store
  Connect rejects alpha), the catalog declaring exactly one universal 1024 slot that exists beside
  it, every macOS iconset slot at its size and opaque, the `.icns` elements matching the iconset
  sizes element for element, and the `.ico` holding every declared entry.

`brand/dist/preview/` is for eyes, not for machines. `adaptive-masks.png` is three columns (circle,
squircle, rounded square) by two rows (the colour icon, then the themed icon), with the
guaranteed-visible circle drawn on top. `logo-variants.png` is the light and dark rows.
`favicon-grid.png` is 16/32/48 at six times size on both plates. `splash.png` is the 288dp splash
canvas with its 192dp circle. `logo-compositions.png` is one row per composition — symbol,
horizontal, stacked, wordmark, uppercase — on both plates, each row sized to its own aspect.
`platform-icons.png` is eleven icon sizes in two rows: at their real size on the light plate, and
zoomed by nearest neighbour on the dark one, so a 16px icon can actually be judged.

## Applying the assets

`brand/dist/placement.json`:

```json
{
  "generatedBy": "pnpm brand:build",
  "source": { "mark": "…svg", "colors": "…tokens.css" },
  "assets": [
    {
      "file": "web/favicon.ico",
      "destination": "apps/web/public/favicon.ico",
      "consumer": "web",
      "format": "ico",
      "contains": [16, 32, 48],
      "note": "new file; the application declares only /favicon.svg today"
    }
  ]
}
```

`file` is relative to `brand/dist/`. `destination` is relative to the repository root, or `null`
for reference art that is never packaged. `width`/`height` are the file's own pixels;
`contains` lists the sizes inside a container. `consumer` names who reads it.

Two notes matter when applying:

- `android/values/ic_launcher_background.xml` replaces the Tauri scaffold's
  `res/drawable/ic_launcher_background.xml`. Delete the drawable, or the adaptive icon's
  `@color/ic_launcher_background` and a stale gradient will both exist.
- `android/drawable/ic_splash_mark.xml` and `android/mobile/*` are byte-identical copies of
  committed files owned by `scripts/build-brand-mark.mjs`. Copying them is a no-op; they are in the
  bundle so the asset set is complete.

Known drift in the web application that this pipeline does **not** fix, because it writes no code:

- `apps/web/app/workspace/manifest.ts` and `apps/web/app/workspace/manifest.webmanifest/route.ts`
  both claim `/workspace/manifest.webmanifest`, and both still declare `#161a24` where the token
  background is `#181715`.
- `apps/web/app/layout.tsx` declares `/favicon.svg` and `/workspace/icons/apple-touch-icon.png`;
  the PWA icon list lives in whichever manifest route is actually served.

## Platform requirements

| Step | Requires |
|---|---|
| everything except macOS rendering | Linux, macOS or Windows, Node 22.18+, `sharp` |
| android resources | nothing beyond the above; they are files, not a build |
| `pnpm --dir apps/desktop android:build` | Android SDK (`~/Android/Sdk` here), a JDK, and Gradle's first-run downloads |
| iOS icons | Generated here: the 18-slot Tauri set plus a single-size catalog. What needs a Mac is **installing and running the app**, not producing the files. |
| ICNS rendering | Unverified. The container is structurally tested and packed from the same buffers as the iconset; run `iconutil -c icns brand/dist/macos/icon.iconset` on a Mac and compare it against `brand/dist/macos/icon.icns` before shipping. |
