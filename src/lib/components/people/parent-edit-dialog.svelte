<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { DIALOG_CONTENT as PEOPLE_DIALOG_CONTENT } from "./people-dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import type { ParentDirectoryRow } from "$lib/server/people/people-types";

  let {
    open = $bindable(false),
    parent = null,
    pending = false,
    error = null,
    onsave,
  }: {
    open?: boolean;
    parent?: ParentDirectoryRow | null;
    pending?: boolean;
    error?: string | null;
    onsave: (form: FormData) => void;
  } = $props();

  let email = $state("");
  let mobile = $state("");

  $effect(() => {
    if (open && parent) {
      email = parent.email ?? "";
      mobile = parent.phone ?? "";
    }
  });

  function submit(): void {
    if (!parent) return;
    const payload = new FormData();
    payload.set("parentId", String(parent.id));
    payload.set("guardianEmail", email);
    payload.set("guardianMobile", mobile);
    onsave(payload);
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class={PEOPLE_DIALOG_CONTENT}>
    <Dialog.Header>
      <Dialog.Title class="text-lg font-semibold">{parent?.name ?? "Parent"}</Dialog.Title>
      <Dialog.Description class="text-sm text-muted-foreground">
        Contact details only. Accounts and logins are not changed from this page.
      </Dialog.Description>
    </Dialog.Header>

    {#if error}
      <p class="rounded-lg border border-border bg-destructive/10 p-3 text-sm text-destructive">
        {error}
      </p>
    {/if}

    <form
      class="grid gap-3"
      onsubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div class="space-y-1">
        <Label for="parent-email" class="text-sm font-normal text-muted-foreground">Email</Label>
        <Input
          id="parent-email"
          class="min-h-11 bg-background text-foreground sm:min-h-9"
          type="email"
          value={email}
          oninput={(event) => (email = event.currentTarget.value)}
          maxlength={200}
          autocomplete="email"
        />
      </div>
      <div class="space-y-1">
        <Label for="parent-mobile" class="text-sm font-normal text-muted-foreground">Mobile</Label>
        <Input
          id="parent-mobile"
          class="min-h-11 bg-background text-foreground sm:min-h-9"
          type="tel"
          value={mobile}
          oninput={(event) => (mobile = event.currentTarget.value)}
          maxlength={200}
          autocomplete="tel"
        />
      </div>

      <p class="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        Clearing a field removes that contact detail. Duplicate emails are allowed and keep the
        Duplicate badge.
      </p>

      <Dialog.Footer class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save contact"}</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
