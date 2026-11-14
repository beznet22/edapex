# 49 — Window Aesthetic (web and desktop)

**Status:** decision document. One system rendered in two hosts.
**Depends on:** `19` Gold on Slate tokens, `15` shell surfaces, `47` budgets.

This is **not** a desktop-only skin. The same bundle runs in a browser tab and in
a frameless Tauri window, so the design has to be correct in both without becoming
two designs. The sections below mark which rules are universal and which exist
only because one host has chrome the other does not.
**Sources:** Tauri v2 window customization; DESIGN.md format (Google Labs); the window-controls articles cited inline.

## The decision in one line

Frameless with **native traffic lights kept on macOS**, and system-drawn controls
elsewhere. Not a hand-drawn titlebar on every platform.

That split is not a compromise, it is the correct reading of each platform:

| Platform | Chrome | Why |
|---|---|---|
| macOS | `decorations: false` + keep native traffic lights | Users expect them at a fixed position; reimplementing them is the fastest way to look non-native |
| Windows | Custom controls, honour Snap Layouts | Windows 11's maximise hover flyout only works with a real system button; a fake one silently removes a feature people use |
| Linux | Custom controls | No single convention to honour |

## What the research says

**Tauri v2 gives two options, and the docs are explicit about the trade.** Setting
`decorations: false` gives full control but, on macOS, "will also lose some
features provided by the system, such as moving or aligning the window." The
documented alternative for macOS is a *transparent* titlebar with a custom window
background — native behaviour, custom colour. That is what we take.

**`data-tauri-drag-region` only applies to the element it is on.** Not to children.
So the drag area is a dedicated element, not a wrapper around content — otherwise
every button inside it becomes a drag handle and clicks stop working. This is the
single most common way a frameless app ships broken.

**Double-click to maximise must be wired manually** if drag is handled by event
listener rather than the attribute. Users double-click a titlebar without thinking;
if nothing happens it reads as a bug.

## Aesthetic: what "borderless" should mean here

The instruction was frameless, hairline separation, refined typography, fluid
micro-interactions. Applied to this app, which is a school operations tool people
use for hours, not a marketing page:

**1. The window edge is a hairline, not a frame.**
One `1px` inner border at `oklch(... / 0.06)` in light, `0.10` in dark. Enough to
separate the window from a same-coloured desktop behind it; invisible against a
contrasting one. Never a heavy border, never a drop shadow on the window itself —
the OS already draws one.

**2. Division by elevation, not by line.**
This continues the decision already made for the web shell: panels separate with
tint and shadow, not `border-r`. A frameless window that then draws borders
internally has removed one frame to add twelve. The only hairlines are:

- the window edge (above),
- the titlebar/content boundary, and only while the content is scrolled — a
  static line under a titlebar is decoration, a line that appears on scroll is
  information.

**3. Typography does the work a frame used to.**
With no chrome, hierarchy has to come from type and spacing. Three sizes only:
`13px` for chrome and metadata, `15px` for body and composer, `22px` for surface
titles. Weight and colour carry emphasis; size stays fixed. A frameless window with
six type sizes reads as noisy precisely because nothing else is delimiting content.

**4. Micro-interactions: fast, and only where they mean something.**
- `120ms` for hover and press, `200ms` for panel movement. Anything slower than
  that on a window you drag feels laggy rather than fluid.
- Buttons depress by `1px` and dim by `4%` — a scale transform on a toolbar button
  in a native window looks like a web page.
- The titlebar dims to 60% when the window loses focus. That single change is what
  makes an undecorated window feel like a real app rather than a browser view;
  the OS cannot do it for us once decorations are off.
- **All of it respects `prefers-reduced-motion`**, already verified for the web
  shell by `e2e/workspace.spec.ts`.

**5. Drag regions are visible on hover, never otherwise.**
A `-webkit-app-region`-style hint would be a line of chrome; instead the cursor
becomes the platform's move cursor over the drag strip. Discoverable by trying,
invisible at rest.

## Interaction spec

| Element | Behaviour |
|---|---|
| Titlebar (32px) | Drag. Double-click toggles maximise. |
| Titlebar buttons | 44×32 hit area, minimum — bigger than Windows' own, because a miss closes nothing on a mac but closes the app on Windows |
| Close button | Red only on macOS-style right; on Windows/Linux it uses the token `destructive` |
| Traffic-light inset | `78px` left padding on macOS so content never collides with the lights |
| Focus loss | Titlebar to 60% opacity, 120ms |
| Scroll | Hairline under titlebar appears only when `scrollTop > 0` |
| Unmaximise | Window edge radius returns to `10px`; maximised is square |

## Implementation shape

```
apps/desktop/src-tauri/tauri.conf.json   decorations:false, transparent, min sizes
apps/desktop/src-tauri/capabilities/     window allow-* permissions
apps/desktop/src/titlebar.ts             drag, double-click, controls
apps/web/app/globals.css                 --titlebar-height, --window-hairline
apps/web/components/desktop/Titlebar.tsx rendered only when running under Tauri
```

The titlebar is a **desktop-only component**. The web app runs in a browser tab
where a fake titlebar is wrong, so it is gated on the existing Tauri detection
(`lib/tauri.ts`) rather than on a build flag — the same bundle must behave
correctly in both hosts.

## The browser tab is the other half

Most of the aesthetic is host-independent and that is the point: typography,
spacing, colour, elevation, radii and motion are identical in a tab and in a
window. What differs is only the frame.

| | Browser tab | Desktop window |
|---|---|---|
| Chrome | The browser draws it | We draw it: 32px titlebar |
| Window edge | None | 1px hairline, 10px radius floating |
| Focus | OS dims the tab | Titlebar to 60% on blur |
| Scroll source | The document | Content pane under a fixed titlebar |

**The titlebar renders nothing in a tab** — not hidden, not a spacer. Reserve the
band and every surface shifts down for chrome that is not there. Gating is on
`isTauriHost()` at runtime, not a build flag, because one bundle serves both.

**Breakpoints do not change between hosts.** A 500px-wide desktop window gets the
mobile shell, because `minWidth` is 360px and a phone-width composition at 500px is
the correct answer, not a compromise. The responsive suite already asserts no
horizontal overflow at seven widths and runs against the browser host — which is
also the regression suite for the window's narrow states.

**What must never diverge:** any token. If a value needs to differ per host, the
design is wrong.

## What this does not do

- No custom traffic lights on macOS. Reimplementing them loses window snapping and
  Stage Manager behaviour.
- No window shadow, no acrylic/mica. Both fight the OS compositor and look wrong
  on the other platform.
- No fake Snap Layout hover on Windows. The real button keeps the real feature.

## Verification

- `cargo check` on the desktop crate.
- Manual on Linux (available here): frameless, draggable, double-click maximises.
- The browser host is covered by the existing suite: theme, responsive overflow at
  seven widths, reduced motion, service-worker policy.
- **macOS and Windows remain unverified** — no runner for either, and the desktop
  UI cannot be asserted by Playwright. Stated rather than implied.
- **The titlebar's browser behaviour is verified as absent**, not assumed: an e2e
  assertion checks it does not render outside Tauri.
