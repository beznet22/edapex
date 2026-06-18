<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import type { OptionItem } from "$lib/types/chat-types";
  import MousePointerClickIcon from "@lucide/svelte/icons/mouse-pointer-click";

  let {
    options,
    promptText,
    runId,
    stepId,
  }: {
    options: OptionItem[];
    promptText: string;
    runId: string;
    stepId: string;
  } = $props();

  let selected = $state(false);

  function handleSelect(option: OptionItem) {
    if (selected) return;
    selected = true;

    window.dispatchEvent(
      new CustomEvent("chat:resumeWorkflow", {
        detail: {
          runId,
          step: stepId,
          resumeData: { selectedOptionId: option.id },
          selectedLabel: option.label,
        },
      }),
    );
  }
</script>

<Card.Root
  class="hermes-glass border-primary/20 overflow-hidden animate-in slide-in-from-bottom-2 duration-300 my-2 {selected ? 'opacity-60 pointer-events-none' : ''}"
>
  <Card.Header class="pb-3">
    <div class="flex items-start gap-3">
      <div
        class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10"
      >
        <MousePointerClickIcon class="size-5 text-primary" />
      </div>
      <div class="flex-1 min-w-0">
        <Card.Title class="text-sm font-semibold">Make a selection</Card.Title>
        <Card.Description class="text-xs mt-0.5">
          {promptText}
        </Card.Description>
      </div>
    </div>
  </Card.Header>
  <Card.Content class="pb-3 pt-0">
    <div class="flex flex-col gap-2">
      {#each options as option (option.id)}
        <Button
          variant="outline"
          size="sm"
          class="justify-start h-auto py-2.5 px-3 text-left border-primary/20 hover:border-primary/50 hover:bg-primary/10 transition-colors"
          onclick={() => handleSelect(option)}
          disabled={selected}
        >
          <span class="text-sm font-medium">{option.label}</span>
        </Button>
      {/each}
    </div>
  </Card.Content>
</Card.Root>
