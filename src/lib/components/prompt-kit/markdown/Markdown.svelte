<script lang="ts">
  import { Streamdown, type StreamdownProps } from "svelte-streamdown";
  import { cn } from "$lib/utils/shadcn";
  import { mode } from "mode-watcher";
  import { page } from "$app/state";

  type Props = StreamdownProps & {
    class?: string;
  };

  let { class: className, ...restProps }: Props = $props();
  const defaultOrigin = page.url.origin;
</script>

<Streamdown
  {defaultOrigin}
  class={cn(
    "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
    className,
  )}
  renderHtml={true}
  shikiTheme={mode.current === "dark"
    ? "github-dark-default"
    : "github-light-default"}
  shikiPreloadThemes={["github-dark-default", "github-light-default"]}
  baseTheme="shadcn"
  {...restProps}
>
  {#snippet mdx({ token, props, children })}
    {#if token.tagName === "Link"}
      {@const { active, label, ...attr } = props}
      <a {...attr}>{@render children()} </a>
    {:else}
      {@render children()}
    {/if}
  {/snippet}
</Streamdown>
