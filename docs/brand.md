# Edapex Universal Brand Asset Generation System

**Status:** Normative for the asset set. Generate-only in this repository — see
[Implementation status](#15-implementation-status) and [`docs/brand/README.md`](brand/README.md).

## 1. Objective

Design and implement a unified, reproducible brand asset generation pipeline for Edapex.

The pipeline must generate branding assets for:

- Web applications.
- Android applications.
- iOS applications.
- Desktop applications (Windows, macOS and Linux).
- Progressive Web Applications.
- Social media and marketing.
- Splash screens and onboarding.
- Product documentation and presentations.

This must be a general-purpose branding system with platform-specific asset generation adapters.

Do not implement an Android-only solution.

## 2. Inspect the existing repository

Before implementation:

1. Inspect the existing brand assets.
2. Identify the canonical logo and mascot artwork.
3. Inspect the current `scripts/build-brand-mark.mjs`.
4. Inspect existing Tauri configuration.
5. Identify all application targets and their build systems.
6. Inspect existing Android and iOS generated project directories.
7. Identify existing image-processing dependencies.
8. Identify assets currently duplicated across applications.

Reuse existing infrastructure where appropriate.

Do not introduce duplicate branding sources or unnecessary dependencies.

## 3. Canonical source of truth

Establish one authoritative branding source directory.

It should contain:

- Primary logo.
- Symbol/logo mark.
- Wordmark, if available.
- Mascot/robot artwork.
- Original PNG references.
- Theme and colour variants.

Preserve the existing Edapex logo identity and geometry.

Do not invent new logo variations or redesign the existing mark as part of this task.

Separate editable source artwork from generated output.

Never manually maintain generated assets.

## 4. Brand tokens

Establish machine-readable brand tokens.

At minimum:

- Primary brand colours.
- Light and dark theme colours.
- Foreground and background colours.
- Typography references, where available.
- Logo variants.
- Standard spacing and clear-space rules.
- Icon safe-area guidelines.

Use JSON or another structured format that can be consumed by the build pipeline.

Do not invent brand colours or typography where these have not been established. Extract them from existing assets and configuration, then document any assumptions.

## 5. Toolchain

Evaluate and use the following tools:

- Inkscape CLI: SVG rendering and raster export.
- ImageMagick: image processing and conversion.
- Potrace: initial vectorization of raster logos.
- SVGO: SVG optimization.
- Sharp: Node.js-based image generation and resizing.
- Tauri CLI: application icon generation.
- Android SDK: Android resource compilation and validation.
- Xcode tools: iOS asset validation where macOS is available.

Prefer existing tools over adding redundant dependencies.

The pipeline must run on Linux wherever the target format does not require proprietary platform tooling.

Document any macOS-only validation or packaging steps.

## 6. Universal asset generation

Generate the following asset families.

### A. Logo assets

- Primary logo.
- Symbol.
- Wordmark, if available.
- Black variant.
- White variant.
- Monochrome variant.
- Transparent variants.

Formats:

- SVG.
- PNG.
- WebP.

Generate appropriate dimensions for intended use cases.

### B. Web assets

Generate:

- Favicon SVG.
- Favicon ICO.
- Standard favicon PNG sizes.
- PWA icons.
- Maskable PWA icon.
- Open Graph image.
- Social sharing artwork.

Preserve transparent backgrounds where appropriate.

### C. Android assets

Generate:

- Adaptive launcher foreground.
- Adaptive launcher background.
- Monochrome themed icon.
- Required launcher density resources.
- Native splash VectorDrawable.
- Splash preview images.

Use `tauri icon` where supported by the installed Tauri version.

Do not assume the launcher icon generator also handles the native splash.

### D. iOS assets

Generate:

- App icon artwork.
- Required app icon sizes or an appropriate AppIcon asset catalog.
- Splash artwork where applicable.

Inspect the current Tauri iOS project before deciding the exact resource locations.

Do not generate obsolete icon formats unnecessarily.

### E. Desktop assets

Generate:

- Windows ICO.
- macOS ICNS.
- Linux PNG icons.

Use appropriate sizes and transparency.

Integrate with the existing Tauri configuration.

### F. Animation assets

Preserve editable SVG artwork for:

- Onboarding logo reveal.
- Interactive Edapex robot.
- Web and desktop mascot animation.

Preserve meaningful SVG IDs and groups.

Do not flatten animation-ready artwork into raster images.

### G. Marketing assets

Generate reusable:

- Square brand avatar.
- Social cover artwork.
- Open Graph preview image.
- Presentation logo variants.
- High-resolution transparent logo exports.

Do not automatically create decorative marketing compositions that have not been designed or approved.

## 7. Platform adapters

Use a modular architecture.

The universal pipeline should not contain platform-specific assumptions everywhere.

Recommended architecture:

- `core/`: canonical assets, brand tokens, validation and common utilities.
- `generators/logo/`: logo exports.
- `generators/icons/`: icon compositions.
- `generators/web/`: favicon and PWA outputs.
- `generators/android/`: Android-specific outputs.
- `generators/ios/`: iOS-specific outputs.
- `generators/desktop/`: desktop outputs.
- `generators/social/`: marketing outputs.

Each generator should be independently executable.

## 8. Output organisation

Use a structured generated-output directory.

Keep the following separate:

- Editable source files.
- Intermediate files.
- Final generated assets.
- Platform-specific resources.
- Preview images.

Do not commit unnecessary temporary conversion files.

Avoid overwriting manually maintained project configuration.

## 9. Build commands

Expose convenient commands through the existing package manager.

Required interface:

`pnpm brand:build`

Generate all platform-independent assets and all supported platform assets.

Also provide:

`pnpm brand:logos`

`pnpm brand:icons`

`pnpm brand:android`

`pnpm brand:ios`

`pnpm brand:desktop`

`pnpm brand:web`

`pnpm brand:social`

`pnpm brand:validate`

The commands should reuse shared generation functions rather than implement separate conversion logic.

If a platform-specific tool is unavailable, clearly report that platform's generation or validation was skipped. Do not silently claim success.

## 10. Validation

Validate:

- Source SVG correctness.
- Transparency.
- Dimensions.
- Aspect ratios.
- File formats.
- Negative spaces.
- Logo proportions.
- Colour variants.
- Adaptive icon safe areas.
- SVG rendering fidelity.
- Android VectorDrawable compatibility.
- Output completeness.

Generate preview sheets to make visual inspection easy.

For launcher icons, preview the actual platform masks rather than only the square source image.

For raster exports, compare rendered results against the canonical source.

## 11. Android-specific requirements

The native splash logo remains static.

The onboarding animation is separate and uses the editable SVG.

Verify:

- Native splash theme.
- Splash background colour.
- Logo size and placement.
- Android adaptive icon rendering.
- Dark and light themes.
- Android resource compilation.

Do not introduce splash animation simply because the platform supports it.

## 12. Integration requirements

Integrate the generated assets with the existing Tauri application.

Inspect existing configuration before changing it.

Ensure:

- Correct application icon paths.
- Correct Android resource references.
- Correct iOS asset references.
- Correct desktop icon references.
- No stale default Tauri icons.
- No manually maintained duplicate assets.

Do not assume every generated asset should be copied into every application package.

Only package the resources actually required by each platform.

## 13. Documentation

Create a README explaining:

- Canonical source locations.
- Toolchain dependencies.
- Installation instructions.
- Generation commands.
- Platform-specific requirements.
- How to update the logo.
- How to regenerate all assets.
- How to validate generated output.
- Which steps require macOS or Android SDK tooling.

## 14. Definition of done

The implementation is complete when:

1. One canonical brand source generates all required asset families.
2. The generation pipeline is reproducible.
3. All supported targets have their correct assets.
4. The Tauri application references the generated assets correctly.
5. Android builds successfully.
6. iOS resources are generated and validated where tooling permits.
7. Desktop icon resources are generated.
8. Web assets are generated and validated.
9. Preview sheets are available.
10. Documentation is complete.

Do not report an asset as generated or validated when the required platform tool was unavailable.

First report the existing repository structure and proposed implementation plan. Then implement incrementally, preserving the existing working pipeline.

## 15. Implementation status

Status: **partially implemented**, generate-only. The pipeline exists and is documented in
[`docs/brand/README.md`](brand/README.md); the deviations from this document are deliberate.

| Decision | What it means here |
|---|---|
| Generate-only | Every asset is written under `brand/dist/` with a `placement.json` table of destinations. Nothing in the pipeline writes into an application tree, so no Tauri config, Android resource or web manifest has been changed. Applying the set is a separate step. |
| `tauri icon` is not used | Its `--output` redirects desktop icons only; mobile icons are always written into `gen/android`. ICO and ICNS are written by `scripts/brand/core/{ico,icns}.mjs` instead. |
| iOS is deferred | There is no `gen/apple` project and no macOS or Xcode to validate one. `pnpm brand:ios` reports `SKIPPED` with that reason rather than claiming success (§9). |
| Mascot | No separate robot artwork exists in this repository. The mark's committed black and white PNGs are the reference art, and the animation geometry is `apps/desktop/mobile/src/assets/brand-mark-paths.ts` (§F). No SVG ids were invented: naming the parts would be a redesign (§3). |
| Wordmark | In scope as of this revision. Set in Plus Jakarta Sans SemiBold (SIL OFL 1.1, release 2.7.1, committed with its licence) and outlined at build time with fontkit, so the export needs no font installed while `brand/source/wordmark/` keeps the editable text. See [`brand/typography.md`](brand/typography.md). The earlier "no wordmark, because the repository has none" decision is superseded. |
| iOS | In scope as of this revision, superseding the earlier deferral. Tauri's 18-slot per-size set and a single-size `AppIcon.appiconset` are both generated; every file is opaque, because App Store Connect rejects an app icon with alpha. Installing and running on a device still needs a Mac. |
| macOS and Windows | Complete as files. The macOS `.iconset` is generated so `iconutil` can verify it, and the `.icns` is packed from the same buffers; Windows carries a nine-entry ICO. macOS rendering remains unverified here for want of `iconutil`. |
| Toolchain | `sharp` for render, fit and encode; `svgo` optional for the logo SVG. The legacy `scripts/build-brand-mark.mjs` keeps the splash vector and mobile mark and is excluded from `brand:build` because it writes outside `brand/`. |
| Colours | Derived from `packages/tokens/tokens.css` by selector (`:root`, `.dark`), not by occurrence order, because `--primary` is redefined by every accent preset. `oklchToHex` lives in one module shared with `scripts/check-splash-tokens.mjs`. |
| Safe zones | Android adaptive art is fitted to the guaranteed-visible 66dp of the 108dp canvas. The maskable web icon is held inside the W3C circle of radius 40% of the icon. Both are measured by `brand:validate`. |

Not done, and not claimed: rendering of the generated `icon.icns` on macOS, device verification of the
iOS set, the Android Gradle build, and any application integration.
