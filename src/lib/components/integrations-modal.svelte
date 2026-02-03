<script lang="ts">
    import * as Dialog from "$lib/components/ui/dialog/index.js";
    import { Button } from "$lib/components/ui/button";
    import {
        Card,
        CardContent,
        CardHeader,
        CardTitle,
        CardDescription,
        CardFooter,
    } from "$lib/components/ui/card";
    import { Badge } from "$lib/components/ui/badge";
    import { Spinner } from "$lib/components/ui/spinner";
    import { chatProviders, type ChatProviders } from "$lib/chat/models";
    import { addProvder } from "$lib/api/agent.remote";
    import { toast } from "svelte-sonner";
    import { saveTokenData } from "$lib/context/oauth.svelte";
    import type { CredentialType } from "$lib/schema/chat-schema";
    import Plug from "@lucide/svelte/icons/plug";

    let {
        open = $bindable(false),
        onOpenChange,
    }: { open: boolean; onOpenChange?: (open: boolean) => void } = $props();

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

            // In a real app we might redirect or show a code here.
            // For Google OAuth device flow:
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

<Dialog.Root bind:open {onOpenChange}>
    <Dialog.Content class="sm:max-w-[700px]">
        <Dialog.Header>
            <Dialog.Title>Integrations</Dialog.Title>
            <Dialog.Description>
                Connect external AI providers to enhance your chat experience.
            </Dialog.Description>
        </Dialog.Header>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 py-4">
            {#each chatProviders as provider}
                <Card>
                    <CardHeader class="pb-3">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <!-- We could add provider icons here if we had them mapped -->
                                <Plug class="h-5 w-5 text-muted-foreground" />
                                <CardTitle class="text-base"
                                    >{provider.name}</CardTitle
                                >
                            </div>
                            <!-- 
                           We would ideally check connection status here.
                           For now, we assume disconnected or handle state elsewhere.
                          -->
                        </div>
                        <CardDescription
                            >{provider.description ||
                                "Connect to this provider"}</CardDescription
                        >
                    </CardHeader>
                    <CardFooter>
                        <Button
                            variant="outline"
                            class="w-full gap-2"
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
    </Dialog.Content>
</Dialog.Root>
