# Brand assets — the applier's sheet

Everything here is **generated, and nothing here is applied**. `brand/dist/` is a staging area:
the pipeline writes it, `placement.json` says where each file belongs, and copying it into the
application is a separate, deliberate step. That separation is the point — a generator that wrote
into `src-tauri/` or `apps/web/` could not be reviewed as assets.

| Path | What it is | May I edit it? |
|---|---|---|
| `brand/source/` | The editable inputs: the wordmark as real text, and the typeface with its licence. | Yes — then regenerate. |
| `brand/dist/` | Every generated asset, grouped by family, plus `placement.json`. | **No.** Re-running the pipeline overwrites it. |
| `brand/README.md` | This sheet. | Yes. |

`brand/dist/placement.json` is the contract. One row per file:

```json
{
  "file": "ios/icons/AppIcon-20x20@1x.png",   // relative to brand/dist/
  "destination": "apps/desktop/src-tauri/icons/ios/AppIcon-20x20@1x.png",
  "consumer": "ios",
  "format": "png",
  "width": 20, "height": 20,                  // or "contains": [...] for a container
  "note": "why it exists, or what it replaces"
}
```

A row with `"destination": null` is **reference art** — a logo export for a deck, a share card.
It is not packaged and must not be copied into the application.

## Before you copy

```bash
pnpm brand:validate        # must exit 0; it re-derives the tokens and checks every file
```

If it fails, the assets are stale or wrong. Fix the source and regenerate rather than copying a
broken set.

## Copy

From the repository root:

```bash
node --input-type=module -e '
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const placement = JSON.parse(readFileSync("brand/dist/placement.json", "utf8"));
let copied = 0;
let skipped = 0;

for (const row of placement.assets) {
  if (row.destination === null) { skipped += 1; continue; }
  const to = join(process.cwd(), row.destination);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(join("brand/dist", row.file), to);
  copied += 1;
}

console.log(`copied ${copied} files, skipped ${skipped} reference assets`);
'
```

It is a documented loop rather than a `brand:apply` script on purpose: applying assets rewrites
application files, and that should not be one muscle-memory command away from a build.

## After you copy — the things a file copy cannot do

These are ordered by how quietly they fail.

1. **Android: delete the stale background drawable.** The adaptive icon references
   `@color/ic_launcher_background`, but the Tauri scaffold also left
   `gen/android/app/src/main/res/drawable/ic_launcher_background.xml`. Both existing is a stale
   gradient next to a colour resource.

   ```bash
   rm apps/desktop/src-tauri/gen/android/app/src/main/res/drawable/ic_launcher_background.xml
   ```

2. **iOS: the catalog needs a project.** `gen/apple` does not exist in the repository, so the
   copy creates the directory only. Run `pnpm --dir apps/desktop exec tauri ios init` first if the
   iOS target is being set up for the first time; the 18-file set in `icons/ios/` works either way.

3. **Web: two manifests claim the same URL.** `apps/web/app/workspace/manifest.ts` and
   `apps/web/app/workspace/manifest.webmanifest/route.ts` both resolve to
   `/workspace/manifest.webmanifest`, and both still declare `#161a24` where the token background
   is `#181715`. Fetch the URL, keep the file that serves it, delete the other, and point its
   `icons` array at `workspace/icons/` with `purpose: "maskable"` on the maskable entry.

4. **Web: the icon list.** `apps/web/app/layout.tsx` declares `/favicon.svg` and
   `/workspace/icons/apple-touch-icon.png`. It does not yet reference `favicon.ico`, the PNG
   favicons or `og.png` — add them when the assets land.

5. **Desktop: `bundle.icon` is already correct.** `tauri.conf.json` names
   `icons/32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, `icon.ico`; all five are in
   `brand/dist/`. Nothing to edit.

## Verify after copying

```bash
node scripts/verify-brand-mark.mjs      # the four legacy mark checks
node scripts/check-splash-tokens.mjs    # splash colours still follow the token sheet
node scripts/check-docs.mjs             # the Android package identity still agrees
pnpm --dir apps/web test
pnpm --dir apps/desktop android:build   # needs the Android SDK
```

On macOS, additionally:

```bash
iconutil -c icns brand/dist/macos/icon.iconset   # compare against brand/dist/macos/icon.icns
```

## Rules that survive the copy

- **An app icon is the symbol alone.** Never copy a lockup or a wordmark into `icons/`, `mipmap-*`
  or `AppIcon.*`. The adaptive mask shows 66dp of 108 and a taskbar icon is 16px.
- **Never hand-edit `brand/dist/`.** Edit `brand/source/` or `packages/tokens/tokens.css`, then
  `pnpm brand:build`. `brand:validate` fails when the token sheet and the assets disagree.
- **Reference rows stay out of the application.** `logo/mark-*`, `logo/lockup-*` and `social/*`
  have `destination: null` for a reason.

## Where the detail lives

| Document | For |
|---|---|
| [`docs/brand/README.md`](../docs/brand/README.md) | The operator's manual: every command, the toolchain, what is verified and what is not. |
| [`docs/brand/typography.md`](../docs/brand/typography.md) | The typeface, its licence, and the numbers every lockup is built on. |
| [`docs/brand.md`](../docs/brand.md) | The specification this implements, with its status and deviations. |
