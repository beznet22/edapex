<script lang="ts">
  import type { PageData } from "./$types.js";
  import type { AuthUser } from "$lib/types/auth-types";
  import SharedChatView from "$lib/components/SharedChatView.svelte";
  let { data }: { data: PageData } = $props();
</script>

<SharedChatView
  user={data.user as AuthUser}
  messages={[]}
  chatData={undefined}
  examTypeId={null}
/>
