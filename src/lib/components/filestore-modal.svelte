<script lang="ts">
    import * as Dialog from "$lib/components/ui/dialog/index.js";
    import { Button } from "$lib/components/ui/button";
    import { ScrollArea } from "$lib/components/ui/scroll-area";
    import { Badge } from "$lib/components/ui/badge";
    import { Card, CardContent } from "$lib/components/ui/card";
    import Loader2 from "@lucide/svelte/icons/loader-2";
    import Trash2 from "@lucide/svelte/icons/trash-2";
    import RefreshCw from "@lucide/svelte/icons/refresh-cw";
    import FileText from "@lucide/svelte/icons/file-text";
    import Eye from "@lucide/svelte/icons/eye";
    import { toast } from "svelte-sonner";

    let { open = $bindable(false) } = $props();

    // Mock data for now - will be replaced with real data fetching
    let files = $state([
        {
            id: "1",
            filename: "student_result_101.pdf",
            status: "extracted",
            preview: "/placeholder.png",
            uploadedAt: new Date(),
        },
        {
            id: "2",
            filename: "student_result_102.pdf",
            status: "error",
            error: "Failed to parse table",
            preview: "/placeholder.png",
            uploadedAt: new Date(),
        },
        {
            id: "3",
            filename: "student_result_103.pdf",
            status: "pending",
            preview: "/placeholder.png",
            uploadedAt: new Date(),
        },
    ]);

    function getStatusColor(status: string) {
        switch (status) {
            case "extracted":
                return "bg-green-500/10 text-green-700 border-green-500/20";
            case "error":
                return "bg-red-500/10 text-red-700 border-red-500/20";
            case "pending":
                return "bg-yellow-500/10 text-yellow-700 border-yellow-500/20";
            default:
                return "bg-gray-500/10 text-gray-700";
        }
    }

    async function handleDelete(id: string) {
        // TODO: Implement delete logic
        files = files.filter((f) => f.id !== id);
        toast.success("File deleted");
    }

    async function handleRetry(id: string) {
        // TODO: Implement retry logic
        toast.info("Retrying extraction...");
    }
</script>

<Dialog.Root bind:open>
    <Dialog.Content class="sm:max-w-[800px]">
        <Dialog.Header>
            <Dialog.Title>Student Files</Dialog.Title>
            <Dialog.Description>
                Manage uploaded assessment files and view their extraction
                status.
            </Dialog.Description>
        </Dialog.Header>

        <ScrollArea class="h-[500px] w-full pr-4">
            <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {#each files as file (file.id)}
                    <Card class="overflow-hidden">
                        <div
                            class="aspect-3/4 w-full bg-muted relative group"
                        >
                            <!-- Preview placeholder -->
                            <div
                                class="absolute inset-0 flex items-center justify-center text-muted-foreground bg-muted/50"
                            >
                                <FileText class="h-12 w-12 opacity-50" />
                            </div>

                            <!-- Overlay Actions -->
                            <div
                                class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2"
                            >
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    class="h-8 w-8"
                                >
                                    <Eye class="h-4 w-4" />
                                </Button>
                                {#if file.status === "error"}
                                    <Button
                                        variant="secondary"
                                        size="icon"
                                        class="h-8 w-8"
                                        onclick={() => handleRetry(file.id)}
                                    >
                                        <RefreshCw class="h-4 w-4" />
                                    </Button>
                                {/if}
                                <Button
                                    variant="destructive"
                                    size="icon"
                                    class="h-8 w-8"
                                    onclick={() => handleDelete(file.id)}
                                >
                                    <Trash2 class="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        <CardContent class="p-3">
                            <div class="mb-2 flex items-start justify-between">
                                <p
                                    class="truncate text-sm font-medium leading-none"
                                    title={file.filename}
                                >
                                    {file.filename}
                                </p>
                            </div>

                            <div class="flex items-center justify-between">
                                <Badge
                                    variant="outline"
                                    class={getStatusColor(file.status)}
                                >
                                    {file.status}
                                </Badge>
                                <span class="text-[10px] text-muted-foreground">
                                    {file.uploadedAt.toLocaleDateString()}
                                </span>
                            </div>

                            {#if file.error}
                                <p
                                    class="mt-2 text-[10px] text-destructive truncate"
                                    title={file.error}
                                >
                                    {file.error}
                                </p>
                            {/if}
                        </CardContent>
                    </Card>
                {/each}
            </div>
        </ScrollArea>
    </Dialog.Content>
</Dialog.Root>
