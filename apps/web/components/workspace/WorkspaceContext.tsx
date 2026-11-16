"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import type { CapabilityManifest } from "@edapex/contracts";

import type { ProactiveController } from "@/hooks/use-proactive";
import type { WorkspaceRuntimeController } from "@/hooks/use-workspace-runtime";

export interface WorkspaceContextValue {
  readonly manifest: CapabilityManifest;
  /**
   * The workspace the signed-in user acts in.
   *
   * Carried here rather than derived in each surface: a surface that hardcodes one
   * (or falls back to the literal "workspace") writes rows nobody will ever read back.
   */
  readonly workspaceId: string;
  /**
   * The academic year the person is looking at.
   *
   * Distinct from `workspaceId` and not interchangeable with it: this is the school's session
   * (academic year) id, carried on every tenant request as `X-Academic-Id`. A surface that
   * derives it from `workspaceId` sends a *user* id, which happens to resolve when a row with
   * that id exists and silently scopes everything else to the wrong year.
   */
  readonly academicId: number;
  readonly runtime: WorkspaceRuntimeController;
  readonly proactive: ProactiveController;
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
