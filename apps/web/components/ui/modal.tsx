"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The app's modal surface.
 *
 * There is **no dialog primitive in the vendored OpenDuet set** — all ten files use
 * only `role="status"` and `role="log"`. The established pattern here is the overlay
 * in `RuntimeSetup.tsx`, and this extracts it rather than inventing a second one, so a
 * new dialog cannot drift from the existing.
 *
 * The parts that are easy to get wrong, and why each is here:
 *
 * - **Escape closes.** A modal without it traps a keyboard user.
 * - **Focus moves in and returns.** Focus lands on the panel, and on close goes back to
 *   whatever opened it — otherwise the next Tab starts from the top of the document.
 * - **Background scroll is frozen.** Without it the page scrolls behind the overlay and
 *   the dialog appears to drift.
 * - **Click-outside closes, click-inside does not.** The check is on the backdrop
 *   element, not on a coordinate, so a click that starts inside and ends outside does
 *   not dismiss.
 */

export interface ModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly description?: string | undefined;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  /** `max-w-md` by default; wide dialogs pass their own. */
  readonly widthClassName?: string;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  widthClassName = "max-w-md"
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // Remembered before the panel takes focus, so closing returns to the trigger.
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      // A focus trap by hand, because the panel is not a native <dialog>. Without it
      // Tab walks into the page behind the overlay, which is still interactive.
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable === undefined || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-background/70 p-4 backdrop-blur-md"
      onMouseDown={(event) => {
        // Only a press that starts on the backdrop dismisses. A drag that begins in
        // the panel and releases outside must not close the dialog and lose the draft.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-describedby={description === undefined ? undefined : descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        /**
         * Flat, not raised.
         *
         * The first version carried `--elevation-3`, which on a warm canvas reads as a
         * grey halo rather than depth. Separation comes from the scrim behind the panel
         * and a single hairline border, which is how every flat-surface app does it —
         * a shadow on top of a scrim is depth described twice.
         */
        className={cn(
          "animate-spring-in relative flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-[var(--radius-xl)] border border-border bg-card",
          widthClassName
        )}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight" id={titleId}>
              {title}
            </h2>
            {description === undefined ? null : (
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground" id={descriptionId}>
                {description}
              </p>
            )}
          </div>
          <Button
            aria-label="Close"
            className="-mr-2 -mt-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>

        <div className="scrollbar-auto min-h-0 flex-1 overflow-y-auto px-6 pb-2">{children}</div>

        {footer === undefined ? null : (
          <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/40 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
