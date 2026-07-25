<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let showCode = $state<{ classId: number; code: string } | null>(null);
  let copied = $state(false);

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }
</script>

<svelte:head>
  <title>Connect Codes — Admin</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6 p-4">
  <h1 class="text-2xl font-bold">Connect Codes</h1>
  <p class="text-muted-foreground text-sm">
    Generate 6-digit codes for parents to link their Telegram account.
    Each code is valid for 7 days and can be shared with all parents of that class.
  </p>

  {#if showCode}
    {@const code = showCode.code}
    <div class="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4 text-center">
      <p class="mb-2 text-sm font-medium text-yellow-400">Share this code with parents:</p>
      <p class="mb-3 text-4xl font-bold tracking-widest">{code}</p>
      <div class="flex justify-center gap-3">
        <button
          onclick={() => copyCode(code)}
          class="rounded bg-yellow-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-yellow-500"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
        <button
          onclick={() => (showCode = null)}
          class="rounded bg-muted px-4 py-1.5 text-sm text-muted-foreground hover:bg-muted/80"
        >
          Dismiss
        </button>
      </div>
      <p class="mt-2 text-xs text-yellow-400/60">This code will only be shown once.</p>
    </div>
  {/if}

  <div class="space-y-3">
    {#each data.classes as c (c.classId)}
      <div class="flex items-center justify-between rounded-lg border p-4">
        <div>
          <p class="font-medium">{c.className ?? "Unknown"}{c.sectionName ? ` — ${c.sectionName}` : ""}</p>
          {#if c.activeCode}
            <p class="text-xs text-muted-foreground">
              Active code ends with <span class="font-mono font-medium text-green-400">{c.activeCode}</span>
              &nbsp;— expires {new Date(c.codeExpiresAt!).toLocaleDateString()}
            </p>
          {:else}
            <p class="text-xs text-muted-foreground">No active code</p>
          {/if}
        </div>
        <form method="POST" action="?/generate" use:enhance={() => {
          return async ({ result }) => {
            if (result.type === "success") {
              const res = result.data as { success: boolean; code?: string; classId?: number };
              if (res.success && res.code && res.classId) {
                showCode = { classId: res.classId, code: res.code };
              }
            }
          };
        }}>
          <input type="hidden" name="classId" value={c.classId} />
          <button
            type="submit"
            class="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Generate Code
          </button>
        </form>
      </div>
    {:else}
      <p class="py-8 text-center text-muted-foreground">
        No classes assigned to your account.
      </p>
    {/each}
  </div>
</div>
