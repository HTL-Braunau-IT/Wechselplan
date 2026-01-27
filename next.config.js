/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import "./src/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
const nextConfig = {
  // Allow development origins - using the format from Next.js documentation
  allowedDevOrigins: [
    '10.10.10.6',
    '10.10.10.5',
    '*.10.10.10.6',
    '*.10.10.10.5'
  ],
  // Enable CORS for development
  async headers() {
    return [
      {
        // Handle all routes including Next.js internal routes
        source: '/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*'
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS'
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: '*'
          },
          {
            key: 'Document-Policy',
            value: 'js-profiling'
          }
        ]
      }
    ]
  },
  // Add configuration for Node.js runtime
  serverExternalPackages: ['ldapjs'],
  experimental: {
    useLightningcss: false,
    serverActions: {
      allowedOrigins: ['*']
    }
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, 'src')
    }
    return config
  }
};

export default nextConfig;
