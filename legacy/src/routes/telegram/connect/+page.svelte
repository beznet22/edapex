<script lang="ts">
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const botUsername = $derived(data.botUsername);
  const token = $derived(data.token);
  const telegramLink = $derived(
    botUsername ? `https://t.me/${botUsername}?start=${token}` : "#",
  );
</script>

<div class="flex min-h-[80vh] items-center justify-center px-4 py-10">
  <div
    class="w-full max-w-md rounded-2xl border border-border/40 bg-card/80 p-6 shadow-2xl backdrop-blur-sm sm:p-8"
  >
    <div class="mb-5 flex items-center gap-3">
      <div
        class="grid size-10 place-items-center rounded-full bg-primary/15 text-primary"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          class="size-5"
        >
          <path
            d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.24 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"
          />
        </svg>
      </div>
      <h1 class="text-xl font-black tracking-tight text-foreground sm:text-2xl">
        Connect Telegram to EdApex
      </h1>
    </div>

    <ol class="mb-6 space-y-3 text-sm text-muted-foreground">
      <li class="flex gap-3">
        <span
          class="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-black text-primary"
          >1</span
        >
        <span
          >Tap the button below to open Telegram and start a chat with the
          EdApex bot.</span
        >
      </li>
      <li class="flex gap-3">
        <span
          class="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-black text-primary"
          >2</span
        >
        <span
          >Press <span class="font-bold text-foreground">Start</span> in Telegram
          to link this account automatically.</span
        >
      </li>
      <li class="flex gap-3">
        <span
          class="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-black text-primary"
          >3</span
        >
        <span
          >Once linked, send any message here to chat with the EdApex assistant.</span
        >
      </li>
    </ol>

    <a
      href={telegramLink}
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-black uppercase tracking-widest text-primary-foreground transition-opacity hover:opacity-90 active:opacity-80"
    >
      Open Telegram
    </a>

    <p
      class="mt-5 text-center text-[11px] font-medium leading-relaxed text-muted-foreground"
    >
      Or manually: in Telegram, message
      <span class="font-bold text-foreground"
        >@{botUsername || "edapex_bot"}</span
      >
      with the command
      <code
        class="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground"
        >/connect {token}</code
      >
    </p>
  </div>
</div>
