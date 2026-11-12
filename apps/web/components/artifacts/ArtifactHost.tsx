"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const DocumentEditor = dynamic(
  () => import("@edapex/documents").then((module) => ({ default: module.DocumentEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading document…
      </div>
    )
  }
);

export interface ArtifactHostProps {
  readonly open: boolean;
  readonly split: boolean;
  readonly chat: ReactNode;
  readonly onClose: () => void;
}

export function ArtifactHost({ open, split, chat, onClose }: ArtifactHostProps) {
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  if (split) {
    return (
      <div
        aria-label="Document workspace"
        aria-modal="true"
        className="fixed inset-0 z-50 grid grid-cols-[minmax(360px,38%)_minmax(480px,62%)] overflow-hidden bg-background"
        role="dialog"
      >
        <div className="flex min-w-0 flex-col border-r border-border">{chat}</div>
        <div className="min-w-0 overflow-hidden bg-background">
          <DocumentEditor onClose={onClose} />
        </div>
      </div>
    );
  }

  return (
    <div
      aria-label="Document workspace"
      aria-modal="true"
      className="fixed inset-0 z-50 flex justify-center bg-background"
      role="dialog"
    >
      <div className="h-dvh w-full max-w-[430px] overflow-hidden border-x border-border bg-background">
        <DocumentEditor onClose={onClose} />
      </div>
    </div>
  );
}
