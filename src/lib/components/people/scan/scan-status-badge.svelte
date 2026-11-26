<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { Spinner } from "$lib/components/ui/spinner";
  import type { ScanUiStatus } from "$lib/server/people/people-types";

  let {
    status,
    failureMessage = null,
  }: {
    status: ScanUiStatus;
    failureMessage?: string | null;
  } = $props();

  /**
   * Labels match the owner's spec (spec §4A), with two deliberate deviations recorded in the plan:
   * `committed` renders "Uploaded" and `failed` renders "Error" — because `manifest.ts` already
   * uses "Uploaded" to mean *processing* on /filestore, so reusing it for a terminal state would
   * collide.
   *
   * Every tone maps onto an existing shadcn `Badge` variant plus design tokens only. No palette
   * classes and no raw colours: `src/routes/layout.css` is the single source of colour truth.
   */
  const LABELS: Record<ScanUiStatus, string> = {
    not_uploaded: "Not Uploaded",
    queued: "Queued",
    extracting: "Extracting",
    draft: "Draft",
    committed: "Uploaded",
    published: "Published",
    failed: "Error",
  };

  const VARIANTS: Record<
    ScanUiStatus,
    "secondary" | "outline" | "default" | "destructive"
  > = {
    not_uploaded: "secondary",
    queued: "outline",
    extracting: "outline",
    draft: "default",
    committed: "secondary",
    published: "default",
    failed: "destructive",
  };

  const busy = $derived(status === "queued" || status === "extracting");
</script>

<Badge
  variant={VARIANTS[status]}
  class="gap-1.5"
  title={status === "failed" && failureMessage ? failureMessage : undefined}
>
  {#if busy}
    <Spinner class="size-3" />
  {/if}
  {LABELS[status]}
</Badge>
