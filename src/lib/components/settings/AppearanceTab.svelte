<script lang="ts">
	import { Separator } from "$lib/components/ui/separator/index.js";
	import SunIcon from "@lucide/svelte/icons/sun";
	import MoonIcon from "@lucide/svelte/icons/moon";
	import { getTheme } from "@sejohnson/svelte-themes";

	const theme = getTheme();

	const themeOptions = [
		{
			value: "light" as const,
			label: "Light Core",
			Icon: SunIcon,
			iconBg: "bg-white border border-sidebar-border/50",
			iconTextColor: "text-slate-400"
		},
		{
			value: "dark" as const,
			label: "Gold on Slate",
			Icon: MoonIcon,
			iconBg: "bg-card border border-sidebar-border/50",
			iconTextColor: "text-slate-500"
		}
	];
</script>

<div class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
	<div class="space-y-2">
		<h2 class="text-2xl font-black tracking-tight text-foreground">Visual Engine</h2>
		<p class="text-sm text-muted-foreground">
			Customize the interface aesthetic and system themes.
		</p>
	</div>

	<Separator class="bg-sidebar-border/10" />

	<div class="grid grid-cols-2 gap-4">
		{#each themeOptions as option (option.value)}
			<button
				onclick={() => (theme.selectedTheme = option.value)}
				class="group relative aspect-video rounded-2xl border-2 overflow-hidden transition-all {theme.resolvedTheme ===
				option.value
					? 'border-primary ring-4 ring-primary/10 shadow-2xl'
					: 'border-sidebar-border/50 hover:border-sidebar-border grayscale hover:grayscale-0'}"
			>
				<div class="absolute inset-0 bg-background p-3">
					<div class="w-full h-2 bg-sidebar-border/20 rounded-full mb-2"></div>
					<div class="w-1/2 h-2 bg-sidebar-border/20 rounded-full"></div>
				</div>
				<div class="absolute bottom-3 left-3 flex items-center gap-2">
					<div
						class="size-6 rounded-lg {option.iconBg} flex items-center justify-center {option.iconTextColor}"
					>
						<option.Icon class="size-3.5" />
					</div>
					<span
						class="text-[10px] font-black uppercase tracking-widest {theme.resolvedTheme ===
						option.value
							? 'text-primary'
							: option.iconTextColor}">{option.label}</span
					>
				</div>
			</button>
		{/each}
	</div>
</div>
