<script lang="ts">
  import * as Resizable from "$lib/components/ui/resizable";
  import WorkspaceSidebar from "$lib/components/workspace/WorkspaceSidebar.svelte";
  import { useInspector } from "$lib/context/inspector-context.svelte";
  import { cn } from "$lib/utils/shadcn";
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();

  const inspector = useInspector();
  let inspectorPane = $state<{
    isCollapsed: () => boolean;
    isExpanded: () => boolean;
    expand: () => void;
    collapse: () => void;
  } | undefined>(undefined);

  $effect(() => {
    if (!inspectorPane) return;
    if (inspector.inspectorOpen) {
      if (inspectorPane.isCollapsed()) inspectorPane.expand();
    } else {
      if (inspectorPane.isExpanded()) inspectorPane.collapse();
    }
  });
</script>

<Resizable.PaneGroup
  direction="horizontal"
  class="flex flex-1 min-h-0 w-full"
>
  <Resizable.Pane
    defaultSize={inspector.inspectorOpen ? 60 : 100}
    minSize={30}
    class="flex flex-col min-h-0 min-w-0 h-full relative"
  >
    {@render children()}
  </Resizable.Pane>

  <Resizable.Handle
    withHandle
    class={cn(
      "w-4 bg-sidebar border-transparent flex items-center justify-center hover:bg-muted/20 transition-colors z-10",
      !inspector.inspectorOpen && "hidden",
    )}
  />
  <Resizable.Pane
    bind:this={inspectorPane}
    collapsible={true}
    collapsedSize={0}
    defaultSize={inspector.inspectorOpen ? 40 : 0}
    minSize={20}
    maxSize={50}
    class="transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)] overflow-hidden"
    onExpand={() => {
      inspector.inspectorOpen = true;
    }}
    onCollapse={() => {
      inspector.inspectorOpen = false;
    }}
  >
    <WorkspaceSidebar />
  </Resizable.Pane>
</Resizable.PaneGroup>
