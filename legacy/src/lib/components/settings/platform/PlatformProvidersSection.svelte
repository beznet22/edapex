<script lang="ts">
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";
	import ServerIcon from "@lucide/svelte/icons/server";
	import ServerOffIcon from "@lucide/svelte/icons/server-off";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";

	interface PlatformProvider {
		providerId: string;
		name: string;
		hasEnvKey: boolean;
		enabled: boolean;
	}

	let providers = $state<PlatformProvider[]>([]);
	let loading = $state<boolean>(true);
	let togglingId = $state<string | null>(null);

	async function loadProviders(): Promise<void> {
		loading = true;
		try {
			const response = await fetch("/api/settings/platform-providers", {
				credentials: "include"
			});
			if (!response.ok) {
				throw new Error(`GET /api/settings/platform-providers failed: ${response.status}`);
			}
			const payload: unknown = await response.json();
			if (typeof payload !== "object" || payload === null) {
				throw new Error("Unexpected response shape");
			}
			const list = (payload as { providers?: unknown }).providers;
			providers = Array.isArray(list)
				? (list as PlatformProvider[]).filter(
						(entry): entry is PlatformProvider =>
							typeof entry === "object" &&
							entry !== null &&
							typeof (entry as PlatformProvider).providerId === "string"
					)
				: [];
		} catch (err) {
			console.error("[PlatformProvidersSection] load failed", err);
			toast.error("Could not load platform providers.");
		} finally {
			loading = false;
		}
	}

	async function handleToggle(provider: PlatformProvider): Promise<void> {
		if (togglingId !== null) return;
		togglingId = provider.providerId;
		const next = !provider.enabled;
		// Optimistic update so the switch feels instant.
		const previous = providers;
		providers = providers.map((entry) =>
			entry.providerId === provider.providerId ? { ...entry, enabled: next } : entry
		);
		try {
			const response = await fetch("/api/settings/platform-providers", {
				method: "POST",
				credentials: "include",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ providerId: provider.providerId, enabled: next })
			});
			if (!response.ok) {
				throw new Error(`POST /api/settings/platform-providers failed: ${response.status}`);
			}
			toast.success(`${provider.name} ${next ? "enabled" : "disabled"} school-wide.`);
		} catch (err) {
			console.error("[PlatformProvidersSection] toggle failed", err);
			providers = previous;
			toast.error(`Could not update ${provider.name}.`);
		} finally {
			togglingId = null;
		}
	}

	onMount(() => {
		void loadProviders();
	});
</script>

<div class="flex flex-col gap-4">
	<header class="flex flex-col gap-1">
		<h3 class="text-base font-semibold">Platform Providers</h3>
		<p class="text-sm text-muted-foreground">
			Toggle env-backed providers (e.g., <code class="font-mono">GROQ_API_KEY</code>) on or off
			for the whole school. When off, the provider's models stop appearing for everyone until a
			staff member connects their own key, which always overrides the platform decision.
		</p>
	</header>

	<Separator />

	{#if loading}
		<p class="text-sm text-muted-foreground">Loading platform providers…</p>
	{:else if providers.length === 0}
		<p class="text-sm text-muted-foreground">
			No platform providers are configured. Add an API key to your environment and restart the
			server to expose it here.
		</p>
	{:else}
		<ul class="flex flex-col gap-2">
			{#each providers as provider (provider.providerId)}
				<li
					class="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 {provider.enabled
						? 'border-border bg-muted/20'
						: 'border-destructive/40 bg-destructive/5'}"
				>
					<div class="flex items-center gap-3 min-w-0">
						{#if provider.enabled}
							<ServerIcon class="size-4 text-muted-foreground shrink-0" />
						{:else}
							<ServerOffIcon class="size-4 text-destructive shrink-0" />
						{/if}
						<div class="min-w-0">
							<p class="text-sm font-semibold truncate">{provider.name}</p>
							<p class="text-xs text-muted-foreground">
								{provider.providerId} · env key present
							</p>
						</div>
					</div>
					<Button
						size="sm"
						variant={provider.enabled ? "outline" : "default"}
						disabled={togglingId !== null}
						onclick={() => void handleToggle(provider)}
					>
						{togglingId === provider.providerId
							? provider.enabled
								? "Disabling…"
								: "Enabling…"
							: provider.enabled
								? "Disable"
								: "Enable"}
					</Button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
