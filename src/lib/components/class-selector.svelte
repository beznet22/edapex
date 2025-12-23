<script lang="ts">
  import { SelectedClass } from "$lib/context/sync.svelte";
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
  import type { ClassValue } from "svelte/elements";

  let {
    class: c,
  }: {
    class?: ClassValue;
  } = $props();

  let open = $state(false);
  const userContext = UserContext.fromContext();
  const selectedClass = SelectedClass.fromContext();
  const selectedClassDetails = $derived(
    userContext.classes.find(
      (c) => c.id && c.id == Number(selectedClass.value),
    ),
  );
</script>

<DropdownMenu {open} onOpenChange={(val) => (open = val)}>
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
        {#if !selectedClassDetails}
          Select a Class
        {:else}
          {`${selectedClassDetails?.className} (${selectedClassDetails?.sectionName})`}
        {/if}
        <ChevronDown />
      </Button>
    {/snippet}
  </DropdownMenuTrigger>
  <DropdownMenuContent align="start" class="">
    {#each userContext.classes as cls (cls.id)}
      <DropdownMenuItem
        onSelect={() => {
          open = false;
          selectedClass.value = `${cls.id}`;
        }}
        class="group/item flex flex-row items-center justify-between gap-4"
        data-active={cls.id === Number(selectedClass.value)}
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
