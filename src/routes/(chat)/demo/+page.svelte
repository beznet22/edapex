<script lang="ts">
  import { page } from "$app/state";
  import { Streamdown } from "svelte-streamdown";

  let content = `
# Using MDX Components
<Card title="Hello" count={42}>
This is **markdown content** inside a component!
</Card>
<Link href="#eyJzdHVkZW5...">John Doe</Link>
`;

  const defaultOrigin = page.url.href;
</script>

<Streamdown {defaultOrigin} {content}>
  {#snippet mdx({ token, props, children })}
    {#if token.tagName === "Link"}
      {@const { active, ...attr } = props}
      <a {...attr}>{@render children()} </a>
    {:else}
      {@render children()}
    {/if}
  {/snippet}
</Streamdown>
