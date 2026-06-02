<script lang="ts">
  import type { PageData } from "./$types.js";
  import SharedChatView from "$lib/components/SharedChatView.svelte";
  let { data }: { data: PageData } = $props();
</script>

<SharedChatView
  user={data.user}
  messages={[]}
  chatData={undefined}
/>
