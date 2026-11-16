"use client"

import type * as React from "react"
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/**
 * Toasts, themed from the token sheet.
 *
 * The registry version reads the theme from `next-themes` — a Next-oriented dependency
 * inside a package the Android app imports, and one that duplicates a decision the tokens
 * already make in CSS (`.dark` on `<html>` selects the palette). The theme is a prop
 * instead, defaulting to `system`; an app that supports an explicit override passes the
 * resolved value.
 */
interface ToasterStyle extends React.CSSProperties {
  "--normal-bg"?: string
  "--normal-text"?: string
  "--normal-border"?: string
  "--border-radius"?: string
}

const toasterStyle: ToasterStyle = {
  "--normal-bg": "var(--popover)",
  "--normal-text": "var(--popover-foreground)",
  "--normal-border": "var(--border)",
  "--border-radius": "var(--radius)",
}

const Toaster = ({ theme = "system", ...props }: ToasterProps) => (
  <Sonner
    theme={theme}
    className="toaster group"
    icons={{
      success: <CircleCheckIcon className="size-4" />,
      info: <InfoIcon className="size-4" />,
      warning: <TriangleAlertIcon className="size-4" />,
      error: <OctagonXIcon className="size-4" />,
      loading: <Loader2Icon className="size-4 animate-spin" />,
    }}
    style={toasterStyle}
    {...props}
  />
)

export { Toaster }
