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
  const snapPoints: (number | string)[] = variant === "full" ? [1] : [0.33, 0.72, 1];

  return (
    <Drawer
      onOpenChange={(next: boolean) => {
        if (!next) onClose();
      }}
      open={open}
      snapPoints={snapPoints}
    >
      <DrawerContent className="max-h-dvh rounded-t-sheet border-border bg-card">
        <DrawerHeader className="px-gutter pb-2 pt-0">
          <DrawerTitle className="text-title">{title}</DrawerTitle>
        </DrawerHeader>
        <div className="screen-bottom scrollbar-auto min-h-0 flex-1 overflow-y-auto px-gutter pb-4">
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
