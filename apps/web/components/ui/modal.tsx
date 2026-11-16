"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "@edapex/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from "@edapex/ui/components/dialog";
import { cn } from "@/lib/utils";

/**
 * The app's modal surface.
 *
 * A **composition** over the registry `Dialog`, not a second dialog. It used to be a
 * hand-rolled overlay with its own focus trap, Escape handling, scroll lock and
 * click-outside test — four things Radix already implements, and four things that had to
 * be re-audited whenever the markup moved. What is left here is the app's layout: a flat
 * panel, a scrollable body, an optional footer bar.
 *
 * Flat, not raised: an `--elevation-3` panel on a warm canvas reads as a grey halo.
 * Separation comes from the scrim plus a single hairline border.
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

/**
 * `DialogContent` caps itself at `sm:max-w-lg`, and tailwind-merge will not drop that for a
 * caller's unprefixed `max-w-xl` — they are different variants. The ladder is spelled out
 * so every class is a literal the scanner emits, and a new width is a visible addition
 * rather than a silently ignored one.
 */
const WIDTH_LADDER: Readonly<Record<string, string>> = {
  "max-w-md": "sm:max-w-md",
  "max-w-lg": "sm:max-w-lg",
  "max-w-xl": "sm:max-w-xl",
  "max-w-2xl": "sm:max-w-2xl"
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  widthClassName = "max-w-md"
}: ModalProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        className={cn(
          "flex max-h-[85dvh] w-full flex-col gap-0 overflow-hidden rounded-[var(--radius-xl)] border-border bg-card p-0 shadow-none",
          widthClassName,
          WIDTH_LADDER[widthClassName]
        )}
        showCloseButton={false}
      >
        <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
          <div className="min-w-0">
            <DialogTitle className="text-xl font-semibold tracking-tight">{title}</DialogTitle>
            {description === undefined ? null : (
              <DialogDescription className="mt-1.5 text-sm leading-6">
                {description}
              </DialogDescription>
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
      </DialogContent>
    </Dialog>
  );
}
