import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Bills are uploaded through server actions; the per-file limit is enforced
    // again on the server from the admin "maximum upload size" setting.
    serverActions: { bodySizeLimit: "30mb" },
    // Client router cache: pages fetched in the last 30 s (visited) / 60 s
    // (prefetched on hover) open instantly. Saving data clears it right away.
    staleTimes: { dynamic: 30, static: 60 },
  },
  serverExternalPackages: ["@aws-sdk/client-s3"],
  // Master lists moved into the Master Data section; keep old bookmarks working.
  async redirects() {
    return [
      { source: "/admin/suppliers", destination: "/masters/suppliers", permanent: true },
      { source: "/ecommerce/stores", destination: "/masters/stores", permanent: true },
    ];
  },
};

export default nextConfig;
