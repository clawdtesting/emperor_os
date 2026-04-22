/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  output: 'standalone',
  experimental: {
    typedRoutes: true
  }
};

export default nextConfig;
