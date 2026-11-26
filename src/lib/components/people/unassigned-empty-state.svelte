<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import UserRound from "@lucide/svelte/icons/user-round";
  import PeopleEmptyState from "./people-empty-state.svelte";

  let {
    enabled,
    onboarding,
    onAddClass,
  }: {
    enabled: boolean;
    onboarding: boolean;
    onAddClass?: () => void;
  } = $props();

  const description = $derived(
    onboarding
      ? "Finish setup to unlock chat and files. The rest of the app needs a class, section and subject assignment."
      : "The rest of the app needs a class, section and subject assignment."
  );
</script>

<PeopleEmptyState title="No class assigned yet" {description}>
  {#snippet icon()}
    <UserRound class="size-5" />
  {/snippet}
  {#snippet action()}
    {#if enabled && onAddClass}
      <Button onclick={onAddClass}>
        Add class
      </Button>
    {:else}
      <p class="text-xs text-muted-foreground">
        Ask an administrator to assign you to a class or enable self-assignment.
      </p>
    {/if}
  {/snippet}
</PeopleEmptyState>
