/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";
import { withSentryConfig } from "@sentry/nextjs";

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
  },
  // Add configuration for Node.js runtime
  serverExternalPackages: ['ldapjs'],
  experimental: {
    serverActions: {
      allowedOrigins: ['*']
    }
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': './src'
    }
    return config
  }
};

const sentryWebpackPluginOptions = {
  silent: true,
  org: "sentry",
  project: "internal",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  url: "http://sentry.htl-braunau.at/",
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  disableLogger: true,
};

export default withSentryConfig(nextConfig, sentryWebpackPluginOptions);
