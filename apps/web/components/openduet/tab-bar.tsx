/**
 * Structure adapted from CopilotKit/OpenDuet at
 * f52288fff5ccdbd3de428d573d9f026fce5ff480
 * (openbot/app/src/components/shell/tab-bar.tsx), MIT.
 * EdApex changes: Next links, EdApex routes, Gold tokens, no motion dependency.
 */
"use client";

import Link from "next/link";
import { ListChecks, MessageCircle, WandSparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type WorkspaceTab = "chat" | "tasks" | "make";

interface TabItem {
  readonly id: WorkspaceTab;
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
}

const TABS: readonly TabItem[] = [
  { id: "chat", href: "/workspace", label: "Chat", icon: MessageCircle },
  { id: "tasks", href: "/workspace/tasks", label: "Tasks", icon: ListChecks },
  { id: "make", href: "/workspace/make", label: "Make", icon: WandSparkles }
];

interface TabBarProps {
  readonly current: WorkspaceTab;
  readonly waitingCount?: number;
}

export function TabBar({ current, waitingCount = 0 }: TabBarProps) {
  return (
    <nav
      aria-label="Workspace"
      className="absolute inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 mx-auto flex h-16 w-[min(344px,calc(100%-2rem))] gap-1 rounded-[32px] border border-border/70 bg-card/95 p-[5px] shadow-2xl backdrop-blur-xl"
    >
      {TABS.map((tab) => {
        const active = tab.id === current;
        const Icon = tab.icon;
        const badge = tab.id === "tasks" ? waitingCount : 0;
        return (
          <Link
            aria-current={active ? "page" : undefined}
            aria-label={badge > 0 ? `${tab.label}, ${badge} waiting` : tab.label}
            className={cn(
              "relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-[27px] px-2 text-[11px] font-semibold transition-colors",
              active
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            )}
            href={tab.href}
            key={tab.id}
          >
            <Icon aria-hidden="true" className="size-5" strokeWidth={active ? 2.2 : 1.9} />
            <span>{tab.label}</span>
            {badge > 0 ? (
              <span
                aria-hidden="true"
                className="absolute left-1/2 top-1 ml-2 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
              >
                {badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
