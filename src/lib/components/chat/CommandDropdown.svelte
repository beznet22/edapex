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
  import PenIcon from "@lucide/svelte/icons/pen";
  import TagIcon from "@lucide/svelte/icons/tag";
  import BanIcon from "@lucide/svelte/icons/ban";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import SearchIcon from "@lucide/svelte/icons/search";
  import ShuffleIcon from "@lucide/svelte/icons/shuffle";
  import ActivityIcon from "@lucide/svelte/icons/activity";

  let {
    query,
    onSelect,
  }: {
    query: string;
    onSelect: (cmd: string) => void;
  } = $props();

  const commands = [
    // Workflows (Assistant)
    {
      id: "extract",
      label: "extract",
      icon: ScanLineIcon,
      desc: "Extract data via Mistral OCR",
    },
    {
      id: "validate",
      label: "validate",
      icon: ShieldCheckIcon,
      desc: "Human-in-the-loop review",
    },
    {
      id: "generate",
      label: "generate",
      icon: FileSignatureIcon,
      desc: "Upsert student results",
    },
    {
      id: "publish",
      label: "publish",
      icon: SendIcon,
      desc: "Publish final grade reports",
    },

    // Grading
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

    // Onboarding
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
      id: "register",
      label: "register",
      icon: UserPlusIcon,
      desc: "Begin conversational registration",
    },

    // Governance
    {
      id: "update",
      label: "update",
      icon: SettingsIcon,
      desc: "Update student or guardian record",
    },
    {
      id: "suspend",
      label: "suspend",
      icon: BanIcon,
      desc: "Suspend user workspace access",
    },
    {
      id: "delete",
      label: "delete",
      icon: BanIcon,
      desc: "Permanently remove a user account",
    },
    {
      id: "password",
      label: "password",
      icon: RefreshCwIcon,
      desc: "Reset a user's account password",
    },

    // Core/Default
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

    // Deprecated aliases (one minor version, remove in 0.5.0)
    {
      id: "ban",
      label: "ban (deprecated)",
      icon: BanIcon,
      desc: "Use /suspend instead",
    },
    {
      id: "edit",
      label: "edit (deprecated)",
      icon: PenIcon,
      desc: "Use /update instead",
    },
    {
      id: "rename",
      label: "rename (deprecated)",
      icon: TagIcon,
      desc: "Use /update instead",
    },
    {
      id: "find",
      label: "find (deprecated)",
      icon: SearchIcon,
      desc: "Use /search instead",
    },
  ];

  const filtered = $derived(
    query
      ? commands.filter((c) => c.id.includes(query.toLowerCase()))
      : commands,
  );
</script>

<div
  class="w-full min-w-[320px] bg-popover/90 backdrop-blur-2xl border border-border/10 rounded-xl shadow-2xl p-1 animate-in fade-in slide-in-from-bottom-2 duration-200"
>
  <div
    class="px-2 py-1.5 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.15em]"
  >
    Available Commands
  </div>
  <div
    class="flex flex-col gap-0.5 max-h-[270px] overflow-y-auto scrollbar-slick px-0.5"
  >
    {#each filtered as cmd}
      <button
        class="group flex items-center gap-3 w-full p-2 rounded-lg hover:bg-sidebar-accent/50 text-left transition-colors cursor-pointer"
        onclick={() => onSelect(cmd.id)}
      >
        <div
          class="size-8 flex items-center justify-center rounded-md border border-border/10 bg-sidebar-accent/20 group-hover:border-primary/20 group-hover:bg-primary/5 transition-colors"
        >
          <cmd.icon
            class="size-4 text-muted-foreground group-hover:text-primary transition-colors"
          />
        </div>
        <div class="flex flex-col">
          <span
            class="text-sm font-medium text-foreground group-hover:text-primary transition-colors"
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
</div>
