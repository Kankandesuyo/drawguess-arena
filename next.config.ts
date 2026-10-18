import type { NextConfig } from 'next';
const config: NextConfig = { poweredByHeader: false, devIndicators: false, ...(process.env.CLOUDFLARE_BUILD==='1'?{output:'export' as const,distDir:'.next-cloudflare'}:{}) };
export default config;

