import { useState } from "react";
import type { ReactNode } from "react";
import { Renderer } from "@openuidev/react-lang";

import type { SurfacePart } from "@edapex/contracts";

import { edapexLibrary } from "./catalog";

export interface SurfaceRendererProps {
  readonly surface: SurfacePart;
  readonly fallback?: ReactNode;
}

export function SurfaceRenderer({ surface, fallback }: SurfaceRendererProps) {
  const [invalid, setInvalid] = useState(false);
  if (invalid) {
    return <>{fallback ?? <p className="text-sm text-muted-foreground">Surface unavailable.</p>}</>;
  }
  return (
    <Renderer
      isStreaming={false}
      library={edapexLibrary}
      onError={(errors) => {
        if (errors.length > 0) setInvalid(true);
      }}
      response={surface.source}
    />
  );
}
