<script lang="ts">
  import { useChat } from "$lib/context/chat-context.svelte";
  import { useFileActions } from "$lib/context/file-context.svelte";
  import { UserContext } from "$lib/context/user-context.svelte";
  import { cn } from "$lib/utils/shadcn.js";
  import { Button } from "./ui/button";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from "./ui/dropdown-menu";
  import { CircleCheck, ChevronDown } from "@lucide/svelte";
  import type { ClassSection } from "$lib/types/result-types";
  import type { ClassValue } from "svelte/elements";
  import { replaceState } from "$app/navigation";

  let {
    class: c,
  }: {
    class?: ClassValue;
  } = $props();

  let open = $state(false);
  const userContext = UserContext.fromContext();
  const chat = $derived(useChat());
  const file = $derived(useFileActions());

  const onSelect = (cls: ClassSection) => {
    open = false;
    chat.selectedClass = cls;
    file.selectedClass = cls;
  };

  const onOpenChange = (val: boolean) => {
    open = val;
  };
</script>

<DropdownMenu {open} {onOpenChange}>
  <DropdownMenuTrigger>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="outline"
        class={cn(
          "data-[state=open]:bg-accent data-[state=open]:text-accent-foreground w-fit md:h-[34px] md:px-2",
          c,
        )}
      >
        {#if !chat.selectedClass?.id}
          Select a Class
        {:else}
          {`${chat.selectedClass?.className} (${chat.selectedClass?.sectionName})`}
        {/if}
        <ChevronDown />
      </Button>
    {/snippet}
  </DropdownMenuTrigger>
  <DropdownMenuContent align="center" class="max-h-96 overflow-y-auto">
    {#each userContext.classes as cls (cls.id)}
      <DropdownMenuItem
        onSelect={() => onSelect(cls)}
        class="group/item flex flex-row items-center justify-between gap-4"
        data-active={cls.id === chat.selectedClass?.id}
      >
        <div class="flex flex-col items-start gap-1">
          <div>{`${cls.className} (${cls.sectionName})`}</div>
        </div>

        <div
          class="text-foreground dark:text-foreground opacity-0 group-data-[active=true]/item:opacity-100"
        >
          <CircleCheck />
        </div>
      </DropdownMenuItem>
    {/each}
  </DropdownMenuContent>
</DropdownMenu>
