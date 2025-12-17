<script lang="ts">
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import { FilesContext } from "$lib/context/file-context.svelte";
  import { Check, Paperclip, Plus } from "@lucide/svelte";
  import { Button } from "./ui/button";
  import { useChat } from "$lib/context/chat-context.svelte";
  import { iconRegistry } from "$lib/utils/icons";

  let {
    input = $bindable(),
  }: {
    input: string;
  } = $props();

  let open = $state(false);
  const filesContext = FilesContext.fromContext();
  const chat = useChat();
</script>

<DropdownMenu.Root {open} onOpenChange={(val: boolean) => (open = val)}>
  <DropdownMenu.Trigger>
    {#snippet child({ props }: { props: any })}
      <Button {...props} variant="outline" size="icon" class="size-9 rounded-full cursor-pointer">
        <Plus class="size-4" />
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content side="top" align="start" class="min-w-[150px]">
    <DropdownMenu.Group>
      <DropdownMenu.Item
        onSelect={() => {
          filesContext.openFileDialog();
          open = false;
        }}
        class="group/item flex flex-row items-center justify-between gap-4"
      >
        <div class="flex items-center gap-5">
          <Paperclip class="size-4" />
          <div>Add Photos & Files</div>
        </div>
      </DropdownMenu.Item>
    </DropdownMenu.Group>
    <DropdownMenu.Separator class="mx-2" />
    <DropdownMenu.Group>
      {#each chat.agents as agent}
        {@const Icon = iconRegistry[agent.iconName]}
        <DropdownMenu.Item
          onSelect={() => {
            chat.activeAgent = agent;
            open = false;
          }}
          class="group/item flex flex-row items-center justify-between gap-4"
          data-active={chat.activeAgent?.id === agent.id}
        >
          <div class="flex items-center gap-5">
            <Icon class="size-4" />
            <div>{agent.label}</div>
          </div>

          <div
            class="text-foreground dark:text-foreground opacity-0 group-data-[active=true]/item:opacity-100"
          >
            <Check class="size-4" />
          </div>
        </DropdownMenu.Item>
      {/each}
    </DropdownMenu.Group>
  </DropdownMenu.Content>
</DropdownMenu.Root>
