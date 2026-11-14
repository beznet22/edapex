import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";
import { WorkspaceLayoutClient } from "@/components/workspace/WorkspaceLayoutClient";

export const metadata: Metadata = {
  title: "Workspace",
  description: "EdApex cowork workspace.",
  manifest: "/workspace/manifest.webmanifest"
};

export default function WorkspaceLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <ServiceWorkerRegistration />
      <WorkspaceLayoutClient>{children}</WorkspaceLayoutClient>
    </>
  );
}
