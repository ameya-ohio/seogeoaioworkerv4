/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["mongodb"],
  experimental: {
    // Content-plan workbooks are uploaded through a server action, not an API
    // route, so the action body limit is what bounds an import.
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
