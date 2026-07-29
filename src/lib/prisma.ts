import { PrismaClient, type Prisma } from '@prisma/client';

/**
 * Models that are soft-deleted by directory sync rather than removed.
 *
 * Entra sync sets `isActive = false` instead of deleting, so without a default
 * filter every list in the app would keep showing people who left the school.
 */
const SOFT_DELETED_MODELS = new Set(['Student', 'Teacher', 'Class']);

/**
 * Read operations that accept a `where` and should therefore default to active
 * rows only. `findUnique` is deliberately absent: looking a record up by its
 * primary key is an explicit request for that row, and historical views resolve
 * people that way.
 *
 * Scope note: Prisma query extensions intercept top-level model operations
 * only. A nested read such as
 * `class.findUnique({ include: { students: true } })` is *not* filtered, so any
 * nested relation that must exclude departed people needs its own
 * `where: { isActive: true }`. This is deliberate — it keeps historical views
 * (past schedules, past grade sheets) intact by default.
 */
const FILTERED_OPERATIONS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);

/**
 * Opt out of the default active-only filter.
 *
 * Pass as `where: { isActive: ANY_ACTIVE_STATE }` from code that legitimately
 * needs deactivated rows: the sync engine (which must see inactive rows to
 * reactivate them), the admin data tables (which render an active/inactive
 * badge), and historical reporting.
 *
 * It is an empty filter, so it constrains nothing at the SQL level. Its only
 * job is to make `where.isActive` defined, which is the signal the extension
 * below uses to keep its hands off.
 */
export const ANY_ACTIVE_STATE: Prisma.BoolFilter = { not: undefined };

/**
 * Decides whether a query should have `isActive: true` injected.
 *
 * Exported so the policy is unit-testable without a database connection.
 */
export function shouldDefaultToActive(
  model: string | undefined,
  operation: string,
  where: Record<string, unknown> | undefined,
): boolean {
  if (!model || !SOFT_DELETED_MODELS.has(model)) return false;
  if (!FILTERED_OPERATIONS.has(operation)) return false;
  // An explicit `isActive` in the caller's where always wins, which is what
  // makes ANY_ACTIVE_STATE work as an opt-out.
  return where?.isActive === undefined;
}

function createPrismaClient() {
  return new PrismaClient().$extends({
    name: 'active-by-default',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          const typedArgs = args as { where?: Record<string, unknown> };
          if (!shouldDefaultToActive(model, operation, typedArgs.where)) {
            return query(args);
          }

          return query({
            ...args,
            where: { ...typedArgs.where, isActive: true },
          } as typeof args);
        },
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as { prisma: ExtendedPrismaClient | undefined };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
