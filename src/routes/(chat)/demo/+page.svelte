<script lang="ts">
  import { page } from "$app/state";
  import { mode } from "mode-watcher";
  import { onMount } from "svelte";
  import { Streamdown } from "svelte-streamdown";

  let content = `
# Using MDX Components

<Card title="Hello" count={42}>
This is **markdown content** inside a component!
</Card>

[John Doe](#eyJzdHVkZW5...>)
`;

  onMount(() => {
    container
      .querySelectorAll("a")
      .forEach((link) => link.removeAttribute("target"));
  });

  const defaultOrigin = page.url.href;
  let container: HTMLDivElement;
</script>

<div bind:this={container}>
  <Streamdown {defaultOrigin} {content} />
</div>
