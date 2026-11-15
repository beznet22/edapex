<script lang="ts" module>
	export type SearchableItem = {
		id: string | number;
		label: string;
		secondary?: string;
		initials?: string;
		searchValue?: string;
	};
</script>

<script lang="ts" generics="T extends SearchableItem">
	import * as Popover from "$lib/components/ui/popover";
	import * as Command from "$lib/components/ui/command";
	import { cn } from "$lib/utils/shadcn.js";
	import Search from "@lucide/svelte/icons/search";
	import type { Component } from "svelte";

	type Props = {
		items: T[];
		triggerLabel: string;
		triggerIcon?: Component;
		onSelect: (item: T) => void;
		placeholder?: string;
		emptyText?: string;
		open?: boolean;
		disabled?: boolean;
		class?: string;
		align?: "start" | "center" | "end";
		side?: "top" | "right" | "bottom" | "left";
	};

	let {
		items,
		triggerLabel,
		triggerIcon: TriggerIcon,
		onSelect,
		placeholder = "Search…",
		emptyText = "No results",
		open = $bindable(false),
		disabled = false,
		class: className,
		align = "start",
		side = "bottom",
	}: Props = $props();

	function handleSelect(item: T) {
		open = false;
		onSelect(item);
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				{disabled}
				class={cn(
					"inline-flex h-9 min-h-12 md:min-h-9 items-center gap-2",
					"rounded-full bg-primary px-4 text-sm font-bold",
					"text-primary-foreground",
					"transition-spring active:scale-95",
					"hover:bg-primary/90 hover:shadow-md hover:shadow-primary/20",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					"disabled:opacity-50 disabled:pointer-events-none",
					className,
				)}
			>
				{#if TriggerIcon}
					<TriggerIcon class="h-4 w-4" />
				{/if}
				<span>{triggerLabel}</span>
			</button>
		{/snippet}
	</Popover.Trigger>

	<Popover.Content
		{side}
		{align}
		sideOffset={8}
		class="w-[calc(100vw-1.5rem)] mx-3 md:mx-0 md:w-80 md:max-w-96
		       max-h-[70dvh] md:max-h-80
		       p-0 rounded-2xl
		       hermes-glass border border-border/60 shadow-xl
		       data-[side=bottom]:slide-in-from-top-2
		       data-[side=top]:slide-in-from-bottom-2
		       safe-area-bottom overflow-hidden"
	>
		<Command.Root class="bg-transparent">
			<div class="flex items-center gap-2 border-b border-border/60 px-3 h-12 md:h-11">
				<Search class="h-4 w-4 shrink-0 text-muted-foreground" />
				<Command.Input
					{placeholder}
					class="flex h-10 w-full bg-transparent text-base md:text-sm
					       outline-none placeholder:text-muted-foreground"
				/>
			</div>

			<Command.List
				class="max-h-[calc(70dvh-3rem)] md:max-h-64
				       overflow-y-auto overscroll-contain
				       scrollbar-hide md:[&::-webkit-scrollbar]:w-1.5
				       p-1"
			>
				<Command.Empty class="py-8 text-center text-sm text-muted-foreground">
					{emptyText}
				</Command.Empty>
				<Command.Group>
					{#each items as item, i (item.id)}
						<Command.Item
							value={item.searchValue ?? `${item.label} ${item.secondary ?? ""}`}
							onSelect={() => handleSelect(item)}
							class="flex min-h-12 md:min-h-10 items-center gap-3
							       rounded-lg px-2 py-2 text-sm cursor-pointer
							       transition-spring
							       aria-selected:bg-accent aria-selected:text-accent-foreground
							       aria-selected:scale-[1.005]
							       active:scale-[0.98]"
						>
							<span
								class="flex h-8 w-8 shrink-0 items-center justify-center
								       rounded-full bg-primary/15 text-xs font-bold
								       text-primary transition-spring
								       aria-selected:bg-primary aria-selected:text-primary-foreground
								       aria-selected:scale-105"
							>
								{item.initials ?? item.label.slice(0, 2).toUpperCase()}
							</span>
							<span class="flex-1 truncate font-medium">
								{item.label}
							</span>
							{#if item.secondary}
								<span class="text-xs tabular-nums text-muted-foreground">
									{item.secondary}
								</span>
							{/if}
						</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
