import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";

import "./globals.css";

import { resolveDarkClass, readThemeCookies } from "@/lib/theme";

export const metadata: Metadata = {
  title: {
    default: "EdApex",
    template: "%s · EdApex"
  },
  description: "EdApex school operations and cowork workspace.",
  applicationName: "EdApex",
  icons: {
    icon: "/favicon.svg",
    apple: "/workspace/icons/apple-touch-icon.png"
  },
  appleWebApp: {
    capable: true,
    title: "EdApex",
    statusBarStyle: "black-translucent"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfd" },
    { media: "(prefers-color-scheme: dark)", color: "#161a24" }
  ]
};

/**
 * The theme class is resolved on the server from the cookie, so the first paint
 * already carries the right palette. Reading it in an inline script would paint
 * before the script runs and flash the wrong theme.
 */
export default async function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const preference = readThemeCookies(cookieStore.toString());
  const dark = resolveDarkClass(preference.mode, false);

  return (
    <html
      className={dark ? "dark" : undefined}
      data-accent={preference.accent}
      data-theme-mode={preference.mode}
      lang="en"
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
