<script lang="ts">
  import { requestReset } from "$lib/api/auth.remote";
  import SubmitButton from "$lib/components/submit-button.svelte";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import Mail from "@lucide/svelte/icons/mail";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import { cn } from "$lib/utils/shadcn.js";

  let { form }: { form?: { success: boolean } } = $props();
  const isSuccess = $derived(!!form?.success);
</script>

<div class="fixed inset-0 -z-10 overflow-hidden bg-background">
  <!-- Static Glows (Subtle) -->
  <div class="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-primary/7 rounded-full blur-[120px]"></div>
  <div class="absolute bottom-[-20%] right-[-10%] w-[70%] h-[70%] bg-primary/3 rounded-full blur-[120px]"></div>
  
  <!-- Diagonal Fading Dotted Pattern -->
  <div 
    class="absolute inset-0 opacity-[0.08] dark:opacity-[0.15] text-foreground"
    style="
      background-image: radial-gradient(circle, currentColor 1px, transparent 1px);
      background-size: 24px 24px;
      mask-image: linear-gradient(to bottom right, black 20%, transparent 80%);
      -webkit-mask-image: linear-gradient(to bottom right, black 20%, transparent 80%);
    "
  ></div>

  <!-- Micro-Dithering -->
  <div class="absolute inset-0 opacity-[0.03] dark:opacity-[0.08] mix-blend-overlay pointer-events-none"></div>
</div>

<div
  class="relative flex min-h-dvh w-full items-center justify-center p-2 sm:p-8"
>
  <div 
    class="flex w-full max-w-[440px] flex-col gap-8 rounded-[32px] border border-border/40 bg-card/40 p-1 backdrop-blur-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-1000 ease-out transition-all"
  >
    <div class="flex flex-col gap-8 rounded-[28px] bg-card/30 p-4 sm:p-10 border border-border/10">
      <div
        class="flex flex-col items-center justify-center gap-3 text-center"
      >
        <div class="size-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 mb-2">
            <Mail class="size-6 text-primary shadow-[0_0_20px_rgba(var(--primary),0.5)]" />
        </div>
        <h3 class="text-2xl font-black uppercase tracking-tighter dark:text-zinc-50">
          Reset Password
        </h3>
        <p class="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 max-w-[240px] leading-relaxed">
          {isSuccess ? "Check your email for a reset link." : "Enter your email and we'll send you a link to reset your password."}
        </p>
      </div>

      {#if !isSuccess}
        <form 
          {...requestReset}
          class="flex flex-col gap-6"
        >
          <div class="flex flex-col gap-2">
            <Label for="email" class="text-xs font-bold uppercase tracking-widest text-muted-foreground/80 ml-1">
              Email Address
            </Label>
            <div class="relative group">
              <div class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 transition-colors group-focus-within:text-primary">
                <Mail class="size-4" />
              </div>
              <Input
                {...requestReset.fields.email.as("email")}
                placeholder="name@example.com"
                class="pl-9 h-12 bg-muted/30 border-muted-foreground/10 focus:bg-background transition-all"
              />
            </div>
            {#each requestReset.fields.email.issues() ?? [] as issue}
              <p class="text-[10px] font-medium text-destructive mt-1 ml-1 animate-in fade-in slide-in-from-top-1">{issue.message}</p>
            {/each}
          </div>

          <SubmitButton 
            pending={!!requestReset.pending} 
            success={false} 
            class="h-12 rounded-xl font-bold uppercase tracking-widest shadow-xl shadow-primary/20 mt-2"
          >
            Send Reset Link
          </SubmitButton>
        </form>
      {:else}
        <div class="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4">
            <div class="p-4 rounded-xl bg-primary/5 border border-primary/10 text-center text-sm font-medium text-primary">
                Instructions have been sent.
            </div>
            <a 
                href="/signin" 
                class="flex items-center justify-center gap-2 h-12 rounded-xl bg-primary text-primary-foreground font-bold uppercase tracking-widest shadow-xl shadow-primary/20 hover:opacity-90 transition-opacity"
            >
                <ArrowLeft class="size-4" />
                Back to Sign In
            </a>
        </div>
      {/if}

      {#if !isSuccess}
        <p class="text-center text-sm text-gray-600 dark:text-zinc-400">
            Remember your password?
            <a
            href="/signin"
            class="font-semibold text-gray-800 hover:underline dark:text-zinc-200"
            >
            Sign in
            </a>
        </p>
      {/if}
    </div>
  </div>
</div>
