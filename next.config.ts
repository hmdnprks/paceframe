import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let phones on the local network load dev assets (e.g. http://192.168.1.65:3000).
  allowedDevOrigins: ["192.168.1.65", "192.168.*.*", "10.*.*.*", "*.local"],
  cacheComponents: true,
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
