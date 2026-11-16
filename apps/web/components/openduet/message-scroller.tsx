/**
 * Structure adapted from CopilotKit/OpenDuet at
 * f52288fff5ccdbd3de428d573d9f026fce5ff480
 * (openbot/app/src/components/ui/message-scroller.tsx), MIT.
 * EdApex changes: native scroll container, no external message-scroller primitive.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowDown } from "lucide-react";

import { Button } from "@edapex/ui/components/button";
import { cn } from "@/lib/utils";

interface MessageScrollerProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly label: string;
  readonly scrollKey: string | number;
}

export function MessageScroller({ children, className, label, scrollKey }: MessageScrollerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(true);

  const updateAtEnd = useCallback((): void => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    setAtEnd(distance < 48);
  }, []);

  useEffect(() => {
    updateAtEnd();
  }, [scrollKey, updateAtEnd]);

  useEffect(() => {
    if (!atEnd) return;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [atEnd, scrollKey]);

  const scrollToEnd = (): void => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  return (
    <div className={cn("relative flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
      <div
        aria-label={label}
        // `scrollbar-reveal` rather than `no-scrollbar`: this is a `role="log"` with
        // `tabIndex={0}`, so a keyboard user needs to see that the region scrolls.
        // Hiding the bar entirely made a clipped transcript look complete. The bar
        // now fades in on hover or focus and stays out of the reading surface otherwise.
        className="scrollbar-auto min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 pt-5"
        onScroll={updateAtEnd}
        ref={viewportRef}
        role="log"
        tabIndex={0}
      >
        <div className="mx-auto flex min-h-full w-full max-w-[672px] flex-col gap-5">
          {children}
          <div className="h-1 w-1 shrink-0" ref={endRef} />
        </div>
      </div>
      <Button
        aria-label="Scroll to latest message"
        className={cn(
          // `transition-[opacity,transform]` rather than the default colour transition:
          // this element's whole behaviour is a fade and a lift, so animating colour
          // would be animating the one property that does not change.
          "absolute bottom-3 left-1/2 z-10 size-11 -translate-x-1/2 rounded-full border-border bg-card text-muted-foreground shadow-lg transition-[opacity,transform] duration-200 hover:bg-card hover:text-foreground",
          atEnd ? "pointer-events-none translate-y-2 opacity-0" : "opacity-100"
        )}
        onClick={scrollToEnd}
        size="icon"
        type="button"
        variant="outline"
      >
        <ArrowDown aria-hidden="true" className="size-4" />
      </Button>
    </div>
  );
}
