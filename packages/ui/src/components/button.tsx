import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { cn } from "@edapex/ui/lib/utils"

/**
 * Registry `button`, modified by token rather than forked.
 *
 * Four deviations, each fixing something measurable — the API, the `data-*` attributes and
 * the `radix-ui` composition are untouched:
 *
 * - **`sm` was `h-8` (32px)**, under the 44pt iOS / 48dp Android minimum. Now 36px with an
 *   expanded hit area (`after:-inset-1`), so it measures ~44px to a finger without looking
 *   oversized beside a 44px icon button.
 * - **Corners from the radius ladder**, so a button nested in a card does not carry the
 *   card's own corner radius.
 * - **`transition-all` became `transition-colors`**: `all` animates layout properties too,
 *   which makes a size change during a re-render visibly stutter.
 * - **Focus ring at `ring-2` with an offset**: the registry's `ring-[3px]` is an arbitrary
 *   value, and without the offset a ring drawn on `--card` disappears into the card on both
 *   themes.
 */
const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium outline-none",
    "rounded-md transition-colors",
    "after:absolute after:-inset-1 after:content-['']",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    "aria-invalid:border-destructive",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-border bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline"
      },
      size: {
        default: "h-10 px-4 text-body",
        xs: "h-7 gap-1 px-2 text-label [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 px-3 text-label",
        lg: "h-11 px-6 text-body",
        icon: "size-10",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9",
        "icon-lg": "size-11"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
