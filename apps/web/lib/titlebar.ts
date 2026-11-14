/**
 * Window chrome, for both hosts.
 *
 * The same bundle runs in a browser tab and in a frameless Tauri window, so this
 * module is written host-first: everything is a no-op unless we are actually in a
 * desktop window. Two rules come from the Tauri documentation and are easy to get
 * wrong:
 *
 * 1. `data-tauri-drag-region` applies **only** to the element it is on, never to
 *    its children. The drag strip is therefore a dedicated element; a wrapper
 *    would make every button inside it a drag handle and clicks would stop
 *    working.
 * 2. Double-click to maximise is not automatic when dragging is wired by hand. A
 *    titlebar that ignores a double-click reads as broken, because nobody
 *    double-clicks deliberately — they do it by habit.
 *
 * In a browser tab there is no chrome to add: `attachDragRegion` is never called
 * and `Titlebar` renders nothing. Not a hidden element and not a spacer — a
 * reserved band would shift every surface down for chrome that is not there.
 */

import { isTauriHost } from "@/lib/platform";

export interface WindowControls {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  startDragging: () => Promise<void>;
}

export type WindowControlsProvider = () => Promise<WindowControls | null>;

let provider: WindowControlsProvider | null = null;

/** Registered once by the desktop shell at startup. */
export function registerWindowControls(next: WindowControlsProvider): void {
  provider = next;
}

/**
 * The default provider, wired straight to the Rust commands.
 *
 * A dynamic import keeps `@tauri-apps/api` out of the browser bundle: in a tab it
 * is never reached, and the bundler can still split it.
 */
async function tauriControls(): Promise<WindowControls> {
  const { invoke } = await import("@tauri-apps/api/core");
  return {
    minimize: () => invoke("window_minimize"),
    toggleMaximize: () => invoke("window_toggle_maximize"),
    close: () => invoke("window_close"),
    startDragging: () => invoke("window_start_dragging")
  };
}

export async function controls(): Promise<WindowControls | null> {
  if (!isTauriHost()) return null;
  if (provider !== null) return provider();
  return tauriControls();
}

/** True only inside the desktop window, where a titlebar is ours to draw. */
export function showsTitlebar(): boolean {
  return isTauriHost();
}

/**
 * Wires drag and double-click onto the drag surface. Returns a disposer.
 *
 * `pointerdown` rather than `mousedown` so a pen or touch trackpad behaves like a
 * mouse.
 */
export function attachDragRegion(
  element: HTMLElement,
  resolve: () => Promise<WindowControls | null>
): () => void {
  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;

    // A double-click arrives as two `pointerdown`s; the second is the one that
    // should maximise. `detail` counts them for us.
    if (event.detail === 2) {
      void resolve().then((handle) => handle?.toggleMaximize());
      return;
    }

    void resolve().then((handle) => handle?.startDragging());
  };

  element.addEventListener("pointerdown", onPointerDown);

  return () => element.removeEventListener("pointerdown", onPointerDown);
}

/**
 * The hairline under the titlebar, shown only once content is scrolled.
 *
 * A line that is always present is decoration; a line that appears on scroll is
 * information — it says the titlebar floats over content rather than sitting above
 * it. Returns a disposer.
 */
export function attachScrollHairline(
  scroller: HTMLElement,
  onToggle: (visible: boolean) => void
): () => void {
  let visible = false;

  const update = (): void => {
    const next = scroller.scrollTop > 2;
    if (next === visible) return;
    visible = next;
    onToggle(next);
  };

  scroller.addEventListener("scroll", update, { passive: true });
  update();

  return () => scroller.removeEventListener("scroll", update);
}

/**
 * macOS places traffic lights at the left, and the window is undecorated, so
 * content must be padded past them. Zero elsewhere.
 */
export function trafficLightInset(platform: string): number {
  return platform === "macos" ? 78 : 0;
}
