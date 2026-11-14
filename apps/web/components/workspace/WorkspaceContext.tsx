"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import type { CapabilityManifest } from "@edapex/contracts";

import type { WorkspaceRuntimeController } from "@/hooks/use-workspace-runtime";

export interface WorkspaceContextValue {
  readonly manifest: CapabilityManifest;
  readonly runtime: WorkspaceRuntimeController;
  readonly openArtifact: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  children,
  value
}: {
  readonly children: ReactNode;
  readonly value: WorkspaceContextValue;
}) {
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceContext(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (value === null) {
    throw new Error("useWorkspaceContext must be used inside WorkspaceProvider");
  }
  return value;
}
