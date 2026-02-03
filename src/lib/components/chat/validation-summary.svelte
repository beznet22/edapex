<script lang="ts">
    import CheckCircleIcon from "@lucide/svelte/icons/check-circle";
    import XCircleIcon from "@lucide/svelte/icons/x-circle";

    let {
        valid,
        invalid,
        results,
    }: {
        valid: number;
        invalid: number;
        results: any[];
    } = $props();
</script>

<div class="space-y-4">
    <div class="flex gap-4">
        <div
            class="relative w-full rounded-lg border border-green-500/50 bg-green-500/10 p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4"
        >
            <CheckCircleIcon class="h-4 w-4 text-green-500" />
            <h5
                class="mb-1 font-medium leading-none tracking-tight text-green-700"
            >
                Valid
            </h5>
            <div class="text-sm [&_p]:leading-relaxed text-green-700">
                {valid} students
            </div>
        </div>

        {#if invalid > 0}
            <div
                class="relative w-full rounded-lg border border-destructive/50 p-4 text-destructive [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-destructive"
            >
                <XCircleIcon class="h-4 w-4" />
                <h5 class="mb-1 font-medium leading-none tracking-tight">
                    Invalid
                </h5>
                <div class="text-sm [&_p]:leading-relaxed">
                    {invalid} students
                </div>
            </div>
        {/if}
    </div>

    {#if invalid > 0}
        <div class="rounded-md border p-4">
            <h4 class="mb-2 text-sm font-medium">Issues Found</h4>
            <ul class="space-y-2 text-sm">
                {#each results.filter((r) => !r.valid) as result}
                    <li class="flex flex-col gap-1">
                        <div class="font-medium">
                            {result.name} ({result.admissionNo})
                        </div>
                        {#each result.issues as issue}
                            <div class="ml-4 text-xs text-red-500">
                                • {issue}
                            </div>
                        {/each}
                    </li>
                {/each}
            </ul>
        </div>
    {/if}
</div>
