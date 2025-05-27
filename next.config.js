/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const nextConfig = {
  // Allow development origins - must be exact matches
  allowedDevOrigins: [
    'http://10.10.10.6:3000',
    'http://10.10.10.6',
    'http://10.10.10.5:3000',
    'http://10.10.10.5'
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
          }
        ]
      }
    ]
  }
};

export default nextConfig;
