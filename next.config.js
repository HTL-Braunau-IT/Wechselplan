/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const nextConfig = {
  // Allow development origins
  allowedDevOrigins: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://10.10.10.6:3000',  // Your specific development IP
    'http://10.10.10.6',
    'http://10.10.10.5:3000',  // Your specific development IP
    'http://10.10.10.5'        // Your specific development IP without port
  ],
  // Enable CORS for development
  async headers() {
    return [
      {
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
            value: 'X-Requested-With, Content-Type, Authorization'
          }
        ]
      }
    ]
  }
};

export default nextConfig;
