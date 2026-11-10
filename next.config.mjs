/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  compress: true,
  // Lets instrumentation.ts pre-load popular prices when the server starts.
  experimental: { instrumentationHook: true },
};

export default nextConfig;
