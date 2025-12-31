<script lang="ts">
  import { cn } from "$lib/utils/shadcn";
  import { mode } from "mode-watcher";
  import { page } from "$app/state";
  import { Streamdown, type StreamdownProps } from "svelte-streamdown";

  type Props = StreamdownProps & {
    class?: string;
  };

  let { class: className, ...restProps }: Props = $props();
  const defaultOrigin = page.url.origin;

  let container: HTMLDivElement;

  $effect(() => {
    if (!container) return;

    // Function to remove target="_blank" from links
    const removeTargets = () => {
      container.querySelectorAll('a[target="_blank"]').forEach((a) => {
        a.removeAttribute("target");
        const href = a.getAttribute("href");
        const hash = href?.includes("#") ? href.split("#")[1] : "";
        a.setAttribute("href", "#" + hash);
      });
    };

    // Initial pass
    removeTargets();

    const observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      for (const m of mutations) {
        if (
          m.addedNodes.length > 0 ||
          (m.type === "attributes" && m.target instanceof HTMLAnchorElement)
        ) {
          shouldScan = true;
          break;
        }
      }

      if (shouldScan) {
        removeTargets();
      }
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["target", "href"],
    });

    return () => observer.disconnect();
  });
</script>

<div
  bind:this={container}
  class={cn(
    "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
    className,
  )}
>
  <Streamdown
    {defaultOrigin}
    class="contents"
    renderHtml={true}
    shikiTheme={mode.current === "dark"
      ? "github-dark-default"
      : "github-light-default"}
    baseTheme="shadcn"
    {...restProps}
  />
</div>
