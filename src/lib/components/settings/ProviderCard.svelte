<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import KeyRoundIcon from "@lucide/svelte/icons/key-round";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { providerLogos } from "./_logos";
	import type { Snippet } from "svelte";

	interface BadgeSpec {
		label: string;
		classes: string;
	}

	interface Props {
		providerId: string;
		providerName: string;
		logoAlt?: string;
		logoUrl?: string;
		containerClass?: string;
		icon?: Snippet;
		badge?: BadgeSpec;
		meta?: string;
		metaClass?: string;
		metaLineClamp?: boolean;
		description?: string;
		/**
		 * Source-aware status subtitle (e.g. "Your key — overrides platform").
		 * Renders below `meta` so the user can see at a glance whether
		 * this row is user-driven or platform-default.
		 */
		status?: Snippet;
		onConnect?: () => void;
		connectLabel?: string;
		connectContent?: Snippet;
		connectDisabled?: boolean;
		connectVariant?: "outline" | "ghost";
	}

	let {
		providerId,
		providerName,
		logoAlt,
		logoUrl,
		containerClass = "bg-muted/5 border border-sidebar-border/30 hover:bg-muted/10 transition-all",
		icon,
		badge,
		meta,
		metaClass = "text-[10px] text-muted-foreground/70 leading-snug",
		metaLineClamp = true,
		description,
		status,
		onConnect,
		connectLabel = "Connect",
		connectContent,
		connectDisabled = false,
		connectVariant = "outline"
	}: Props = $props();

	const resolvedLogoUrl = $derived(logoUrl ?? providerLogos[providerId]);
	const finalLogoAlt = $derived(logoAlt ?? providerName);
	const connectButtonClass = $derived(
		connectVariant === "ghost"
			? "min-h-12 rounded-xl text-[11px] font-black uppercase tracking-widest text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10"
			: "min-h-12 rounded-xl text-[11px] font-black uppercase tracking-widest border-sidebar-border/50 hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
	);
</script>

<div class="flex items-center gap-3 p-4 rounded-2xl {containerClass}">
	<div
		class="size-10 rounded-xl bg-background border border-sidebar-border/50 flex items-center justify-center p-2 overflow-hidden shrink-0"
	>
		{#if icon}
			{@render icon()}
		{:else if resolvedLogoUrl}
			<img
				src={resolvedLogoUrl}
				alt={finalLogoAlt}
				class="size-full object-contain dark:invert"
				onerror={(e) => {
					(e.target as HTMLImageElement).style.display = "none";
				}}
			/>
		{:else}
			<KeyRoundIcon class="size-4 text-muted-foreground" />
		{/if}
	</div>
	<div class="flex-1 min-w-0 space-y-0.5">
		{#if badge}
			<div class="flex items-center gap-2 flex-wrap">
				<span class="text-sm font-black tracking-tight truncate">{providerName}</span>
				<Badge
					class="border-none text-[9px] font-black px-1.5 py-0 rounded-md {badge.classes}"
				>
					{badge.label}
				</Badge>
			</div>
		{:else}
			<span class="text-sm font-black tracking-tight block truncate">{providerName}</span>
		{/if}
		{#if meta}
			<p class="{metaClass}{metaLineClamp ? ' line-clamp-1' : ''}">{meta}</p>
		{/if}
		{#if status}
			{@render status()}
		{/if}
		{#if description}
			<p class="text-[10px] text-muted-foreground/70 leading-snug line-clamp-1">
				{description}
			</p>
		{/if}
	</div>
	{#if onConnect}
		<Button
			variant={connectVariant}
			size="sm"
			onclick={onConnect}
			disabled={connectDisabled}
			class={connectButtonClass}
		>
			{#if connectContent}
				{@render connectContent()}
			{:else}
				<PlusIcon class="size-3" />
				{connectLabel}
			{/if}
		</Button>
	{/if}
</div>

