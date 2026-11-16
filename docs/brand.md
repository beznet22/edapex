# Edapex Android Brand Asset Generation

## Objective

Extend the existing `scripts/build-brand-mark.mjs` pipeline to generate all required Android branding assets for the Edapex Tauri mobile application.

The implementation must use the existing canonical Edapex brand mark as its source of truth.

Do not manually maintain multiple independent copies of the logo.

## 1. Inspect the existing project first

Before modifying anything:

1. Identify the installed Tauri version and CLI.
2. Inspect `tauri.conf.json`.
3. Locate the generated Android project.
4. Inspect its current launcher icon resources.
5. Inspect `AndroidManifest.xml`, `themes.xml`, splash-screen configuration and existing drawable resources.
6. Identify existing build scripts and dependencies.
7. Determine which generated Android files are managed by Tauri.

Do not assume the project uses the default Tauri directory structure without verifying it.

Preserve existing configuration and application functionality.

## 2. Use the appropriate tools

Prefer the following tools:

- Tauri CLI `tauri icon`: Android and cross-platform launcher icon generation.
- ImageMagick: image preprocessing, resizing, transparency and validation.
- Inkscape CLI: SVG rendering and export.
- SVGO: SVG optimization.
- Potrace: initial PNG-to-SVG tracing when required.
- Android SDK build tools (`aapt2`, Gradle): Android resource validation and compilation.

Do not implement a custom launcher icon generator if the installed Tauri CLI already provides the required functionality.

## 3. Establish canonical source assets

Use the existing canonical SVG:

`apps/web/public/brand/edapex_brand_mark.svg`

Preserve the original PNG files as source references.

Do not modify the brand identity or silhouette.

The logo must retain:

- Open-book geometry.
- Two knockout circles.
- Antenna.
- Original negative spaces.
- Original proportions.

Do not add a mouth, shadows, 3D effects or additional decorative elements.

## 4. Generate Android launcher icons

Create a dedicated square launcher-icon composition.

Do not simply stretch the existing 624 × 540 logo into a square.

The composition must:

- Preserve the original logo proportions.
- Have sufficient transparent safe space.
- Remain recognizable when Android applies circular, squircle or other adaptive masks.
- Avoid clipping the book's side components.
- Remain legible at small sizes.

Generate separate adaptive icon layers:

1. Foreground: Edapex logo.
2. Background: appropriate Edapex brand background.
3. Monochrome: simplified single-colour logo for themed Android icons.

Use the installed Tauri CLI's icon manifest support where available.

Generate all required Android density resources.

Verify the generated output in:

`src-tauri/gen/android/app/src/main/res/`

Adapt this location to the actual project structure.

Do not assume that generating the launcher icon also configures the splash screen.

## 5. Generate native Android splash assets

The native Android splash must use a static logo.

Generate a suitable Android VectorDrawable XML from the canonical SVG or a carefully prepared Android-compatible vector source.

Requirements:

- Preserve knockout circles and negative spaces.
- Use appropriate fill rules and path winding.
- Maintain the logo's aspect ratio.
- Use a transparent background where appropriate.
- Avoid embedding a raster PNG inside the vector.
- Ensure compatibility with the project's Android minimum SDK and splash implementation.

Use the existing splash resource naming and theme configuration where possible.

Verify the actual rendered output through Android resource compilation and an emulator or physical device.

Do not assume that a successful SVG preview guarantees correct Android VectorDrawable rendering.

## 6. Preserve the animated SVG for onboarding

The onboarding logo must remain a separate, editable SVG asset.

Preserve semantic element IDs and groups required by the existing React + GSAP animation system.

The onboarding animation should support:

- Centre spine appearing first.
- Left and right book sections revealing outward simultaneously.
- Upper logo elements resolving into view.
- Final logo settling into its normal position.

Do not flatten the animated SVG into a PNG.

The native splash and onboarding animation are separate implementations.

## 7. Generate web and desktop assets

Continue generating:

- Optimized web SVG.
- CSS-mask-compatible logo.
- Desktop/mobile application assets where required.

All generated assets must originate from the same canonical source.

Avoid manually editing generated output files.

## 8. Proposed output structure

Adapt this structure to the existing repository:

brand/
├── source/
│   └── edapex_brand_mark.svg
│
├── android/
│   ├── launcher/
│   │   ├── icon-manifest.json
│   │   ├── edapex-app-icon.png
│   │   ├── edapex-icon-foreground.png
│   │   ├── edapex-icon-background.png
│   │   └── edapex-icon-monochrome.png
│   │
│   ├── splash/
│   │   └── ic_splash_mark.xml
│   │
│   └── preview/
│       ├── launcher-preview.png
│       ├── adaptive-mask-preview.png
│       └── splash-preview.png
│
├── web/
│   └── edapex_brand_mark.svg
│
└── scripts/
    └── build-brand-assets.mjs

Generated Android resources must be placed in the actual Tauri Android project directories.

Keep source artwork separate from generated Android resources.

## 9. Validation requirements

The generation script must validate:

- Source files exist.
- Generated files are non-empty.
- PNG dimensions are correct.
- PNG transparency is preserved where required.
- Adaptive icon layers have the expected dimensions.
- SVG remains valid.
- Android VectorDrawable compiles successfully.
- Knockout circles remain transparent.
- Logo proportions have not changed.
- No default Tauri launcher icon remains.

Render previews at multiple sizes.

Inspect launcher icons under different Android adaptive masks.

Test splash rendering in light and dark themes.

## 10. Build integration

Expose a reproducible command:

`pnpm brand:build`

It should:

1. Validate the canonical source.
2. Generate the launcher icon source compositions.
3. Invoke Tauri's icon generator.
4. Generate the Android splash VectorDrawable.
5. Generate web and desktop assets.
6. Optimize generated SVG files.
7. Produce preview images.
8. Run validation checks.

Add the command to the existing package scripts.

Avoid destructive changes to manually maintained Android resources.

If Tauri regenerates or overwrites Android resources during `tauri android init`, document the regeneration procedure and ensure the asset pipeline can restore the custom resources.

## 11. Deliverables

Provide:

1. Updated generation script.
2. Updated package scripts.
3. Android launcher icon resources.
4. Android splash VectorDrawable.
5. Editable onboarding SVG.
6. Web and desktop assets.
7. Preview images.
8. Validation results.
9. Documentation explaining how to regenerate all assets.

Do not consider the task complete merely because files were generated.

The Android project must compile successfully, and the launcher icon and splash logo must be visually inspected on an emulator or physical device.