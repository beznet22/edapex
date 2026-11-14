"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Square, X } from "lucide-react";

import {
  attachDragRegion,
  attachScrollHairline,
  controls,
  showsTitlebar,
  trafficLightInset,
  type WindowControls
} from "@/lib/titlebar";
import { cn } from "@/lib/utils";

/**
 * Desktop window chrome.
 *
 * Renders **nothing** in a browser tab. Not a hidden element, not a spacer: the
 * browser already draws chrome, a second one inside the page is a fake, and a
 * reserved band would shift every surface down for something that is not there.
 * See `specs/49-desktop-window.md`.
 */
export function Titlebar({ title }: { readonly title?: string }) {
  const [visible, setVisible] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [inset, setInset] = useState(0);
  const dragRef = useRef<HTMLDivElement>(null);
  const handle = useRef<WindowControls | null>(null);

  // Resolved once on mount. `showsTitlebar()` is false in a tab, so nothing here
  // runs and the component returns null — a tab never flashes a titlebar.
  useEffect(() => {
    if (!showsTitlebar()) return;
    setVisible(true);
    setInset(trafficLightInset(platformName()));

    let dispose: (() => void) | null = null;
    void controls().then((resolved) => {
      handle.current = resolved;
      if (dragRef.current !== null) {
        dispose = attachDragRegion(dragRef.current, async () => handle.current);
      }
    });

    return () => dispose?.();
  }, []);

  // The hairline appears only once content has moved under the titlebar, so it
  // carries information rather than decorating a static edge.
  useEffect(() => {
    if (!visible) return;
    const scroller = document.querySelector<HTMLElement>("[data-workspace-scroll]");
    if (scroller === null) return;
    return attachScrollHairline(scroller, setScrolled);
  }, [visible]);

  if (!visible) return null;

  return (
    <header
      className={cn(
        "relative z-50 flex h-8 shrink-0 select-none items-center",
        "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px",
        "after:bg-[var(--window-hairline)] after:transition-opacity after:duration-[120ms]",
        scrolled ? "after:opacity-100" : "after:opacity-0",
        // Losing focus dims the chrome. An undecorated window has no other way to
        // say it is not the active one; without it the app reads as a page.
        "transition-opacity duration-[120ms]"
      )}
      data-tauri-drag-region
      ref={dragRef}
      style={{ paddingLeft: inset }}
    >
      {/* The drag strip is its own element: the attribute does not inherit, so a
          wrapper would make the buttons below draggable instead of clickable. */}
      <div className="h-full flex-1" data-tauri-drag-region />
      <span className="pointer-events-none px-2 text-[13px] text-muted-foreground">
        {title ?? "EdApex Work"}
      </span>
      <div className="h-full flex-1" data-tauri-drag-region />
      {/* Controls are Linux/Windows only. On macOS the native traffic lights are
          kept, because reimplementing them loses window snapping and Stage
          Manager behaviour. */}
      {inset === 0 ? <Controls /> : null}
    </header>
  );
}

function Controls() {
  const base =
    "flex h-full w-11 items-center justify-center text-muted-foreground transition-colors duration-[120ms] hover:bg-accent hover:text-foreground";
  return (
    <div className="flex h-full">
      <button
        aria-label="Minimise"
        className={base}
        onClick={() => void controls().then((handle) => handle?.minimize())}
        type="button"
      >
        <Minus aria-hidden="true" className="size-3.5" />
      </button>
      <button
        aria-label="Maximise or restore"
        className={base}
        onClick={() => void controls().then((handle) => handle?.toggleMaximize())}
        type="button"
      >
        <Square aria-hidden="true" className="size-3" />
      </button>
      <button
        aria-label="Close"
        className={cn(base, "hover:bg-destructive hover:text-destructive-foreground")}
        onClick={() => void controls().then((handle) => handle?.close())}
        type="button"
      >
        <X aria-hidden="true" className="size-3.5" />
      </button>
    </div>
  );
}

function platformName(): string {
  if (typeof navigator === "undefined") return "linux";
  const agent = navigator.userAgent.toLowerCase();
  if (agent.includes("mac")) return "macos";
  if (agent.includes("win")) return "windows";
  return "linux";
}
