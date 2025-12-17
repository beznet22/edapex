<script lang="ts">
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import type { WithoutChildren } from "$lib/utils/shadcn.js";
  import { Eclipse, type Icon } from "@lucide/svelte";
  import type { Component } from "svelte";
  import type { ComponentProps } from "svelte";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import { page } from "$app/state";
  import { pushState } from "$app/navigation";
  import { chatProviders, type ChatProviders } from "$lib/chat/models";
  import { Button } from "./ui/button";
  import { Spinner } from "./ui/spinner";
  import type { AuthUser } from "$lib/types/auth-types";
  import { CredentialType } from "$lib/schema/chat-schema";
  import { toast } from "svelte-sonner";
  import { saveTokenData } from "$lib/context/oauth.svelte";
  import { addProvder } from "$lib/api/agent.remote";
  import { getTheme } from "@sejohnson/svelte-themes";
  import Switch from "./ui/switch/switch.svelte";
  import { Label } from "./ui/label";

  let {
    items,
    user,
    ...restProps
  }: { user?: AuthUser; items: { title: string; url: string; icon: Component<Icon> }[] } & WithoutChildren<
    ComponentProps<typeof Sidebar.Group>
  > = $props();

  const theme = getTheme();
  let open = $derived(page.state.showModal || false);
  let providers = $state<ChatProviders[]>(chatProviders);

  let value = $state<CredentialType>();
  const triggerContent = $derived(providers.find((p) => p.id === value)?.name ?? "Select a provider");

  const onclick = async (url: string) => {
    switch (url) {
      case "#settings":
        pushState(url, { showModal: true });
        break;
      default:
        pushState("", { showModal: true });
    }
  };

  const onSubmit = async (e: SubmitEvent) => {
    e.preventDefault();

    const form = e.target as HTMLFormElement;
    const data = new FormData(form);
    const provider = data.get("provider") as CredentialType;
    console.log("provider: ", provider);
    const result = await addProvder({ provider });
    if (!result.success || !result.deviceAuth) {
      toast.error(result.message);
      return;
    }

    history.back();
    saveTokenData({ ...result.deviceAuth, provider });
  };
</script>

<Sidebar.Group {...restProps}>
  <Sidebar.GroupContent>
    <Sidebar.Menu>
      {#each items as item (item.title)}
        {@const Icon = item.icon}
        <Sidebar.MenuItem>
          <Sidebar.MenuButton onclick={(e) => onclick(item.url)}>
            {#snippet child({ props })}
              <a href={item.url} {...props}>
                <Icon />
                <span>{item.title}</span>
              </a>
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
      {/each}
      <Sidebar.MenuItem>
        <div class="flex w-full justify-between items-center space-x-2 p-2">
          <Label for="theme-switch" class="cursor-pointer">
            <Eclipse class="size-4" />
            <span>{theme.resolvedTheme === "light" ? "Dark" : "Light"} Mode</span>
          </Label>
          <Switch
            class="cursor-pointer"
            checked={theme.resolvedTheme === "dark"}
            id="theme-switch"
            onCheckedChange={() => (theme.selectedTheme = theme.resolvedTheme === "light" ? "dark" : "light")}
          />
        </div>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.GroupContent>
</Sidebar.Group>

<Dialog.Root
  bind:open
  onOpenChange={() => {
    history.back();
  }}
>
  <Dialog.Content class="sm:max-w-[425px]">
    <form onsubmit={onSubmit}>
      <Dialog.Header>
        <Dialog.Title>Add Chat Provider</Dialog.Title>
        <Dialog.Description>Add a chat model provider to use with your chat.</Dialog.Description>
      </Dialog.Header>
      {#if providers.length > 0}
        <div class="grid gap-4 py-4">
          <Select.Root required type="single" name="provider" bind:value>
            <Select.Trigger class="w-full">
              {triggerContent}
            </Select.Trigger>
            <Select.Content>
              <Select.Group>
                <Select.Label>Providers</Select.Label>
                {#each providers as provider (provider.id)}
                  <Select.Item value={provider.id} label={provider.name}>
                    {provider.name}
                  </Select.Item>
                {/each}
              </Select.Group>
            </Select.Content>
          </Select.Root>
        </div>
      {/if}
      <Dialog.Footer>
        <Button type="submit" variant="default" disabled={!!addProvder.pending}>
          {#if addProvder.pending}
            <Spinner />
          {:else}
            <span>Add</span>
          {/if}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
