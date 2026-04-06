import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Next.js API routes to read files from the parent repo's clients/ dir
  serverExternalPackages: ["@google-cloud/secret-manager", "googleapis"],
  allowedDevOrigins: ["10.0.0.236"],
};

export default nextConfig;
