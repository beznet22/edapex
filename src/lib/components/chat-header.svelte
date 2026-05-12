<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import { useSidebar } from "$lib/components/ui/sidebar/index.js";
  import type { AuthUser } from "$lib/types/auth-types";
  import type { DBChat } from "$lib/server/db/schema";
  import { UserContext } from "$lib/context/user-context.svelte";
  import PanelRightIcon from "@lucide/svelte/icons/panel-right";

  let {
    user,
    chat,
    readonly = false,
    onToggleInspector,
  }: {
    user?: AuthUser;
    chat?: DBChat;
    readonly?: boolean;
    onToggleInspector?: () => void;
  } = $props();

  const sidebar = useSidebar();
  const userContext = UserContext.fromContext();

  import FolderIcon from "@lucide/svelte/icons/folder";
  import LayoutPanelLeftIcon from "@lucide/svelte/icons/layout-panel-left";
</script>

<header
  class="sticky top-0 z-30 w-full shrink-0 border-b border-border/10 bg-background/80 backdrop-blur-xl px-4 py-3 flex items-center justify-between min-w-0 h-14"
>
  <div class="flex flex-1 items-center gap-2 min-w-0">
    <Sidebar.Trigger
      variant="ghost"
      class="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
    />
    <div class="flex items-center gap-2 min-w-0 overflow-hidden">
      <h2 class="text-sm font-semibold tracking-tight text-white/90">Hermes</h2>
      {#if !chat?.title}
        <span class="text-[10px] uppercase tracking-widest text-white/30 font-bold ml-1 hidden sm:inline">New conversation</span>
      {:else}
        <span class="text-xs text-white/40 truncate ml-1">{chat.title}</span>
      {/if}
    </div>
  </div>

  <div class="flex items-center gap-2 shrink-0">
     <Button 
       variant="outline" 
       size="sm" 
       class="h-8 px-3 gap-2 border-white/10 bg-white/5 hover:bg-white/10 text-xs font-medium rounded-lg transition-all group"
       onclick={onToggleInspector}
     >
       <FolderIcon class="size-3.5 opacity-60 group-hover:opacity-100" />
       <span>Files</span>
     </Button>
     <Button variant="ghost" size="icon" class="size-8 rounded-lg text-white/40 hover:text-white">
       <LayoutPanelLeftIcon class="size-4" />
     </Button>
  </div>
</header>
