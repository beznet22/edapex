"use client";

import { useState } from "react";
import { Check, ChevronRight, Mail, Plus, Search, Server } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/workspace/EmptyState";
import { Input } from "@/components/ui/input";
import {
  PLUGIN_GROUPS,
  pluginById,
  type PluginEntry
} from "@/lib/plugins-catalogue";

/**
 * Plugins.
 *
 * The UI word is "plugin" because that is what a person understands; the internal type
 * stays `ConnectorKind` because renaming the server type to follow a label is churn for a
 * vocabulary change.
 *
 * Layout follows the reference: a **two-column grid** per category, each entry a tile +
 * name + one-line summary + a trailing action. A single-column list was wrong for two
 * reasons — it made each row taller than its content, and it could not show two categories
 * side by side, so the page read as a page that had failed to load.
 */

const ICONS: Record<string, LucideIcon> = {
  mail: Mail,
  server: Server
};

export function PluginsSurface({
  connectedIds = [],
  onConnect
}: {
  readonly connectedIds?: readonly string[];
  readonly onConnect?: ((pluginId: string) => void) | undefined;
}) {
  const [query, setQuery] = useState("");
  const connected = new Set(connectedIds);

  const matches = (plugin: PluginEntry): boolean => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return true;
    return (
      plugin.name.toLowerCase().includes(needle) ||
      plugin.summary.toLowerCase().includes(needle)
    );
  };

  const groups = PLUGIN_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    plugins: group.pluginIds
      .map((id) => pluginById(id))
      .filter((plugin): plugin is PluginEntry => plugin !== undefined)
      .filter(matches)
  })).filter((group) => group.plugins.length > 0);

  return (
    <section className="scrollbar-auto flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[880px] px-4 pb-12 pt-6 lg:px-8 lg:pt-8">
        {/*
          The reference pairs Plugins with a Skills tab. Skills are reusable instruction
          packs, not connections, so they are a separate surface — rendering an empty
          Skills tab now would be a promise the app cannot keep.
        */}
        <div
          aria-label="Plugin views"
          className="mb-5 inline-flex items-center gap-1 rounded-full bg-muted p-1 text-[13px]"
          role="tablist"
        >
          <span
            aria-selected="true"
            className="rounded-full bg-background px-3.5 py-1.5 font-medium shadow-sm"
            role="tab"
          >
            Plugins
          </span>
          <span
            aria-disabled="true"
            aria-selected="false"
            className="cursor-not-allowed rounded-full px-3.5 py-1.5 text-muted-foreground/60"
            role="tab"
            title="Skills are not available yet"
          >
            Skills
          </span>
        </div>

        <header>
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight">Plugins</h1>
          <p className="mt-1.5 max-w-prose text-[13px] leading-6 text-muted-foreground">
            Connect a service so the agent can work in it as you. Each plugin asks for
            specific permissions before anything is shared.
          </p>
        </header>

        <label className="mt-5 block">
          <span className="sr-only">Search plugins</span>
          <span className="relative block">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="h-10 pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search plugins"
              type="search"
              value={query}
            />
          </span>
        </label>

        {groups.length === 0 ? (
          <EmptyState
            action={
              <Button onClick={() => setQuery("")} size="sm" variant="outline">
                Clear search
              </Button>
            }
            description={`Nothing matched “${query.trim()}”. Try a shorter word, or clear the search to see everything.`}
            kind="no-results"
            title="No plugins match"
          />
        ) : (
          groups.map((group) => (
            <section className="mt-8" key={group.id}>
              {/*
                The chevron is decorative, not a control. The reference uses it to imply a
                "see all" route; with two entries in a category there is nothing to expand,
                and a chevron that does nothing is the kind of affordance that teaches
                people the UI is broken.
              */}
              <h2 className="flex items-center gap-1 text-[15px] font-semibold">
                {group.label}
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 text-muted-foreground/60"
                />
              </h2>

              <div className="mt-3 grid gap-x-8 gap-y-1 sm:grid-cols-2">
                {group.plugins.map((plugin) => (
                  <PluginTile
                    connected={connected.has(plugin.id)}
                    key={plugin.id}
                    onConnect={onConnect}
                    plugin={plugin}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </section>
  );
}

function PluginTile({
  plugin,
  connected,
  onConnect
}: {
  readonly plugin: PluginEntry;
  readonly connected: boolean;
  readonly onConnect: ((pluginId: string) => void) | undefined;
}) {
  const Icon = ICONS[plugin.icon] ?? Mail;

  return (
    <div className="group flex w-full items-start gap-3 rounded-[var(--radius-md)] px-2 py-3 transition-colors hover:bg-muted/50">
      {/*
        A tile, not a logo. The reference draws brand marks; a redrawn Google logo would
        imply an integration depth we do not have and is a trademark to boot. A neutral
        glyph on a bordered tile scans the same way without either problem.
      */}
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-background text-muted-foreground">
        <Icon aria-hidden="true" className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium leading-5">{plugin.name}</p>
        <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{plugin.summary}</p>
        {/*
          Permissions before connecting, never after. A prompt that arrives without
          context is the one people click through blindly.
        */}
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground/80">
          {plugin.requests.join(" · ")}
        </p>
      </div>

      <div className="shrink-0 pt-0.5">
        {connected ? (
          <span className="inline-flex h-8 items-center gap-1 rounded-full bg-success/10 px-2.5 text-[11px] font-semibold text-success">
            <Check aria-hidden="true" className="size-3" />
            Connected
          </span>
        ) : (
          <Button
            aria-label={`Connect ${plugin.name}`}
            className="size-8 rounded-full"
            disabled={onConnect === undefined}
            onClick={() => onConnect?.(plugin.id)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Plus aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}
