<script lang="ts">
  import * as Avatar from "$lib/components/ui/avatar";
  import { initials } from "$lib/people/people-display";

  let {
    name,
    photo = null,
    secondary = null,
    tertiary = null,
    colorful = false,
    size = "md",
  }: {
    name: string | null;
    photo?: string | null;
    secondary?: string | null;
    tertiary?: string | null;
    colorful?: boolean;
    size?: "md" | "lg";
  } = $props();

  // Deterministic palette: the same person always gets the same colour, so the
  // avatar never flickers between renders (a random pick would). Only used when
  // there is no photo, for the students directory.
  const AVATAR_PALETTE = [
    "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
    "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
    "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
    "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
    "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300",
    "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
  ];

  function paletteFor(value: string | null): string {
    const seed = value ?? "?";
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
      hash = (hash * 31 + seed.charCodeAt(index)) | 0;
    }
    return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
  }

  const boxClass = $derived(size === "lg" ? "size-14 text-base" : "size-10 text-xs");
  const fallbackClass = $derived(
    colorful ? paletteFor(name) : "bg-muted text-muted-foreground"
  );
</script>

<div class="flex min-w-0 items-center gap-3">
  <Avatar.Root class="{boxClass} rounded-full">
    {#if photo}
      <Avatar.Image src={photo} alt="" class="size-full object-cover" loading="lazy" />
    {/if}
    <!-- bits-ui swaps to the fallback when the image is missing (404) or broken. -->
    <Avatar.Fallback class="{fallbackClass} font-semibold">
      {initials(name)}
    </Avatar.Fallback>
  </Avatar.Root>
  <div class="min-w-0">
    <p class="truncate text-sm font-medium text-foreground">{name || "Unnamed"}</p>
    {#if secondary}
      <p class="truncate text-xs text-muted-foreground">{secondary}</p>
    {/if}
    {#if tertiary}
      <p class="truncate text-xs text-muted-foreground">{tertiary}</p>
    {/if}
  </div>
</div>
