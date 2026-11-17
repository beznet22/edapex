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
| compact | < 600dp | drawer; top strip is Chat · Make | single column |
| medium | 600–839dp | drawer | single column, max measure |
| expanded | 840–1199dp | drawer | supporting pane from 1024dp |
| large | 1200–1599dp | drawer, persistent at ≥ 1024dp | two-pane, transcript capped |
| extra-large | ≥ 1600dp | drawer | two-pane |
| short | < 480dp high | quick actions hide on keyboard | — |

Navigation is one component at every size. The dock and the rail were removed: a bottom
dock competes with the composer for the bottom edge, and a rail plus a drawer is two
navigation models to keep in sync. What the top strip carries is what you *begin* from —
Chat, or Make — and everything else is a row in the drawer.

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

## 8a. The splash screen, precisely

Two durations are commonly conflated, and only one of them is ours.

**Splash visibility is not a fixed window.** The system shows the splash from process start
until the activity's first frame is ready to draw. There is no documented minimum and no
fixed maximum: on a warm start it is a few frames, on a cold start on a slow device it can be
most of a second. An app cannot extend it except through
`SplashScreen.setKeepOnScreenCondition`, and this app does **not** use that — holding the
splash would delay access to a workspace that is already interactive.

**Icon animation duration is a different thing.** On API 31+ an
`AnimatedVectorDrawable` may be supplied as the splash icon, and the platform plays it once,
on a schedule the app does not control. Because the splash can end before the animation does,
a cut-off frame is a normal outcome, not an edge case. Below API 31 the compat library does
not replicate AVD support at all. That is why the icon here is **static**.

**What the app owns** is the handover:

| Stage | Owner | Duration |
|---|---|---|
| Splash icon, stationary | platform | until the first frame |
| Splash view fade-out | app, `setOnExitAnimationListener` | 150ms, opacity only |
| Boot veil fade-out | app, CSS | effects spring (230ms), opacity only |

The splash background and the veil background are the same token colour, so the three stages
read as one surface settling rather than three that swap. Nothing animates the mark itself:
a mark that moves while its own ghost fades draws the eye to the seam.

The brand animation lives on onboarding page 1, where the mark is neither masked by the
system nor racing the process start: a centre-out reveal from the book's spine, two clipped
halves uncovering outward, `spatial-slow` (496ms), no overshoot, and immediate under
`prefers-reduced-motion`.

### Icon geometry

The splash canvas is 288dp and the system masks the icon to a **192dp circle**. A bounding
box that fits a square does not fit a circle: this mark's widest points are 98.4dp from its
centre, which would be clipped by 2.4dp.

**The drawable must declare the 288dp canvas, not the 192dp circle.** It declared 192dp, so
the platform scaled the whole vector up by 288/192 and a 92dp radius arrived at 138dp against
a 96dp mask — the side tabs were cut on both sides and the launch looked distorted. The
generated VectorDrawable is a 944×944 viewport fitted to the canvas at a **91.9dp radius**,
and `windowSplashScreenAnimatedIcon` is where that declaration matters, because Android sizes
the drawable from its own intrinsic size rather than from the drawable's viewport aspect.

### Ink and surface

Both come from the sheet, and neither can be a literal:

- `splash_background` is the `background` token in sRGB — `#FAF9F5` light, `#181715` night.
- `splash_mark` is the `foreground` token — `#141413` light, `#FAF9F5` night — referenced as
  `@color/splash_mark` from every path. A shape cannot follow a theme, so the ink is a
  colour resource with a night pair, exactly like the shipped black and white PNGs.

`scripts/check-splash-tokens.mjs` recomputes both from `oklch()` and fails if either drifts,
if the ink stops being the foreground token, or if either mark drops below 7:1 against its
surface. It exists because both colours had drifted: the light value was a cool #FBFBFD
against a warm token, and the night value was #161A24 — Tauri's scaffold blue-black — with a
hard-coded black mark on top, which is why the dark splash read as a blank black screen.

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

### Verified on a device, 2026-11-16

Samsung SM-G781U, Android 13 (API 33), WebView 157.0.8103.38 — so `linear()` springs,
`env(safe-area-inset-*)` and `clip-path` are all live and the Kotlin inset bridge is the
fallback path rather than the primary one.

| Check | Result |
|---|---|
| Cold start | No crash, no white flash; splash window created and destroyed |
| Splash mark | Undistorted in both modes, ink resolved from the foreground token |
| Insets | `--platform-inset-top: 88px`, `--platform-inset-bottom: 144px` |
| Back, nothing open | Exits the task |
| Back, drawer open | Drawer closes, activity keeps focus |
| Deep link | `edapex://auth?code=test` arrives at `MainActivity` via `onNewIntent` |
| Rotation | Layout reflows at the medium window class; no reload |
| Density 560 | Rows grow, text wraps, nothing clipped |

Three defects were found only here, and none was reachable from a desktop build:

1. **`window.rs` did not compile for Android.** `start_dragging`, `minimize`, `unmaximize` and
   `maximize` are `WindowExt` methods that do not exist on a mobile `WebviewWindow`.
2. **The sheet opened off-screen.** vaul translates a snapped sheet, and a content-sized
   panel made it land at `translateY(536px)` on a 303px sheet while reporting `open`.
3. **`window.EdApexHost` was never defined.** `addJavascriptInterface` ran in `onResume`,
   after the bundle; the view-tree walk found no WebView from `onCreate` or `onResume`, which
   also left `--platform-inset-*` empty. `onWebViewCreate` is the hook that always fires.

The lesson worth keeping: a splash and an inset bridge cannot be signed off by typecheck.
Both needed a running process and a real display.

## Push delivery (Part III)

The facts a future agent would otherwise rediscover the hard way. The envelope and its rules live
in `packages/contracts/src/push.ts`; the sender and fan-out live in `services/sms-api/src/lib/server/services/push/`.

- **One event, one audience, one rendered string.** Copy is rendered server-side because a lock
  screen cannot run code. The envelope has no field for a score or a student's name: the payload
  transits Google, so class-level subjects only. That rule is structural, not a convention.
- **Fan-out is a Cloudflare Queue, never the request.** One class change is hundreds of
  recipients; a request that sends them all drops the tail silently. `push_jobs` carries a unique
  `idempotency_key` derived from `(eventId, userId)`, so a queue retry, a duplicate producer call
  and a redelivered event all collapse onto one row.
- **Sealed checkpoints deviate from the plan's plaintext DDL.** Every event body and every
  checkpoint is sealed, matching `threads.body`; only `status`, `attempt`, `lease_until` and `seq`
  stay readable. A plan that says otherwise is out of date.
- **Quiet hours are UTC today.** The school schema carries no timezone column, so a 21:00 boundary
  is wrong by at most the school's UTC offset. Fixing it means adding the column, not moving the
  comparison.
- **An audience is a query, never a list.** `parents`/`students` resolve through the student row
  (the unit a school talks about); `admin` resolves through `users.is_administrator`; `teacher`
  through `sm_staffs.user_id` for the school. `userIds` is the explicit escape hatch. A resolved
  list on the wire would be a snapshot that goes stale between composing and sending.
- **The sender is FCM HTTP v1 with WebCrypto only.** A service account signs a short-lived RS256
  JWT, which becomes an OAuth token cached until a minute before expiry. A 404 or `UNREGISTERED`
  retires the device row; anything else is a retryable failure.
- **Nothing posts a notification until the app has a token.** `POST /v1/devices` is the only way a
  row exists, and it needs `google-services.json` in `apps/desktop/src-tauri/gen/android/app/`.
  Without that file the queue delivers nothing and settles `no_devices`, which is visible in
  `push_jobs` rather than silent.
