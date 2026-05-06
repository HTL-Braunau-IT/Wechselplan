import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    LDAP_URL: z.string().url(),
    LDAP_BASE_DN: z.string(),
    LDAP_USERNAME: z.string(),
    LDAP_PASSWORD: z.string(),
    LDAP_STUDENTS_OU: z.string(),
    LDAP_TEACHERS_OU: z.string(),
    LDAP_STUDENT_GROUPS: z.string().optional(),
    LDAP_TEACHER_GROUPS: z.string().optional(),
    AUTH_LDAP_ENABLED: z.string().optional(),
    AUTH_MS_ENABLED: z.string().optional(),
    ENTRA_TENANT_ID: z.string().optional(),
    ENTRA_CLIENT_ID: z.string().optional(),
    ENTRA_CLIENT_SECRET: z.string().optional(),
    ENTRA_TEACHER_GROUP_ID: z.string().optional(),
    ENTRA_SYNC_CLASS_GROUP_IDS: z.string().optional(),
    ENTRA_SUPER_ADMIN_OBJECT_ID: z.string().optional(),
    ENTRA_SYNC_MODE: z.enum(['hybrid', 'nightly_only']).optional(),
    ENTRA_SYNC_ENABLED: z.string().optional(),
    AZURE_AD_CLIENT_ID: z.string().optional(),
    AZURE_AD_CLIENT_SECRET: z.string().optional(),
    AZURE_AD_TENANT_ID: z.string().optional(),
    MS_STUDENT_GROUPS: z.string().optional(),
    MS_TEACHER_GROUPS: z.string().optional(),
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
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    LDAP_URL: process.env.LDAP_URL,
    LDAP_BASE_DN: process.env.LDAP_BASE_DN,
    LDAP_USERNAME: process.env.LDAP_USERNAME,
    LDAP_PASSWORD: process.env.LDAP_PASSWORD,
    LDAP_STUDENTS_OU: process.env.LDAP_STUDENTS_OU,
    LDAP_TEACHERS_OU: process.env.LDAP_TEACHERS_OU,
    LDAP_STUDENT_GROUPS: process.env.LDAP_STUDENT_GROUPS,
    LDAP_TEACHER_GROUPS: process.env.LDAP_TEACHER_GROUPS,
    AUTH_LDAP_ENABLED: process.env.AUTH_LDAP_ENABLED,
    AUTH_MS_ENABLED: process.env.AUTH_MS_ENABLED,
    ENTRA_TENANT_ID: process.env.ENTRA_TENANT_ID,
    ENTRA_CLIENT_ID: process.env.ENTRA_CLIENT_ID,
    ENTRA_CLIENT_SECRET: process.env.ENTRA_CLIENT_SECRET,
    ENTRA_TEACHER_GROUP_ID: process.env.ENTRA_TEACHER_GROUP_ID,
    ENTRA_SYNC_CLASS_GROUP_IDS: process.env.ENTRA_SYNC_CLASS_GROUP_IDS,
    ENTRA_SUPER_ADMIN_OBJECT_ID: process.env.ENTRA_SUPER_ADMIN_OBJECT_ID,
    ENTRA_SYNC_MODE: process.env.ENTRA_SYNC_MODE,
    ENTRA_SYNC_ENABLED: process.env.ENTRA_SYNC_ENABLED,
    AZURE_AD_CLIENT_ID: process.env.AZURE_AD_CLIENT_ID,
    AZURE_AD_CLIENT_SECRET: process.env.AZURE_AD_CLIENT_SECRET,
    AZURE_AD_TENANT_ID: process.env.AZURE_AD_TENANT_ID,
    MS_STUDENT_GROUPS: process.env.MS_STUDENT_GROUPS,
    MS_TEACHER_GROUPS: process.env.MS_TEACHER_GROUPS,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    NOTENMANAGEMENT_BASE_URL: process.env.NOTENMANAGEMENT_BASE_URL,
    LICENSE_SERVER_URL: process.env.LICENSE_SERVER_URL,
    LICENSE_KEY: process.env.LICENSE_KEY,
    DISABLE_ENTITLEMENTS: process.env.DISABLE_ENTITLEMENTS,
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION,
    NEXT_PUBLIC_BUILD_DATE: process.env.NEXT_PUBLIC_BUILD_DATE,
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
});
