/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@campus-stranger/shared-types', '@campus-stranger/crypto'],
  poweredByHeader: false,
};

export default nextConfig;
