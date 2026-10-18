import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Bills are uploaded through server actions; the per-file limit is enforced
    // again on the server from the admin "maximum upload size" setting.
    serverActions: { bodySizeLimit: "30mb" },
  },
  serverExternalPackages: ["@aws-sdk/client-s3"],
};

export default nextConfig;
