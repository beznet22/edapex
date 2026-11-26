<script lang="ts">
  import type { Snippet } from "svelte";
  import Inbox from "@lucide/svelte/icons/inbox";

  let {
    title,
    description,
    icon,
    action,
  }: {
    title: string;
    description: string;
    icon?: Snippet<[]>;
    action?: Snippet<[]>;
  } = $props();
</script>

<div
  class="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center"
>
  <div class="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
    {#if icon}
      {@render icon()}
    {:else}
      <Inbox class="size-5" />
    {/if}
  </div>
  <h3 class="text-lg font-semibold text-foreground">{title}</h3>
  <p class="max-w-prose text-sm text-muted-foreground">{description}</p>
  {#if action}
    {@render action()}
  {/if}
</div>
