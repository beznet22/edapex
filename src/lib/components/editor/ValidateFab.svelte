<script lang="ts">
  import { useChat } from "$lib/context/chat-context.svelte";
  import CheckCircleIcon from "@lucide/svelte/icons/check-circle";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";

  let { artifactId, title }: { artifactId: string; title: string } = $props();

  const chat = useChat();

  const mode = $derived.by(() => {
    if (chat.lastCommittedArtifactId === artifactId) return "committed" as const;
    if (chat.pendingValidationArtifactId === artifactId) return "validating" as const;
    if (chat.pendingValidationErrors?.artifactId === artifactId)
      return "revalidate" as const;
    return "validate" as const;
  });

  const label = $derived(
    mode === "validating"
      ? "Validating…"
      : mode === "revalidate"
        ? "Revalidate"
        : "Validate",
  );

  const buttonClasses = $derived(
    mode === "validating"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
      : mode === "revalidate"
        ? "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30"
        : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  );

  const isDisabled = $derived(mode === "validating");

  function handleClick() {
    if (isDisabled || mode === "committed") return;
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("chat:requestValidation", {
        detail: { artifactId, mode },
      }),
    );
  }
</script>

{#if mode !== "committed"}
  <button
    type="button"
    onclick={handleClick}
    disabled={isDisabled}
    class="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 inline-flex items-center gap-2 rounded-full px-5 py-3 border backdrop-blur-md shadow-lg font-medium text-sm transition-all hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:hover:scale-100 {buttonClasses}"
    title={title}
    aria-label={label}
  >
    {#if mode === "validating"}
      <LoaderCircleIcon class="size-4 animate-spin" />
    {:else if mode === "revalidate"}
      <RefreshCwIcon class="size-4" />
    {:else}
      <CheckCircleIcon class="size-4" />
    {/if}
    <span>{label}</span>
  </button>
{/if}
