<script lang="ts">
  import SharedChatView from "$lib/components/SharedChatView.svelte";
    import { useSidebar } from "$lib/components/ui/sidebar";
  import { useInspector } from "$lib/context/inspector-context.svelte";
  import { useUser } from "$lib/context/user-context.svelte.js";
  import { onMount } from "svelte";

  const userContext = useUser();
  const inspector = useInspector();
  const sidebar = useSidebar();

  onMount(() => {
    inspector.close();
    sidebar.setOpenMobile(false);
  });
</script>

<SharedChatView
  user={userContext.user!}
  messages={[]}
  chatData={undefined}
  examTypeId={null}
/>
