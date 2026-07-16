<script lang="ts">
	import { page } from "$app/state";
	import BuildingIcon from "@lucide/svelte/icons/building";
	import FileTextIcon from "@lucide/svelte/icons/file-text";
	import CalendarClockIcon from "@lucide/svelte/icons/calendar-clock";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
	import UserIcon from "@lucide/svelte/icons/user";

	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";
	import {
		Accordion,
		AccordionContent,
		AccordionItem,
		AccordionTrigger
	} from "$lib/components/ui/accordion/index.js";

	import SchoolIdentitySection from "./platform/SchoolIdentitySection.svelte";
	import ReportTemplatesSection from "./platform/ReportTemplatesSection.svelte";
	import AcademicCalendarSection from "./platform/AcademicCalendarSection.svelte";

	interface Props {
		designation: string | null | undefined;
	}

	let { designation }: Props = $props();

	const allowedDesignations = ["admin", "it", "it_support"] as const;
	const canManageSchool = $derived(
		designation !== null &&
			designation !== undefined &&
			(allowedDesignations as readonly string[]).includes(designation)
	);

	type SectionId = "school-identity" | "report-templates" | "academic-calendar";

	interface SectionConfig {
		id: SectionId;
		title: string;
		description: string;
		icon: typeof BuildingIcon;
	}

	const sections: readonly SectionConfig[] = [
		{
			id: "school-identity",
			title: "School Identity",
			description: "Name, phone, email, address, and logo shown on reports and PDFs.",
			icon: BuildingIcon
		},
		{
			id: "report-templates",
			title: "Report Templates",
			description:
				"Termly / annual report titles, principal signature name, support email, and result email subject.",
			icon: FileTextIcon
		},
		{
			id: "academic-calendar",
			title: "Academic Calendar",
			description: "Manage academic years and exam types; toggle the active year.",
			icon: CalendarClockIcon
		}
	] as const;

	let openSection = $state<SectionId | undefined>("school-identity");
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-12">
	<div class="space-y-2">
		<h2 class="text-2xl font-black tracking-tight text-foreground">Workspace Identity</h2>
		<p class="text-sm text-muted-foreground">
			Manage your personal profile and workspace identification.
		</p>
	</div>

	<Separator class="bg-sidebar-border/10" />

	<div class="grid gap-6">
		<div class="grid gap-2">
			<Label
				for="username"
				class="text-xs font-black uppercase tracking-widest text-muted-foreground/60 ml-1"
				>Display Name</Label
			>
			<Input
				id="username"
				value={page.data.user?.name}
				class="h-12 bg-muted/5 border-sidebar-border/50 rounded-xl px-4 font-bold text-sm focus:border-primary/50 transition-all"
				placeholder="Your name"
			/>
		</div>
		<div class="grid gap-2">
			<Label
				for="email"
				class="text-xs font-black uppercase tracking-widest text-muted-foreground/60 ml-1"
				>Email Address</Label
			>
			<Input
				id="email"
				value={page.data.user?.email}
				disabled
				class="h-12 bg-muted/5 border-sidebar-border/50 rounded-xl px-4 font-bold text-sm opacity-50"
			/>
		</div>
	</div>

	<div
		class="p-4 rounded-2xl bg-primary/5 border border-primary/20 flex gap-4 items-start"
	>
		<div class="p-3 rounded-xl bg-primary/10 border border-primary/20">
			<ShieldCheckIcon class="size-5 text-primary" />
		</div>
		<div class="space-y-1">
			<h4 class="text-sm font-black text-foreground">Identity Verified</h4>
			<p class="text-xs text-muted-foreground leading-relaxed">
				Your account is secured via enterprise SSO. Profile changes are optimistic and
				synchronized with the central directory.
			</p>
		</div>
	</div>

	{#if canManageSchool}
		<Separator class="bg-sidebar-border/10" />

		<div class="space-y-4">
			<div class="flex items-center gap-3">
				<div class="p-2 rounded-lg bg-primary/10 text-primary">
					<UserIcon class="size-4" />
				</div>
				<div class="space-y-0.5">
					<h3 class="text-sm font-black tracking-tight text-foreground">School Configuration</h3>
					<p class="text-xs text-muted-foreground">
						School-wide settings. Changes apply to every staff member and are written to the audit
						log.
					</p>
				</div>
			</div>

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
								{#if section.id === "school-identity"}
									<SchoolIdentitySection />
								{:else if section.id === "report-templates"}
									<ReportTemplatesSection />
								{:else}
									<AcademicCalendarSection />
								{/if}
							</div>
						</AccordionContent>
					</AccordionItem>
				{/each}
			</Accordion>
		</div>
	{/if}
</div>
