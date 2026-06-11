<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import { useSidebar } from "$lib/components/ui/sidebar/index.js";
	import type { AuthUser } from "$lib/types/auth-types";
	import { UserContext } from "$lib/context/user-context.svelte";
	import ActivityPopover from "$lib/components/activity-popover.svelte";
	import ModelSelector from "$lib/components/model-selector.svelte";

	let {
		user,
	}: {
		user?: AuthUser;
	} = $props();

	const sidebar = useSidebar();
	const userContext = UserContext.fromContext();
</script>

<header
  class="sticky top-0 z-30 w-full shrink-0 border-b border-border/10 bg-background/80 backdrop-blur-xl px-4 py-3 flex items-center justify-between min-w-0 h-14"
>
  <div class="flex flex-1 items-center gap-2 min-w-0">
    <Sidebar.Trigger
      variant="ghost"
      class="h-10 w-10 min-h-10 min-w-10 shrink-0 text-muted-foreground hover:text-foreground"
    />
    <ModelSelector
      class="h-10 rounded-full border-none bg-transparent hover:bg-muted/40 text-muted-foreground hover:text-foreground shrink-0 transition-all data-[state=open]:bg-muted/40"
    />
  </div>

  <div class="flex items-center gap-1 shrink-0">
    <ActivityPopover />
  </div>
</header>
