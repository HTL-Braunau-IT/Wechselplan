/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import path from 'path'
import { fileURLToPath } from 'url'
import './src/env.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import("next").NextConfig} */
const nextConfig = {
  // Emit `.next/standalone`: a self-contained server with only the modules the
  // build actually traced. The production image copies that instead of the
  // whole `node_modules` tree, which is the difference between a ~350 MB and a
  // ~1.5 GB image.
  output: 'standalone',
  // Tracing misses files that are only ever read at runtime through a computed
  // path, so name them explicitly.
  outputFileTracingIncludes: {
    '/api/export/notenliste': ['./src/app/templates/excel/**'],
    // Every route that renders a PDF reads the IBM Plex Sans TTFs off disk.
    '/api/export': ['./src/lib/pdf/fonts/**'],
    '/api/export/schedule-dates': ['./src/lib/pdf/fonts/**'],
    '/api/notensammler/pdf': ['./src/lib/pdf/fonts/**'],
    '/api/notensammler/pdf/all': ['./src/lib/pdf/fonts/**'],
  },
  // `next build` re-runs eslint and tsc, which the CI `verify` job has already
  // done — and the `image` job depends on `verify`, so a build that gets this
  // far is by construction type-clean. Skipping the second pass takes a couple
  // of minutes off every image build. Locally, `npm run check` is the gate.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // Allow development origins - using the format from Next.js documentation
  allowedDevOrigins: ['10.10.10.6', '10.10.10.5', '*.10.10.10.6', '*.10.10.10.5'],
  // Enable CORS for development
  async headers() {
    return [
      {
        // Handle all routes including Next.js internal routes
        source: '/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: '*',
          },
          {
            key: 'Document-Policy',
            value: 'js-profiling',
          },
        ],
      },
    ]
  },
  experimental: {
    useLightningcss: false,
    serverActions: {
      allowedOrigins: ['*'],
    },
  },
  webpack: config => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, 'src'),
    }
    return config
  },
}

export default nextConfig
