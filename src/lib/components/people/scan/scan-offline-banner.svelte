<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import CloudOff from "@lucide/svelte/icons/cloud-off";
  import { onMount } from "svelte";
  import { replayQueuedCaptures } from "$lib/people/scan/scan-queue";

  /**
   * Shows only while captures are held locally (plan Gate 3). Dismissible for the session, because
   * a teacher who has to silence it every lesson will stop trusting it.
   *
   * There is no Background Sync — Safari never shipped it — so this also owns the `online`
   * listener and the on-open drain.
   */
  let {
    pending,
    onDrained,
  }: {
    pending: number;
    onDrained?: (sent: number) => void;
  } = $props();

  let online = $state(true);
  let replaying = $state(false);
  let dismissed = $state(false);

  async function replay(): Promise<void> {
    if (replaying) return;
    replaying = true;
    try {
      const results = await replayQueuedCaptures();
      const sent = results.filter((result) => result.outcome === "sent").length;
      onDrained?.(sent);
    } finally {
      replaying = false;
    }
  }

  onMount(() => {
    online = navigator.onLine;

    const handleOnline = (): void => {
      online = true;
      void replay();
    };
    const handleOffline = (): void => {
      online = false;
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // On-open pass: iOS gives no background wake-up, so this is the only reliable moment.
    if (online && pending > 0) void replay();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  });

  const visible = $derived(pending > 0 && !dismissed);
  const label = $derived(
    `${pending} scan${pending === 1 ? "" : "s"} queued offline${online ? "" : " · will sync when online"}`
  );
</script>

{#if visible}
  <div
    class="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/60 px-3 py-2"
    role="status"
  >
    <CloudOff class="size-4 shrink-0 text-muted-foreground" />
    <span class="min-w-0 flex-1 text-xs font-medium text-muted-foreground">{label}</span>
    <Badge variant="secondary">{pending}</Badge>
    {#if online}
      <Button size="sm" variant="outline" disabled={replaying} onclick={() => void replay()}>
        {replaying ? "Syncing…" : "Sync now"}
      </Button>
    {/if}
    <Button size="sm" variant="ghost" onclick={() => (dismissed = true)}>Hide</Button>
  </div>
{/if}
