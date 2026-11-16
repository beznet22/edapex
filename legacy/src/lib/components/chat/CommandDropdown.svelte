<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { cn } from "$lib/utils/shadcn";
  import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
  import ScanLineIcon from "@lucide/svelte/icons/scan-line";
  import FileSignatureIcon from "@lucide/svelte/icons/file-signature";
  import SendIcon from "@lucide/svelte/icons/send";
  import GraduationCapIcon from "@lucide/svelte/icons/graduation-cap";
  import CalendarCheckIcon from "@lucide/svelte/icons/calendar-check";
  import UserPlusIcon from "@lucide/svelte/icons/user-plus";
  import UserCheckIcon from "@lucide/svelte/icons/user-check";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import CameraIcon from "@lucide/svelte/icons/camera";
  import EyeIcon from "@lucide/svelte/icons/eye";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
  import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
  import HandIcon from "@lucide/svelte/icons/hand";
  import BanIcon from "@lucide/svelte/icons/ban";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import SearchIcon from "@lucide/svelte/icons/search";
  import ShuffleIcon from "@lucide/svelte/icons/shuffle";
  import ActivityIcon from "@lucide/svelte/icons/activity";
  import ScrollTextIcon from "@lucide/svelte/icons/scroll-text";

  let {
    query,
    onSelect,
    onDismiss,
  }: {
    query: string;
    onSelect: (cmd: string) => void;
    onDismiss?: () => void;
  } = $props();

  let highlightedIndex = $state(0);
  let dropdownRef = $state<HTMLDivElement | null>(null);

  $effect(() => {
    const _ = filtered;
    highlightedIndex = 0;
  });

  function handleKeydown(e: KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        e.stopPropagation();
        if (filtered.length > 0) {
          highlightedIndex = (highlightedIndex + 1) % filtered.length;
          scrollToHighlighted();
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        e.stopPropagation();
        if (filtered.length > 0) {
          highlightedIndex = (highlightedIndex - 1 + filtered.length) % filtered.length;
          scrollToHighlighted();
        }
        break;
      case 'Enter':
      case 'Tab':
        e.preventDefault();
        e.stopPropagation();
        if (filtered.length > 0 && highlightedIndex >= 0 && highlightedIndex < filtered.length) {
          onSelect(filtered[highlightedIndex].id);
        }
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        onDismiss?.();
        break;
    }
  }

  function scrollToHighlighted() {
    const container = dropdownRef?.querySelector('[data-results]');
    const item = container?.querySelector(`[data-index="${highlightedIndex}"]`);
    if (item) {
      item.scrollIntoView({ block: 'nearest' });
    }
  }

  function handleClickOutside(e: MouseEvent) {
    if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
      onDismiss?.();
    }
  }

  $effect(() => {
    document.addEventListener('keydown', handleKeydown, true);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeydown, true);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  });

  const commands = $derived.by(() => {
    // Subcommand pickers when user has typed a command prefix
    if (query.startsWith("transcript")) {
      return [
        {
          id: "transcript generate",
          label: "transcript generate",
          icon: ScrollTextIcon,
          desc: "Compute transcript and render preview PDF (any synonym: create, make, render, build)",
        },
        {
          id: "transcript publish",
          label: "transcript publish",
          icon: SendIcon,
          desc: "Render transcript PDF and email parent — no StudentTimeline row (any synonym: send, email, share)",
        },
        {
          id: "transcript report",
          label: "transcript report",
          icon: ScrollTextIcon,
          desc: "Stream a markdown transcript summary into the editor panel (any synonym: summarize, draft)",
        },
      ];
    }
    if (query.startsWith("marksheet")) {
      return [
        {
          id: "marksheet generate",
          label: "marksheet generate",
          icon: FileSignatureIcon,
          desc: "Generate PDF report card from a committed marksheet (any synonym: create, make, render, preview)",
        },
        {
          id: "marksheet publish",
          label: "marksheet publish",
          icon: SendIcon,
          desc: "Publish PDF + email parents (any synonym: send, email, share, dispatch)",
        },
        {
          id: "marksheet result",
          label: "marksheet result",
          icon: SearchIcon,
          desc: "View a committed marksheet result (any synonym: show, display, inspect)",
        },
        {
          id: "marksheet view",
          label: "marksheet view",
          icon: EyeIcon,
          desc: "View a marksheet artifact (any synonym: open, show, inspect)",
        },
      ];
    }
    if (query.startsWith("staff")) {
      return [
        {
          id: "staff register",
          label: "staff register",
          icon: UserPlusIcon,
          desc: "Register a new staff member",
        },
        {
          id: "staff update",
          label: "staff update",
          icon: SettingsIcon,
          desc: "Update staff record",
        },
        {
          id: "staff assign",
          label: "staff assign",
          icon: UserCheckIcon,
          desc: "Assign class/subject to staff",
        },
      ];
    }
    if (query.startsWith("update")) {
      return [
        {
          id: "update photo",
          label: "update photo",
          icon: CameraIcon,
          desc: "Attach the last photo upload to a student profile",
        },
      ];
    }
    // Top-level commands (no subcommand prefix)
    return [
      {
        id: "marksheet",
        label: "marksheet",
        icon: ScanLineIcon,
        desc: "Marksheet pipeline (generate, publish, result, view)",
      },
      {
        id: "staff",
        label: "staff",
        icon: UserPlusIcon,
        desc: "Staff operations (register, update, assign)",
      },
      {
        id: "update",
        label: "update",
        icon: SettingsIcon,
        desc: "Update student or guardian record",
      },
      {
        id: "enroll",
        label: "enroll",
        icon: UserPlusIcon,
        desc: "Enroll student in a class",
      },
      {
        id: "admit",
        label: "admit",
        icon: UserPlusIcon,
        desc: "Admit a new student to the school",
      },
      {
        id: "transfer",
        label: "transfer",
        icon: UserCheckIcon,
        desc: "Transfer student to another class",
      },
      {
        id: "promote",
        label: "promote",
        icon: ArrowUpIcon,
        desc: "Promote student to next class",
      },
      {
        id: "demote",
        label: "demote",
        icon: ArrowDownIcon,
        desc: "Demote student to previous class",
      },
      {
        id: "self-assign",
        label: "self-assign",
        icon: HandIcon,
        desc: "Teacher self-assigns a class",
      },
      {
        id: "grade",
        label: "grade",
        icon: GraduationCapIcon,
        desc: "Submit academic grade",
      },
      {
        id: "mark",
        label: "mark",
        icon: GraduationCapIcon,
        desc: "Add exam marks",
      },
      {
        id: "attendance",
        label: "attendance",
        icon: CalendarCheckIcon,
        desc: "Record attendance status",
      },
      {
        id: "suspend",
        label: "suspend",
        icon: BanIcon,
        desc: "Suspend user workspace access",
      },
      {
        id: "reactivate",
        label: "reactivate",
        icon: ShieldCheckIcon,
        desc: "Reactivate suspended account",
      },
      {
        id: "password",
        label: "password",
        icon: RefreshCwIcon,
        desc: "Reset a user's account password",
      },
      {
        id: "search",
        label: "search",
        icon: SearchIcon,
        desc: "Search the school directory",
      },
      {
        id: "switch",
        label: "switch",
        icon: ShuffleIcon,
        desc: "Switch active class or section",
      },
      {
        id: "context",
        label: "context",
        icon: ActivityIcon,
        desc: "Show the active academic context",
      },
      {
        id: "transcript",
        label: "transcript",
        icon: ScrollTextIcon,
        desc: "Multi-term transcript (generate, publish, report)",
      },
    ];
  });

  const fuzzyIntentsByPrefix: Record<string, string[]> = {
    transcript: ["generate", "publish", "report"],
    marksheet: ["generate", "publish", "result", "view"],
  };

  const filtered = $derived.by(() => {
    if (!query) return commands;

    const q = query.toLowerCase();
    const exactOrPrefix = commands.filter((c) => c.id.toLowerCase().includes(q));

    for (const [prefix, knownVerbs] of Object.entries(fuzzyIntentsByPrefix)) {
      if (query.startsWith(`${prefix} `)) {
        const secondWord = query.slice(`${prefix} `.length).trim().toLowerCase();
        const knownVerbsLower = knownVerbs.map((v) => v.toLowerCase());
        const isKnownPrefix = knownVerbsLower.some((v) => secondWord.startsWith(v));
        const samePrefix = commands.filter((c) => c.id.toLowerCase().startsWith(prefix));

        if (!isKnownPrefix) return samePrefix;
        return samePrefix.filter((c) => {
          const verb = c.id.slice(`${prefix} `.length).toLowerCase();
          return exactOrPrefix.includes(c) || knownVerbsLower.includes(verb);
        });
      }
    }

    return exactOrPrefix;
  });
</script>

<div
  bind:this={dropdownRef}
  class="w-full min-w-[320px] bg-popover/90 backdrop-blur-2xl border border-border/10 rounded-xl shadow-2xl p-1 animate-in fade-in slide-in-from-bottom-2 duration-200"
  role="listbox"
  aria-label="Command suggestions"
>
  <div
    class="px-2 py-1.5 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.15em]"
  >
    Available Commands
  </div>
  <div
    data-results
    class="flex flex-col gap-0.5 max-h-[270px] overflow-y-auto scrollbar-slick px-0.5"
  >
    {#each filtered as cmd, index}
      <button
        data-index={index}
        class="group flex items-center gap-3 w-full p-2 rounded-lg text-left transition-colors cursor-pointer {highlightedIndex === index
          ? 'bg-primary/10 border border-primary/20'
          : 'hover:bg-sidebar-accent/50 border border-transparent'}"
        onclick={() => onSelect(cmd.id)}
        onmouseenter={() => (highlightedIndex = index)}
        role="option"
        aria-selected={highlightedIndex === index}
      >
        <div
          class="size-8 flex items-center justify-center rounded-md border transition-colors {highlightedIndex === index
            ? 'border-primary/30 bg-primary/10'
            : 'border-border/10 bg-sidebar-accent/20 group-hover:border-primary/20'}"
        >
          <cmd.icon
            class="size-4 transition-colors {highlightedIndex === index
              ? 'text-primary'
              : 'text-muted-foreground group-hover:text-primary'}"
          />
        </div>
        <div class="flex flex-col">
          <span
            class="text-sm font-medium transition-colors {highlightedIndex === index
              ? 'text-primary'
              : 'text-foreground group-hover:text-primary'}"
            >/{cmd.label}</span
          >
          <span class="text-xs text-muted-foreground">{cmd.desc}</span>
        </div>
      </button>
    {/each}
    {#if filtered.length === 0}
      <div class="p-4 text-center text-sm text-muted-foreground">
        No commands matching "/{query}"
      </div>
    {/if}
  </div>

  {#if filtered.length > 0}
    <div class="mx-1.5 h-px bg-border/10 mt-0.5"></div>
    <div class="flex items-center gap-3 px-2 py-1.5 text-[9px] text-muted-foreground/40">
      <span><kbd class="px-1 py-0.5 rounded bg-sidebar-accent/30 text-muted-foreground/50 font-mono">↑↓</kbd> navigate</span>
      <span><kbd class="px-1 py-0.5 rounded bg-sidebar-accent/30 text-muted-foreground/50 font-mono">↵</kbd> select</span>
      <span><kbd class="px-1 py-0.5 rounded bg-sidebar-accent/30 text-muted-foreground/50 font-mono">esc</kbd> dismiss</span>
    </div>
  {/if}
</div>
