import { NextResponse } from "next/server";

/**
 * The workspace is installable but not phone-shaped: it adapts from 320px to
 * 1920px, so the manifest deliberately omits `orientation` and declares no
 * narrow-only display mode. Locking orientation to portrait would contradict the
 * responsive contract in spec 15.
 */
const manifest = {
  name: "EdApex Work",
  short_name: "EdApex",
  description: "EdApex school operations and cowork workspace.",
  id: "/workspace",
  start_url: "/workspace",
  scope: "/workspace",
  display: "standalone",
  display_override: ["window-controls-overlay", "standalone"],
  background_color: "#161a24",
  theme_color: "#161a24",
  categories: ["education", "productivity"],
  icons: [
    {
      src: "/workspace/icons/icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any"
    },
    {
      src: "/workspace/icons/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any"
    },
    {
      src: "/workspace/icons/maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable"
    }
  ],
  shortcuts: [
    {
      name: "Chat",
      short_name: "Chat",
      url: "/workspace",
      icons: [{ src: "/workspace/icons/icon-192.png", sizes: "192x192" }]
    },
    {
      name: "Tasks",
      short_name: "Tasks",
      url: "/workspace/tasks",
      icons: [{ src: "/workspace/icons/icon-192.png", sizes: "192x192" }]
    },
    {
      name: "Make",
      short_name: "Make",
      url: "/workspace/make",
      icons: [{ src: "/workspace/icons/icon-192.png", sizes: "192x192" }]
    }
  ]
} as const;

export function GET(): NextResponse {
  return NextResponse.json(manifest, {
    headers: {
      "cache-control": "public, max-age=3600",
      "content-type": "application/manifest+json"
    }
  });
}
