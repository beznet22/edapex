<script module lang="ts">
  export type FormSuccessData = {
    success: true;
  };
  export type FormFailureData = {
    success: false;
    message: string;
    email?: string;
  };
  export type FormData = FormSuccessData | FormFailureData;

  export type AuthFormProps = {
    form?: FormData;
    submitButton: Snippet<[{ pending: boolean; success: boolean }]>;
    children: Snippet;
  };
</script>

<script lang="ts">
  import { login, signup } from "$lib/api/auth.remote";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { page } from "$app/state";
  import Mail from "@lucide/svelte/icons/mail";
  import Lock from "@lucide/svelte/icons/lock";
  import type { Snippet } from "svelte";

  let { form, submitButton, children }: AuthFormProps = $props();

  const isSignup = $derived(page.params.authType === "signup");
  const auth = $derived(isSignup ? signup : login);
</script>

<form {...auth} class="flex flex-col gap-5 px-4 sm:px-10">
  <div class="flex flex-col gap-2">
    <Label for="email" class="text-xs font-bold uppercase tracking-widest text-muted-foreground/80 ml-1">
      Email Address
    </Label>
    <div class="relative group">
      <div class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 transition-colors group-focus-within:text-primary">
        <Mail class="size-4" />
      </div>
      <Input
        {...auth.fields.email.as("email")}
        placeholder="name@example.com"
        class="pl-9 h-11 bg-muted/30 border-muted-foreground/10 focus:bg-background transition-all"
      />
    </div>
    {#each auth.fields.email.issues() ?? [] as issue}
      <p class="text-[10px] font-medium text-destructive mt-1 ml-1 animate-in fade-in slide-in-from-top-1">{issue.message}</p>
    {/each}
  </div>

  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between ml-1">
      <Label for="password" class="text-xs font-bold uppercase tracking-widest text-muted-foreground/80">
        Password
      </Label>
      {#if !isSignup}
        <a
          href="/forgot-password"
          class="text-[10px] font-bold uppercase tracking-widest text-primary/80 hover:text-primary transition-colors"
        >
          Forgot password?
        </a>
      {/if}
    </div>
    <div class="relative group">
      <div class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 transition-colors group-focus-within:text-primary">
        <Lock class="size-4" />
      </div>
      <Input
        {...auth.fields.password.as("password")}
        type="password"
        placeholder="••••••••"
        class="pl-9 h-11 bg-muted/30 border-muted-foreground/10 focus:bg-background transition-all"
      />
    </div>
    {#each auth.fields.password.issues() ?? [] as issue}
      <p class="text-[10px] font-medium text-destructive mt-1 ml-1 animate-in fade-in slide-in-from-top-1">{issue.message}</p>
    {/each}
  </div>

  <div class="mt-2">
    {@render submitButton({ pending: !!auth.pending, success: !!form?.success })}
  </div>

  {@render children()}
</form>
