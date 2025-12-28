import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@sql-ops/shared'],
};

export default nextConfig;
