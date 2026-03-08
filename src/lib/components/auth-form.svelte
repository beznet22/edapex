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
  import type { Snippet } from "svelte";

  let { form, submitButton, children }: AuthFormProps = $props();

  const isSignup = $derived(page.params.authType === "signup");
  const auth = $derived(isSignup ? signup : login);
</script>

<form {...auth} class="flex flex-col gap-4 px-6 sm:px-10">
  <div class="flex flex-col gap-2">
    <Label for="email" class=" text-zinc-600 dark:text-zinc-400">Email Address</Label>

    <Input {...auth.fields.email.as("email")} />
    {#each auth.fields.email.issues() ?? [] as issue}
      <p class="issue">{issue.message}</p>
    {/each}
  </div>

  <div class="flex flex-col gap-2">
    <Label for="password" class="text-zinc-600 dark:text-zinc-400">Password</Label>

    <Input {...auth.fields.password.as("password")} type="password" />
    {#each auth.fields.password.issues() ?? [] as issue}
      <p class="issue">{issue.message}</p>
    {/each}
  </div>

  {@render submitButton({ pending: !!auth.pending, success: !!form?.success })}
  {@render children()}
</form>
