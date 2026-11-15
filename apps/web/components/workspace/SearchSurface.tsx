"use client";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

/**
 * Search.
 *
 * A shell, not a working search: the index it needs is chat history, which is not stored
 * yet. The input is live so the route is navigable and the layout is reviewable, but
 * nothing claims to have searched — an empty state that says "no results" would be a lie,
 * because nothing was searched.
 */
export function SearchSurface() {
  return (
    <section className="scrollbar-auto flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[760px] px-4 pb-12 pt-6 lg:px-8 lg:pt-8">
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight">Search</h1>

        <label className="mt-5 block">
          <span className="sr-only">Search conversations and agents</span>
          <span className="relative block">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              autoFocus
              className="h-10 pl-9"
              disabled
              placeholder="Search conversations and agents"
              type="search"
            />
          </span>
        </label>

        <p className="mt-4 text-[13px] leading-6 text-muted-foreground">
          Search is not connected yet. It will index your conversations, tasks and agents —
          not school records, which stay in the school database and are reached through the
          tools instead.
        </p>
      </div>
    </section>
  );
}
