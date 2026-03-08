<script lang="ts">
  import SubmitButton from "$lib/components/submit-button.svelte";
  import { page } from "$app/state";
  import AuthForm, { type FormData } from "$lib/components/auth-form.svelte";
  import { onMount } from "svelte";
  import { clearLocalStore } from "$lib/utils";

  let { form }: { form?: FormData } = $props();

  const signInSignUp = $derived(
    page.params.authType === "signup" ? "Sign up" : "Sign in",
  );

  onMount(() => {
    clearLocalStore("selected-class");
    clearLocalStore("students");
  });
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
  <div class="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] dark:opacity-[0.08] mix-blend-overlay pointer-events-none"></div>
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
            <div class="size-6 rounded-lg bg-primary shadow-[0_0_20px_rgba(var(--primary),0.5)]"></div>
        </div>
        <h3 class="text-2xl font-black uppercase tracking-tighter text-foreground">
          {signInSignUp}
        </h3>
        <p class="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60 max-w-[240px] leading-relaxed">
          Welcome back. Enter your details to access your workspace.
        </p>
      </div>

      <!-- Email/password form -->
      <AuthForm form={form ?? undefined}>
        {#snippet submitButton({ pending, success })}
          <SubmitButton {pending} {success} class="h-11 rounded-xl font-bold uppercase tracking-widest shadow-xl shadow-primary/20">
            {signInSignUp}
          </SubmitButton>
        {/snippet}

        {#if page.params.authType === "signup"}
          {@render switchAuthType({
            question: "Already have an account?",
            href: "/signin",
            cta: "Sign in",
          })}
        {:else}
          {@render switchAuthType({
            question: "Don't have an account?",
            href: "/signup",
            cta: "Create account",
          })}
        {/if}
      </AuthForm>
    </div>
  </div>
</div>

{#snippet switchAuthType({
  question,
  href,
  cta,
  postscript = "",
}: {
  question: string;
  href: string;
  cta: string;
  postscript?: string;
})}
  <p class="mt-6 text-center text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">
    {question}
    <a
      {href}
      class="text-primary hover:text-primary/80 transition-colors ml-1"
    >
      {cta}
    </a>
    {postscript}
  </p>
{/snippet}
