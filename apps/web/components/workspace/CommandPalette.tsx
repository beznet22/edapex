"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ListChecks,
  MessageCircle,
  Monitor,
  Moon,
  Palette,
  Plug,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  User,
  WandSparkles
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut
} from "@/components/ui/command";
import { useTheme } from "@/components/workspace/ThemeProvider";
import { THEME_MODES, type ThemeMode } from "@/lib/theme";

/**
 * The command palette.
 *
 * `⌘K` / `Ctrl+K`. The accessible pattern is **combobox + listbox** (WAI-ARIA APG), which
 * is what `cmdk` implements — not a custom list with roving focus. Getting that wrong is
 * the usual failure: Escape does not close, the arrow keys do not move, and the result is
 * announced as nothing.
 *
 * In this app it is not decoration. Three destinations plus settings is more than a
 * pointer wants to traverse, and the palette is also the fastest route to a theme change.
 *
 * # Scope
 *
 * Navigation and appearance only. It does **not** search conversations yet — there is no
 * index, and a palette that reports "no results" for a query it never ran is a lie. The
 * `Search` entry navigates to the surface that says so plainly.
 */

interface PaletteAction {
  readonly id: string;
  readonly label: string;
  readonly keywords?: readonly string[];
  readonly icon: LucideIcon;
  readonly group: "Navigate" | "Appearance" | "Account";
  readonly shortcut?: string;
  readonly run: () => void;
}

const NAV_TARGETS: readonly {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly keywords?: readonly string[];
}[] = [
  { id: "go-chat", label: "Chat", href: "/workspace", icon: MessageCircle, keywords: ["home", "agent"] },
  {
    id: "go-tasks",
    label: "Tasks",
    href: "/workspace/tasks",
    icon: ListChecks,
    keywords: ["queue", "waiting"]
  },
  {
    id: "go-make",
    label: "Agents",
    href: "/workspace/make",
    icon: WandSparkles,
    keywords: ["make", "create", "bot"]
  },
  {
    id: "go-plugins",
    label: "Plugins",
    href: "/workspace/plugins",
    icon: Plug,
    keywords: ["connectors", "google", "mcp"]
  },
  {
    id: "go-search",
    label: "Search",
    href: "/workspace/search",
    icon: Search,
    keywords: ["find"]
  }
];

export function CommandPalette() {
  const router = useRouter();
  const { preference, setMode, setAccent } = useTheme();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setOpen((current) => !current);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const go = useCallback(
    (href: string): void => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  const actions = useMemo<PaletteAction[]>(() => {
    const navigation: PaletteAction[] = NAV_TARGETS.map((target) => ({
      id: target.id,
      label: target.label,
      keywords: target.keywords,
      icon: target.icon,
      group: "Navigate",
      run: () => go(target.href)
    }));

    const themeIcons: Record<ThemeMode, LucideIcon> = {
      light: Sun,
      dark: Moon,
      system: Monitor
    };
    const appearance: PaletteAction[] = THEME_MODES.map((mode) => ({
      id: `theme-${mode}`,
      label: `Theme: ${mode[0]?.toUpperCase() ?? ""}${mode.slice(1)}`,
      keywords: ["colour", "dark", "light", "appearance"],
      icon: themeIcons[mode],
      group: "Appearance",
      shortcut: preference.mode === mode ? "Current" : undefined,
      run: () => {
        setMode(mode);
        setOpen(false);
      }
    }));

    const account: PaletteAction[] = [
      {
        id: "go-settings",
        label: "Settings",
        keywords: ["appearance", "account", "preferences"],
        icon: Settings,
        group: "Account",
        run: () => go("/workspace/settings")
      },
      {
        id: "go-profile",
        label: "Profile",
        icon: User,
        group: "Account",
        run: () => go("/workspace/settings")
      },
      {
        id: "go-security",
        label: "Security and sign-in",
        keywords: ["password", "login", "session"],
        icon: ShieldCheck,
        group: "Account",
        run: () => go("/workspace/settings/security")
      }
    ];

    // Accent presets are listed so the palette can do everything the appearance page can.
    // A palette that only *navigates* to settings would be a slower route for the one
    // thing people change most.
    const accents: PaletteAction[] = ["coral", "gold", "teal", "jade", "indigo"].map(
      (accent) => ({
        id: `accent-${accent}`,
        label: `Accent: ${accent[0]?.toUpperCase() ?? ""}${accent.slice(1)}`,
        keywords: ["colour", "theme", "palette"],
        icon: Palette,
        group: "Appearance" as const,
        shortcut: preference.accent === accent ? "Current" : undefined,
        run: () => {
          setAccent(accent as typeof preference.accent);
          setOpen(false);
        }
      })
    );

    return [...navigation, ...appearance, ...accents, ...account];
  }, [go, preference.accent, preference.mode, setAccent, setMode]);

  const groups = ["Navigate", "Appearance", "Account"] as const;

  return (
    <CommandDialog
      description="Search destinations, change the theme, or open settings."
      onOpenChange={setOpen}
      open={open}
      title="Command palette"
    >
      <CommandInput placeholder="Where to? Or type a setting…" />
      <CommandList>
        <CommandEmpty>Nothing matches that.</CommandEmpty>
        {groups.map((group, index) => {
          const items = actions.filter((action) => action.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group}>
              {index > 0 ? <CommandSeparator /> : null}
              <CommandGroup heading={group}>
                {items.map((action) => {
                  const Icon = action.icon;
                  return (
                    <CommandItem
                      key={action.id}
                      // `keywords` is what makes the palette usable with vocabulary the
                      // label does not contain — "connectors" finds Plugins.
                      keywords={[...(action.keywords ?? [])]}
                      onSelect={action.run}
                      value={action.id}
                    >
                      <Icon aria-hidden="true" />
                      <span>{action.label}</span>
                      {action.shortcut === undefined ? null : (
                        <CommandShortcut>{action.shortcut}</CommandShortcut>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </div>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}

/**
 * A visible affordance for the palette.
 *
 * `⌘K` is discoverable only to people who already know it. This button is the same
 * entry point for everyone else, and it sits in the sidebar so it does not compete with
 * the header's ranked controls.
 */
export function CommandPaletteTrigger({ className }: { readonly className?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const open = (): void => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })
    );
  };

  return (
    <button
      aria-keyshortcuts="Meta+K Control+K"
      aria-label="Open command palette"
      className={className}
      onClick={open}
      type="button"
    >
      <Search aria-hidden="true" />
      <span>Search</span>
      {/* Rendered after mount so a server render cannot guess the platform's modifier. */}
      {mounted ? (
        <kbd className="ml-auto hidden rounded border border-border bg-background px-1 text-[10px] font-medium text-muted-foreground sm:inline">
          ⌘K
        </kbd>
      ) : null}
    </button>
  );
}

/** Exported for the tests that assert the palette's scope. */
export const PALETTE_NAV_TARGETS = NAV_TARGETS;
