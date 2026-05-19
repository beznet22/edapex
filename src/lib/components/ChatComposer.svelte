<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import { Separator } from "$lib/components/ui/separator";
  import { Textarea } from "$lib/components/ui/textarea";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
  import SquareIcon from "@lucide/svelte/icons/square";
  import PaperclipIcon from "@lucide/svelte/icons/paperclip";
  import MicIcon from "@lucide/svelte/icons/mic";
  import XIcon from "@lucide/svelte/icons/x";
  import GraduationCapIcon from "@lucide/svelte/icons/graduation-cap";
  import FolderOpenIcon from "@lucide/svelte/icons/folder-open";
  import CircleUserIcon from "@lucide/svelte/icons/circle-user";
  import CloudUploadIcon from "@lucide/svelte/icons/cloud-upload";
  import FilePlusIcon from "@lucide/svelte/icons/file-plus";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import CheckIcon from "@lucide/svelte/icons/check";
  import ZapIcon from "@lucide/svelte/icons/zap";
  import ActivityIcon from "@lucide/svelte/icons/activity";
  import WindIcon from "@lucide/svelte/icons/wind";
  import BrainCircuitIcon from "@lucide/svelte/icons/brain-circuit";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import ShieldAlertIcon from "@lucide/svelte/icons/shield-alert";

  import { useChat } from "$lib/context/chat-context.svelte";
  import { useFileActions } from "$lib/context/file-context.svelte";
  import { UserContext } from "$lib/context/user-context.svelte";
  import { SelectedModel } from "$lib/context/sync.svelte";
  import { cn } from "$lib/utils/shadcn";
  import { DESIGNATIONS } from "$lib/types/sms-types";
  import type { AuthUser } from "$lib/types/auth-types";
  import type { MentionPayload } from "$lib/context/chat-context.svelte";
  import ModelSelector from "./model-selector.svelte";
  import CommandDropdown from "./chat/CommandDropdown.svelte";
  import MentionDropdown from "./chat/MentionDropdown.svelte";
  import { PromptInput, PromptInputTextarea, PromptInputActions } from "./prompt-kit/prompt-input";
  import { toast } from "svelte-sonner";

  let {
    user,
    readonly,
    isInitial = true,
  }: {
    user?: AuthUser;
    readonly: boolean;
    isInitial?: boolean;
  } = $props();

  let input = $state("");
  let textareaRef = $state<HTMLTextAreaElement | null>(null);
  let showCommands = $state(false);
  let showMentions = $state(false);
  let mentionQuery = $state("");
  let commandQuery = $state("");
  let blockedWorkflowMessage = $state<string | null>(null);
  let selectedMentions = $state<MentionPayload[]>([]);

  const chat = useChat();
  const file = useFileActions();
  const userContext = UserContext.fromContext();
  const selectedChatModel = SelectedModel.fromContext();

  /**
   * Extract the slash command type from input text.
   * Returns the command name (e.g., "extract", "validate", "publish") or null.
   */
  function extractSlashCommand(text: string): string | null {
    const match = text.trim().match(/^\/(\w+)/);
    return match ? match[1] : null;
  }

  /**
   * Check if a workflow of the same type is already active.
   * Blocks duplicate workflow slash commands per Requirement 14.6.
   */
  function isDuplicateWorkflow(command: string): boolean {
    return chat.activeWorkflows.some(
      (wf) => wf.tool.toLowerCase() === command.toLowerCase()
    );
  }

  function onSubmit() {
    if (chat.loading) {
      chat.client.stop();
      return;
    }

    if (input.trim() && chat.status === "ready") {
      // Block duplicate workflow slash commands (Requirement 14.6)
      const slashCommand = extractSlashCommand(input);
      if (slashCommand && isDuplicateWorkflow(slashCommand)) {
        blockedWorkflowMessage = `A "${slashCommand}" workflow is already in progress. Please wait for it to complete.`;
        // Auto-dismiss the blocked message after 5 seconds
        setTimeout(() => {
          blockedWorkflowMessage = null;
        }, 5000);
        return;
      }

      blockedWorkflowMessage = null;
      // Pass selected mentions to the chat context for inclusion in request body
      chat.pendingMentions = [...selectedMentions];
      // Pass file references to chat context before sending (Requirement 9.4)
      chat.fileReferences = file.references ? [...file.references] : [];
      chat.client.sendMessage({ text: input });
      input = "";
      selectedMentions = [];
      // Clear file references after submission
      chat.fileReferences = [];
      if (file.references?.length) {
        file.references = [];
      }
      chat.scrollToBottom();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      if (showCommands || showMentions) return; // Let dropdown handle it
      e.preventDefault();
      onSubmit();
    }
  }

  function handleInputDetection() {
    if (!textareaRef) return;
    
    // Detection for Slash Commands and Mentions
    const cursor = textareaRef.selectionStart || 0;
    const beforeCursor = input.substring(0, cursor);
    
    const commandMatch = beforeCursor.match(/\/(\w*)$/);
    if (commandMatch) {
      showCommands = true;
      commandQuery = commandMatch[1];
      showMentions = false;
    } else {
      showCommands = false;
      const mentionMatch = beforeCursor.match(/@(\w*)$/);
      if (mentionMatch) {
        showMentions = true;
        mentionQuery = mentionMatch[1];
      } else {
        showMentions = false;
      }
    }
  }

  function selectCommand(command: string) {
    const cursor = textareaRef?.selectionStart || 0;
    const beforeCursor = input.substring(0, cursor);
    const afterCursor = input.substring(cursor);
    const newBefore = beforeCursor.replace(/\/(\w*)$/, `/${command} `);
    input = newBefore + afterCursor;
    showCommands = false;
    textareaRef?.focus();
  }

  function selectMention(mention: any) {
    const cursor = textareaRef?.selectionStart || 0;
    const beforeCursor = input.substring(0, cursor);
    const afterCursor = input.substring(cursor);
    const displayName = mention.name.length > 40 ? mention.name.slice(0, 40) : mention.name;
    const newBefore = beforeCursor.replace(/@(\w*)$/, `@${displayName} `);
    input = newBefore + afterCursor;
    showMentions = false;
    // Track the structured mention for submission
    selectedMentions = [...selectedMentions, {
      category: mention.category,
      id: mention.id,
      name: mention.name,
      parentContext: mention.parentContext,
    }];
    textareaRef?.focus();
  }

  function handleNativeUpload() {
    file.openFileDialog();
  }

  // Profile selection logic
  const profiles = [
    { id: 'strong', label: 'Strong', icon: ZapIcon, description: 'Pro models for complex tasks' },
    { id: 'balanced', label: 'Balanced', icon: ActivityIcon, description: 'Speed & intelligence mix' },
    { id: 'simple', label: 'Simple', icon: WindIcon, description: 'Fast, efficient responses' }
  ];

  let selectedProfile = $derived(chat.profile);
  let thinkingEnabled = $derived(chat.thinkingEnabled);
</script>

<div class="w-full flex justify-center px-4 pb-6">
  <PromptInput 
    class="composer-box relative w-full max-w-[780px] flex flex-col hermes-glass rounded-4xl shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] transition-all duration-500 focus-within:ring-1 focus-within:ring-primary/40 focus-within:border-primary/30 p-0 border-border/10 bg-[#09090b]/40 backdrop-blur-3xl ring-offset-background"
    value={input}
    onValueChange={(val) => {
      input = val;
      handleInputDetection();
    }}
    onSubmit={onSubmit}
  >
    <!-- Attachment Tray (Top Layer) -->
    {#if file.files.length > 0 || chat.studentData || (file.references && file.references.length > 0)}
      <div class="flex flex-wrap gap-2 px-4 pt-4 pb-2 transition-all duration-500 ease-out">
        {#if chat.studentData}
          <div class="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 border border-primary/20 text-xs font-medium text-primary">
            <GraduationCapIcon class="size-3.5" />
            <span class="max-w-[120px] truncate">{chat.studentData.name}</span>
            <button 
              onclick={() => (chat.studentData = undefined)} 
              class="hover:text-foreground/80 transition-colors"
              aria-label="Remove student"
            >
              <XIcon class="size-3" />
            </button>
          </div>
        {/if}

        {#each file.files as f, i}
          <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-[11px] font-bold tracking-wide text-primary group shadow-sm">
            <PaperclipIcon class="size-3.5 opacity-70" />
            <span class="max-w-[150px] truncate uppercase tracking-tighter">{f.name}</span>
            <button 
              onclick={() => file.remove(i)} 
              class="opacity-40 group-hover:opacity-100 hover:text-foreground transition-all ml-1"
              aria-label={`Remove ${f.name}`}
            >
              <XIcon class="size-3" />
            </button>
          </div>
        {/each}

        {#if file.references}
          {#each file.references as ref (ref.key)}
            <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-white/5 text-[11px] font-bold tracking-wide text-foreground/70 group shadow-sm">
              {#if ref.type === "dir"}
                <FolderOpenIcon class="size-3.5 opacity-50" />
              {:else}
                <PaperclipIcon class="size-3.5 opacity-50" />
              {/if}
              <span class="max-w-[150px] truncate uppercase tracking-tighter">{ref.name}</span>
              <button 
                onclick={() => file.removeReference(ref.key)} 
                class="opacity-40 group-hover:opacity-100 hover:text-destructive transition-all ml-1"
                aria-label={`Remove reference ${ref.name}`}
              >
                <XIcon class="size-3" />
              </button>
            </div>
          {/each}
        {/if}
      </div>
    {/if}

    <!-- Input Layer -->
    <div 
      class="relative flex flex-col min-h-[48px] w-full"
      onclick={() => textareaRef?.focus()}
      role="presentation"
    >
      <!-- Active Workflow Badge (Requirement 14.2) -->
      {#if chat.activeWorkflows.length > 0}
        <div class="flex flex-wrap gap-1.5 px-4 pt-2">
          {#each chat.activeWorkflows as wf (wf.tool)}
            <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-bold tracking-wide text-primary animate-pulse">
              <span class="size-1.5 rounded-full bg-primary"></span>
              <span class="uppercase">{wf.tool}</span>
              <span class="opacity-60">Running</span>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Blocked Workflow Message (Requirement 14.6) -->
      {#if blockedWorkflowMessage}
        <div class="mx-4 mt-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] font-medium text-amber-300 animate-in fade-in slide-in-from-bottom-1 duration-200">
          {blockedWorkflowMessage}
        </div>
      {/if}

      <PromptInputTextarea
        bind:ref={textareaRef}
        onkeydown={handleKeydown}
        placeholder="Message Hermes..."
        class="resize-none border-none bg-transparent focus-visible:ring-0 text-base leading-relaxed scrollbar-slick min-h-[48px] w-full px-4 py-3 placeholder:text-muted-foreground/30 transition-all duration-300"
      />
    </div>

    <!-- Floating Popovers (Above Composer) -->
    {#if showCommands}
      <div class="absolute bottom-full left-4 right-4 mb-4 z-50">
        <CommandDropdown query={commandQuery} onSelect={selectCommand} />
      </div>
    {/if}

    {#if showMentions}
      <div class="absolute bottom-full left-4 right-4 mb-4 z-50">
        <MentionDropdown
          query={mentionQuery}
          designationId={DESIGNATIONS.indexOf(userContext.user?.designation ?? 'it')}
          visible={showMentions}
          onSelect={selectMention}
          onDismiss={() => (showMentions = false)}
        />
      </div>
    {/if}

    <!-- Confidence Gate Confirmation Overlay -->
    {#if chat.pendingConfirmation}
      <div class="absolute bottom-full left-0 right-0 mb-3 z-50 px-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div class="w-full max-w-[780px] mx-auto hermes-glass rounded-2xl border border-amber-500/20 shadow-[0_0_30px_-8px_rgba(212,175,55,0.15)] p-4">
          <div class="flex items-start gap-3">
            <div class="flex-shrink-0 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <ShieldAlertIcon class="size-5 text-amber-400" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1.5">
                <span class="text-[10px] font-black uppercase tracking-widest text-amber-400">
                  {chat.pendingConfirmation.type === 'mutation' ? 'Mutation Gate' : 'Navigation Gate'}
                </span>
                <Badge variant="outline" class="text-[9px] font-bold border-amber-500/30 text-amber-300 px-1.5 py-0">
                  {Math.round(chat.pendingConfirmation.confidence * 100)}% / {Math.round(chat.pendingConfirmation.threshold * 100)}%
                </Badge>
              </div>
              <p class="text-xs text-muted-foreground/80 leading-relaxed line-clamp-2">
                {chat.pendingConfirmation.reasoning}
              </p>
              <div class="flex items-center gap-2 mt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-7 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-lg"
                  onclick={() => chat.pendingConfirmation = null}
                >
                  Dismiss
                </Button>
                <span class="text-[9px] text-muted-foreground/40">
                  Use a slash command (e.g. /extract) to bypass
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Actions Tray (Footer Layer) -->
    <PromptInputActions class="flex items-center justify-between p-2 pl-3 pb-3 rounded-b-4xl bg-transparent border-none">
      
      <!-- Left Group: [Attach+Voice | Vertical Line | Context Chips] -->
      <div class="flex items-center gap-1.5">
        <div class="flex items-center gap-0.5">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="icon" class="size-8 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-primary transition-colors" aria-label="Upload options">
                  <PaperclipIcon class="size-4.5" />
                </Button>
              {/snippet}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="start" class="w-48 hermes-glass border-border/20 shadow-2xl">
              <DropdownMenu.Label class="text-xs font-semibold uppercase tracking-wider opacity-50">Attachments</DropdownMenu.Label>
              <DropdownMenu.Separator class="bg-border/10" />
              <DropdownMenu.Item onSelect={handleNativeUpload} class="gap-2 focus:bg-primary/10 focus:text-primary">
                <CloudUploadIcon class="size-4" />
                <span>Native Upload</span>
              </DropdownMenu.Item>
              <DropdownMenu.Item disabled class="gap-2">
                <FilePlusIcon class="size-4" />
                <span>Recents (Soon)</span>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>

          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="icon" class="size-8 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-primary transition-colors" aria-label="Voice input">
                  <MicIcon class="size-4.5" />
                </Button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>Voice Input</Tooltip.Content>
          </Tooltip.Root>

          <div class="mx-2 h-4 w-px bg-white/10 shrink-0"></div>
        </div>

        <!-- Dynamic Context Chips -->
        <div class="flex items-center gap-1 font-sans overflow-x-auto scrollbar-hide">
          <!-- Profile Selector -->
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="sm" class="h-8 px-2 gap-1.5 text-xs font-medium rounded-lg hover:bg-white/5 text-muted-foreground hover:text-primary shrink-0 transition-colors">
                    {@const profile = profiles.find(p => p.id === chat.profile)}
                    {#if profile}
                      {@const Icon = profile.icon}
                      <Icon class="size-3.5" />
                      <span class="text-primary font-bold">{profile.label}</span>
                    {/if}
                    <ChevronDownIcon class="size-3 opacity-50" />
                </Button>
              {/snippet}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="start" class="w-56 hermes-glass border-white/5 shadow-2xl">
              <DropdownMenu.Label class="text-[10px] font-bold uppercase tracking-widest opacity-40 px-2 py-2">Agent Profile</DropdownMenu.Label>
              <DropdownMenu.Separator class="bg-white/5" />
              {#each profiles as profile}
                <DropdownMenu.Item 
                  class={cn(
                    "gap-3 px-3 py-2.5 rounded-lg transition-all focus:bg-primary/10 focus:text-primary",
                    selectedProfile === profile.id ? "text-primary bg-primary/5" : ""
                  )}
                  onclick={() => chat.profile = profile.id as "strong" | "balanced" | "simple"}
                >
                  {@const Icon = profile.icon}
                  <Icon class="size-4" />
                  <div class="flex flex-col">
                    <span class="text-[11px] font-bold uppercase tracking-tight">{profile.label}</span>
                    <span class="text-[9px] opacity-40 leading-none">{profile.description}</span>
                  </div>
                </DropdownMenu.Item>
              {/each}
            </DropdownMenu.Content>
          </DropdownMenu.Root>

          <!-- Thinking Toggle -->
          <Button 
            variant="ghost" 
            size="sm" 
            class={cn(
              "h-8 px-2.5 gap-1.5 text-[10px] font-black uppercase tracking-widest rounded-full border transition-all duration-300",
              chat.thinkingEnabled 
                ? "bg-primary/10 border-primary/40 text-primary shadow-[0_0_15px_rgba(212,175,55,0.1)]" 
                : "bg-white/5 border-white/5 text-muted-foreground hover:border-white/10"
            )}
            onclick={() => {
              chat.thinkingEnabled = !chat.thinkingEnabled;
              if (chat.thinkingEnabled) {
                selectedChatModel.value = 'auto';
              }
            }}
          >
            <BrainCircuitIcon class={cn("size-3.5", chat.thinkingEnabled ? "animate-pulse" : "opacity-50")} />
            Thinking
          </Button>

          <ModelSelector class="h-8 rounded-lg border-none bg-transparent hover:bg-white/5 text-muted-foreground hover:text-primary shrink-0 transition-all" />
        </div>
      </div>

      <div class="flex items-center px-1">
        <Button 
          variant="default" 
          size="icon" 
          class={cn(
            "size-10 rounded-full transition-all duration-300 relative group overflow-hidden shadow-2xl",
            chat.loading ? "bg-destructive hover:bg-destructive/90" : "bg-primary hover:bg-primary/90 text-primary-foreground",
            !input.trim() && !chat.loading && "opacity-50 grayscale cursor-not-allowed"
          )}
          onclick={onSubmit}
          disabled={!input.trim() && !chat.loading}
        >
          <!-- Dynamic Core Glow (Warming effect) -->
          <div class="absolute inset-0 bg-white/20 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          <div class="absolute inset-0 bg-primary-foreground/10 blur-xl opacity-0 group-hover:opacity-50 transition-opacity duration-500"></div>
          
          {#if chat.loading}
            <SquareIcon class="size-4 fill-current" />
          {:else}
            <ArrowUpIcon class="size-5 stroke-3 transform group-active:translate-y-[-2px] transition-transform" />
          {/if}
        </Button>
      </div>
    </PromptInputActions>

    <!-- Hidden native file input -->
    <input
      type="file"
      multiple
      class="hidden"
      bind:this={file.fileInputRef}
      onchange={file.onchange}
    />
  </PromptInput>
</div>

<style>
  :global(.composer-box .scrollbar-slick) {
    scrollbar-width: thin;
    scrollbar-color: color-mix(in oklch, var(--muted-foreground), transparent 85%) transparent;
  }
  :global(.composer-box .scrollbar-slick::-webkit-scrollbar) {
    width: 4px;
  }
  :global(.composer-box .scrollbar-slick::-webkit-scrollbar-thumb) {
    background: color-mix(in oklch, var(--muted-foreground), transparent 85%);
    border-radius: 99px;
  }
</style>
