"use client";

import { Skeleton } from "@/components/openduet/skeleton";
import type { WorkspaceTab } from "@/components/openduet/tab-bar";

const BOOT_LABEL: Record<WorkspaceTab, string> = {
  chat: "Chat",
  tasks: "Tasks",
  make: "Make"
};

const BOOT_TABS: readonly WorkspaceTab[] = ["chat", "tasks", "make"];

function BootRail({ surface }: { readonly surface: WorkspaceTab }) {
  return (
    <aside className="hidden w-[72px] shrink-0 flex-col items-center border-r border-border bg-card/25 py-4 lg:flex">
      <Skeleton className="size-11 rounded-xl" />
      <div className="my-4 h-px w-8 bg-border" />
      <div className="flex flex-col gap-2">
        {BOOT_TABS.map((tab) => (
          <div
            className={
              tab === surface
                ? "rounded-xl p-0.5 ring-1 ring-primary/35"
                : "rounded-xl p-0.5"
            }
            key={tab}
          >
            <Skeleton className="size-11 rounded-xl" />
          </div>
        ))}
      </div>
    </aside>
  );
}

function BootMobileNav({ surface }: { readonly surface: WorkspaceTab }) {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 mx-auto flex h-16 w-[min(344px,calc(100%-2rem))] gap-1 rounded-[32px] border border-border/70 bg-card/95 p-[5px] lg:hidden"
    >
      {BOOT_TABS.map((tab) => (
        <div
          className={
            tab === surface
              ? "flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-[27px] bg-primary/15"
              : "flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-[27px]"
          }
          key={tab}
        >
          <Skeleton className="size-5 rounded-md" />
          <Skeleton className="h-2 w-8 rounded" />
        </div>
      ))}
    </div>
  );
}

function ChatBoot() {
  return (
    <>
      <div className="mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col gap-4 px-4 py-6 lg:hidden">
        <Skeleton className="mx-auto mt-8 size-12 rounded-2xl" />
        <Skeleton className="mx-auto h-6 w-52" />
        <Skeleton className="mx-auto h-4 w-64" />
        <div className="mt-auto space-y-2">
          <Skeleton className="h-16 w-4/5" />
          <Skeleton className="h-16 w-3/5 self-end" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      </div>
      <div className="hidden min-h-0 flex-1 items-center justify-center px-4 pb-10 lg:flex">
        <div className="w-full max-w-[760px]">
          <div className="mb-2 flex items-center gap-2 px-1">
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-[116px] w-full rounded-2xl" />
          <Skeleton className="mx-auto mt-3 h-2.5 w-48" />
        </div>
      </div>
    </>
  );
}

function TasksBoot() {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col px-4 py-6 lg:max-w-[880px] lg:px-6 lg:py-8">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-3 w-44" />
        </div>
        <Skeleton className="h-10 w-24 rounded-lg" />
      </div>
      <div className="mt-5 flex gap-2">
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-16 rounded-full" />
      </div>
      <div className="mt-4 space-y-2">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            className="flex items-start gap-3 rounded-xl border border-border bg-card/40 p-3.5"
            key={index}
          >
            <Skeleton className="mt-0.5 size-5 rounded-md" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-4/5" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function MakeBoot() {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col px-4 py-6 lg:max-w-[880px] lg:px-6 lg:py-8">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-3 w-48" />
        </div>
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div className="rounded-xl border border-border bg-card/40 p-3" key={index}>
            <Skeleton className="h-28 w-full rounded-lg" />
            <Skeleton className="mt-3 h-4 w-3/4" />
            <Skeleton className="mt-2 h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function WorkspaceBoot({ surface }: { readonly surface: WorkspaceTab }) {
  return (
    <div
      aria-label={`Loading ${BOOT_LABEL[surface]} workspace`}
      className="flex h-dvh w-full overflow-hidden bg-background text-foreground"
      role="status"
    >
      <BootRail surface={surface} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="safe-top shrink-0 border-b border-border px-3 pb-2.5 lg:px-6 lg:pb-3 lg:pt-4">
          <div className="mx-auto flex w-full max-w-[430px] items-center justify-between gap-2 lg:max-w-none">
            <div className="flex items-center gap-2 lg:hidden">
              <Skeleton className="size-9 rounded-xl" />
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-2.5 w-16" />
              </div>
            </div>
            <div className="hidden items-center gap-2 text-sm lg:flex">
              <span className="font-semibold tracking-tight">EdApex Work</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-muted-foreground">{BOOT_LABEL[surface]}</span>
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="size-11 rounded-xl" />
            </div>
          </div>
        </header>

        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden pb-[92px] lg:pb-0">
          {surface === "chat" ? <ChatBoot /> : surface === "tasks" ? <TasksBoot /> : <MakeBoot />}
          <BootMobileNav surface={surface} />
        </main>
      </div>
    </div>
  );
}
