<script lang="ts">
  import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardFooter,
  } from "$lib/components/ui/card/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";

  import UserIcon from "@lucide/svelte/icons/user";
  import PaintbrushIcon from "@lucide/svelte/icons/paintbrush";
  import PlugIcon from "@lucide/svelte/icons/plug";
  import KeyIcon from "@lucide/svelte/icons/key-round";
  import CheckIcon from "@lucide/svelte/icons/check";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import SunIcon from "@lucide/svelte/icons/sun";
  import MoonIcon from "@lucide/svelte/icons/moon";
  import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import ChevronUpIcon from "@lucide/svelte/icons/chevron-up";
  import Settings2Icon from "@lucide/svelte/icons/settings-2";

  import { page } from "$app/state";
  import { pushState, invalidateAll } from "$app/navigation";
  import { untrack } from "svelte";
  import { useAI } from "$lib/context/ai-context.svelte";
  import { getTheme } from "@sejohnson/svelte-themes";
  import { toast } from "svelte-sonner";
  import {
    addProvider,
    removeProvider,
    getProviders,
    toggleProvider,
    getAgentRouting,
    updateAgentRouting,
    getAgentSettings,
    updateAgentSettings,
  } from "$lib/api/agent.remote.js";
  import type { CredentialType } from "$lib/schema/chat-schema";
  import type { AgentSetting } from "$lib/server/mastra/storage/libsql/app-db.schema";

  const providerLogos: Record<string, string> = {
    groq: "https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg/icons/groq.svg",
    nvidia_nim:
      "https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg/icons/nvidia.svg",
    mistral:
      "https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg/icons/mistral.svg",
    deepseek:
      "https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg/icons/deepseek.svg",
    opencode:
      "https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg/icons/opencode.svg",
  };

  let open = $state(false);
  let activeTab = $state("Providers");

  const tabs = [
    { name: "General", icon: UserIcon },
    { name: "Appearance", icon: PaintbrushIcon },
    { name: "Providers", icon: PlugIcon },
    { name: "Agent Routing", icon: Settings2Icon },
  ];

  // AI & Provider State
  const ai = useAI();
  const theme = getTheme();
  let connectedProviders = $state<
    Array<{
      provider: string;
      name: string;
      enabled: boolean;
      source: "db" | "env";
      priority: number;
      baseUrl: string;
    }>
  >([]);
  let advancedOpen = $state<Record<string, boolean>>({});
  let apiKeys = $state<Record<string, string>>({});

  // Agent Routing & Settings State
  let routing = $state<
    Array<{ role: string; provider: string; model: string }>
  >([]);
  let settings = $state<Partial<AgentSetting>>({
    profile: "balanced",
    globalToolsEnabled: 1,
  });

  let isLoadingProviders = $state(false);
  let isLoadingRouting = $state(false);
  let savingProviderId = $state<string | null>(null);
  let removingProviderId = $state<string | null>(null);
  let copiedProviderId = $state<string | null>(null);

  // Sync with URL state
  $effect(() => {
    if (page.state.showModal !== undefined) {
      open = !!page.state.showModal;
    }
  });

  function onOpenChange(isOpen: boolean) {
    if (!isOpen && page.state.showModal) {
      history.back();
    }
  }

  // Load providers on open

  const sortedConnectedProviders = $derived(connectedProviders);

  $effect(() => {
    if (open) {
      untrack(() => {
        loadConnectedProviders();
        loadAgentConfig();
      });
    }
  });

  async function loadAgentConfig() {
    isLoadingRouting = true;
    try {
      const [rResult, sResult] = await Promise.all([
        getAgentRouting({}),
        getAgentSettings({}),
      ]);
      if (rResult.success) routing = rResult.routing;
      if (sResult.success && sResult.settings) {
        settings = sResult.settings as Partial<AgentSetting>;
      }
    } catch (err) {
      console.error("Failed to load agent config:", err);
    } finally {
      isLoadingRouting = false;
    }
  }

  async function loadConnectedProviders() {
    isLoadingProviders = true;
    try {
      const result = await getProviders({});
      if (result.success) {
        connectedProviders = result.providers;
      }
    } catch (err) {
      console.error("Failed to load providers:", err);
    } finally {
      isLoadingProviders = false;
    }
  }

  async function updateProfile(profile: string) {
    settings.profile = profile;
    await updateAgentSettings({ profile });
    toast.success(`AI profile set to ${profile}`);
  }

  async function updateRouting(
    role: string,
    provider: string,
    model: string,
  ) {
    const index = routing.findIndex((r) => r.role === role);
    if (index !== -1) {
      routing[index] = { role, provider, model };
    } else {
      routing.push({ role, provider, model });
    }

    try {
      await updateAgentRouting({ role, provider, model });
      toast.success(`${role} routing updated`);
    } catch (error) {
      toast.error(`Failed to update ${role} routing`);
    }
  }

  // Real-time Provider Save (Debounced)
  let saveTimeout: any;
  async function handleAdvancedUpdate(
    providerId: string,
    field: "priority" | "baseUrl",
    value: string | number,
  ) {
    const provider = connectedProviders.find((p) => p.provider === providerId);
    if (!provider) return;

    // @ts-ignore
    provider[field] = value;

    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      try {
        await addProvider({
          provider: providerId as CredentialType,
          priority: Number(provider.priority),
          baseUrl: provider.baseUrl,
        } as any);
        toast.success(`${providerId} configuration updated`);
      } catch (err) {
        console.error(err);
      }
    }, 1000);
  }

  async function handleApiKeyInput(providerId: string, value: string) {
    if (!value || value.trim().length < 10) return;

    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      savingProviderId = providerId;
      try {
        const result = await addProvider({
          provider: providerId as CredentialType,
          apiKey: value.trim(),
        } as any);
        if (result.success) {
          toast.success(`${providerId} connected`);
          apiKeys[providerId] = "";
          await loadConnectedProviders();
        }
      } catch (err) {
        console.error(err);
      } finally {
        savingProviderId = null;
      }
    }, 1000);
  }

  async function handleRemoveKey(providerId: string) {
    removingProviderId = providerId;
    try {
      const result = await removeProvider({
        provider: providerId as CredentialType,
      });
      if (result.success) {
        toast.success(`${providerId} disconnected`);
        ai.removeProvider(providerId);
        await loadConnectedProviders();
      }
    } catch (err) {
      toast.error("Failed to remove provider");
    } finally {
      removingProviderId = null;
    }
  }

  function handleCopyMaskedKey(providerId: string) {
    const found = connectedProviders.find((p) => p.provider === providerId);
    if (!found) return;
    navigator.clipboard.writeText(found.name);
    copiedProviderId = providerId;
    setTimeout(() => {
      copiedProviderId = null;
    }, 2000);
  }

  async function handleToggleProvider(providerId: string, enabled: boolean) {
    try {
      const result = await toggleProvider({
        provider: providerId as CredentialType,
        enabled,
      });
      if (result.success) {
        toast.success(`${providerId} ${enabled ? "enabled" : "disabled"}`);
        await loadConnectedProviders();
        await invalidateAll();
      }
    } catch (err) {
      toast.error("Failed to update status");
    }
  }
</script>

<Dialog.Root bind:open {onOpenChange}>
  <Dialog.Content
    class="overflow-hidden p-0 fixed inset-0 w-full h-full max-w-none rounded-none md:relative md:inset-auto md:w-auto md:h-auto md:max-h-[85vh] md:max-w-[1000px] md:rounded-2xl border-sidebar-border bg-background"
    trapFocus={false}
  >
    <Dialog.Title class="sr-only">Settings</Dialog.Title>
    <Dialog.Description class="sr-only"
      >Configure your EdApex workspace preferences.</Dialog.Description
    >

    <Sidebar.Provider class="items-start bg-transparent">
      <!-- Settings Sidebar -->
      <Sidebar.Root
        collapsible="none"
        class="hidden md:flex bg-sidebar w-64 border-r border-sidebar-border/10"
      >
        <Sidebar.Content class="p-2 pt-4">
          <Sidebar.Group>
            <Sidebar.GroupLabel
              class="text-[10px] uppercase tracking-widest text-sidebar-foreground/30 px-3 pb-2 font-black"
              >Workspace Settings</Sidebar.GroupLabel
            >
            <Sidebar.GroupContent>
              <Sidebar.Menu class="gap-1">
                {#each tabs as tab (tab.name)}
                  <Sidebar.MenuItem>
                    <Sidebar.MenuButton
                      isActive={activeTab === tab.name}
                      onclick={() => (activeTab = tab.name)}
                      class="rounded-xl px-3 h-10 transition-all hover:bg-sidebar-accent/50 data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                    >
                      <tab.icon class="size-4" />
                      <span class="font-bold text-[13px] tracking-tight"
                        >{tab.name}</span
                      >
                    </Sidebar.MenuButton>
                  </Sidebar.MenuItem>
                {/each}
              </Sidebar.Menu>
            </Sidebar.GroupContent>
          </Sidebar.Group>
        </Sidebar.Content>

        <Sidebar.Footer class="p-4 border-t border-sidebar-border/10">
          <div class="flex items-center gap-3 px-2 py-1">
            <div
              class="size-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]"
            ></div>
            <span
              class="text-[10px] font-black uppercase tracking-widest text-sidebar-foreground/40"
              >System Healthy</span
            >
          </div>
        </Sidebar.Footer>
      </Sidebar.Root>

      <!-- Main Content Area -->
      <main class="flex h-full md:h-[80vh] flex-1 flex-col overflow-hidden bg-background">
        <header
          class="flex shrink-0 flex-col border-b border-sidebar-border/10 bg-background/50 backdrop-blur-xl"
        >
          <!-- Mobile Tab Bar -->
          <div class="flex md:hidden overflow-x-auto scrollbar-hide gap-1 px-3 py-2">
            {#each tabs as tab (tab.name)}
              <button
                onclick={() => (activeTab = tab.name)}
                class="flex items-center gap-1.5 min-h-12 px-4 py-2 rounded-xl text-xs font-bold tracking-tight whitespace-nowrap shrink-0 transition-all {activeTab === tab.name ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/10'}"
              >
                <tab.icon class="size-4" />
                {tab.name}
              </button>
            {/each}
          </div>
          <!-- Desktop Breadcrumb -->
          <div class="hidden md:flex h-16 items-center justify-between px-6">
          <Breadcrumb.Root>
            <Breadcrumb.List>
              <Breadcrumb.Item class="hidden md:block">
                <Breadcrumb.Link
                  href="##"
                  class="text-xs font-bold uppercase tracking-widest text-muted-foreground/40"
                  >Settings</Breadcrumb.Link
                >
              </Breadcrumb.Item>
              <Breadcrumb.Separator class="hidden md:block opacity-20" />
              <Breadcrumb.Item>
                <Breadcrumb.Page
                  class="text-xs font-black uppercase tracking-widest text-primary"
                  >{activeTab}</Breadcrumb.Page
                >
              </Breadcrumb.Item>
            </Breadcrumb.List>
          </Breadcrumb.Root>
          </div>
        </header>

        <ScrollArea class="h-full" scrollbarYClasses="w-1 px-0.5">
          <div class="p-8 max-w-3xl mx-auto space-y-8">
            {#if activeTab === "General"}
              <div
                class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300"
              >
                <div class="space-y-2">
                  <h2
                    class="text-2xl font-black tracking-tight text-foreground"
                  >
                    Workspace Identity
                  </h2>
                  <p class="text-sm text-muted-foreground">
                    Manage your personal profile and workspace identification.
                  </p>
                </div>

                <Separator class="bg-sidebar-border/10" />

                <div class="grid gap-6">
                  <div class="grid gap-2">
                    <Label
                      for="username"
                      class="text-xs font-black uppercase tracking-widest text-muted-foreground/60 ml-1"
                      >Display Name</Label
                    >
                    <Input
                      id="username"
                      value={page.data.user?.name}
                      class="h-12 bg-muted/5 border-sidebar-border/50 rounded-xl px-4 font-bold text-sm focus:border-primary/50 transition-all"
                      placeholder="Your name"
                    />
                  </div>
                  <div class="grid gap-2">
                    <Label
                      for="email"
                      class="text-xs font-black uppercase tracking-widest text-muted-foreground/60 ml-1"
                      >Email Address</Label
                    >
                    <Input
                      id="email"
                      value={page.data.user?.email}
                      disabled
                      class="h-12 bg-muted/5 border-sidebar-border/50 rounded-xl px-4 font-bold text-sm opacity-50"
                    />
                  </div>
                </div>

                <div
                  class="p-4 rounded-2xl bg-primary/5 border border-primary/20 flex gap-4 items-start"
                >
                  <div
                    class="p-3 rounded-xl bg-primary/10 border border-primary/20"
                  >
                    <ShieldCheckIcon class="size-5 text-primary" />
                  </div>
                  <div class="space-y-1">
                    <h4 class="text-sm font-black text-foreground">
                      Identity Verified
                    </h4>
                    <p class="text-xs text-muted-foreground leading-relaxed">
                      Your account is secured via enterprise SSO. Profile
                      changes are optimistic and synchronized with the central
                      directory.
                    </p>
                  </div>
                </div>
              </div>
            {:else if activeTab === "Appearance"}
              <div
                class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300"
              >
                <div class="space-y-2">
                  <h2
                    class="text-2xl font-black tracking-tight text-foreground"
                  >
                    Visual Engine
                  </h2>
                  <p class="text-sm text-muted-foreground">
                    Customize the interface aesthetic and system themes.
                  </p>
                </div>

                <Separator class="bg-sidebar-border/10" />

                <div class="grid grid-cols-2 gap-4">
                  <button
                    onclick={() => (theme.selectedTheme = "light")}
                    class="group relative aspect-video rounded-2xl border-2 overflow-hidden transition-all {theme.resolvedTheme ===
                    'light'
                      ? 'border-primary ring-4 ring-primary/10 shadow-2xl'
                      : 'border-sidebar-border/50 hover:border-sidebar-border grayscale hover:grayscale-0'}"
                  >
                    <div class="absolute inset-0 bg-[#F9FAFB] p-3">
                      <div
                        class="w-full h-2 bg-sidebar-border/20 rounded-full mb-2"
                      ></div>
                      <div
                        class="w-1/2 h-2 bg-sidebar-border/20 rounded-full"
                      ></div>
                    </div>
                    <div
                      class="absolute bottom-3 left-3 flex items-center gap-2"
                    >
                      <div
                        class="size-6 rounded-lg bg-white border border-sidebar-border/50 flex items-center justify-center text-slate-400"
                      >
                        <SunIcon class="size-3.5" />
                      </div>
                      <span
                        class="text-[10px] font-black uppercase tracking-widest {theme.resolvedTheme ===
                        'light'
                          ? 'text-primary'
                          : 'text-slate-400'}">Light Core</span
                      >
                    </div>
                  </button>

                  <button
                    onclick={() => (theme.selectedTheme = "dark")}
                    class="group relative aspect-video rounded-2xl border-2 overflow-hidden transition-all {theme.resolvedTheme ===
                    'dark'
                      ? 'border-primary ring-4 ring-primary/10 shadow-2xl'
                      : 'border-sidebar-border/50 hover:border-sidebar-border grayscale hover:grayscale-0'}"
                  >
                    <div class="absolute inset-0 bg-[#0A0A0A] p-3">
                      <div
                        class="w-full h-2 bg-sidebar-border/20 rounded-full mb-2"
                      ></div>
                      <div
                        class="w-1/2 h-2 bg-sidebar-border/20 rounded-full"
                      ></div>
                    </div>
                    <div
                      class="absolute bottom-3 left-3 flex items-center gap-2"
                    >
                      <div
                        class="size-6 rounded-lg bg-[#111] border border-sidebar-border/50 flex items-center justify-center text-slate-500"
                      >
                        <MoonIcon class="size-3.5" />
                      </div>
                      <span
                        class="text-[10px] font-black uppercase tracking-widest {theme.resolvedTheme ===
                        'dark'
                          ? 'text-primary'
                          : 'text-slate-500'}">Gold on Slate</span
                      >
                    </div>
                  </button>
                </div>
              </div>
            {:else if activeTab === "Providers"}
              <div
                class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-12"
              >
                <div class="space-y-2">
                  <h2
                    class="text-2xl font-black tracking-tight text-foreground"
                  >
                    AI Orchestration
                  </h2>
                  <p class="text-sm text-muted-foreground">
                    Manage your provider credentials and intelligence status.
                  </p>
                </div>

                <Separator class="bg-sidebar-border/10" />

                <div
                  class="grid grid-cols-1 md:grid-cols-2 gap-4 pb-12 items-start"
                >
                  {#each ai.supportedProviders.filter(p => p.id !== 'opengateway') as provider (provider.id)}
                    {@const connected = connectedProviders.find(
                      (p) => p.provider === provider.id,
                    )}
                    <Card
                      class="bg-muted/5 border-sidebar-border/50 relative overflow-hidden rounded-2xl group transition-all hover:bg-muted/10 hermes-glass"
                    >
                      <CardHeader class="p-5">
                        <div class="flex items-start justify-between">
                          <div class="flex items-center gap-4">
                            <div
                              class="size-12 rounded-xl bg-background border border-sidebar-border/50 flex items-center justify-center p-2.5 overflow-hidden"
                            >
                              {#if providerLogos[provider.id]}
                                <img
                                  src={providerLogos[provider.id]}
                                  alt={provider.name}
                                  class="size-full object-contain dark:invert"
                                  onerror={(e) => {
                                    (
                                      e.target as HTMLImageElement
                                    ).style.display = "none";
                                  }}
                                />
                              {:else}
                                <KeyIcon class="size-5 text-muted-foreground" />
                              {/if}
                            </div>
                            <div class="space-y-0.5">
                              <div class="flex items-center gap-2">
                                <CardTitle
                                  class="text-[14px] font-black tracking-tight"
                                  >{provider.name}</CardTitle
                                >
                                {#if connected}
                                  <Badge
                                    class="{connected.source === 'db'
                                      ? 'bg-primary/20 text-primary'
                                      : 'bg-muted-foreground/10 text-muted-foreground/60'} border-none text-[8px] font-black px-1.5 py-0 rounded-md"
                                    >{connected.source === "db"
                                      ? "PERSONAL"
                                      : "GLOBAL"}</Badge
                                  >
                                {/if}
                              </div>
                              <CardDescription
                                class="text-[11px] font-medium leading-tight max-w-[150px] line-clamp-2"
                                >{provider.description}</CardDescription
                              >
                            </div>
                          </div>

                          <div class="flex flex-col items-end gap-2">
                            {#if connected}
                              <Switch
                                checked={connected.enabled}
                                onCheckedChange={(val) =>
                                  handleToggleProvider(provider.id, val)}
                                class="scale-75 origin-right"
                              />
                            {/if}
                          </div>
                        </div>
                      </CardHeader>

                      <CardFooter class="px-5 pb-5 pt-0 flex flex-col gap-3">
                        {#if connected}
                          <div
                            class="flex items-center justify-between w-full p-2 bg-background/50 rounded-xl border border-sidebar-border/50 backdrop-blur-sm"
                          >
                            <div class="flex items-center gap-2 px-2">
                              <CheckIcon class="size-3 text-green-500" />
                              <span
                                class="text-[10px] font-bold text-muted-foreground/60 font-mono tracking-tighter"
                                >{connected.name}</span
                              >
                            </div>

                            <div class="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                class="min-h-12 min-w-12 rounded-xl hover:bg-primary/10 hover:text-primary transition-all"
                                onclick={() => handleCopyMaskedKey(provider.id)}
                              >
                                {#if copiedProviderId === provider.id}
                                  <CheckIcon class="size-3" />
                                {:else}
                                  <CopyIcon class="size-3" />
                                {/if}
                              </Button>

                              <Button
                                variant="ghost"
                                size="icon"
                                class="min-h-12 min-w-12 rounded-xl hover:bg-destructive/10 hover:text-destructive transition-all"
                                onclick={() => handleRemoveKey(provider.id)}
                                disabled={removingProviderId === provider.id ||
                                  connected.source === "env"}
                              >
                                {#if removingProviderId === provider.id}
                                  <Spinner class="size-3" />
                                {:else}
                                  <Trash2Icon class="size-3" />
                                {/if}
                              </Button>
                            </div>
                          </div>

                          <!-- Advanced Configuration (Integrated) -->
                          <div class="w-full space-y-3 pt-2">
                            <div class="flex items-center gap-2 px-1">
                              <Settings2Icon class="size-3 text-muted-foreground/40" />
                              <span class="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40">Advanced Config</span>
                            </div>
                            
                            <div class="grid grid-cols-1 gap-3 p-3 bg-background/30 rounded-xl border border-sidebar-border/20">
                              <div class="grid gap-1.5">
                                <Label class="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40 ml-1">Priority (1 = Highest)</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  value={connected.priority ?? 1}
                                  oninput={(e) => handleAdvancedUpdate(provider.id, "priority", (e.target as HTMLInputElement).value)}
                                  class="h-12 bg-background/50 border-sidebar-border/50 text-[11px] font-bold rounded-lg"
                                />
                              </div>
                              <div class="grid gap-1.5">
                                <Label class="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40 ml-1">Base URL (Proxy)</Label>
                                <Input
                                  placeholder="Default"
                                  value={connected.baseUrl ?? ""}
                                  oninput={(e) => handleAdvancedUpdate(provider.id, "baseUrl", (e.target as HTMLInputElement).value)}
                                  class="h-12 bg-background/50 border-sidebar-border/50 text-[11px] font-bold rounded-lg"
                                />
                              </div>
                            </div>
                          </div>
                        {:else}
                          <div class="relative w-full group/input">
                            <Input
                              type="password"
                              placeholder="API Key for {provider.name}"
                              class="h-10 w-full bg-background/30 rounded-xl border-sidebar-border focus:border-primary/50 text-xs font-mono pl-4 pr-10 transition-all placeholder:text-muted-foreground/20"
                              bind:value={apiKeys[provider.id]}
                              oninput={(e) =>
                                handleApiKeyInput(
                                  provider.id,
                                  (e.target as HTMLInputElement).value,
                                )}
                            />
                            <div
                              class="absolute right-3 top-1/2 -translate-y-1/2"
                            >
                              {#if savingProviderId === provider.id}
                                <Spinner class="size-4 text-primary" />
                              {:else}
                                <KeyIcon
                                  class="size-4 text-muted-foreground/30 group-focus-within/input:text-primary/50"
                                />
                              {/if}
                            </div>
                          </div>
                        {/if}
                      </CardFooter>
                    </Card>
                  {/each}
                </div>
              </div>
            {:else if activeTab === "Agent Routing"}
              <div
                class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-12"
              >
                <div class="space-y-2">
                  <h2
                    class="text-2xl font-black tracking-tight text-foreground"
                  >
                    Intelligence Routing
                  </h2>
                  <p class="text-sm text-muted-foreground">
                    Assign specific models to agent roles and configure
                    system intelligence.
                  </p>
                </div>

                <Separator class="bg-sidebar-border/10" />

                <!-- Profile Selection -->
                <div class="grid grid-cols-3 gap-4">
                  {#each ["strong", "balanced", "simple"] as profile}
                    <button
                      onclick={() => updateProfile(profile)}
                      class="flex flex-col items-start gap-2 p-4 rounded-2xl border-2 transition-all {settings.profile ===
                      profile
                        ? 'border-primary bg-primary/5 gold-glow'
                        : 'border-sidebar-border/50 bg-muted/5 hover:bg-muted/10'}"
                    >
                      <div class="flex items-center gap-2">
                        <div
                          class="size-2 rounded-full {profile === 'strong'
                            ? 'bg-primary'
                            : profile === 'balanced'
                              ? 'bg-blue-500'
                              : 'bg-slate-500'}"
                        ></div>
                        <span
                          class="text-xs font-black uppercase tracking-widest"
                          >{profile}</span
                        >
                      </div>
                      <p
                        class="text-[10px] text-muted-foreground text-left leading-tight"
                      >
                        {profile === "strong"
                          ? "High confidence, complex reasoning"
                          : profile === "balanced"
                            ? "Optimal speed and accuracy"
                            : "Fastest response, basic tasks"}
                      </p>
                    </button>
                  {/each}
                </div>

                <div class="space-y-4 pt-4">
                  <h3
                    class="text-xs font-black uppercase tracking-widest text-muted-foreground/60 ml-1"
                  >
                    Agent Role Mapping
                  </h3>
                  <div class="grid gap-3">
                    {#each ["supervisor", "assistant", "default"] as role}
                      {@const current = routing.find(
                        (r) => r.role === role,
                      )}
                      <div
                        class="flex items-center justify-between p-4 bg-muted/5 border border-sidebar-border/50 rounded-2xl hermes-glass"
                      >
                        <div class="flex items-center gap-4">
                          <div
                            class="size-10 rounded-xl bg-background border border-sidebar-border/50 flex items-center justify-center"
                          >
                            <UserIcon class="size-5 text-muted-foreground/60" />
                          </div>
                          <div class="space-y-0.5">
                            <span class="text-sm font-black capitalize"
                              >{role}</span
                            >
                            <p class="text-[10px] text-muted-foreground">
                              Model used for {role} logic
                            </p>
                          </div>
                        </div>

                        <select
                          class="h-10 w-[200px] bg-background border border-sidebar-border/50 rounded-xl text-xs px-3 font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                          value={current
                            ? `${current.provider}:${current.model}`
                            : ""}
                          onchange={(e) => {
                            const [provider, model] = (
                              e.target as HTMLSelectElement
                            ).value.split(":");
                             updateRouting(role, provider, model);
                          }}
                        >
                          <option value="">System Default</option>
                          {#each ai.availableModels as model}
                            <option value={`${model.provider}:${model.id}`}
                              >{model.name} ({model.provider})</option
                            >
                          {/each}
                        </select>
                      </div>
                    {/each}
                  </div>
                </div>

                <div
                  class="p-4 rounded-2xl bg-primary/5 border border-primary/20 flex gap-4 items-start mt-6"
                >
                  <div
                    class="p-3 rounded-xl bg-primary/10 border border-primary/20"
                  >
                    <ShieldCheckIcon class="size-5 text-primary" />
                  </div>
                  <div class="space-y-1">
                    <h4 class="text-sm font-black text-foreground">
                      Confidence Gating Active
                    </h4>
                    <p class="text-xs text-muted-foreground leading-relaxed">
                      All state-mutating requests are gated by a 90% confidence
                      threshold. Agent Roles are automatically switched based on
                      task complexity.
                    </p>
                  </div>
                </div>
              </div>
            {/if}
          </div>
        </ScrollArea>
      </main>
    </Sidebar.Provider>
  </Dialog.Content>
</Dialog.Root>
