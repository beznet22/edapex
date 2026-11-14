import type { NextConfig } from "next";

const isDesktopBuild = process.env.EDAPEX_DESKTOP_BUILD === "1";
const isDevelopment = process.env.NODE_ENV !== "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  isDevelopment
    ? "connect-src 'self' ws://localhost:5181 ws://127.0.0.1:5181 http://localhost:5181 https://api.llacademy.ng https://openrouter.ai"
    : "connect-src 'self' https://api.llacademy.ng https://openrouter.ai",
  "img-src 'self' data: blob:",
  isDevelopment
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "style-src-elem 'self' 'unsafe-inline'",
  "style-src-attr 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self' https://api.llacademy.ng"
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  trailingSlash: isDesktopBuild,
  ...(isDesktopBuild ? { output: "export" } : {}),
  images: {
    unoptimized: true
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()"
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains"
          }
        ]
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "Service-Worker-Allowed", value: "/workspace" }
        ]
      },
      {
        source: "/workspace/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600" }]
      }
    ];
  }
};

export default nextConfig;
