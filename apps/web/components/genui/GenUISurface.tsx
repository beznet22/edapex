"use client";

import dynamic from "next/dynamic";

import type { SurfacePart } from "@edapex/contracts";

const SurfaceRenderer = dynamic(
  () => import("@edapex/genui").then((module) => ({ default: module.SurfaceRenderer })),
  {
    ssr: false,
    loading: () => <div className="skeleton-shimmer h-20 rounded-xl border border-border" />
  }
);

export function GenUISurface({ surface }: { readonly surface: SurfacePart }) {
  return (
    <div className="rounded-xl border border-border bg-card/70 p-3">
      <SurfaceRenderer
        fallback={
          <p className="text-xs text-muted-foreground">
            This generated surface could not be rendered.
          </p>
        }
        surface={surface}
      />
    </div>
  );
}
