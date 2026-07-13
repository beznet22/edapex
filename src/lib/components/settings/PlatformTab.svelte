<script lang="ts">
	import BuildingIcon from "@lucide/svelte/icons/building";
	import FileTextIcon from "@lucide/svelte/icons/file-text";
	import CalendarIcon from "@lucide/svelte/icons/calendar";
	import ServerIcon from "@lucide/svelte/icons/server";
	import GiftIcon from "@lucide/svelte/icons/gift";
	import SaveIcon from "@lucide/svelte/icons/save";
	import XIcon from "@lucide/svelte/icons/x";
	import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
	import { toast } from "svelte-sonner";

	import {
		Accordion,
		AccordionContent,
		AccordionItem,
		AccordionTrigger
	} from "$lib/components/ui/accordion/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";

	import SchoolIdentitySection from "./platform/SchoolIdentitySection.svelte";
	import ReportTemplatesSection from "./platform/ReportTemplatesSection.svelte";
	import AcademicCalendarSection from "./platform/AcademicCalendarSection.svelte";
	import PlatformProvidersSection from "./platform/PlatformProvidersSection.svelte";
	import PotLuckConfigSection from "./platform/PotLuckConfigSection.svelte";

	type SectionId =
		| "school-identity"
		| "report-templates"
		| "academic-calendar"
		| "platform-providers"
		| "potluck-configuration";

	interface SectionConfig {
		id: SectionId;
		title: string;
		description: string;
		placeholder: string;
		icon: typeof BuildingIcon;
		// When true the section component renders its own Save/Cancel; the
		// accordion-level buttons are hidden for that section to avoid two
		// competing action surfaces.
		standalone: boolean;
	}

	const sections: readonly SectionConfig[] = [
		{
			id: "school-identity",
			title: "School Identity",
			description: "Name, phone, email, address, and logo shown on reports and PDFs.",
			placeholder:
				"School Identity fields land here in Phase 3. Edits will read/write smGeneralSettings; logo uploads will use POST /api/uploads with kind=\"logo\".",
			icon: BuildingIcon,
			standalone: true
		},
		{
			id: "report-templates",
			title: "Report Templates",
			description:
				"Termly / annual report titles, principal signature name, support email, and result email subject.",
			placeholder:
				"Report Templates fields land here in Phase 4. Edits will read/write the 5 fields via getReportSettings(schoolId).",
			icon: FileTextIcon,
			standalone: true
		},
		{
			id: "academic-calendar",
			title: "Academic Calendar",
			description: "Manage academic years and exam types; toggle the active year.",
			placeholder:
				"Academic Calendar fields land here in Phase 5. Lists/creates smAcademicYears and smExamTypes; toggles activeStatus on the active year.",
			icon: CalendarIcon,
			standalone: false
		},
		{
			id: "platform-providers",
			title: "Platform Providers",
			description:
				"Toggle env-backed providers (GROQ_API_KEY, DEEPSEEK_API_KEY, …) on or off school-wide.",
			placeholder:
				"Platform providers land here in Phase 2. Disables write to admin_model_overrides with modelId=null and are excluded from availableModels.",
			icon: ServerIcon,
			standalone: true
		},
		{
			id: "potluck-configuration",
			title: "Pot-Luck Configuration",
			description:
				"Pool of shared API keys (donor/consumer roles, caps, allowed providers, audit retention).",
			placeholder:
				"Pot-Luck Configuration fields land here in Phase 7. Edits the potluck_config row in LibSQLite app-db. CSV export/import live alongside.",
			icon: GiftIcon,
			standalone: true
		}
	] as const;

	let openSection = $state<SectionId | undefined>("school-identity");

	// Per-section dirty flag. Populated when subsequent phases wire their form
	// bindings; for the shell, every section starts clean so Save is disabled
	// until edits occur. Keeping the shape now so Phase 3+ only need to flip
	// the flag from their handlers without touching this layout.
	const dirty = $state<Record<SectionId, boolean>>({
		"school-identity": false,
		"report-templates": false,
		"academic-calendar": false,
		"platform-providers": false,
		"potluck-configuration": false
	});

	function handleSave(id: SectionId, title: string) {
		// Phase 3+ replace this stub with the real persist call. Until then,
		// surface a hint so manual verification can confirm the wiring.
		toast.info(`${title} save is wired but persistence lands in a later phase.`);
		dirty[id] = false;
	}

	function handleCancel(id: SectionId, title: string) {
		toast.info(`${title} draft reverted (stub).`);
		dirty[id] = false;
	}
</script>

<section class="space-y-6">
	<header class="space-y-1.5">
		<h2 class="text-lg font-bold tracking-tight">Platform Settings</h2>
		<p class="text-muted-foreground text-sm">
			School-wide configuration. Changes here apply to every staff member in your school and are
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
			<AccordionItem value={section.id} class="px-4">
				<AccordionTrigger class="hover:no-underline">
					<div class="flex items-center gap-3">
						<span
							class="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
						>
							<Icon class="h-4 w-4" />
						</span>
						<span class="flex flex-col items-start text-left">
							<span class="text-sm font-semibold">{section.title}</span>
							<span class="text-muted-foreground text-xs font-normal">
								{section.description}
							</span>
						</span>
					</div>
				</AccordionTrigger>

				<AccordionContent>
					<div class="space-y-4 pt-2 pb-1">
						{#if section.standalone}
							{#if section.id === "school-identity"}
								<SchoolIdentitySection />
							{:else if section.id === "report-templates"}
								<ReportTemplatesSection />
							{:else if section.id === "academic-calendar"}
								<AcademicCalendarSection />
							{:else if section.id === "platform-providers"}
								<PlatformProvidersSection />
							{:else if section.id === "potluck-configuration"}
								<PotLuckConfigSection />
							{/if}
						{:else}
							<p class="text-muted-foreground text-xs leading-relaxed">
								{section.placeholder}
							</p>

							<div
								class="border-border/40 bg-muted/20 text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-xs"
							>
								Section content arrives in a later phase.
							</div>

							<div class="flex items-center justify-end gap-2 pt-1">
								<Button
									size="sm"
									variant="ghost"
									disabled={!dirty[section.id]}
									onclick={() => handleCancel(section.id, section.title)}
								>
									<RotateCcwIcon class="mr-1.5 h-3.5 w-3.5" />
									Cancel
								</Button>
								<Button
									size="sm"
									disabled={!dirty[section.id]}
									onclick={() => handleSave(section.id, section.title)}
								>
									{#if dirty[section.id]}
										<SaveIcon class="mr-1.5 h-3.5 w-3.5" />
									{:else}
										<XIcon class="mr-1.5 h-3.5 w-3.5" />
									{/if}
									Save
								</Button>
							</div>
						{/if}
					</div>
				</AccordionContent>
			</AccordionItem>
		{/each}
	</Accordion>
</section>
