import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Three changes from the shadcn default, each fixing something measurable:
 *
 * - **`sm` was `h-8` (32px)**, under the 44pt iOS / 48dp Android minimum. Now 36px with
 *   an expanded hit area (`after:-inset-1`), so a compact button measures ~44px to a
 *   finger without looking oversized beside a 44px icon button.
 * - **Corners from the radius ladder**, so a button nested in a card does not carry the
 *   card's own corner radius.
 * - **`transition-all` became `transition-colors`**: `all` animates layout properties
 *   too, which makes a size change during a re-render visibly stutter.
 *
 * The focus ring has an offset — without it a ring drawn on `--card` disappears into the
 * card's own colour on both themes.
 */
const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium outline-none",
    "rounded-[var(--radius-md)] transition-colors",
    "after:absolute after:-inset-1 after:content-['']",
    "disabled:pointer-events-none disabled:opacity-50",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border border-border bg-background hover:bg-accent",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90"
      },
      size: {
        default: "h-10 px-4 text-sm",
        sm: "h-9 px-3 text-[13px]",
        lg: "h-11 px-6 text-sm",
        icon: "size-10",
        "icon-sm": "size-9"
      }
    },
    defaultVariants: { variant: "default", size: "default" }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  readonly asChild?: boolean;
}

/**
 * `forwardRef` rather than a plain function.
 *
 * A native `<button>` accepts a ref, so a wrapper that drops it is a *silent* downgrade:
 * composition still works until something composes focus or measurement — shadcn's
 * sidebar does exactly that, and the failure is a type error far from the cause.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, ...props },
  ref
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  );
});
Button.displayName = "Button";

export { Button, buttonVariants };
