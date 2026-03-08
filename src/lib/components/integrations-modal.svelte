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
    import { chatProviders } from "$lib/chat/models.js";
    import { addProvder } from "$lib/api/agent.remote.js";
    import { toast } from "svelte-sonner";
    import { saveTokenData } from "$lib/context/oauth.svelte.js";
    import type { CredentialType } from "$lib/schema/chat-schema.js";
    import Plug from "@lucide/svelte/icons/plug";
    import { page } from "$app/state";
    import ResponsiveSheet from "$lib/components/shared/responsive-sheet.svelte";
    import Settings from "@lucide/svelte/icons/settings";
    import FolderIcon from "@lucide/svelte/icons/folder";

    let open = $state(false);


    function onOpenChange(isOpen: boolean) {
        if (!isOpen && page.state.showModal) {
            history.back();
        }
    }

    let connectingProviderId = $state<CredentialType | null>(null);

    async function handleConnect(providerId: CredentialType, name: string) {
        if (connectingProviderId) return;
        connectingProviderId = providerId;
        try {
            const result = await addProvder({ provider: providerId });
            if (!result.success || !result.deviceAuth) {
                toast.error(result.message);
                return;
            }

            toast.info(
                `Authorizing ${name}... Please complete the process in the popup.`,
            );
            saveTokenData({ ...result.deviceAuth, provider: providerId });
            open = false;
        } catch (err) {
            console.error(err);
            toast.error("Failed to initiate connection");
        } finally {
            connectingProviderId = null;
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
                </CardFooter>
            </Card>
        {/each}
    </div>
</ResponsiveSheet>
