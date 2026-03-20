<script lang="ts">
    import { page } from "$app/state";
    import {
        addProvder,
        addToken,
        setDefaultProvider,
    } from "$lib/api/agent.remote.js";
    import { chatProviders } from "$lib/chat/models.js";
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
    import { saveTokenData, closePopup } from "$lib/context/oauth.svelte.js";
    import type { CredentialType } from "$lib/schema/chat-schema.js";
    import CheckCircleIcon from "@lucide/svelte/icons/check-circle";
    import CircleIcon from "@lucide/svelte/icons/circle";
    import Plug from "@lucide/svelte/icons/plug";
    import { toast } from "svelte-sonner";

    let open = $state(false);

    // Sync with page state for sidebar/navigation triggers
    $effect(() => {
        if (page.state.showModal !== undefined) {
            open = page.state.showModal;
        }
    });

    function onOpenChange(isOpen: boolean) {
        if (!isOpen && page.state.showModal) {
            history.back();
        }
    }

    let connectingProviderId = $state<CredentialType | null>(null);
    let manualCode = $state("");
    let currentDeviceCode = $state("");
    let optimisticDefaultProvider = $state<string | null>(null);
    let displayDefaultProvider = $derived(
        optimisticDefaultProvider ?? page.data.defaultProvider,
    );

    async function handleConnect(providerId: CredentialType, name: string) {
        if (connectingProviderId) return;
        connectingProviderId = providerId;
        manualCode = "";
        try {
            const result = await addProvder({ provider: providerId });
            if (!result.success || !result.deviceAuth) {
                toast.error(result.message);
                connectingProviderId = null;
                return;
            }

            currentDeviceCode = result.deviceAuth.device_code;
            toast.info(
                `Authorizing ${name}... Please complete the process in the popup.`,
            );
            saveTokenData({ ...result.deviceAuth, provider: providerId });

            // For most providers, we can close and let polling happen
            // For Google, we stay open to allow manual code entry
            if (providerId !== "google_oauth") {
                open = false;
                connectingProviderId = null;
            }
        } catch (err) {
            console.error(err);
            toast.error("Failed to initiate connection");
            connectingProviderId = null;
        }
    }

    async function verifyManualCode(providerId: CredentialType) {
        if (!manualCode) {
            toast.error("Please enter the authorization code");
            return;
        }

        try {
            const result = await addToken({
                device_code: currentDeviceCode,
                provider: providerId,
                manual_code: manualCode,
            });

            if (result.success) {
                toast.success(
                    `${(connectingProviderId || providerId).replace("_", " ")} added safely`,
                );
                closePopup();
                open = false;
                connectingProviderId = null;
            } else {
                toast.error(result.message || "Failed to verify code");
            }
        } catch (err) {
            console.error(err);
            toast.error("An error occurred during verification");
        }
    }

    async function handleSetDefault(providerId: CredentialType) {
        optimisticDefaultProvider = providerId;
        try {
            const result = await setDefaultProvider({ provider: providerId });
            if (result.success) {
                toast.success(result.message);
            } else {
                toast.error(result.message);
                optimisticDefaultProvider = null;
            }
        } catch (err) {
            console.error(err);
            toast.error("Failed to set default provider");
            optimisticDefaultProvider = null;
        }
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
    description="Connect external AI providers and select your default for automated tasks."
    {prefix}
>
    <div class="grid grid-cols-1 gap-4 py-4">
        {#each chatProviders as provider}
            <Card class="bg-muted/5 border-border/50 relative overflow-hidden">
                {#if displayDefaultProvider === provider.id}
                    <div
                        class="absolute top-0 right-0 p-1 bg-primary/10 rounded-bl-xl border-l border-b border-primary/20"
                    >
                        <CheckCircleIcon class="size-3 text-primary" />
                    </div>
                {/if}
                <CardHeader class="pb-3">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <Plug class="h-5 w-5 text-muted-foreground" />
                            <CardTitle class="text-base"
                                >{provider.name}</CardTitle
                            >
                        </div>
                        <button
                            class="p-1 hover:bg-primary/10 rounded-full transition-colors group"
                            onclick={() => handleSetDefault(provider.id)}
                            title="Set as default provider"
                        >
                            {#if displayDefaultProvider === provider.id}
                                <CheckCircleIcon class="size-5 text-primary" />
                            {:else}
                                <CircleIcon
                                    class="size-5 text-muted-foreground group-hover:text-primary transition-colors"
                                />
                            {/if}
                        </button>
                    </div>
                    <CardDescription
                        >{provider.description ||
                            "Connect to this provider"}</CardDescription
                    >
                </CardHeader>
                <CardFooter>
                    {#if connectingProviderId === provider.id && provider.id === "google_oauth"}
                        <div
                            class="flex flex-col w-full gap-2 transition-all duration-300"
                        >
                            <Input
                                type="text"
                                bind:value={manualCode}
                                placeholder="Paste authorization code here"
                                class="rounded-xl border-border/50 focus:border-primary/50"
                            />
                            <div class="flex gap-2">
                                <Button
                                    variant="default"
                                    class="flex-1 rounded-xl"
                                    onclick={() =>
                                        verifyManualCode(provider.id)}
                                >
                                    Verify Code
                                </Button>
                                <Button
                                    variant="ghost"
                                    class="rounded-xl"
                                    onclick={() => {
                                        connectingProviderId = null;
                                        manualCode = "";
                                    }}
                                >
                                    Cancel
                                </Button>
                            </div>
                            <p
                                class="text-[10px] text-muted-foreground text-center"
                            >
                                Tip: The code is displayed in the popup after
                                authorization.
                            </p>
                        </div>
                    {:else}
                        <Button
                            variant="outline"
                            class="w-full gap-2 rounded-xl"
                            onclick={() =>
                                handleConnect(provider.id, provider.name || "")}
                            disabled={!!connectingProviderId}
                        >
                            {#if connectingProviderId === provider.id}
                                <Spinner class="h-4 w-4" /> Connecting...
                            {:else}
                                Connect
                            {/if}
                        </Button>
                    {/if}
                </CardFooter>
            </Card>
        {/each}
    </div>
</ResponsiveSheet>
