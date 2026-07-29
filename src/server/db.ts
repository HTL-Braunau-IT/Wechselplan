/**
 * Historically this file constructed its own PrismaClient, as did
 * `src/lib/db.ts`, while `src/lib/prisma.ts` constructed a third. All three
 * cached onto `globalThis.prisma`, so in development they clobbered each other
 * and a caller could end up holding a client without the active-by-default
 * extension.
 *
 * There is now a single client. This module remains as the `db` alias that
 * tRPC's context expects.
 */
export { prisma as db } from '@/lib/prisma'
