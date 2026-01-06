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
  import { getStudents } from "$lib/api/chat.remote";
  import { toast } from "svelte-sonner";
  import { localStore } from "$lib/utils";

  let {
    class: c,
  }: {
    class?: ClassValue;
  } = $props();

  let open = $state(false);
  const userContext = UserContext.fromContext();
  const chat = $derived(useChat());
  const file = $derived(useFileActions());
  let loading = $state(true);

  const loadStudents = async () => {
    loading = true;
    const result = await getStudents({
      classId: chat.selectedClass?.classId || undefined,
      sectionId: chat.selectedClass?.sectionId || undefined,
    });

    if (!result.success || (!result.data && result.message)) {
      loading = false;
      toast.error(result.message);
    }

    userContext.students = result.data!;
    localStore("students", result.data);
    loading = false;
  };

  const onSelect = (cls: ClassSection) => {
    open = false;
    chat.selectedClass = cls;
    file.selectedClass = cls;
    loadStudents();
  };

  // $effect(() => {
  //   console.log(userContext.students);
  // });

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
          "h-9 sm:h-10 rounded-full px-3 sm:px-4 w-fit text-xs sm:text-sm gap-1.5 sm:gap-2 transition-all duration-200",
          "data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
          c,
        )}
      >
        <div class="max-w-[100px] sm:max-w-[120px] truncate">
          {#if !chat.selectedClass?.id}
            Select a Class
          {:else}
            {`${chat.selectedClass?.className} (${chat.selectedClass?.sectionName})`}
          {/if}
        </div>
        <ChevronDown class="size-3.5 sm:size-4 opacity-50" />
      </Button>
    {/snippet}
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end" class="max-h-96">
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
