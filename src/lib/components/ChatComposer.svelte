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

  import { useChat } from "$lib/context/chat-context.svelte";
  import { useFileActions } from "$lib/context/file-context.svelte";
  import { UserContext } from "$lib/context/user-context.svelte";
  import { cn } from "$lib/utils/shadcn";
  import type { AuthUser } from "$lib/types/auth-types";
  import ModelSelector from "./model-selector.svelte";
  import CommandDropdown from "./chat/CommandDropdown.svelte";
  import MentionDropdown from "./chat/MentionDropdown.svelte";
  import { PromptInput, PromptInputTextarea, PromptInputActions } from "./prompt-kit/prompt-input";

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

  const chat = useChat();
  const file = useFileActions();
  const userContext = UserContext.fromContext();

  function onSubmit() {
    if (chat.loading) {
      chat.client.stop();
      return;
    }

    if (input.trim() && chat.status === "ready") {
      chat.client.sendMessage({ text: input });
      input = "";
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
    const newBefore = beforeCursor.replace(/@(\w*)$/, `@${mention.name} `);
    input = newBefore + afterCursor;
    showMentions = false;
    textareaRef?.focus();
  }

  function handleNativeUpload() {
    file.openFileDialog();
  }
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
    {#if file.files.length > 0 || chat.studentData}
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
          <div class="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 border border-primary/20 text-xs font-medium text-primary group">
            <PaperclipIcon class="size-3.5" />
            <span class="max-w-[150px] truncate">{f.name}</span>
            <button 
              onclick={() => file.remove(i)} 
              class="opacity-50 group-hover:opacity-100 hover:text-foreground/80 transition-all"
              aria-label={`Remove ${f.name}`}
            >
              <XIcon class="size-3" />
            </button>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Input Layer -->
    <div 
      class="relative flex flex-col min-h-[48px] w-full"
      onclick={() => textareaRef?.focus()}
      role="presentation"
    >
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
        <MentionDropdown query={mentionQuery} onSelect={selectMention} />
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
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="sm" class="h-8 px-2 gap-1.5 text-xs font-medium rounded-lg hover:bg-white/5 text-muted-foreground hover:text-primary shrink-0 transition-colors">
                   <CircleUserIcon class="size-3.5" />
                   <span class="text-primary font-bold">default</span>
                   <ChevronDownIcon class="size-3 opacity-50" />
                </Button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>Active Personality Profile</Tooltip.Content>
          </Tooltip.Root>

          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="sm" class="h-8 px-2 gap-1.5 text-xs font-medium rounded-lg hover:bg-white/5 text-muted-foreground hover:text-primary shrink-0 transition-colors">
                   <FolderOpenIcon class="size-3.5" />
                   <span>Home</span>
                   <ChevronDownIcon class="size-3 opacity-50" />
                </Button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>Current Tenant Isolation Layer</Tooltip.Content>
          </Tooltip.Root>

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
