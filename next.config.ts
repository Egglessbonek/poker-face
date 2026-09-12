import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the landing preview to coexist with the existing server on port 3000.
  distDir: process.env.PORT === "3001" ? "build/port-3001" : ".next",
};

export default nextConfig;
