import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    // Root of at-rest secret encryption (crypto.ts scrypt KDF) AND the NextAuth
    // JWT signing secret — required, so a deployment without it fails at boot
    // rather than when an admin first saves a service password (finding 39).
    NEXTAUTH_SECRET: z.string(),
    // Microsoft Graph app credentials for the support-email sender. Optional so a
    // deployment that does not use support email still boots; declared here so
    // they go through the same validation contract as everything else.
    GRAPH_TENANT_ID: z.string().optional(),
    GRAPH_CLIENT_ID: z.string().optional(),
    GRAPH_CLIENT_SECRET: z.string().optional(),
    GRAPH_MAIL_FROM: z.string().optional(),
    GRAPH_MAIL_TO: z.string().optional(),
    // Photo cache TTL / source-priority knobs, read by the photo-source libs.
    ENTRA_STUDENT_PHOTO_CACHE_TTL_HOURS: z.string().optional(),
    ENTRA_TEACHER_PHOTO_CACHE_TTL_HOURS: z.string().optional(),
    ENTRA_STUDENT_PHOTO_SOURCE_PRIORITY: z.string().optional(),
    ENTRA_TEACHER_PHOTO_SOURCE_PRIORITY: z.string().optional(),
    // Entra is the only identity provider and the only directory source, so
    // these are required rather than optional: a deployment missing them can
    // neither log anyone in nor sync, and failing at boot beats failing at the
    // login page.
    ENTRA_TENANT_ID: z.string(),
    ENTRA_CLIENT_ID: z.string(),
    ENTRA_CLIENT_SECRET: z.string(),
    ENTRA_TEACHER_GROUP_ID: z.string().optional(),
    ENTRA_SYNC_CLASS_GROUP_IDS: z.string().optional(),
    ENTRA_SUPER_ADMIN_OBJECT_ID: z.string().optional(),
    ENTRA_SYNC_ENABLED: z.string().optional(),
    SYNC_TRIGGER_SECRET: z.string().optional(),
    SYNC_MAX_DEACTIVATION_RATIO: z.string().optional(),
    GITHUB_TOKEN: z.string().optional(),
    NOTENMANAGEMENT_BASE_URL: z.string().url(),
    LICENSE_SERVER_URL: z.string().url().optional(),
    LICENSE_KEY: z.string().optional(),
    DISABLE_ENTITLEMENTS: z.string().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_APP_VERSION: z.string().optional(),
    NEXT_PUBLIC_BUILD_DATE: z.string().optional(),
    NEXT_PUBLIC_ENTRA_TEACHER_GROUP_ID: z.string().optional(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    GRAPH_TENANT_ID: process.env.GRAPH_TENANT_ID,
    GRAPH_CLIENT_ID: process.env.GRAPH_CLIENT_ID,
    GRAPH_CLIENT_SECRET: process.env.GRAPH_CLIENT_SECRET,
    GRAPH_MAIL_FROM: process.env.GRAPH_MAIL_FROM,
    GRAPH_MAIL_TO: process.env.GRAPH_MAIL_TO,
    ENTRA_STUDENT_PHOTO_CACHE_TTL_HOURS: process.env.ENTRA_STUDENT_PHOTO_CACHE_TTL_HOURS,
    ENTRA_TEACHER_PHOTO_CACHE_TTL_HOURS: process.env.ENTRA_TEACHER_PHOTO_CACHE_TTL_HOURS,
    ENTRA_STUDENT_PHOTO_SOURCE_PRIORITY: process.env.ENTRA_STUDENT_PHOTO_SOURCE_PRIORITY,
    ENTRA_TEACHER_PHOTO_SOURCE_PRIORITY: process.env.ENTRA_TEACHER_PHOTO_SOURCE_PRIORITY,
    ENTRA_TENANT_ID: process.env.ENTRA_TENANT_ID,
    ENTRA_CLIENT_ID: process.env.ENTRA_CLIENT_ID,
    ENTRA_CLIENT_SECRET: process.env.ENTRA_CLIENT_SECRET,
    ENTRA_TEACHER_GROUP_ID: process.env.ENTRA_TEACHER_GROUP_ID,
    ENTRA_SYNC_CLASS_GROUP_IDS: process.env.ENTRA_SYNC_CLASS_GROUP_IDS,
    ENTRA_SUPER_ADMIN_OBJECT_ID: process.env.ENTRA_SUPER_ADMIN_OBJECT_ID,
    ENTRA_SYNC_ENABLED: process.env.ENTRA_SYNC_ENABLED,
    SYNC_TRIGGER_SECRET: process.env.SYNC_TRIGGER_SECRET,
    SYNC_MAX_DEACTIVATION_RATIO: process.env.SYNC_MAX_DEACTIVATION_RATIO,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    NOTENMANAGEMENT_BASE_URL: process.env.NOTENMANAGEMENT_BASE_URL,
    LICENSE_SERVER_URL: process.env.LICENSE_SERVER_URL,
    LICENSE_KEY: process.env.LICENSE_KEY,
    DISABLE_ENTITLEMENTS: process.env.DISABLE_ENTITLEMENTS,
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION,
    NEXT_PUBLIC_BUILD_DATE: process.env.NEXT_PUBLIC_BUILD_DATE,
    NEXT_PUBLIC_ENTRA_TEACHER_GROUP_ID: process.env.NEXT_PUBLIC_ENTRA_TEACHER_GROUP_ID,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
})
