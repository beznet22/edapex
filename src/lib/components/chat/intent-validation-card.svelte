<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import ShieldAlertIcon from "@lucide/svelte/icons/shield-alert";
  import XIcon from "@lucide/svelte/icons/x";

  let {
    intentName,
    confidence,
    description = "",
    onConfirm,
    onCancel,
  }: {
    intentName: string;
    confidence: number;
    description?: string;
    onConfirm: () => void;
    onCancel: () => void;
  } = $props();

  let confidencePercent = $derived(Math.round(confidence * 100));
  let isBelowThreshold = $derived(confidence < 0.9);
</script>

{#if isBelowThreshold}
  <Card.Root class="hermes-glass border-primary/20 overflow-hidden animate-in slide-in-from-bottom-2 duration-300">
    <Card.Header class="pb-3">
      <div class="flex items-start gap-3">
        <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <ShieldAlertIcon class="size-5 text-primary" />
        </div>
        <div class="flex-1 min-w-0">
          <Card.Title class="text-sm font-semibold">Intent Verification Required</Card.Title>
          <Card.Description class="text-xs mt-0.5">
            Confidence: <span class="font-mono font-semibold text-primary">{confidencePercent}%</span>
            <span class="text-muted-foreground"> — below 90% threshold</span>
          </Card.Description>
        </div>
        <Button
          variant="ghost"
          size="icon"
          class="size-7 shrink-0 rounded-full"
          onclick={onCancel}
        >
          <XIcon class="size-3.5" />
        </Button>
      </div>
    </Card.Header>
    <Card.Content class="pb-3">
      {#if description}
        <p class="text-xs text-muted-foreground mb-3">{description}</p>
      {/if}
      <div class="flex items-center gap-2">
        <Button
          class="flex-1 gap-1.5 gold-glow"
          size="sm"
          onclick={onConfirm}
        >
          Confirm Action: {intentName}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onclick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </Card.Content>
  </Card.Root>
{/if}
