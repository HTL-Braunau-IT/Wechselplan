import { groupPalette, neutralGroup, type GroupColor } from '@/lib/pdf/palette'
import { UNGROUPED_SECTION_ID } from './types'

/**
 * The print colour for a roster section, so the on-screen preview and the group
 * chips match the generated PDF exactly. Section id 0 (unassigned) is neutral.
 */
export function sectionColor(id: number): GroupColor {
  if (id === UNGROUPED_SECTION_ID || id < 1) return neutralGroup
  return groupPalette[(id - 1) % groupPalette.length] ?? neutralGroup
}

export function sectionTitle(id: number): string {
  return id === UNGROUPED_SECTION_ID ? 'Ohne Gruppe' : `Gruppe ${id}`
}
