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
  }: {
    query: string;
    onSelect: (cmd: string) => void;
  } = $props();

  const commands = $derived.by(() => {
    // Subcommand pickers when user has typed a command prefix
    if (query.startsWith("transcript")) {
      return [
        {
          id: "transcript generate",
          label: "transcript generate",
          icon: ScrollTextIcon,
          desc: "Compute transcript and render preview PDF for the active student",
        },
        {
          id: "transcript publish",
          label: "transcript publish",
          icon: SendIcon,
          desc: "Render transcript PDF and email parent — no StudentTimeline row",
        },
        {
          id: "transcript report",
          label: "transcript report",
          icon: ScrollTextIcon,
          desc: "Stream a markdown transcript summary into the editor panel",
        },
      ];
    }
    if (query.startsWith("marksheet")) {
      return [
        {
          id: "marksheet generate",
          label: "marksheet generate",
          icon: FileSignatureIcon,
          desc: "Generate PDF report card from a committed marksheet",
        },
        {
          id: "marksheet publish",
          label: "marksheet publish",
          icon: SendIcon,
          desc: "Publish PDF + email parents",
        },
        {
          id: "marksheet result",
          label: "marksheet result",
          icon: SearchIcon,
          desc: "View a committed marksheet result",
        },
        {
          id: "marksheet view",
          label: "marksheet view",
          icon: EyeIcon,
          desc: "View a marksheet artifact",
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

  const filtered = $derived(
    query
      ? commands.filter((c) => c.id.toLowerCase().includes(query.toLowerCase()))
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
