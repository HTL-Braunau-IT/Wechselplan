/**
 * Guard against a directory sync mass-deactivating people.
 *
 * A Graph call that returns an empty or truncated group is indistinguishable
 * from "everybody left the school", and apply runs with no selection deactivate
 * whatever the diff says. On the unattended nightly path nobody reviews the
 * preview first, so the run refuses instead.
 */

export const DEFAULT_MAX_DEACTIVATION_RATIO = 0.2

export class MassDeactivationError extends Error {
  readonly scope: string
  readonly deactivating: number
  readonly activeBefore: number
  readonly ratio: number
  readonly limit: number

  constructor(params: {
    scope: string
    deactivating: number
    activeBefore: number
    ratio: number
    limit: number
  }) {
    super(
      `Refusing to deactivate ${params.deactivating} of ${params.activeBefore} active ${params.scope} ` +
        `(${(params.ratio * 100).toFixed(1)}%, limit ${(params.limit * 100).toFixed(1)}%). ` +
        `Review the sync preview and apply manually if this is expected.`,
    )
    this.name = 'MassDeactivationError'
    this.scope = params.scope
    this.deactivating = params.deactivating
    this.activeBefore = params.activeBefore
    this.ratio = params.ratio
    this.limit = params.limit
  }
}

/**
 * Reads the configured limit, falling back to
 * {@link DEFAULT_MAX_DEACTIVATION_RATIO}. An unparseable or out-of-range value
 * falls back rather than disabling the guard.
 */
export function resolveMaxDeactivationRatio(): number {
  const raw = process.env.SYNC_MAX_DEACTIVATION_RATIO?.trim()
  if (!raw) return DEFAULT_MAX_DEACTIVATION_RATIO

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return DEFAULT_MAX_DEACTIVATION_RATIO
  }
  return parsed
}

/**
 * Throws {@link MassDeactivationError} when the deactivation count crosses the
 * limit. A limit of `null` disables the check; deactivating everything when
 * nothing was active is a no-op and always passes.
 */
export function assertDeactivationWithinLimit(params: {
  scope: string
  deactivating: number
  activeBefore: number
  limit: number | null
}): void {
  const { scope, deactivating, activeBefore, limit } = params
  if (limit === null) return
  if (deactivating === 0 || activeBefore === 0) return

  const ratio = deactivating / activeBefore
  if (ratio <= limit) return

  throw new MassDeactivationError({ scope, deactivating, activeBefore, ratio, limit })
}
