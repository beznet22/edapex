<script lang="ts">
  let {
    label,
    tone = "muted",
  }: {
    label: string;
    tone?: "active" | "muted";
  } = $props();
</script>

<span
  class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium {tone ===
  'active'
    ? 'border-primary/30 bg-primary/10 text-primary'
    : 'border-border bg-muted text-muted-foreground'}"
>
  {label}
</span>
