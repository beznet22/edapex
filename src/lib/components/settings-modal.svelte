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
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";

  import UserIcon from "@lucide/svelte/icons/user";
  import PaintbrushIcon from "@lucide/svelte/icons/paintbrush";
  import PlugIcon from "@lucide/svelte/icons/plug";
  import BoxIcon from "@lucide/svelte/icons/box";
  import SearchIcon from "@lucide/svelte/icons/search";
  import KeyRoundIcon from "@lucide/svelte/icons/key-round";
  import SunIcon from "@lucide/svelte/icons/sun";
  import MoonIcon from "@lucide/svelte/icons/moon";
  import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import CogIcon from "@lucide/svelte/icons/cog";
  import Settings2Icon from "@lucide/svelte/icons/settings-2";

  import { page } from "$app/state";
  import { untrack } from "svelte";
  import { fly } from 'svelte/transition';
  import { getTheme } from "@sejohnson/svelte-themes";
  import { toast } from "svelte-sonner";
  import { z } from "zod";
  import {
    getUserCredentials,
    saveUserCredential,
    deleteUserCredential,
    getModelVisibility,
    updateModelVisibility,
    getAvailableModels,
    getPlatformDefaults
  } from "$lib/api/agent.remote.js";
  import { AvailableModelsHolder } from "$lib/context/sync.svelte";
  import { BUILTIN_PROVIDERS } from "$lib/provider/catalog";
  import { CustomProviderEncryptedDataSchema } from "$lib/provider/spec";
  import type { ProviderId } from "$lib/provider/types";
  import type { ProviderInfo, ModelInfo } from "$lib/provider/spec";

  const providerLogos: Record<string, string> = {
    groq: "https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg/icons/groq.svg",
    nvidia_nim:
      "https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg/icons/nvidia.svg",
    mistral:
      "https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg/icons/mistral.svg",
    deepseek:
      "https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg/icons/deepseek.svg",
    opencode:
      "https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg/icons/opencode.svg"
  };

  type CredentialKind = "env" | "credential" | "custom";
  type ProviderSource = "db" | "env";

  interface ProviderSummary {
    provider: string;
    name: string;
    enabled: boolean;
    source: ProviderSource;
    priority: number;
    baseUrl: string;
    credentialType: CredentialKind;
  }

  let open = $state(false);
  let activeTab = $state("Providers");

  const tabs = [
    { name: "General", icon: UserIcon },
    { name: "Appearance", icon: PaintbrushIcon },
    { name: "Providers", icon: PlugIcon },
    { name: "Models", icon: BoxIcon }
  ] as const;

  const theme = getTheme();

  function onOpenChange(isOpen: boolean) {
    if (!isOpen && page.state.showModal) {
      history.back();
    }
  }

  $effect(() => {
    if (page.state.showModal !== undefined) {
      open = !!page.state.showModal;
    }
  });

  $effect(() => {
    if (open) {
      untrack(() => {
        if (activeTab === "Providers") void loadProviders();
        if (activeTab === "Models") void loadModels();
      });
    }
  });

  function changeTab(name: string) {
    activeTab = name;
    untrack(() => {
      if (name === "Providers" && connectedProviders.length === 0 && !isLoadingProviders) {
        void loadProviders();
      }
      if (name === "Models" && !isLoadingModels) {
        void loadModels();
      }
    });
  }

  // ─── Providers state ──────────────────────────────────────────────────────
  const POPULAR_VISIBLE_COUNT = 5;

  let connectedProviders = $state<ProviderSummary[]>([]);
  let isLoadingProviders = $state(false);
  let removingProviderId = $state<string | null>(null);
  let showMoreProviders = $state(false);
  let connectingProvider = $state<ProviderInfo | null>(null);
  let isCustomFlow = $state(false);
  let platformDefaults = $state<
    Array<{ providerId: string; envKey: string; hasEnvKey: boolean }>
  >([]);
  let apiKeyInput = $state("");
  let isSavingApiKey = $state(false);
  let apiKeyError = $state<string | null>(null);

  const customFormSchema = CustomProviderEncryptedDataSchema.extend({
    providerId: z
      .string()
      .min(1)
      .regex(/^[a-z0-9_-]+$/, "Lowercase letters, numbers, hyphens, or underscores")
  });
  type CustomFormValues = z.infer<typeof customFormSchema>;

  let customProviderId = $state("");
  let customDisplayName = $state("");
  let customBaseUrl = $state("");
  let customApiKey = $state("");
  let customModels = $state<Array<{ id: string; displayName: string }>>([]);
  let customHeaders = $state<Array<{ name: string; value: string }>>([]);
  let customErrors = $state<Partial<Record<keyof CustomFormValues, string>>>({});
  let customSubmitError = $state<string | null>(null);
  let isSubmittingCustom = $state(false);

  async function loadProviders() {
    isLoadingProviders = true;
    try {
      const [credsResult, platformResult] = await Promise.all([
        getUserCredentials({}),
        getPlatformDefaults({})
      ]);
      if (credsResult.success) {
        connectedProviders = credsResult.providers as ProviderSummary[];
      } else {
        connectedProviders = [];
        toast.error(credsResult.message ?? "Failed to load providers");
      }
      if (platformResult.success) {
        platformDefaults = platformResult.defaults;
      }
    } catch (err) {
      console.error("Failed to load providers:", err);
      connectedProviders = [];
    } finally {
      isLoadingProviders = false;
    }
  }

  const popularProviders = $derived(
    Object.values(BUILTIN_PROVIDERS).slice(0, POPULAR_VISIBLE_COUNT)
  );
  const remainingProviders = $derived(
    Object.values(BUILTIN_PROVIDERS).slice(POPULAR_VISIBLE_COUNT)
  );
  const connectedProviderIds = $derived(
    new Set(connectedProviders.map((p) => p.provider))
  );

  function visiblePopularProviders(): ProviderInfo[] {
    return popularProviders.filter((p) => !connectedProviderIds.has(p.id));
  }
  function visibleRemainingProviders(): ProviderInfo[] {
    return remainingProviders.filter((p) => !connectedProviderIds.has(p.id));
  }

  function startConnect(provider: ProviderInfo) {
    connectingProvider = provider;
    isCustomFlow = false;
    apiKeyInput = "";
    apiKeyError = null;
  }

  function startCustomConnect() {
    connectingProvider = null;
    isCustomFlow = true;
    customProviderId = "";
    customDisplayName = "";
    customBaseUrl = "";
    customApiKey = "";
    customModels = [];
    customHeaders = [];
    customErrors = {};
  }

  function exitConnectForm() {
    connectingProvider = null;
    isCustomFlow = false;
    apiKeyInput = "";
    apiKeyError = null;
  }

  async function submitApiKey() {
    if (!connectingProvider) return;
    const trimmed = apiKeyInput.trim();
    if (trimmed.length < 10) {
      apiKeyError = "API key must be at least 10 characters";
      return;
    }
    apiKeyError = null;
    isSavingApiKey = true;
    try {
      const result = await saveUserCredential({
        providerId: connectingProvider.id,
        credentialType: "credential",
        apiKey: trimmed
      });
      if (result.success) {
        toast.success(`${connectingProvider.name} connected`);
        exitConnectForm();
        await loadProviders();
      } else {
        apiKeyError = result.message ?? "Failed to save API key";
      }
    } catch (err) {
      console.error(err);
      apiKeyError = "Unexpected error";
    } finally {
      isSavingApiKey = false;
    }
  }

  function addCustomModel() {
    customModels = [...customModels, { id: "", displayName: "" }];
  }
  function removeCustomModel(index: number) {
    customModels = customModels.filter((_, i) => i !== index);
  }
  function addCustomHeader() {
    customHeaders = [...customHeaders, { name: "", value: "" }];
  }
  function removeCustomHeader(index: number) {
    customHeaders = customHeaders.filter((_, i) => i !== index);
  }

  async function submitCustomProvider() {
    customErrors = {};
    const baseUrl = customBaseUrl.trim().length > 0 ? customBaseUrl.trim() : "https://example.com/v1";
    const cleanedModels = customModels
      .map((m) => ({ id: m.id.trim(), displayName: m.displayName.trim() }))
      .filter((m) => m.id.length > 0 && m.displayName.length > 0);
    const cleanedHeaders = customHeaders
      .map((h) => ({ name: h.name.trim(), value: h.value.trim() }))
      .filter((h) => h.name.length > 0 && h.value.length > 0);

    const parsed = customFormSchema.safeParse({
      providerId: customProviderId.trim(),
      displayName: customDisplayName.trim() || customProviderId.trim(),
      baseUrl,
      apiKey: customApiKey.trim() || undefined,
      models: cleanedModels,
      headers: cleanedHeaders
    });
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof CustomFormValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !(key in fieldErrors)) {
          (fieldErrors as Record<string, string>)[key] = issue.message;
        }
      }
      customErrors = fieldErrors;
      return;
    }

    isSubmittingCustom = true;
    try {
      const result = await saveUserCredential({
        providerId: parsed.data.providerId,
        credentialType: "custom",
        displayName: parsed.data.displayName,
        baseUrl: parsed.data.baseUrl,
        apiKey: parsed.data.apiKey,
        models: parsed.data.models,
        headers: parsed.data.headers
      });
      if (result.success) {
        toast.success(`${parsed.data.displayName} added`);
        exitConnectForm();
        await loadProviders();
      } else {
        toast.error(result.message ?? "Failed to save custom provider");
      }
    } catch (err) {
      console.error(err);
      toast.error("Unexpected error");
    } finally {
      isSubmittingCustom = false;
    }
  }

  function badgeForCredential(cred: ProviderSummary): {
    label: string;
    classes: string;
  } {
    if (cred.credentialType === "custom") {
      return { label: "Custom", classes: "bg-primary/20 text-primary" };
    }
    if (cred.credentialType === "credential") {
      return { label: "API key", classes: "bg-primary/20 text-primary" };
    }
    if (cred.source === "env" && cred.name === "keyless") {
      return { label: "keyless", classes: "bg-muted-foreground/10 text-muted-foreground/60" };
    }
    if (cred.source === "env") {
      return { label: "Config", classes: "bg-muted-foreground/10 text-muted-foreground/60" };
    }
    return { label: "API key", classes: "bg-primary/20 text-primary" };
  }

  async function disconnectProvider(providerId: string) {
    removingProviderId = providerId;
    try {
      const result = await deleteUserCredential({ providerId });
      if (result.success) {
        toast.success(`${providerId} disconnected`);
        await loadProviders();
      } else {
        toast.error(result.message ?? "Failed to disconnect");
      }
    } catch (err) {
      console.error(err);
      toast.error("Unexpected error");
    } finally {
      removingProviderId = null;
    }
  }

  // ─── Models state ─────────────────────────────────────────────────────────

  const availableModelsHolder = AvailableModelsHolder.fromContext();

  // Models are SSR loaded via the layout into the context. No initial
  // fetch needed — first paint of the Models tab shows the full list.
  let availableModels = $state<ModelInfo[]>(availableModelsHolder.models);
  let visibleModelIds = $state<string[]>(
    availableModelsHolder.models
      .map((m) => m.id)
      .filter((id) => !availableModelsHolder.hiddenIds.has(id))
  );
  let isLoadingModels = $state(false);
  let modelSearch = $state("");
  let togglingModelId = $state<string | null>(null);

  // Re-sync local state from the context when the context updates (e.g. after
  // a remote refresh from the model selector or after a toggle).
  $effect(() => {
    availableModels = availableModelsHolder.models;
    visibleModelIds = availableModelsHolder.models
      .map((m) => m.id)
      .filter((id) => !availableModelsHolder.hiddenIds.has(id));
  });

  async function loadModels(): Promise<void> {
    isLoadingModels = true;
    try {
      const [modelsResult, visibilityResult] = await Promise.all([
        getAvailableModels({}),
        getModelVisibility({})
      ]);
      if (modelsResult.success) {
        availableModelsHolder.replace(modelsResult.models, visibilityResult.success ? visibilityResult.visibleModelIds ?? [] : []);
        availableModels = modelsResult.models;
      } else {
        toast.error(modelsResult.message ?? "Failed to load models");
      }
      if (visibilityResult.success) {
        visibleModelIds = visibilityResult.visibleModelIds ?? [];
      }
    } catch (err) {
      console.error("Failed to load models:", err);
    } finally {
      isLoadingModels = false;
    }
  }

  const modelsByProvider = $derived.by(() => {
    const grouped: Record<string, ModelInfo[]> = {};
    for (const model of availableModels) {
      if ((model as any).source === 'platform') continue;
      (grouped[model.providerId] ??= []).push(model);
    }
    return grouped;
  });
  const platformModels = $derived.by(() =>
    availableModels.filter((m) => (m as any).source === 'platform')
  );
  const visiblePlatformModels = $derived.by(() => {
    const search = modelSearch.trim().toLowerCase();
    if (search.length === 0) return platformModels;
    return platformModels.filter(
      (m) => m.name.toLowerCase().includes(search) || m.providerId.toLowerCase().includes(search)
    );
  });
  const visibleProviderGroups = $derived.by(() => {
    const search = modelSearch.trim().toLowerCase();
    return Object.entries(modelsByProvider)
      .map(([id, models]) => {
        const info = BUILTIN_PROVIDERS[id as ProviderId];
        const filteredModels =
          search.length === 0
            ? models
            : models.filter((m) => m.name.toLowerCase().includes(search));
        return { id, info, models: filteredModels };
      })
      .filter((g) => g.models.length > 0);
  });

  function isModelVisible(modelId: string): boolean {
    return visibleModelIds.includes(modelId);
  }

  async function toggleModelVisibility(modelId: string, nextVisible: boolean) {
    togglingModelId = modelId;
    const previous = visibleModelIds;
    visibleModelIds = nextVisible
      ? [...visibleModelIds, modelId]
      : visibleModelIds.filter((id) => id !== modelId);
    try {
      const result = await updateModelVisibility({ modelId, visible: nextVisible });
      if (!result.success) {
        visibleModelIds = previous;
        toast.error(result.message ?? "Failed to update visibility");
      }
    } catch (err) {
      console.error(err);
      visibleModelIds = previous;
      toast.error("Unexpected error");
    } finally {
      togglingModelId = null;
    }
  }
</script>

<Dialog.Root bind:open {onOpenChange}>
  <Dialog.Content
    class="overflow-hidden p-0 fixed inset-0 w-full h-full max-w-none rounded-none md:left-1/2 md:right-auto md:top-1/2 md:bottom-auto md:-translate-x-1/2 md:-translate-y-1/2 md:w-auto md:h-auto md:max-h-[85vh] md:max-w-[1000px] md:rounded-2xl border-sidebar-border bg-background"
    trapFocus={false}
  >
    <Dialog.Title class="sr-only">Settings</Dialog.Title>
    <Dialog.Description class="sr-only"
      >Configure your EdApex workspace preferences.</Dialog.Description
    >

    <Sidebar.Provider class="items-start bg-transparent">
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
                      onclick={() => changeTab(tab.name)}
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

      <main
        class="flex h-full md:h-[80vh] flex-1 flex-col overflow-hidden bg-background"
      >
        <header
          class="flex shrink-0 flex-col border-b border-sidebar-border/10 bg-background/50 backdrop-blur-xl"
        >
          <div class="flex md:hidden overflow-x-auto scrollbar-hide gap-1 px-3 py-2">
            {#each tabs as tab (tab.name)}
              <button
                onclick={() => changeTab(tab.name)}
                class="flex items-center gap-1.5 min-h-12 px-4 py-2 rounded-xl text-xs font-bold tracking-tight whitespace-nowrap shrink-0 transition-all {activeTab ===
                tab.name
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted/10'}"
              >
                <tab.icon class="size-4" />
                {tab.name}
              </button>
            {/each}
          </div>
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
          <div class="p-6 md:p-8 max-w-3xl mx-auto space-y-8">
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
                class="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-12"
              >
                <div class="space-y-2">
                  <h2
                    class="text-2xl font-black tracking-tight text-foreground"
                  >
                    Providers
                  </h2>
                  <p class="text-sm text-muted-foreground">
                    Connect your AI provider credentials. Your keys are
                    encrypted and isolated to your workspace.
                  </p>
                </div>

                <Separator class="bg-sidebar-border/10" />

                {#if !isCustomFlow && !connectingProvider}
                  <section
                    class="space-y-3"
                    in:fly={{ y: 12, duration: 200 }}
                    out:fly={{ y: -12, duration: 150 }}
                  >
                    <div class="flex items-center justify-between">
                      <h3
                        class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1"
                      >
                        Connected providers
                      </h3>
                      {#if !isLoadingProviders}
                        <span
                          class="text-[10px] font-bold text-muted-foreground/40"
                          >{connectedProviders.length}
                          active</span
                        >
                      {/if}
                    </div>

                    {#if isLoadingProviders}
                      <div class="space-y-2">
                        {#each [0, 1] as skeletonIdx (skeletonIdx)}
                          <div
                            class="flex items-center gap-3 p-4 rounded-2xl bg-muted/5 border border-sidebar-border/30"
                          >
                            <Skeleton class="size-10 rounded-xl" />
                            <div class="flex-1 space-y-2">
                              <Skeleton class="h-3 w-1/3" />
                              <Skeleton class="h-2 w-1/2" />
                            </div>
                            <Skeleton class="h-8 w-20" />
                          </div>
                        {/each}
                      </div>
                    {:else if connectedProviders.length === 0}
                      <div
                        class="p-6 rounded-2xl border border-dashed border-sidebar-border/40 text-center"
                      >
                        <p class="text-sm font-bold text-muted-foreground">
                          No providers connected yet
                        </p>
                        <p class="text-[11px] text-muted-foreground/60 mt-1">
                          Pick one from the list below to get started.
                        </p>
                      </div>
                    {:else}
                      <div class="space-y-2">
                        {#each connectedProviders as cred (cred.provider)}
                          {@const badge = badgeForCredential(cred)}
                          {@const info = BUILTIN_PROVIDERS[cred.provider as ProviderId]}
                          <div
                            class="flex items-center gap-3 p-4 rounded-2xl bg-muted/5 border border-sidebar-border/30 hover:bg-muted/10 transition-all"
                          >
                            <div
                              class="size-10 rounded-xl bg-background border border-sidebar-border/50 flex items-center justify-center p-2 overflow-hidden shrink-0"
                            >
                              {#if providerLogos[cred.provider]}
                                <img
                                  src={providerLogos[cred.provider]}
                                  alt={info?.name ?? cred.provider}
                                  class="size-full object-contain dark:invert"
                                  onerror={(e) => {
                                    (
                                      e.target as HTMLImageElement
                                    ).style.display = "none";
                                  }}
                                />
                              {:else}
                                <KeyRoundIcon
                                  class="size-4 text-muted-foreground"
                                />
                              {/if}
                            </div>
                            <div class="flex-1 min-w-0 space-y-0.5">
                              <div class="flex items-center gap-2 flex-wrap">
                                <span
                                  class="text-sm font-black tracking-tight truncate"
                                  >{info?.name ?? cred.provider}</span
                                >
                                <Badge
                                  class="border-none text-[9px] font-black px-1.5 py-0 rounded-md {badge.classes}"
                                  >{badge.label}</Badge
                                >
                              </div>
                              <p
                                class="text-[10px] font-mono text-muted-foreground/60 truncate"
                              >
                                {cred.name || "—"}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={removingProviderId === cred.provider ||
                                cred.source === "env"}
                              onclick={() => disconnectProvider(cred.provider)}
                              class="min-h-12 rounded-xl text-[11px] font-black uppercase tracking-widest text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10"
                            >
                              {#if removingProviderId === cred.provider}
                                <Spinner class="size-3" />
                              {:else}
                                Disconnect
                              {/if}
                            </Button>
                          </div>
                        {/each}
                      </div>
                    {/if}
                  </section>

                  {#if connectedProviders.length === 0 && platformDefaults.length > 0}
                    <section class="space-y-3">
                      <div class="flex items-center justify-between">
                        <h3
                          class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1"
                        >
                          Platform Defaults
                        </h3>
                        <span
                          class="text-[10px] font-bold text-muted-foreground/40"
                        >
                          {platformDefaults.length}
                          available
                        </span>
                      </div>
                      <div class="space-y-2">
                        {#each platformDefaults as pd (pd.providerId)}
                          {@const info = BUILTIN_PROVIDERS[pd.providerId as ProviderId]}
                          <div
                            class="flex items-center gap-3 p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20"
                          >
                            <div
                              class="size-10 rounded-xl bg-background border border-sidebar-border/50 flex items-center justify-center p-2 overflow-hidden shrink-0"
                            >
                              {#if providerLogos[pd.providerId]}
                                <img
                                  src={providerLogos[pd.providerId]}
                                  alt={info?.name ?? pd.providerId}
                                  class="size-full object-contain dark:invert"
                                  onerror={(e) => {
                                    (e.target as HTMLImageElement).style.display =
                                      "none";
                                  }}
                                />
                              {:else}
                                <KeyRoundIcon class="size-4 text-muted-foreground" />
                              {/if}
                            </div>
                            <div class="flex-1 min-w-0 space-y-0.5">
                              <div class="flex items-center gap-2 flex-wrap">
                                <span
                                  class="text-sm font-black tracking-tight truncate"
                                  >{info?.name ?? pd.providerId}</span
                                >
                                <Badge
                                  class="bg-blue-500/20 text-blue-300 border-blue-500/30 text-[9px] font-black px-1.5 py-0 rounded-md"
                                  >Platform</Badge
                                >
                              </div>
                              <p class="text-[10px] text-muted-foreground/60">
                                Provided by the platform — auto-disconnects when you connect your own key
                              </p>
                            </div>
                          </div>
                        {/each}
                      </div>
                    </section>
                  {/if}

                  <section
                    class="space-y-3"
                    in:fly={{ y: 12, duration: 200 }}
                    out:fly={{ y: -12, duration: 150 }}
                  >
                    <h3
                      class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1"
                    >
                      Popular providers
                    </h3>

                    <div class="space-y-2">
                      {#each visiblePopularProviders() as provider (provider.id)}
                        <div
                          class="flex items-center gap-3 p-4 rounded-2xl bg-muted/5 border border-sidebar-border/30 hover:bg-muted/10 transition-all"
                        >
                          <div
                            class="size-10 rounded-xl bg-background border border-sidebar-border/50 flex items-center justify-center p-2 overflow-hidden shrink-0"
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
                              <KeyRoundIcon class="size-4 text-muted-foreground" />
                            {/if}
                          </div>
                          <div class="flex-1 min-w-0 space-y-0.5">
                            <span
                              class="text-sm font-black tracking-tight block truncate"
                              >{provider.name}</span
                            >
                            <p
                              class="text-[10px] text-muted-foreground/70 leading-snug line-clamp-1"
                            >
                              {provider.description}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onclick={() => startConnect(provider)}
                            class="min-h-12 rounded-xl text-[11px] font-black uppercase tracking-widest border-sidebar-border/50 hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                          >
                            <PlusIcon class="size-3" />
                            Connect
                          </Button>
                        </div>
                      {/each}

                      {#if showMoreProviders}
                        {#each visibleRemainingProviders() as provider (provider.id)}
                          <div
                            class="flex items-center gap-3 p-4 rounded-2xl bg-muted/5 border border-sidebar-border/30 hover:bg-muted/10 transition-all"
                          >
                            <div
                              class="size-10 rounded-xl bg-background border border-sidebar-border/50 flex items-center justify-center p-2 overflow-hidden shrink-0"
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
                                <KeyRoundIcon class="size-4 text-muted-foreground" />
                              {/if}
                            </div>
                            <div class="flex-1 min-w-0 space-y-0.5">
                              <span
                                class="text-sm font-black tracking-tight block truncate"
                                >{provider.name}</span
                              >
                              <p
                                class="text-[10px] text-muted-foreground/70 leading-snug line-clamp-1"
                              >
                                {provider.description}
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onclick={() => startConnect(provider)}
                              class="min-h-12 rounded-xl text-[11px] font-black uppercase tracking-widest border-sidebar-border/50 hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                            >
                              <PlusIcon class="size-3" />
                              Connect
                            </Button>
                          </div>
                        {/each}
                      {/if}

                      <div
                        class="flex items-center gap-3 p-4 rounded-2xl bg-muted/5 border border-sidebar-border/30 hover:bg-muted/10 transition-all"
                      >
                        <div
                          class="size-10 rounded-xl bg-background border border-sidebar-border/50 flex items-center justify-center shrink-0"
                        >
                          <SparklesIcon class="size-4 text-primary" />
                        </div>
                        <div class="flex-1 min-w-0 space-y-0.5">
                          <div class="flex items-center gap-2">
                            <span class="text-sm font-black tracking-tight"
                              >Custom provider</span
                            >
                            <Badge
                              class="bg-primary/20 text-primary border-none text-[9px] font-black px-1.5 py-0 rounded-md"
                              >Custom</Badge
                            >
                          </div>
                          <p
                            class="text-[10px] text-muted-foreground/70 leading-snug line-clamp-1"
                          >
                            Configure an OpenAI-compatible provider.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onclick={startCustomConnect}
                          class="min-h-12 rounded-xl text-[11px] font-black uppercase tracking-widest border-sidebar-border/50 hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                        >
                          <PlusIcon class="size-3" />
                          Connect
                        </Button>
                      </div>

                      {#if visibleRemainingProviders().length > 0}
                        <button
                          onclick={() => (showMoreProviders = !showMoreProviders)}
                          class="text-[11px] font-black uppercase tracking-widest text-primary hover:underline self-start ml-2"
                        >
                          {showMoreProviders
                            ? "Show less"
                            : "Show more providers"}
                        </button>
                      {/if}
                    </div>
                  </section>
                {:else if connectingProvider}
                  <section
                    class="space-y-5"
                    in:fly={{ y: 12, duration: 200 }}
                    out:fly={{ y: -12, duration: 150 }}
                  >
                    <button
                      onclick={exitConnectForm}
                      class="flex items-center gap-2 min-h-12 -ml-2 px-2 rounded-xl text-xs font-black uppercase tracking-widest text-muted-foreground/70 hover:text-foreground hover:bg-muted/10 transition-colors"
                    >
                      <ArrowLeftIcon class="size-4" />
                      Back
                    </button>

                    <div class="space-y-1">
                      <div class="flex items-center gap-3">
                        <div
                          class="size-10 rounded-xl bg-background border border-sidebar-border/50 flex items-center justify-center p-2 overflow-hidden shrink-0"
                        >
                          {#if providerLogos[connectingProvider.id]}
                            <img
                              src={providerLogos[connectingProvider.id]}
                              alt={connectingProvider.name}
                              class="size-full object-contain dark:invert"
                              onerror={(e) => {
                                (e.target as HTMLImageElement).style.display =
                                  "none";
                              }}
                            />
                          {:else}
                            <KeyRoundIcon class="size-4 text-muted-foreground" />
                          {/if}
                        </div>
                        <h3
                          class="text-lg font-black tracking-tight"
                        >
                          Connect {connectingProvider.name}
                        </h3>
                      </div>
                      <p
                        class="text-sm text-muted-foreground leading-relaxed"
                      >
                        {connectingProvider.description}
                      </p>
                      {#if connectingProvider.docUrl}
                        <a
                          href={connectingProvider.docUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="text-[11px] font-bold text-primary hover:underline inline-block"
                          >Provider config docs</a
                        >
                      {/if}
                    </div>

                    <Separator class="bg-sidebar-border/10" />

                    <div class="space-y-2">
                      <Label
                        for="provider-api-key"
                        class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1"
                        >{connectingProvider.name} API key</Label
                      >
                      <Input
                        id="provider-api-key"
                        type="password"
                        bind:value={apiKeyInput}
                        placeholder="API key"
                        disabled={isSavingApiKey}
                        class="h-12 bg-muted/5 border-sidebar-border/50 rounded-xl px-4 font-mono text-sm focus:border-primary/50 transition-all"
                      />
                      {#if apiKeyError}
                        <p class="text-[11px] font-bold text-destructive ml-1">
                          {apiKeyError}
                        </p>
                      {/if}
                    </div>

                    <div class="flex items-center gap-2">
                      <Button
                        onclick={submitApiKey}
                        disabled={isSavingApiKey || apiKeyInput.trim().length < 10}
                        class="min-h-12 rounded-xl px-6 font-black uppercase tracking-widest text-[11px]"
                      >
                        {#if isSavingApiKey}
                          <Spinner class="size-3 mr-2" />
                          Connecting…
                        {:else}
                          Continue
                        {/if}
                      </Button>
                      <Button
                        variant="ghost"
                        onclick={exitConnectForm}
                        disabled={isSavingApiKey}
                        class="min-h-12 rounded-xl px-6 font-black uppercase tracking-widest text-[11px] text-muted-foreground/60"
                      >
                        Cancel
                      </Button>
                    </div>
                  </section>
                {:else}
                  <section
                    class="space-y-5"
                    in:fly={{ y: 12, duration: 200 }}
                    out:fly={{ y: -12, duration: 150 }}
                  >
                    <button
                      onclick={exitConnectForm}
                      class="flex items-center gap-2 min-h-12 -ml-2 px-2 rounded-xl text-xs font-black uppercase tracking-widest text-muted-foreground/70 hover:text-foreground hover:bg-muted/10 transition-colors"
                    >
                      <ArrowLeftIcon class="size-4" />
                      Back
                    </button>

                    <div class="space-y-2">
                      <div class="flex items-center gap-3">
                        <div
                          class="size-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0"
                        >
                          <SparklesIcon class="size-4 text-primary" />
                        </div>
                        <h3 class="text-lg font-black tracking-tight">
                          Custom provider
                        </h3>
                      </div>
                      <p class="text-sm text-muted-foreground leading-relaxed">
                        Configure an OpenAI-compatible provider. See the
                        <a
                          href="https://docs.edapex.io/providers/custom"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="text-primary hover:underline">provider config docs</a
                        >.
                      </p>
                    </div>

                    <Separator class="bg-sidebar-border/10" />

                    <div class="space-y-2">
                      <Label
                        for="custom-provider-id"
                        class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1"
                        >Provider ID</Label
                      >
                      <Input
                        id="custom-provider-id"
                        bind:value={customProviderId}
                        placeholder="myprovider"
                        disabled={isSubmittingCustom}
                        oninput={() => delete customErrors.providerId}
                        class="h-12 bg-muted/5 border-sidebar-border/50 rounded-xl px-4 font-mono text-sm focus:border-primary/50 transition-all {customErrors.providerId
                          ? 'border-destructive/60'
                          : ''}"
                      />
                      {#if customErrors.providerId}
                        <p class="text-[11px] font-bold text-destructive ml-1">
                          {customErrors.providerId}
                        </p>
                      {:else}
                        <p class="text-[10px] text-muted-foreground/60 ml-1">
                          Lowercase letters, numbers, hyphens, or underscores
                        </p>
                      {/if}
                    </div>

                    <div class="space-y-2">
                      <Label
                        for="custom-display-name"
                        class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1"
                        >Display name</Label
                      >
                      <Input
                        id="custom-display-name"
                        bind:value={customDisplayName}
                        placeholder="My AI Provider"
                        disabled={isSubmittingCustom}
                        oninput={() => delete customErrors.displayName}
                        class="h-12 bg-muted/5 border-sidebar-border/50 rounded-xl px-4 font-bold text-sm focus:border-primary/50 transition-all {customErrors.displayName
                          ? 'border-destructive/60'
                          : ''}"
                      />
                      {#if customErrors.displayName}
                        <p class="text-[11px] font-bold text-destructive ml-1">
                          {customErrors.displayName}
                        </p>
                      {/if}
                    </div>

                    <div class="space-y-2">
                      <Label
                        for="custom-base-url"
                        class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1"
                        >Base URL</Label
                      >
                      <Input
                        id="custom-base-url"
                        bind:value={customBaseUrl}
                        placeholder="https://api.myprovider.com/v1"
                        disabled={isSubmittingCustom}
                        oninput={() => delete customErrors.baseUrl}
                        class="h-12 bg-muted/5 border-sidebar-border/50 rounded-xl px-4 font-mono text-sm focus:border-primary/50 transition-all {customErrors.baseUrl
                          ? 'border-destructive/60'
                          : ''}"
                      />
                      {#if customErrors.baseUrl}
                        <p class="text-[11px] font-bold text-destructive ml-1">
                          {customErrors.baseUrl}
                        </p>
                      {/if}
                    </div>

                    <div class="space-y-2">
                      <Label
                        for="custom-api-key"
                        class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1"
                        >API key</Label
                      >
                      <Input
                        id="custom-api-key"
                        type="password"
                        bind:value={customApiKey}
                        placeholder="API key"
                        disabled={isSubmittingCustom}
                        oninput={() => delete customErrors.apiKey}
                        class="h-12 bg-muted/5 border-sidebar-border/50 rounded-xl px-4 font-mono text-sm focus:border-primary/50 transition-all"
                      />
                      <p class="text-[10px] text-muted-foreground/60 ml-1">
                        Optional. Leave empty if you manage auth via headers.
                      </p>
                    </div>

                    <Separator class="bg-sidebar-border/10" />

                    <div class="space-y-3">
                      <div class="flex items-center gap-2 px-1">
                        <Settings2Icon class="size-3 text-muted-foreground/40" />
                        <span
                          class="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40"
                          >Models</span
                        >
                      </div>
                      {#each customModels as model, idx (idx)}
                        <div class="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-start">
                          <Input
                            bind:value={model.id}
                            placeholder="model-id"
                            disabled={isSubmittingCustom}
                            class="h-10 bg-background/50 border-sidebar-border/50 text-[11px] font-mono rounded-lg"
                          />
                          <Input
                            bind:value={model.displayName}
                            placeholder="Display Name"
                            disabled={isSubmittingCustom}
                            class="h-10 bg-background/50 border-sidebar-border/50 text-[11px] font-bold rounded-lg"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            onclick={() => (customModels = customModels.filter((_, i) => i !== idx))}
                            disabled={isSubmittingCustom}
                            class="min-h-10 min-w-10 rounded-lg text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10"
                            aria-label="Remove model"
                          >
                            <Trash2Icon class="size-3.5" />
                          </Button>
                        </div>
                      {/each}
                      <button
                        type="button"
                        onclick={() => (customModels = [...customModels, { id: '', displayName: '' }])}
                        disabled={isSubmittingCustom}
                        class="text-[11px] font-black uppercase tracking-widest text-primary hover:underline self-start ml-1"
                      >
                        + Add model
                      </button>
                    </div>

                    <div class="space-y-3">
                      <div class="flex items-center gap-2 px-1">
                        <Settings2Icon class="size-3 text-muted-foreground/40" />
                        <span
                          class="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40"
                          >Headers (Optional)</span
                        >
                      </div>
                      {#each customHeaders as header, idx (idx)}
                        <div class="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-start">
                          <Input
                            bind:value={header.name}
                            placeholder="Header-Name"
                            disabled={isSubmittingCustom}
                            class="h-10 bg-background/50 border-sidebar-border/50 text-[11px] font-mono rounded-lg"
                          />
                          <Input
                            bind:value={header.value}
                            placeholder="value"
                            disabled={isSubmittingCustom}
                            class="h-10 bg-background/50 border-sidebar-border/50 text-[11px] font-mono rounded-lg"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            onclick={() => (customHeaders = customHeaders.filter((_, i) => i !== idx))}
                            disabled={isSubmittingCustom}
                            class="min-h-10 min-w-10 rounded-lg text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10"
                            aria-label="Remove header"
                          >
                            <Trash2Icon class="size-3.5" />
                          </Button>
                        </div>
                      {/each}
                      <button
                        type="button"
                        onclick={() => (customHeaders = [...customHeaders, { name: '', value: '' }])}
                        disabled={isSubmittingCustom}
                        class="text-[11px] font-black uppercase tracking-widest text-primary hover:underline self-start ml-1"
                      >
                        + Add header
                      </button>
                    </div>

                    {#if customSubmitError}
                      <p class="text-[11px] font-bold text-destructive ml-1">
                        {customSubmitError}
                      </p>
                    {/if}

                    <div class="flex items-center gap-2">
                      <Button
                        onclick={submitCustomProvider}
                        disabled={isSubmittingCustom}
                        class="min-h-12 rounded-xl px-6 font-black uppercase tracking-widest text-[11px]"
                      >
                        {#if isSubmittingCustom}
                          <Spinner class="size-3 mr-2" />
                          Submitting…
                        {:else}
                          Submit
                        {/if}
                      </Button>
                      <Button
                        variant="ghost"
                        onclick={exitConnectForm}
                        disabled={isSubmittingCustom}
                        class="min-h-12 rounded-xl px-6 font-black uppercase tracking-widest text-[11px] text-muted-foreground/60"
                      >
                        Cancel
                      </Button>
                    </div>
                  </section>
                {/if}
              </div>
            {:else if activeTab === "Models"}
              <div
                class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-12"
              >
                <div class="space-y-2">
                  <h2
                    class="text-2xl font-black tracking-tight text-foreground"
                  >
                    Models
                  </h2>
                  <p class="text-sm text-muted-foreground">
                    Choose which models appear in your chat composer. Hidden
                    models are filtered from the model picker.
                  </p>
                </div>

                <Separator class="bg-sidebar-border/10" />

                <div class="flex items-center gap-2">
                  <div class="relative flex-1">
                    <SearchIcon
                      class="size-4 text-muted-foreground/50 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    />
                    <Input
                      bind:value={modelSearch}
                      placeholder="Search models..."
                      class="h-12 pl-10 pr-4 rounded-xl bg-muted/5 border-sidebar-border/50 text-sm font-bold"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onclick={() => changeTab("Providers")}
                    aria-label="Add provider"
                    class="min-h-12 min-w-12 rounded-xl border-sidebar-border/50"
                  >
                    <PlusIcon class="size-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Provider settings"
                    class="min-h-12 min-w-12 rounded-xl border-sidebar-border/50"
                  >
                    <CogIcon class="size-4" />
                  </Button>
                </div>

                {#if isLoadingModels}
                  <div class="space-y-6">
                    {#each [0, 1] as skeletonIdx (skeletonIdx)}
                      <div class="space-y-2">
                        <Skeleton class="h-3 w-24 ml-1" />
                        <div
                          class="flex items-center gap-3 p-4 rounded-2xl bg-muted/5 border border-sidebar-border/30"
                        >
                          <Skeleton class="size-10 rounded-xl" />
                          <div class="flex-1 space-y-2">
                            <Skeleton class="h-3 w-1/2" />
                            <Skeleton class="h-2 w-1/3" />
                          </div>
                          <Skeleton class="h-5 w-10 rounded-full" />
                        </div>
                      </div>
                    {/each}
                  </div>
                {:else if visibleProviderGroups.length === 0 && visiblePlatformModels.length === 0}
                  <div
                    class="p-6 rounded-2xl border border-dashed border-sidebar-border/40 text-center"
                  >
                    <p class="text-sm font-bold text-muted-foreground">
                      No models available
                    </p>
                    <p class="text-[11px] text-muted-foreground/60 mt-1">
                      Connect a provider to see its models.
                    </p>
                  </div>
                {:else}
                  <div class="space-y-6">
                    {#if visiblePlatformModels.length > 0}
                      <div class="space-y-2">
                        <h3
                          class="text-[10px] font-black uppercase tracking-widest text-blue-300/80 ml-1 flex items-center gap-2"
                        >
                          Platform Defaults
                          <span
                            class="text-muted-foreground/30 font-bold normal-case tracking-tight"
                          >{visiblePlatformModels.length} models</span
                          >
                        </h3>
                        <div class="space-y-1.5">
                          {#each visiblePlatformModels as model (model.id)}
                            <div
                              class="flex items-center gap-3 p-3 px-4 rounded-xl bg-blue-500/5 border border-blue-500/20 hover:bg-blue-500/10 transition-all"
                            >
                              <div class="flex-1 min-w-0 space-y-0.5">
                                <div class="flex items-center gap-2 flex-wrap">
                                  <span
                                    class="text-sm font-black tracking-tight truncate"
                                    >{model.name}</span
                                  >
                                  <Badge
                                    class="bg-blue-500/20 text-blue-300 border-blue-500/30 text-[9px] font-black px-1.5 py-0 rounded-md"
                                    >Platform</Badge
                                  >
                                </div>
                                <p
                                  class="text-[10px] text-muted-foreground/60 truncate"
                                >
                                  {model.description}
                                </p>
                              </div>
                              <Switch
                                checked={isModelVisible(model.id)}
                                disabled={togglingModelId === model.id}
                                onCheckedChange={(val: boolean) =>
                                  toggleModelVisibility(model.id, val)}
                              />
                            </div>
                          {/each}
                        </div>
                      </div>
                    {/if}
                    {#each visibleProviderGroups as group (group.id)}
                      <div class="space-y-2">
                        <h3
                          class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1 flex items-center gap-2"
                        >
                          {group.info?.name ?? group.id}
                          <span
                            class="text-muted-foreground/30 font-bold normal-case tracking-tight"
                          >{group.models.length} models</span
                          >
                        </h3>
                        <div class="space-y-1.5">
                          {#each group.models as model (model.id)}
                            <div
                              class="flex items-center gap-3 p-3 px-4 rounded-xl bg-muted/5 border border-sidebar-border/30 hover:bg-muted/10 transition-all"
                            >
                              <div class="flex-1 min-w-0 space-y-0.5">
                                <div class="flex items-center gap-2 flex-wrap">
                                  <span
                                    class="text-sm font-black tracking-tight truncate"
                                    >{model.name}</span
                                  >
                                  <Badge
                                    class="bg-primary/10 text-primary border-none text-[9px] font-black px-1.5 py-0 rounded-md"
                                    >Free</Badge
                                  >
                                </div>
                                <p
                                  class="text-[10px] text-muted-foreground/60 truncate"
                                >
                                  {model.description}
                                </p>
                              </div>
                              <Switch
                                checked={isModelVisible(model.id)}
                                disabled={togglingModelId === model.id}
                                onCheckedChange={(val: boolean) =>
                                  toggleModelVisibility(model.id, val)}
                              />
                            </div>
                          {/each}
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </ScrollArea>
      </main>
    </Sidebar.Provider>
  </Dialog.Content>
</Dialog.Root>
