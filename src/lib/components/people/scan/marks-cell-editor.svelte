<script lang="ts">
  import { Input } from "$lib/components/ui/input";
  import { cn } from "$lib/utils/shadcn.js";

  /**
   * One mark cell, built on the shadcn `Input` primitive.
   *
   * `type="text"` with `inputmode="numeric"` and `pattern="[0-9]*"`, deliberately not:
   * - `contentEditable` — no value binding, IME/selection bugs, accessibility holes
   * - `type="number"` — spinner arrows, scroll-wheel mutates the value, accepts `e`/`+`/`-`, and
   *   returns `""` for an invalid entry so a real 0 becomes indistinguishable from a typo
   *
   * Edited and flagged states use design tokens only (`ring`, `destructive`); no palette classes,
   * so light and dark both come straight from `src/routes/layout.css`.
   */
  let {
    value,
    max,
    label,
    edited,
    flagged,
    onchange,
    disabled = false,
  }: {
    value: number;
    max: number;
    label: string;
    edited: boolean;
    flagged: boolean;
    onchange: (value: number) => void;
    disabled?: boolean;
  } = $props();

  let raw = $state("");

  // Resync only when the incoming value parses differently, so a teacher mid-keystroke is never
  // overwritten by the prop round-trip.
  $effect(() => {
    const incoming = String(value);
    if (Number(raw === "" ? NaN : raw) !== Number(incoming)) raw = incoming;
  });

  const overMax = $derived(raw.trim() !== "" && Number(raw) > max);

  function commit(next: string): void {
    const digits = next.replace(/[^0-9]/g, "");
    raw = digits;
    onchange(digits === "" ? 0 : Number(digits));
  }
</script>

<Input
  type="text"
  inputmode="numeric"
  pattern="[0-9]*"
  autocomplete="off"
  aria-label="{label} (max {max})"
  aria-invalid={overMax || flagged}
  bind:value={raw}
  oninput={(event) => commit(event.currentTarget.value)}
  {disabled}
  class={cn(
    "h-11 w-12 px-2 text-center text-sm tabular-nums sm:h-9",
    (overMax || flagged) && "border-destructive ring-destructive/20",
    !overMax && !flagged && edited && "ring-2 ring-ring/60"
  )}
/>
