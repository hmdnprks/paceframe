import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let phones on the local network load dev assets (e.g. http://192.168.1.65:3000).
  allowedDevOrigins: ["192.168.1.65", "192.168.*.*", "10.*.*.*", "*.local"],
  cacheComponents: true,
  async headers() {
    return [
      {
        // Always fetch a fresh service worker so updates roll out.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
