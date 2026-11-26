<script lang="ts">
  let {
    nonGmail,
    duplicateCount,
  }: {
    nonGmail: boolean;
    duplicateCount: number;
  } = $props();
</script>

<div class="flex flex-wrap items-center gap-1">
  {#if nonGmail}
    <span
      class="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
    >
      Non-Gmail
    </span>
  {/if}
  {#if duplicateCount > 1}
    <span
      class="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
    >
      Duplicate ×{duplicateCount}
    </span>
  {/if}
</div>
