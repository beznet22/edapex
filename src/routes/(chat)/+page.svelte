<script lang="ts">
  import SharedChatView from "$lib/components/SharedChatView.svelte";
  import { useUser } from "$lib/context/user-context.svelte.js";
  const userContext = useUser();
</script>

<SharedChatView
  user={userContext.user!}
  messages={[]}
  chatData={undefined}
  examTypeId={null}
/>
