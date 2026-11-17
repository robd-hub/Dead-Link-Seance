import type { NextConfig } from "next";

// Intentionally minimal config. The app is stateless (every request re-fetches
// from Wayback/AI, no database, no cache), so the create-next-app defaults of
// cacheComponents/partialPrefetching are deliberately omitted.
const nextConfig: NextConfig = {};

export default nextConfig;
