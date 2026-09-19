/**
 * The four-way percentage split the Noten grid uses to combine the assessment
 * categories into one grade. The four values must sum to 100.
 */
export type WeightConfig = {
  weightWiederholung: number
  weightBericht: number
  weightMitarbeit: number
  weightPraktischeArbeit: number
}

/** The keys of the four weight fields, in display order. */
export const WEIGHT_KEYS: Array<keyof WeightConfig> = [
  'weightWiederholung',
  'weightBericht',
  'weightMitarbeit',
  'weightPraktischeArbeit',
]

/** The ultimate fallback when a teacher has set no weights at any level. */
export const DEFAULT_WEIGHTS: WeightConfig = {
  weightWiederholung: 25,
  weightBericht: 25,
  weightMitarbeit: 25,
  weightPraktischeArbeit: 25,
}

/** The three levels weights can be set at, most specific first. */
export type WeightLevel = 'group' | 'class' | 'global'

/**
 * The override chain, per teacher: a group's own weights win, else the class
 * default, else the teacher's global default, else 25/25/25/25. A level is
 * `null` when the teacher never set it (or cleared it back to inheriting).
 *
 * This is the single source of truth for how weights resolve — every reader
 * (the Noten data API, the transfer prefill, and the client hook) calls it, so
 * they can never diverge.
 */
export function resolveWeights(levels: {
  group?: WeightConfig | null
  class?: WeightConfig | null
  global?: WeightConfig | null
}): WeightConfig {
  return levels.group ?? levels.class ?? levels.global ?? DEFAULT_WEIGHTS
}

/**
 * The value a level inherits when it has no override of its own — i.e. what a
 * newly-enabled override at that level should be seeded with, and what the UI
 * shows greyed out while the override is off. Group inherits from class →
 * global → default; class from global → default; global has nothing above it.
 */
export function inheritedWeights(
  level: WeightLevel,
  levels: { class?: WeightConfig | null; global?: WeightConfig | null },
): WeightConfig {
  if (level === 'group') return levels.class ?? levels.global ?? DEFAULT_WEIGHTS
  if (level === 'class') return levels.global ?? DEFAULT_WEIGHTS
  return DEFAULT_WEIGHTS
}

/** The sum of the four weights (100 when valid). */
export function weightSum(w: WeightConfig): number {
  return (
    w.weightWiederholung + w.weightBericht + w.weightMitarbeit + w.weightPraktischeArbeit
  )
}

/** Whether a split is storable: each field in [0,100] and the four summing to 100. */
export function isWeightConfigValid(w: WeightConfig): boolean {
  const fields = [
    w.weightWiederholung,
    w.weightBericht,
    w.weightMitarbeit,
    w.weightPraktischeArbeit,
  ]
  if (fields.some(v => !Number.isFinite(v) || v < 0 || v > 100)) return false
  return fields.reduce((acc, v) => acc + v, 0) === 100
}
