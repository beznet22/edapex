<script lang="ts">
  import { chatModels } from "$lib/chat/models";
  import { SelectedModel } from "$lib/context/sync.svelte";
  import { cn } from "$lib/utils/shadcn.js";
  import { Button } from "./ui/button";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from "./ui/dropdown-menu";
  import { CircleCheck, ChevronDown } from "@lucide/svelte";
  import type { ClassValue } from "svelte/elements";

  let {
    class: c,
  }: {
    class: ClassValue;
  } = $props();

  let open = $state(false);
  const selectedChatModel = SelectedModel.fromContext();
  const selectedChatModelDetails = $derived(chatModels.find((model) => model.id === selectedChatModel.value));
</script>

<DropdownMenu {open} onOpenChange={(val) => (open = val)}>
  <DropdownMenuTrigger>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="outline"
        class={cn(
          "data-[state=open]:bg-accent data-[state=open]:text-accent-foreground w-fit md:h-[34px] md:px-2",
          c
        )}
      >
        {selectedChatModelDetails?.name}
        <ChevronDown />
      </Button>
    {/snippet}
  </DropdownMenuTrigger>
  <DropdownMenuContent align="start" class="min-w-[300px]">
    {#each chatModels as chatModel (chatModel.id)}
      <DropdownMenuItem
        onSelect={() => {
          open = false;
          selectedChatModel.value = chatModel.id;
        }}
        class="group/item flex flex-row items-center justify-between gap-4"
        data-active={chatModel.id === selectedChatModel.value}
      >
        <div class="flex flex-col items-start gap-1">
          <div>{chatModel.name}</div>
          <div class="text-muted-foreground text-xs">
            {chatModel.description}
          </div>
        </div>

        <div class="text-foreground dark:text-foreground opacity-0 group-data-[active=true]/item:opacity-100">
          <CircleCheck />
        </div>
      </DropdownMenuItem>
    {/each}
  </DropdownMenuContent>
</DropdownMenu>
