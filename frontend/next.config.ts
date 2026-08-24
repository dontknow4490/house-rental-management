import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  // Ensure Next.js dev server can proxy or connect to NestJS backend seamlessly
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:4000/api/:path*",
      },
      {
        source: "/uploads/:path*",
        destination: "http://127.0.0.1:4000/uploads/:path*",
      },
    ];
  },
};

export default nextConfig;
