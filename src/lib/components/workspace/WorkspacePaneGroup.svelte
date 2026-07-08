<script lang="ts">
  import * as Resizable from "$lib/components/ui/resizable";
  import WorkspaceSidebar from "$lib/components/workspace/WorkspaceSidebar.svelte";
  import { useInspector } from "$lib/context/inspector-context.svelte";
  import { useSidebar } from "$lib/components/ui/sidebar/index.js";
  import { cn } from "$lib/utils/shadcn";
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();

  const inspector = useInspector();
  const sidebar = useSidebar();
  let inspectorPane = $state<{
    isCollapsed: () => boolean;
    isExpanded: () => boolean;
    expand: () => void;
    collapse: () => void;
    resize: (size: number) => void;
  } | undefined>(undefined);

  $effect(() => {
    if (!inspectorPane) return;
    if (inspector.inspectorOpen) {
      if (inspectorPane.isCollapsed()) inspectorPane.expand();
    } else {
      if (inspectorPane.isExpanded()) inspectorPane.collapse();
    }
  });

  // When the workspace pane expands, close the left sidebar to reduce
  // distraction and give the editor/inspector more horizontal room.
  // The sidebar state is owned by (chat)/+layout.svelte's <Sidebar.Provider>;
  // useSidebar() here reads/writes through that same provider.
  function handleInspectorExpand() {
    inspector.inspectorOpen = true;
    if (sidebar.open) sidebar.setOpen(false);
  }
  function handleInspectorCollapse() {
    inspector.inspectorOpen = false;
  }

  // Snap-to-100 behavior: when the user drags the handle past 85% going UP
  // (crossing the threshold from <=85% to >85%), snap the pane to 100%.
  // Tracking the previous size ensures we only snap on the upward crossing —
  // dragging back DOWN through 85% is left alone so the user can shrink the
  // pane freely after a snap. The inspectorPane ref exposes paneforge's
  // imperative `resize(size)` method which we call to perform the snap.
  let lastInspectorSize = $state(inspector.inspectorOpen ? 80 : 0);
  function handleInspectorResize(size: number) {
    if (size > 85 && lastInspectorSize <= 85 && inspectorPane) {
      inspectorPane.resize(100);
    }
    lastInspectorSize = size;
  }
</script>

<Resizable.PaneGroup
  direction="horizontal"
  class="flex flex-1 min-h-0 w-full"
>
  <Resizable.Pane
    defaultSize={inspector.inspectorOpen ? 30 : 100}
    minSize={0}
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
    defaultSize={inspector.inspectorOpen ? 80 : 0}
    minSize={20}
    maxSize={100}
    class="transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)] overflow-hidden"
    onExpand={handleInspectorExpand}
    onCollapse={handleInspectorCollapse}
  >
    <WorkspaceSidebar />
  </Resizable.Pane>
</Resizable.PaneGroup>
