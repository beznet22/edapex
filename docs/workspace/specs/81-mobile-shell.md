# 81 — Mobile shell (Android)

Status: Draft. The frontend, the run host and the camera plugin are not yet built; this
file is the contract they will be built against. The full implementation plan lives outside
this repository and is summarised here as decisions.

The Android app is a **new surface**, not a responsive mode of `apps/web`. It shares
`@edapex/tokens`, `@edapex/ui`, `@edapex/host` and `@edapex/chat`; it does not share a
component tree, a router or a stylesheet.

## 1. Host

- Frontend: `apps/desktop/mobile` — Vite + React 19 + Tailwind v4.
- Platform override: `apps/desktop/src-tauri/tauri.android.conf.json`. The desktop
  `tauri.conf.json` is **never** edited for mobile: arrays replace on merge, so a mobile
  value there silently changes the desktop window.
- Native modules: `src-tauri/plugins/runhost` (foreground service, WorkManager,
  notifications) and `src-tauri/plugins/camera` (CameraX).
- One agent runtime: `crates/agent`, called through the in-process `AgentHost`. **No
  WebAssembly on Android** — the build fails if `edapex_agent_wasm*` appears in `dist/`.

## 2. Layout

No app bar anywhere. The shell is edge-to-edge and every screen draws under the status and
navigation bars.

| Breakpoint | Width | Navigation | Content |
|---|---|---|---|
| compact | < 600dp | floating bottom dock, 4 destinations | single column |
| medium | 600–839dp | 72dp rail | single column, max measure |
| expanded | 840–1199dp | rail | supporting pane from 1024dp |
| large | 1200–1599dp | rail | two-pane, transcript capped |
| extra-large | ≥ 1600dp | rail | two-pane |
| short | < 480dp high | dock hides on keyboard | — |

API 37 removes the orientation and resizability opt-out on large screens, so a layout that
assumes portrait is a defect, not a preference. Free-form windowing and split-screen are
ordinary resizes; the Activity is not recreated (`configChanges` covers orientation, screen
size, keyboard and theme), so state must be live-reactive and never read once on mount.

## 3. Insets

`env(safe-area-inset-*)` is the primary source; `MainActivity` writes
`--platform-inset-*` as the authoritative fallback for WebViews older than M144, and the
two are combined with `max()`. Safe-area padding is written **once**, in `Screen`. Native
code must not also pad the parent — that is double padding and it is visible.

The keyboard uses `interactive-widget=resizes-content`. A resize handler that clears focus
produces an open/close loop; `useKeyboardOpen` only reads dimensions.

## 4. Design values

`@edapex/tokens` is the only source. A mobile-only value is an **additive** `@theme` token
in the app, never an override of a shared one. No arbitrary Tailwind values: `check-tokens`
runs in `pnpm check` and fails on a new one.

Motion follows the M3 spring model — standard spatial springs for movement, effects springs
for colour and opacity, and one expressive spring reserved for Send and the shutter.
Reduced motion snaps spatial moves and keeps the fast effects curve.

## 5. Run durability

A turn must survive the app being backgrounded, swiped away, and the phone restarting.

- **Foreground service**, type `specialUse` (no time cap; `dataSync` is capped at 6h/24h and
  may not start from `BOOT_COMPLETED`). Subtype text is declared for Play review.
- **WorkManager** for the durability guarantee: it survives app exit and reboot.
- **A journal** in `crates/store` (`runs`, `run_events`, a checkpoint per tool round) is what
  tells the worker what to resume. At-least-once, checkpointed at tool-round boundaries.
- An unanswered approval **times out** rather than blocking the thread forever.
- `agent_connect` **reuses** a live session; it must never close one.
- Events are batched on a 16 ms window before crossing IPC. Never one message per token.

## 6. Notifications

Four channels: `run` (ongoing, silent), `approval` (high, with Allow/Deny actions), `done`,
`routine`. `POST_NOTIFICATIONS` is requested during onboarding; denial does not stop the
service and the UI says so. The foreground-service notification is built in Kotlin because
`ForegroundInfo` requires it there; everything else goes through the notification plugin.

## 7. Identity

Package name `com.bronotek.edapex` — it must equal the Play Console entry, the Gradle
`applicationId` and the `MainActivity` package. `check-docs.mjs` asserts it.

## 8. Device verification

A real device is the only place this is verified. USB and wireless debugging both work;
`adb reverse tcp:5182 tcp:5182` is required for the dev server and is the step most often
forgotten. The commands for cold start, deep links, process kill, frame pacing and service
inspection are listed in `AGENTS.md` → *Mobile (Android)*.

## 9. Acceptance

- Cold start shows no white flash; the native splash hands off to the boot veil.
- Rotation, split-screen and free-form resize keep state and never reload.
- Back dismisses a sheet before it exits the app.
- A run survives background, swipe-away and reboot, and resumes from its checkpoint.
- A photograph of a printed marksheet produces editable text with per-line confidence, and
  the file carries no GPS tag.
- Matrix: 320 / 360 / 393 / 412 dp portrait, 673 dp landscape, 600 / 717 / 800 / 1280 /
  1600 dp, a 480×720 free-form window, and 200% text scale — no horizontal scroll, no
  clipped rows, every target ≥ 44dp.
