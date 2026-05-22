<script lang="ts">
  import { SelectedModel } from "$lib/context/sync.svelte";
  import { cn } from "$lib/utils/shadcn.js";
  import { Button } from "./ui/button";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuLabel,
  } from "./ui/dropdown-menu";
  import { Badge } from "./ui/badge";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import type { ClassValue } from "svelte/elements";

  import { useAI } from "$lib/context/ai-context.svelte";
  import { useChat } from "$lib/context/chat-context.svelte";
  import { CREDENTIAL_LABELS } from "$lib/schema/chat-schema";


  let {
    class: c,
  }: {
    class?: ClassValue;
  } = $props();

  let open = $state(false);
  const selectedChatModel = SelectedModel.fromContext();
  const ai = useAI();
  const chat = useChat();

  const models = $derived(ai.availableModels);
  
  const selectedChatModelDetails = $derived(
    models.find((model) => model.id === selectedChatModel.value) || models.find(m => m.id === 'auto') || { name: 'Auto (Smart)', id: 'auto', provider: 'system' }
  );

  const groupedModels = $derived.by(() => {
    const groups: Array<{ label: string; models: any[] }> = [];

    // 1. Smart Selection group
    const smartModels = models.filter((m) => m.provider === "system" || m.provider === "all");
    if (smartModels.length > 0) {
      groups.push({ label: "Smart Selection", models: smartModels });
    }

    // 2. OpenGateway group
    const openModels = models.filter((m) => m.provider === "opengateway");
    if (openModels.length > 0) {
      groups.push({ label: "Open Models", models: openModels });
    }

    // 3. Provider groups
    const providers = [...new Set(models.map(m => m.provider))].filter(p => p !== 'system' && p !== 'all' && p !== 'opengateway');
    providers.forEach((provider) => {
      const providerModels = models.filter((m) => m.provider === provider);
      if (providerModels.length > 0) {
        const label = CREDENTIAL_LABELS[provider as keyof typeof CREDENTIAL_LABELS] || (provider as string).toUpperCase();
        groups.push({ label, models: providerModels });
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
          "data-[state=open]:bg-accent data-[state=open]:text-accent-foreground w-fit px-1.5 sm:px-2 md:h-[34px] group",
          c,
        )}
      >
        <div class="max-w-[100px] sm:max-w-none truncate font-bold text-xs tracking-tight">
          {selectedChatModelDetails?.name}
        </div>
        <ChevronDownIcon class="size-4 opacity-50 group-hover:opacity-100 transition-opacity" />
      </Button>
    {/snippet}
  </DropdownMenuTrigger>
  <DropdownMenuContent 
    align="start" 
    class="min-w-[240px] h-[320px] hermes-glass p-0 shadow-2xl border-sidebar-border/30 rounded-xl overflow-hidden"
  >
    <div class="h-full w-full overflow-y-auto overflow-x-hidden p-2 flex flex-col gap-px">
        {#each groupedModels as group, i (group.label)}
          {#if i > 0}
            <div class="h-px bg-sidebar-border/10 my-1 mx-2"></div>
          {/if}
          <DropdownMenuLabel
            class="text-muted-foreground px-3 py-1.5 text-[9px] font-black uppercase tracking-widest opacity-30 sticky top-0 bg-transparent backdrop-blur-sm z-20"
          >
            {group.label}
          </DropdownMenuLabel>
          {#each group.models as chatModel (chatModel.id)}
            <DropdownMenuItem
              onSelect={() => {
                open = false;
                selectedChatModel.value = chatModel.id;
              }}
              class="group/item flex flex-row items-center justify-between gap-1 px-3 py-3 rounded-lg transition-all hover:bg-primary/10 cursor-pointer data-[active=true]:bg-primary/10 relative overflow-hidden"
              data-active={chatModel.id === selectedChatModel.value}
            >
              <div class="flex items-center gap-2 relative z-10 w-full min-w-0">
                <div class="text-[11px] font-bold tracking-tight text-sidebar-foreground/70 group-hover/item:text-primary transition-colors truncate">
                  {chatModel.name.split(" - ").pop()}
                </div>
                {#if (chatModel as any).source}
                  <Badge
                    class="{(chatModel as any).source === 'db' ? 'bg-primary/20 text-primary' : 'bg-muted-foreground/10 text-muted-foreground/60'} border-none text-[8px] font-black px-1 py-0 rounded-sm scale-90"
                  >
                    {(chatModel as any).source === 'db' ? 'PERSONAL' : 'GLOBAL'}
                  </Badge>
                {/if}
              </div>

              {#if chatModel.id === selectedChatModel.value}
                <div class="size-1 rounded-full bg-primary shadow-[0_0_8px_var(--primary)] shrink-0"></div>
              {/if}
            </DropdownMenuItem>
          {/each}
        {/each}
      </div>
  </DropdownMenuContent>
</DropdownMenu>
