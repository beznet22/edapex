<script lang="ts">
  import * as Select from "$lib/components/ui/select";

  let {
    value = $bindable(""),
    options,
    placeholder = "Select…",
    disabled = false,
    id = undefined,
    ariaLabel = undefined,
    onchange,
    class: className = "",
  }: {
    value?: string;
    options: { value: string; label: string }[];
    placeholder?: string;
    disabled?: boolean;
    id?: string;
    ariaLabel?: string;
    onchange?: (value: string) => void;
    class?: string;
  } = $props();

  const selectedLabel = $derived(
    options.find((option) => option.value === value)?.label ?? ""
  );
</script>

<Select.Root
  type="single"
  bind:value
  {disabled}
  onValueChange={(next) => onchange?.(next)}
>
  <Select.Trigger
    {id}
    aria-label={ariaLabel}
    {disabled}
    class="min-h-11 w-full justify-between rounded-md border border-border bg-background px-2 text-sm font-normal text-foreground data-[placeholder]:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:min-h-9 {className}"
  >
    <span class="truncate">{selectedLabel || placeholder}</span>
  </Select.Trigger>
  <Select.Content>
    {#each options as option (option.value)}
      <Select.Item value={option.value} label={option.label} class="min-h-9" />
    {/each}
  </Select.Content>
</Select.Root>
