<script lang="ts">
    import { page } from "$app/state";
    import {
        addProvider,
        removeProvider,
        getProviders,
    } from "$lib/api/agent.remote.js";
    import { chatProviders } from "$lib/chat/models.js";
    import { useAI } from "$lib/context/ai-context.svelte";
    import ResponsiveSheet from "$lib/components/shared/responsive-sheet.svelte";
    import { Button } from "$lib/components/ui/button/index.js";
    import {
        Card,
        CardDescription,
        CardFooter,
        CardHeader,
        CardTitle,
    } from "$lib/components/ui/card/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import { Spinner } from "$lib/components/ui/spinner/index.js";
    import type { CredentialType } from "$lib/schema/chat-schema.js";
    import CopyIcon from "@lucide/svelte/icons/copy";
    import CheckIcon from "@lucide/svelte/icons/check";
    import Trash2Icon from "@lucide/svelte/icons/trash-2";
    import KeyIcon from "@lucide/svelte/icons/key-round";
    import Plug from "@lucide/svelte/icons/plug";
    import ChevronUp from "@lucide/svelte/icons/chevron-up";
    import ChevronDown from "@lucide/svelte/icons/chevron-down";
    import RefreshCcw from "@lucide/svelte/icons/refresh-ccw";
    import { toast } from "svelte-sonner";
    import { invalidateAll } from "$app/navigation";
    import { untrack } from "svelte";

    let open = $state(false);

    $effect(() => {
        if (page.state.showModal !== undefined) {
            const show = !!page.state.showModal;
            untrack(() => {
                open = show;
            });
        }
    });

    function onOpenChange(isOpen: boolean) {
        if (!isOpen && page.state.showModal) {
            history.back();
        }
    }

    const ai = useAI();
    let apiKeys = $state<Record<string, string>>({});
    let savingProviderId = $state<string | null>(null);
    let removingProviderId = $state<string | null>(null);
    let connectedProviders = $state<Array<{ provider: string; name: string }>>([]);
    let copiedProviderId = $state<string | null>(null);
    let priorityOrder = $state<string[]>([]);
    let isSavingSettings = $state(false);
    let refreshingProviderId = $state<string | null>(null);

    $effect(() => {
        if (page.data.userPriority) {
            priorityOrder = [...page.data.userPriority];
        }
    });

    const sortedConnectedProviders = $derived.by(() => {
        const connectedIds = connectedProviders.map(p => p.provider);
        // Map priority items that are actually connected
        const sorted = priorityOrder.filter(id => connectedIds.includes(id));
        // Add connected items not in priority list (though should be rare)
        const others = connectedIds.filter(id => !priorityOrder.includes(id));
        return [...sorted, ...others];
    });

    $effect(() => {
        if (open) {
            untrack(() => loadConnectedProviders());
        }
    });

    async function loadConnectedProviders() {
        try {
            const result = await getProviders({});
            if (result.success) {
                connectedProviders = result.providers;
            }
        } catch (err) {
            console.error("Failed to load providers:", err);
        }
    }

    function isConnected(providerId: string): boolean {
        return connectedProviders.some((p) => p.provider === providerId);
    }

    function getMaskedKey(providerId: string): string {
        const found = connectedProviders.find((p) => p.provider === providerId);
        return found?.name || "";
    }

    async function handleSaveKey(providerId: string) {
        const key = apiKeys[providerId];
        if (!key || key.trim().length === 0) {
            toast.error("Please enter an API key");
            return;
        }

        savingProviderId = providerId;
        try {
            const result = await addProvider({
                provider: providerId as CredentialType,
                apiKey: key.trim(),
            });
            if (result.success) {
                toast.success(result.message);
                apiKeys[providerId] = "";
                ai.addProvider(providerId);
                await loadConnectedProviders();
            } else {
                toast.error(result.message);
            }
        } catch (err) {
            console.error(err);
            toast.error("Failed to save API key");
        } finally {
            savingProviderId = null;
        }
    }

    async function handleRemoveKey(providerId: string) {
        removingProviderId = providerId;
        try {
            const result = await removeProvider({
                provider: providerId as CredentialType,
            });
            if (result.success) {
                toast.success(result.message);
                ai.removeProvider(providerId);
                await loadConnectedProviders();
            } else {
                toast.error(result.message);
            }
        } catch (err) {
            console.error(err);
            toast.error("Failed to remove API key");
        } finally {
            removingProviderId = null;
        }
    }

    async function handleRefreshModels(providerId: string) {
        refreshingProviderId = providerId;
        try {
            const res = await fetch("/api/ai/discover", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ provider: providerId }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success(`Found ${data.count} models for ${providerId}`);
                await invalidateAll();
            } else {
                toast.error(data.error || "Discovery failed");
            }
        } catch (err) {
            console.error(err);
            toast.error("Failed to refresh models");
        } finally {
            refreshingProviderId = null;
        }
    }

    function handleCopyMaskedKey(providerId: string) {
        const masked = getMaskedKey(providerId);
        if (!masked) return;
        navigator.clipboard.writeText(masked);
        copiedProviderId = providerId;
        setTimeout(() => {
            copiedProviderId = null;
        }, 2000);
    }

    async function handleSetPriority(newPriority: string[]) {
        isSavingSettings = true;
        try {
            const res = await fetch("/api/settings/ai", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ priority: newPriority }),
            });
            const data = await res.json();
            if (data.success) {
                priorityOrder = newPriority;
                toast.success("Priority settings updated");
            } else {
                toast.error(data.error || "Failed to update priority");
            }
        } catch (err) {
            console.error(err);
            toast.error("Failed to save priority settings");
        } finally {
            isSavingSettings = false;
        }
    }

    function moveProvider(providerId: string, direction: "up" | "down") {
        const currentSorted = sortedConnectedProviders;
        const index = currentSorted.indexOf(providerId);
        if (index === -1) return;

        const newSorted = [...currentSorted];
        if (direction === "up" && index > 0) {
            [newSorted[index - 1], newSorted[index]] = [newSorted[index], newSorted[index - 1]];
        } else if (direction === "down" && index < newSorted.length - 1) {
            [newSorted[index + 1], newSorted[index]] = [newSorted[index], newSorted[index + 1]];
        } else {
            return; // No move possible
        }

        // Merge with existing priority order to keep non-connected items too
        const others = priorityOrder.filter(id => !currentSorted.includes(id));
        handleSetPriority([...newSorted, ...others]);
    }
</script>

{#snippet prefix()}
    <div class="p-2.5 rounded-2xl bg-primary/10 border border-primary/20">
        <Plug class="size-4 text-primary" />
    </div>
{/snippet}

<ResponsiveSheet
    bind:open
    {onOpenChange}
    title="Integrations"
    description="Connect AI providers by pasting your API keys below."
    {prefix}
>
    <div class="grid grid-cols-1 gap-4 py-4">
        <!-- Instructional Tip -->
        <div class="p-4 rounded-2xl bg-primary/5 border border-primary/10 flex gap-3">
            <div class="bg-primary/10 p-2 rounded-xl h-fit">
                <Plug class="size-4 text-primary" />
            </div>
            <div class="space-y-1">
                <h4 class="text-sm font-medium text-foreground">How to get started?</h4>
                <p class="text-xs text-muted-foreground leading-relaxed">
                    Click "Get API Key" on any provider to visit their console. Create a key, copy it, and paste it here. 
                    <span class="text-primary font-medium">Google Login</span> is the fastest sign-up. 
                    The Top-most connected provider acts as the <span class="text-primary font-medium">Chief Architect</span> (Planner). 
                    Use the arrows to reorder.
                </p>
            </div>
        </div>

        {#if sortedConnectedProviders.length > 1}
            <div class="space-y-3">
                <h4 class="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Planned Order (Chief Architect at Top)</h4>
            </div>
        {/if}

        {#each chatProviders as provider}
            <Card class="bg-muted/5 border-border/50 relative overflow-hidden">
                <CardHeader class="pb-3">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <KeyIcon class="h-5 w-5 text-muted-foreground" />
                            <CardTitle class="text-base"
                                >{provider.name}</CardTitle
                            >
                        </div>
                        <div class="flex items-center gap-2">
                            {#if provider.url}
                                <a
                                    href={provider.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="text-xs text-primary hover:underline font-medium"
                                >
                                    Get API Key
                                </a>
                            {/if}
                            
                            {#if isConnected(provider.id) && sortedConnectedProviders.length > 1}
                                <div class="flex items-center bg-primary/5 rounded-lg border border-primary/10">
                                    <button 
                                        class="p-1 hover:text-primary transition-colors disabled:opacity-30" 
                                        onclick={() => moveProvider(provider.id, "up")}
                                        disabled={sortedConnectedProviders[0] === provider.id || isSavingSettings}
                                        title="Move Up"
                                    >
                                        <ChevronUp class="size-4" />
                                    </button>
                                    <div class="w-px h-3 bg-primary/20"></div>
                                    <button 
                                        class="p-1 hover:text-primary transition-colors disabled:opacity-30" 
                                        onclick={() => moveProvider(provider.id, "down")}
                                        disabled={sortedConnectedProviders[sortedConnectedProviders.length - 1] === provider.id || isSavingSettings}
                                        title="Move Down"
                                    >
                                        <ChevronDown class="size-4" />
                                    </button>
                                </div>
                            {/if}
                        </div>
                    </div>
                    <CardDescription
                        >{provider.description ||
                            "Connect to this provider"}</CardDescription
                    >
                </CardHeader>
                <CardFooter>
                    {#if isConnected(provider.id)}
                        <div class="flex flex-col w-full gap-2">
                            <div
                                class="flex items-center justify-between px-3 py-2 bg-primary/5 rounded-xl border border-primary/10"
                            >
                                <span
                                    class="text-sm text-muted-foreground font-mono"
                                    >{getMaskedKey(provider.id)}</span
                                >
                                <div class="flex items-center gap-1">
                                    <button
                                        class="p-1.5 hover:bg-primary/10 rounded-lg transition-colors"
                                        onclick={() => handleRefreshModels(provider.id)}
                                        disabled={refreshingProviderId === provider.id}
                                        title="Refresh model list"
                                    >
                                        {#if refreshingProviderId === provider.id}
                                            <Spinner class="size-4" />
                                        {:else}
                                            <RefreshCcw
                                                class="size-4 text-muted-foreground"
                                            />
                                        {/if}
                                    </button>
                                    <button
                                        class="p-1.5 hover:bg-primary/10 rounded-lg transition-colors"
                                        onclick={() =>
                                            handleCopyMaskedKey(provider.id)}
                                        title="Copy masked key"
                                    >
                                        {#if copiedProviderId === provider.id}
                                            <CheckIcon
                                                class="size-4 text-green-500"
                                            />
                                        {:else}
                                            <CopyIcon
                                                class="size-4 text-muted-foreground"
                                            />
                                        {/if}
                                    </button>
                                    <button
                                        class="p-1.5 hover:bg-destructive/10 rounded-lg transition-colors"
                                        onclick={() =>
                                            handleRemoveKey(provider.id)}
                                        disabled={removingProviderId ===
                                            provider.id}
                                        title="Remove API key"
                                    >
                                        {#if removingProviderId === provider.id}
                                            <Spinner class="size-4" />
                                        {:else}
                                            <Trash2Icon
                                                class="size-4 text-destructive/70"
                                            />
                                        {/if}
                                    </button>
                                </div>
                            </div>
                        </div>
                    {:else}
                        <div class="flex flex-col w-full gap-2">
                            <Input
                                type="password"
                                bind:value={apiKeys[provider.id]}
                                placeholder="Paste your API key here"
                                class="rounded-xl border-border/50 focus:border-primary/50 font-mono text-sm"
                            />
                            <Button
                                variant="outline"
                                class="w-full gap-2 rounded-xl"
                                onclick={() => handleSaveKey(provider.id)}
                                disabled={savingProviderId === provider.id}
                            >
                                {#if savingProviderId === provider.id}
                                    <Spinner class="h-4 w-4" /> Saving...
                                {:else}
                                    Save Key
                                {/if}
                            </Button>
                        </div>
                    {/if}
                </CardFooter>
            </Card>
        {/each}
    </div>
</ResponsiveSheet>
