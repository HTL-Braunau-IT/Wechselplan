import { createElement } from 'react'
import { renderPdfToBuffer } from './pdf/render'
import WechselplanDocument, { type WechselplanData } from '@/components/pdf/WechselplanDocument'
import NotensammlerDocument, { type NotensammlerData } from '@/components/pdf/NotensammlerDocument'
import NotensammlerAllClassesDocument, {
  type NotensammlerAllClassesClassData,
  type NotensammlerAllClassesData,
} from '@/components/pdf/NotensammlerAllClassesDocument'

export type { NotensammlerAllClassesClassData, NotensammlerAllClassesData }

/**
 * Renders the rotation plan for one class: group rosters, the AM/PM teacher
 * assignments and which group each teacher supervises per turnus.
 */
export async function generateSchedulePDF(data: WechselplanData): Promise<Buffer> {
  return renderPdfToBuffer(createElement(WechselplanDocument, { data }))
}

/** Renders the per-class grade sheet (all teachers, both semesters). */
export async function generateNotensammlerPDF(data: NotensammlerData): Promise<Buffer> {
  return renderPdfToBuffer(createElement(NotensammlerDocument, { data }))
}

/** Renders one teacher's own marks across every class they teach. */
export async function generateNotensammlerAllClassesPDF(
  data: NotensammlerAllClassesData,
): Promise<Buffer> {
  return renderPdfToBuffer(createElement(NotensammlerAllClassesDocument, { data }))
}
