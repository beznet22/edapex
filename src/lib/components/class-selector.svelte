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
  import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
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
  const chat = useChat();
  const file = useFileActions();
  let loading = $state(true);

  const loadStudents = async () => {
    loading = true;
    const result = await getStudents({
      classId: file.selectedClass?.classId || undefined,
      sectionId: file.selectedClass?.sectionId || undefined,
    });

    if (!result.success || (!result.data && result.message)) {
      loading = false;
      toast.error(result.message);
      return;
    }

    userContext.students = result.data!;
    localStore("students", result.data);
    loading = false;
  };

  const onSelect = (cls: ClassSection) => {
    open = false;
    file.selectedClass = cls;
    if (chat) chat.selectedClass = cls;
    loadStudents();
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
        <div class="max-w-[100px] sm:max-w-[120px] truncate">
          {#if !file.selectedClass?.id}
            Select a Class
          {:else}
            {`${file.selectedClass?.className} (${file.selectedClass?.sectionName})`}
          {/if}
        </div>
        <ChevronDownIcon class="opacity-50" />
      </Button>
    {/snippet}
  </DropdownMenuTrigger>
  <DropdownMenuContent align="start" class="max-h-96 min-w-[300px]">
    {#each userContext.classes as cls (cls.id)}
      <DropdownMenuItem
        onSelect={() => onSelect(cls)}
        class="group/item flex flex-row items-center justify-between gap-4"
        data-active={cls.id === file.selectedClass?.id}
      >
        <div class="flex flex-col items-start gap-1">
          <div>{`${cls.className} (${cls.sectionName})`}</div>
        </div>

        <div
          class="text-foreground dark:text-foreground opacity-0 group-data-[active=true]/item:opacity-100"
        >
          <CircleCheckIcon />
        </div>
      </DropdownMenuItem>
    {/each}
  </DropdownMenuContent>
</DropdownMenu>
