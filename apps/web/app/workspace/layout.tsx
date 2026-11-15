import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";

import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";
import { ThemeProvider } from "@/components/workspace/ThemeProvider";
import { WorkspaceLayoutClient } from "@/components/workspace/WorkspaceLayoutClient";
import { readSidebarCookie, type SidebarState } from "@/lib/sidebar-state";
import { readThemeCookies } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Workspace",
  description: "EdApex cowork workspace.",
  manifest: "/workspace/manifest.webmanifest"
};

/**
 * The theme preference is read here, on the server, so `ThemeProvider` starts with the
 * same value the `<html>` element was rendered from.
 *
 * **The provider was previously never mounted.** `useTheme()` falls back to a no-op
 * when there is no provider — deliberately, so a stray toggle does not crash — which
 * meant the control rendered, took clicks, and changed nothing. The fallback hid the
 * bug instead of surfacing it: a crash would have been found immediately.
 */
export default async function WorkspaceLayout({ children }: Readonly<{ children: ReactNode }>) {
  const cookieStore = await cookies();
  const preference = readThemeCookies(cookieStore.toString());
  const sidebar = readSidebarCookie(cookieStore.toString());

  return (
    <ThemeProvider initial={preference}>
      <ServiceWorkerRegistration />
      <WorkspaceLayoutClient initialSidebar={sidebar}>{children}</WorkspaceLayoutClient>
    </ThemeProvider>
  );
}
