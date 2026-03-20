<script lang="ts">
    import { Button } from "$lib/components/ui/button/index.js";
    import {
        Card,
        CardHeader,
        CardTitle,
        CardDescription,
        CardFooter,
    } from "$lib/components/ui/card/index.js";
    import { Spinner } from "$lib/components/ui/spinner/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import { chatProviders } from "$lib/chat/models.js";
    import { addProvder, addToken } from "$lib/api/agent.remote.js";
    import { toast } from "svelte-sonner";
    import { saveTokenData } from "$lib/context/oauth.svelte.js";
    import type { CredentialType } from "$lib/schema/chat-schema.js";
    import Plug from "@lucide/svelte/icons/plug";
    import { page } from "$app/state";
    import ResponsiveSheet from "$lib/components/shared/responsive-sheet.svelte";
    import Settings from "@lucide/svelte/icons/settings";
    import FolderIcon from "@lucide/svelte/icons/folder";

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
                manual_code: manualCode
            });

            if (result.success) {
                toast.success("Connection successful!");
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
    description="Connect external AI providers to enhance your chat experience."
    {prefix}
>
    <div class="grid grid-cols-1 gap-4 py-4">
        {#each chatProviders as provider}
            <Card class="bg-muted/5 border-border/50">
                <CardHeader class="pb-3">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <Plug class="h-5 w-5 text-muted-foreground" />
                            <CardTitle class="text-base"
                                >{provider.name}</CardTitle
                            >
                        </div>
                    </div>
                    <CardDescription
                        >{provider.description ||
                            "Connect to this provider"}</CardDescription
                    >
                </CardHeader>
                <CardFooter>
                    {#if connectingProviderId === provider.id && provider.id === "google_oauth"}
                        <div class="flex flex-col w-full gap-2 transition-all duration-300">
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
                                    onclick={() => verifyManualCode(provider.id)}
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
                            <p class="text-[10px] text-muted-foreground text-center">
                                Tip: The code is displayed in the popup after authorization.
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
