import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EdApex Work",
    short_name: "EdApex",
    description: "EdApex school operations and cowork workspace.",
    id: "/workspace/",
    start_url: "/workspace/",
    scope: "/workspace/",
    display: "standalone",
    orientation: "portrait-primary",
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
    ]
  };
}
