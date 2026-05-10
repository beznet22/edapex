<script lang="ts">
  import { chatModels, type ChatModel } from "$lib/chat/models";
  import { SelectedModel } from "$lib/context/sync.svelte";
  import { cn } from "$lib/utils/shadcn.js";
  import { Button } from "./ui/button";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuLabel,
    DropdownMenuSeparator,
  } from "./ui/dropdown-menu";
  import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import type { ClassValue } from "svelte/elements";

  import { page } from "$app/state";
  import { useAI } from "$lib/context/ai-context.svelte";
  import { CredentialType, CREDENTIAL_LABELS } from "$lib/schema/chat-schema";

  let {
    class: c,
  }: {
    class?: ClassValue;
  } = $props();

  let open = $state(false);
  const selectedChatModel = SelectedModel.fromContext();
  const ai = useAI();
  
  const models = $derived<ChatModel[]>(ai.availableModels.length > 0 ? ai.availableModels : chatModels);
  const selectedChatModelDetails = $derived(
    models.find((model: ChatModel) => model.id === selectedChatModel.value),
  );

  const connectedProviders = $derived(ai.connectedProviders);
  const availableChatModels = $derived(
    models.filter((model: ChatModel) => {
      if (model.provider === "all") {
        return connectedProviders.length > 0;
      }
      return connectedProviders.includes(model.provider);
    }),
  );

  const groupedModels = $derived.by(() => {
    const groups: Array<{ label: string; models: typeof availableChatModels }> = [];

    // 1. General group
    const generalModels = availableChatModels.filter((m: ChatModel) => m.provider === "all");
    if (generalModels.length > 0) {
      groups.push({ label: "Smart Selection", models: generalModels });
    }

    // 2. Provider groups
    Object.values(CredentialType).forEach((provider) => {
      const providerModels = availableChatModels.filter((m: ChatModel) => m.provider === provider);
      if (providerModels.length > 0) {
        groups.push({ label: CREDENTIAL_LABELS[provider], models: providerModels });
      }
    });

    return groups;
  });
</script>

<DropdownMenu {open} onOpenChange={(val) => (open = val)}>
  <DropdownMenuTrigger>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="outline"
        class={cn(
          "data-[state=open]:bg-accent data-[state=open]:text-accent-foreground w-fit px-1.5 sm:px-2 md:h-[34px]",
          c,
        )}
      >
        <div class="max-w-[70px] sm:max-w-none truncate">
          {selectedChatModelDetails?.name}
        </div>
        <ChevronDownIcon />
      </Button>
    {/snippet}
  </DropdownMenuTrigger>
  <DropdownMenuContent align="start" class="min-w-[280px] max-h-[300px] overflow-y-auto scrollbar-thin">
    {#each groupedModels as group, i (group.label)}
      {#if i > 0}
        <DropdownMenuSeparator />
      {/if}
      <DropdownMenuLabel
        class="text-muted-foreground px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider"
      >
        {group.label}
      </DropdownMenuLabel>
      {#each group.models as chatModel (chatModel.id)}
        <DropdownMenuItem
          onSelect={() => {
            open = false;
            selectedChatModel.value = chatModel.id;
          }}
          class="group/item flex flex-row items-center justify-between gap-4"
          data-active={chatModel.id === selectedChatModel.value}
        >
          <div class="flex flex-col items-start gap-0.5">
            <div class="text-xs font-medium">{chatModel.name.split(" - ").pop()}</div>
            <div class="text-muted-foreground text-[10px] leading-tight">
              {chatModel.description}
            </div>
          </div>

          <div
            class="h-4 w-1 rounded-full bg-primary opacity-0 group-data-[active=true]/item:opacity-100"
          >
          </div>
        </DropdownMenuItem>
      {/each}
    {/each}
  </DropdownMenuContent>
</DropdownMenu>
