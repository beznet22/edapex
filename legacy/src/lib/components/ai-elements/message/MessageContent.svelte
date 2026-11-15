<script lang="ts">
  import { cn } from "$lib/utils/shadcn.js";
  import { tv, type VariantProps } from "tailwind-variants";
  import type { HTMLAttributes } from "svelte/elements";

  const messageContentVariants = tv({
    base: "flex flex-col gap-2 overflow-hidden text-sm",
    variants: {
      variant: {
        contained: [
          "max-w-[80%] rounded-[2rem] px-5 py-4 shadow-sm",
          "group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground",
          "group-[.is-assistant]:bg-secondary group-[.is-assistant]:text-foreground",
        ],
        flat: [
          "group-[.is-user]:bg-secondary group-[.is-user]:text-foreground group-[.is-user]:max-w-[80%] group-[.is-user]:rounded-[2rem] group-[.is-user]:px-5 group-[.is-user]:py-4",
          "group-[.is-assistant]:text-foreground",
        ],
      },
    },
    defaultVariants: {
      variant: "contained",
    },
  });

  type MessageContentProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof messageContentVariants>;

  let { class: className = "", variant, children, ...restProps }: MessageContentProps = $props();

  let id = $props.id();
</script>

<div class={cn(messageContentVariants({ variant }), className)} data-content-id={id} {...restProps}>
  {@render children?.()}
</div>
