<script lang="ts">
  import ChatView from "./ChatView.svelte";
  let { data } = $props();
</script>

{#key data.chat?.id}
  <ChatView {data} />
{/key}
