import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `express` and the A2A server SDK are Node-only and boot a loopback HTTP
  // server for the in-process Analyzer agent. Keep them external so Next does
  // not attempt to bundle them into the route handlers.
  serverExternalPackages: ["@a2a-js/sdk", "express"],
};

export default nextConfig;
