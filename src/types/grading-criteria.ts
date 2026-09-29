import { z } from 'zod'

/**
 * Beurteilungskriterien — a teacher's grading criteria, shown to their students.
 *
 * The document is structured rather than free text so every teacher's sheet
 * renders the same way (and matches the PDF teachers used to hand out):
 *
 *   intro                         free text, URLs become links
 *   section.title                 "Mitarbeit"
 *     criterion.title             "Mitbringen der Arbeitsmaterialien"   (optional)
 *       criterion.points[]        "Werkstattmappe, Berichtsblätter"
 *   closing                       free text
 *
 * A criterion without a title renders its points directly under the section
 * heading (e.g. "Arbeitsplatzkontrolle" in the original sheet).
 */

const text = (max: number) => z.string().trim().max(max)

export const gradingCriterionSchema = z.object({
  title: text(200),
  points: z.array(text(1000)).max(40),
})

export const gradingSectionSchema = z.object({
  title: text(200),
  criteria: z.array(gradingCriterionSchema).max(40),
})

export const gradingCriteriaContentSchema = z.object({
  intro: text(4000).default(''),
  sections: z.array(gradingSectionSchema).max(40).default([]),
  closing: text(4000).default(''),
})

export type GradingCriterion = z.infer<typeof gradingCriterionSchema>
export type GradingSection = z.infer<typeof gradingSectionSchema>
export type GradingCriteriaContent = z.infer<typeof gradingCriteriaContentSchema>

/** Body of POST /api/grading-criteria and PUT /api/grading-criteria/[id]. */
export const gradingCriteriaInputSchema = z.object({
  title: text(200).min(1),
  subtitle: text(200).nullish(),
  content: gradingCriteriaContentSchema,
  isDefault: z.boolean().default(false),
  classIds: z.array(z.number().int().positive()).max(200).default([]),
})

export type GradingCriteriaInput = z.infer<typeof gradingCriteriaInputSchema>

/** The rendered document — what a student (or a share-link visitor) sees. */
export interface GradingCriteriaDocument {
  title: string
  subtitle: string | null
  content: GradingCriteriaContent
  teacherName: string
  updatedAt: string
}

/** One of the signed-in teacher's templates, as the editor lists it. */
export interface GradingCriteriaTemplate {
  id: number
  title: string
  subtitle: string | null
  content: GradingCriteriaContent
  isDefault: boolean
  shareToken: string | null
  classes: { id: number; name: string }[]
  updatedAt: string
}

/** GET /api/grading-criteria */
export interface GradingCriteriaListResponse {
  teacherName: string
  templates: GradingCriteriaTemplate[]
  /** Classes the teacher teaches this school year — the override picker's choices. */
  classes: { id: number; name: string }[]
}

/** One entry of GET /api/me/grading-criteria. */
export interface StudentGradingCriteria {
  teacherId: number
  teacherFirstName: string
  teacherLastName: string
  /** Subjects the teacher teaches the student, for context in the list. */
  subjects: string[]
  criteria: GradingCriteriaDocument
}

/** Reads a stored `content` blob leniently: malformed rows render as empty, never throw. */
export function parseGradingCriteriaContent(raw: unknown): GradingCriteriaContent {
  const parsed = gradingCriteriaContentSchema.safeParse(raw)
  return parsed.success ? parsed.data : { intro: '', sections: [], closing: '' }
}

export function emptyGradingCriteriaContent(): GradingCriteriaContent {
  return {
    intro: '',
    sections: [{ title: '', criteria: [{ title: '', points: [''] }] }],
    closing: '',
  }
}

/**
 * Starter content modelled on the workshop sheet teachers already hand out, so a
 * teacher can adapt rather than start from a blank page.
 */
export function exampleGradingCriteriaContent(): GradingCriteriaContent {
  return {
    intro:
      'Grundlage liefert die Leistungsbeurteilungsverordnung des Schulunterrichtsgesetzes.\nhttps://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10009375',
    sections: [
      {
        title: 'Mitarbeit',
        criteria: [
          {
            title: 'Mitbringen der Arbeitsmaterialien',
            points: [
              'Werkstattmappe, Berichtsblätter',
              'Lineal, Bleistift, Farbstifte, Taschenrechner, Messschieber',
            ],
          },
          {
            title: 'Mündliche Mitarbeit in der Stunde',
            points: [
              'aufmerksames Zuhören während Phasen der Stoffvermittlung',
              'aktives Teilnehmen im Unterricht (selbstständiges Melden, Beantworten der gestellten Fragen)',
              'Verständnisfragen beantworten können',
            ],
          },
          { title: 'Pünktlichkeit', points: ['Pünktliches Erscheinen im Unterricht'] },
        ],
      },
      {
        title: 'Berichte',
        criteria: [
          {
            title: 'Arbeitsberichte, Mitschrift',
            points: [
              'Saubere Mitschrift, keine Flugblätter',
              'Für jeden Tag bzw. Halbtag eine Berichtsblattvorlage verwenden',
              'Anführen der Tätigkeit, Arbeitsschritte, Werkzeuge, Materialien, Sicherheitsvorschriften, …',
            ],
          },
        ],
      },
      {
        title: 'Praktische Übungen, Werkstücke',
        criteria: [
          {
            title: 'Funktion',
            points: ['Funktionskontrolle der Übung (technische Fehler? Schlampigkeitsfehler?)'],
          },
          {
            title: 'Sauberkeit',
            points: ['Wie ordentlich wurde gearbeitet? Ist die Übersichtlichkeit gegeben?'],
          },
          { title: 'Tempo', points: ['In welchem Tempo wurde die Aufgabe erledigt?'] },
          {
            title: 'Selbstständigkeit',
            points: [
              'Wurde die Arbeit ohne fremde Hilfe erledigt? War Unterstützung notwendig?',
              'Wurden Fehler selbst erkannt bzw. wurden Fehler selbstständig behoben?',
            ],
          },
        ],
      },
      {
        title: 'Arbeitsplatzkontrolle',
        criteria: [
          {
            title: '',
            points: [
              'Zu Beginn und am Ende des Unterrichts wird der Arbeitsplatz (PC, Monitor, Tastatur, Maus, Werkzeuge, …) auf Beschädigungen und auf Vollständigkeit geprüft und gegebenenfalls beim Lehrer unverzüglich gemeldet.',
            ],
          },
        ],
      },
    ],
    closing:
      'Über die Plattform MS-Teams werden Arbeitsaufträge ausgegeben, die es sorgfältig, vollständig und termingerecht zu erledigen gilt.',
  }
}

/** Drops blank points/criteria/sections so an editor's empty rows are never stored. */
export function compactGradingCriteriaContent(
  content: GradingCriteriaContent,
): GradingCriteriaContent {
  return {
    intro: content.intro.trim(),
    closing: content.closing.trim(),
    sections: content.sections
      .map(section => ({
        title: section.title.trim(),
        criteria: section.criteria
          .map(c => ({
            title: c.title.trim(),
            points: c.points.map(p => p.trim()).filter(Boolean),
          }))
          .filter(c => c.title || c.points.length > 0),
      }))
      .filter(s => s.title || s.criteria.length > 0),
  }
}
