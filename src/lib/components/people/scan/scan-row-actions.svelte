<script lang="ts">
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import { Spinner } from "$lib/components/ui/spinner";
  import EllipsisVertical from "@lucide/svelte/icons/ellipsis-vertical";
  import type { ScanUiStatus } from "$lib/server/people/people-types";

  /**
   * Implements the owner's action-visibility matrix (spec §4A) verbatim. Invalid transitions are
   * hidden or disabled here; the server refuses them regardless, so this is ergonomics, not
   * security.
   *
   *   Not Uploaded → `Upload Mark`, no overflow menu
   *   Queued       → disabled `Queued` badge, `Re-scan`
   *   Extracting   → disabled `Extracting…` badge + spinner, no menu
   *   Draft        → `Review & Save`, `Re-scan`
   *   Uploaded     → `View Mark`, menu: `View Result`, `Publish`, `Re-scan`
   *   Published    → `View Result`, menu: `View Mark` (read-only), `Edit & Re-publish`
   *   Error        → `Retry`, menu: `Re-scan`, `View Error`
   */
  let {
    status,
    studentName,
    failureMessage = null,
    onCapture,
    onReview,
    onRetry,
    onViewMark,
    onViewResult,
    onPublish,
    onRepublish,
    onViewError,
    onEdit,
    busy = false,
  }: {
    status: ScanUiStatus;
    studentName: string;
    failureMessage?: string | null;
    onCapture?: () => void;
    onReview?: () => void;
    onRetry?: () => void;
    onViewMark?: () => void;
    onViewResult?: () => void;
    onPublish?: () => void;
    onRepublish?: () => void;
    onViewError?: () => void;
    /** Opens the student detail dialog. Owned here so the row renders exactly one menu. */
    onEdit?: () => void;
    busy?: boolean;
  } = $props();

  const LABELS: Record<Exclude<ScanUiStatus, "not_uploaded">, string> = {
    queued: "Queued",
    extracting: "Extracting…",
    draft: "Draft",
    committed: "Uploaded",
    published: "Published",
    failed: "Error",
  };

  const itemClass =
    "min-h-11 cursor-pointer rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 sm:min-h-9";
</script>

<div class="flex items-center justify-end gap-1.5">
  {#if status === "not_uploaded"}
    <Button size="sm" onclick={() => onCapture?.()} disabled={busy}>Upload Mark</Button>
  {:else if status === "queued" || status === "extracting"}
    <Badge variant="outline" class="gap-1.5">
      <Spinner class="size-3" />
      {LABELS[status]}
    </Badge>
  {:else if status === "draft"}
    <Button size="sm" onclick={() => onReview?.()} disabled={busy}>Review &amp; Save</Button>
  {:else if status === "committed"}
    <Button size="sm" variant="outline" onclick={() => onViewMark?.()} disabled={busy}>
      View Mark
    </Button>
  {:else if status === "published"}
    <Button size="sm" variant="outline" onclick={() => onViewResult?.()} disabled={busy}>
      View Result
    </Button>
  {:else if status === "failed"}
    <Button size="sm" onclick={() => onRetry?.()} disabled={busy}>Retry</Button>
  {/if}

  {#if status !== "not_uploaded" && status !== "extracting"}
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="icon"
            class="size-11 rounded-full sm:size-9"
            aria-label={`More actions for ${studentName}`}
          >
            <EllipsisVertical class="size-4" />
          </Button>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        align="end"
        sideOffset={6}
        class="w-48 rounded-xl border border-border bg-popover p-1"
      >
        {#if status === "queued" || status === "draft"}
          <DropdownMenu.Item class={itemClass} onclick={() => onCapture?.()}>Re-scan</DropdownMenu.Item>
        {:else if status === "committed"}
          <DropdownMenu.Item class={itemClass} onclick={() => onViewResult?.()}>
            View Result
          </DropdownMenu.Item>
          <DropdownMenu.Item class={itemClass} onclick={() => onPublish?.()}>Publish</DropdownMenu.Item>
          <DropdownMenu.Item class={itemClass} onclick={() => onCapture?.()}>Re-scan</DropdownMenu.Item>
        {:else if status === "published"}
          <DropdownMenu.Item class={itemClass} onclick={() => onViewMark?.()}>
            View Mark (read-only)
          </DropdownMenu.Item>
          <DropdownMenu.Item class={itemClass} onclick={() => onRepublish?.()}>
            Edit &amp; Re-publish
          </DropdownMenu.Item>
        {:else if status === "failed"}
          <DropdownMenu.Item class={itemClass} onclick={() => onCapture?.()}>Re-scan</DropdownMenu.Item>
          <DropdownMenu.Item class={itemClass} onclick={() => onViewError?.()}>
            View Error
          </DropdownMenu.Item>
        {/if}
        {#if onEdit}
          <DropdownMenu.Separator />
          <DropdownMenu.Item class={itemClass} onclick={() => onEdit?.()}>
            View / edit
          </DropdownMenu.Item>
        {/if}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  {/if}
</div>

{#if status === "failed" && failureMessage}
  <p class="mt-1 max-w-56 text-right text-xs text-destructive">{failureMessage}</p>
{/if}
