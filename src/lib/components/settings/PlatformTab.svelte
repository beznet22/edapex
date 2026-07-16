<script lang="ts">
	import ServerIcon from "@lucide/svelte/icons/server";
	import GiftIcon from "@lucide/svelte/icons/gift";

	import {
		Accordion,
		AccordionContent,
		AccordionItem,
		AccordionTrigger
	} from "$lib/components/ui/accordion/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";

	import PlatformProvidersSection from "./platform/PlatformProvidersSection.svelte";
	import PotLuckConfigSection from "./platform/PotLuckConfigSection.svelte";

	type SectionId = "platform-providers" | "potluck-configuration";

	interface SectionConfig {
		id: SectionId;
		title: string;
		description: string;
		icon: typeof ServerIcon;
	}

	const sections: readonly SectionConfig[] = [
		{
			id: "platform-providers",
			title: "Platform Providers",
			description:
				"Toggle env-backed providers (GROQ_API_KEY, DEEPSEEK_API_KEY, …) on or off school-wide.",
			icon: ServerIcon
		},
		{
			id: "potluck-configuration",
			title: "Pot-Luck Configuration",
			description:
				"Pool of shared API keys (donor/consumer roles, caps, allowed providers, audit retention).",
			icon: GiftIcon
		}
	] as const;

	let openSection = $state<SectionId | undefined>("platform-providers");
</script>

<section class="space-y-6">
	<header class="space-y-1.5">
		<h2 class="text-lg font-bold tracking-tight">Platform Settings</h2>
		<p class="text-muted-foreground text-sm">
			Operator configuration. Changes here apply to every staff member in your school and are
			written to the audit log.
		</p>
	</header>

	<Separator />

	<Accordion
		type="single"
		bind:value={openSection}
		class="border-border/60 w-full rounded-xl border"
	>
		{#each sections as section (section.id)}
			{@const Icon = section.icon}
			{@const isOpen = openSection === section.id}
			<AccordionItem value={section.id} class="px-4 group/item transition-colors duration-200 {isOpen ? 'bg-muted/30' : 'hover:bg-muted/15'}">
				<AccordionTrigger class="hover:no-underline py-4 transition-all duration-200 [&[data-state=open]>div>span>span:first-child]:bg-primary/20 [&[data-state=open]>div>span>span:first-child>svg]:scale-110">
					<div class="flex items-center gap-3">
						<span
							class="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200 group-hover/item:bg-primary/15"
						>
							<Icon class="h-4 w-4 transition-transform duration-200" />
						</span>
						<span class="flex flex-col items-start text-left">
							<span class="text-sm font-semibold transition-colors duration-200 group-hover/item:text-foreground">{section.title}</span>
							<span class="text-muted-foreground text-xs font-normal">
								{section.description}
							</span>
						</span>
					</div>
				</AccordionTrigger>

				<AccordionContent>
					<div class="space-y-4 pt-2 pb-1 animate-in fade-in slide-in-from-top-1 duration-200">
						{#if section.id === "platform-providers"}
							<PlatformProvidersSection />
						{:else}
							<PotLuckConfigSection />
						{/if}
					</div>
				</AccordionContent>
			</AccordionItem>
		{/each}
	</Accordion>
</section>
