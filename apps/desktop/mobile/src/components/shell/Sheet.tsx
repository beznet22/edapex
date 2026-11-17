import type { ReactNode } from "react";

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@edapex/ui/components/drawer";

/**
 * The one sheet.
 *
 * `peek` is the third-height stop that can be dragged to full; `full` is the same component
 * at one snap point. A surface that needs a different entrance is a different thing, and
 * inventing a second sheet component is how an app ends up with three back behaviours.
 *
 * The panel overrides the registry's `max-h-[80vh]` with `max-h-dvh`: `vh` on Android is the
 * *largest* viewport, so a sheet sized against it sits under the keyboard and behind the
 * gesture bar.
 *
 * **Snap points are deliberately not used.** vaul positions a snapped sheet by translating
 * it, and that arithmetic assumes a viewport-height sheet; with content-sized height it
 * produced `translateY(536px)` on a 303px sheet and put an "open" drawer entirely below the
 * viewport. The variants set a definite height instead — 40dvh peek, 100dvh full — which is
 * also what the design asks for. Drag-between-stops returns when a surface needs it.
 */
export function Sheet({
  open,
  onClose,
  title,
  variant = "peek",
  children
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly variant?: "peek" | "full";
  readonly children: ReactNode;
}) {
  return (
    <Drawer
      onOpenChange={(next: boolean) => {
        if (!next) onClose();
      }}
      open={open}
    >
      <DrawerContent
        className={variant === "full" ? "sheet-full rounded-t-sheet" : "sheet-peek rounded-t-sheet"}
      >
        <DrawerHeader className="px-gutter pb-2 pt-0">
          <DrawerTitle className="text-title">{title}</DrawerTitle>
        </DrawerHeader>
        <div className="screen-bottom scrollbar-auto min-h-0 flex-1 overflow-y-auto px-gutter">
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
