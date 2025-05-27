/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

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
          }
        ]
      }
    ]
  }
};

export default nextConfig;
