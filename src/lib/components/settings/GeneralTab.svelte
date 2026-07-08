<script lang="ts">
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
	import { page } from "$app/state";
</script>

<div class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
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
</div>
