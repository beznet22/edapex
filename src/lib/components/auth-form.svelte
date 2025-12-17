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
  import { login } from "$lib/api/auth.remote";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import type { SubmitFunction } from "@sveltejs/kit";
  import type { Snippet } from "svelte";
  import { toast } from "svelte-sonner";

  let { form, submitButton, children }: AuthFormProps = $props();
</script>

<form {...login} class="flex flex-col gap-4 px-4 sm:px-16">
  <div class="flex flex-col gap-2">
    <Label for="email" class=" text-zinc-600 dark:text-zinc-400">Email Address</Label>

    <Input {...login.fields.email.as("email")} />
    {#each login.fields.email.issues() ?? [] as issue}
      <p class="issue">{issue.message}</p>
    {/each}
  </div>

  <div class="flex flex-col gap-2">
    <Label for="password" class="text-zinc-600 dark:text-zinc-400">Password</Label>

    <Input {...login.fields.password.as("password")} />
    {#each login.fields.password.issues() ?? [] as issue}
      <p class="issue">{issue.message}</p>
    {/each}
  </div>

  {@render submitButton({ pending: !!login.pending, success: !!form?.success })}
  {@render children()}
</form>
