<script lang="ts">
	import { toast } from "svelte-sonner";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import GlobeIcon from "@lucide/svelte/icons/globe";
	import SendIcon from "@lucide/svelte/icons/send";
	import CheckCircleIcon from "@lucide/svelte/icons/check-circle";
	import AlertCircleIcon from "@lucide/svelte/icons/alert-circle";
	import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";

	import { Button } from "$lib/components/ui/button/index.js";

	interface WebhookInfo {
		url: string | null;
		pendingUpdateCount: number;
		lastErrorDate: string | number | null;
		lastErrorMessage: string | null;
		maxConnections: number | null;
	}

	let webhookInfo = $state<WebhookInfo | null>(null);
	let loadingStatus = $state(false);
	let settingWebhook = $state(false);

	async function checkStatus() {
		loadingStatus = true;
		try {
			const res = await fetch("/api/telegram/webhook-info");
			if (!res.ok) {
				const err = await res.json().catch(() => ({ message: res.statusText }));
				toast.error(err.message ?? "Failed to fetch webhook info");
				return;
			}
			webhookInfo = await res.json();
		} catch (err) {
			toast.error("Network error fetching webhook info");
		} finally {
			loadingStatus = false;
		}
	}

	async function setWebhook() {
		settingWebhook = true;
		try {
			const res = await fetch("/api/telegram/set-webhook", { method: "POST" });
			const data = await res.json();
			if (data.ok) {
				toast.success("Webhook registered");
				await checkStatus();
			} else {
				toast.error(data.description ?? "Failed to set webhook");
			}
		} catch (err) {
			toast.error("Network error setting webhook");
		} finally {
			settingWebhook = false;
		}
	}

	function formatTs(ts: string | number | null): string {
		if (!ts) return "—";
		return new Date(Number(ts) * 1000).toLocaleString();
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<div class="space-y-0.5">
			<h4 class="text-sm font-semibold">Telegram Bot Webhook</h4>
			<p class="text-xs text-muted-foreground">
				Register or check the webhook URL that Telegram calls for bot updates.
			</p>
		</div>
		<div class="flex gap-2">
			<Button
				variant="outline"
				size="sm"
				onclick={checkStatus}
				disabled={loadingStatus}
			>
				{#if loadingStatus}
					<LoaderCircleIcon class="mr-1 size-3 animate-spin" />
				{:else}
					<RefreshCwIcon class="mr-1 size-3" />
				{/if}
				Check Status
			</Button>
			<Button
				size="sm"
				onclick={setWebhook}
				disabled={settingWebhook}
			>
				{#if settingWebhook}
					<LoaderCircleIcon class="mr-1 size-3 animate-spin" />
				{:else}
					<SendIcon class="mr-1 size-3" />
				{/if}
				Set Webhook
			</Button>
		</div>
	</div>

	{#if webhookInfo}
		<div class="rounded-lg border bg-muted/20 p-3 space-y-2 text-sm">
			<div class="flex items-start gap-2">
				<GlobeIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
				<div class="min-w-0">
					<span class="text-xs font-medium text-muted-foreground">URL</span>
					<p class="truncate font-mono text-xs">
						{webhookInfo.url || "(not set)"}
					</p>
				</div>
			</div>

			<div class="flex items-start gap-2">
				{#if webhookInfo.lastErrorMessage}
					<AlertCircleIcon class="mt-0.5 size-4 shrink-0 text-red-400" />
				{:else}
					<CheckCircleIcon class="mt-0.5 size-4 shrink-0 text-green-400" />
				{/if}
				<div>
					<span class="text-xs font-medium text-muted-foreground">Status</span>
					<p class="text-xs">
						{#if webhookInfo.lastErrorMessage}
							<span class="text-red-400">
								Error: {webhookInfo.lastErrorMessage}
								({formatTs(webhookInfo.lastErrorDate)})
							</span>
						{:else}
							<span class="text-green-400">Healthy</span>
						{/if}
					</p>
				</div>
			</div>

			<div class="flex gap-4">
				<div>
					<span class="text-xs font-medium text-muted-foreground">Pending Updates</span>
					<p class="text-xs">{webhookInfo.pendingUpdateCount}</p>
				</div>
				<div>
					<span class="text-xs font-medium text-muted-foreground">Max Connections</span>
					<p class="text-xs">{webhookInfo.maxConnections ?? "—"}</p>
				</div>
			</div>
		</div>
	{/if}
</div>
