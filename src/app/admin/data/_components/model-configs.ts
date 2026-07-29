import type { Column } from './data-table'

/**
 * Column definitions for the admin CRUD tabs.
 *
 * Keeping them together makes drift visible: before this file, `rooms` marked
 * every column `sortable` while the otherwise identical `subjects` table marked
 * none, purely because one copy had been edited and the other had not.
 */

const ID: Column = { key: 'id', label: 'ID', type: 'number', readonly: true, sortable: true }

/** createdAt/updatedAt, present on every model. */
const TIMESTAMPS: Column[] = [
  { key: 'createdAt', label: 'Erstellt am', type: 'date', readonly: true, sortable: true },
  { key: 'updatedAt', label: 'Aktualisiert am', type: 'date', readonly: true, sortable: true },
]

/**
 * Directory-sync provenance columns, shared by the Student, Teacher and Class
 * tables. All three carry the same lifecycle fields, and all three used to
 * declare them separately with slightly different labels.
 */
export const SYNC_COLUMNS: Column[] = [
  {
    key: 'externalId',
    label: 'Entra-Objekt-ID',
    type: 'text',
    readonly: true,
    sortable: true,
  },
  { key: 'externalSource', label: 'Quelle', type: 'text', readonly: true, sortable: true },
  {
    key: 'lastSyncedAt',
    label: 'Zuletzt synchronisiert',
    type: 'date',
    readonly: true,
    sortable: true,
  },
]

export const TIMESTAMP_COLUMNS = TIMESTAMPS

export interface ModelConfig {
  /** Prisma model name as accepted by /api/admin/data. */
  model: string
  /** Human-facing label used in dialog titles and prompts. */
  label: string
  columns: Column[]
}

export const MODEL_CONFIGS = {
  subjects: {
    model: 'subject',
    label: 'Fach',
    columns: [
      ID,
      { key: 'name', label: 'Name', type: 'text', required: true, sortable: true },
      { key: 'description', label: 'Beschreibung', type: 'textarea', sortable: true },
      ...TIMESTAMPS,
    ],
  },
  rooms: {
    model: 'room',
    label: 'Raum',
    columns: [
      ID,
      { key: 'name', label: 'Name', type: 'text', required: true, sortable: true },
      { key: 'capacity', label: 'Kapazität', type: 'number', sortable: true },
      { key: 'description', label: 'Beschreibung', type: 'textarea', sortable: true },
      ...TIMESTAMPS,
    ],
  },
  'learning-contents': {
    model: 'learningContent',
    label: 'Lehrinhalt',
    columns: [
      ID,
      { key: 'name', label: 'Name', type: 'text', required: true, sortable: true },
      { key: 'description', label: 'Beschreibung', type: 'textarea', sortable: true },
      ...TIMESTAMPS,
    ],
  },
  roles: {
    model: 'role',
    label: 'Rolle',
    columns: [
      ID,
      { key: 'name', label: 'Name', type: 'text', required: true, sortable: true },
      { key: 'description', label: 'Beschreibung', type: 'textarea', sortable: true },
      ...TIMESTAMPS,
    ],
  },
  'group-assignments': {
    model: 'groupAssignment',
    label: 'Gruppenzuordnung',
    columns: [
      ID,
      { key: 'groupId', label: 'Gruppen-ID', type: 'number', required: true, sortable: true },
      { key: 'class', label: 'Klasse', type: 'text', required: true, sortable: true },
      ...TIMESTAMPS,
    ],
  },
  'school-holidays': {
    model: 'schoolHoliday',
    label: 'Schulferien',
    columns: [
      ID,
      { key: 'name', label: 'Name', type: 'text', required: true, sortable: true },
      { key: 'startDate', label: 'Beginn', type: 'date', required: true, sortable: true },
      { key: 'endDate', label: 'Ende', type: 'date', required: true, sortable: true },
      ...TIMESTAMPS,
    ],
  },
  'school-years': {
    model: 'schoolYear',
    label: 'Schuljahr',
    columns: [
      ID,
      { key: 'label', label: 'Bezeichnung', type: 'text', required: true, sortable: true },
      { key: 'startDate', label: 'Beginn', type: 'date', required: true, sortable: true },
      { key: 'endDate', label: 'Ende', type: 'date', required: true, sortable: true },
      {
        key: 'semesterChangeDate',
        label: 'Semesterwechsel',
        type: 'date',
        required: true,
        sortable: true,
      },
      { key: 'isCurrent', label: 'Aktuell', type: 'boolean', sortable: true },
      ...TIMESTAMPS,
    ],
  },
  'schedule-times': {
    model: 'scheduleTime',
    label: 'Unterrichtszeit',
    columns: [
      ID,
      { key: 'startTime', label: 'Beginn', type: 'text', required: true, sortable: true },
      { key: 'endTime', label: 'Ende', type: 'text', required: true, sortable: true },
      { key: 'hours', label: 'Stunden', type: 'number', required: true, sortable: true },
      { key: 'period', label: 'Zeitraum', type: 'text', required: true, sortable: true },
      ...TIMESTAMPS,
    ],
  },
  'break-times': {
    model: 'breakTime',
    label: 'Pausenzeit',
    columns: [
      ID,
      { key: 'name', label: 'Name', type: 'text', required: true, sortable: true },
      { key: 'startTime', label: 'Beginn', type: 'text', required: true, sortable: true },
      { key: 'endTime', label: 'Ende', type: 'text', required: true, sortable: true },
      { key: 'period', label: 'Zeitraum', type: 'text', required: true, sortable: true },
      ...TIMESTAMPS,
    ],
  },
  'teacher-rotations': {
    model: 'teacherRotation',
    label: 'Lehrkraftrotation',
    columns: [
      ID,
      { key: 'classId', label: 'Klassen-ID', type: 'number', required: true, sortable: true },
      { key: 'groupId', label: 'Gruppen-ID', type: 'number', required: true, sortable: true },
      { key: 'teacherId', label: 'Lehrkraft-ID', type: 'number', required: true, sortable: true },
      { key: 'turnId', label: 'Turnus-ID', type: 'text', required: true, sortable: true },
      { key: 'period', label: 'Zeitraum', type: 'text', required: true, sortable: true },
      ...TIMESTAMPS,
    ],
  },
  'schedule-pdfs': {
    model: 'schedulePDF',
    label: 'Stundenplan-PDF',
    columns: [
      { key: 'id', label: 'ID', type: 'text', readonly: true, sortable: true },
      { key: 'classId', label: 'Klassen-ID', type: 'text', required: true, sortable: true },
      ...TIMESTAMPS,
    ],
  },
  'support-messages': {
    model: 'supportMessage',
    label: 'Support-Nachricht',
    columns: [
      ID,
      { key: 'name', label: 'Name', type: 'text', required: true, sortable: true },
      { key: 'message', label: 'Nachricht', type: 'textarea', required: true },
      { key: 'currentUri', label: 'Seite', type: 'text', sortable: true },
      ...TIMESTAMPS,
    ],
  },
} as const satisfies Record<string, ModelConfig>

export type ModelConfigSlug = keyof typeof MODEL_CONFIGS

export function getModelConfig(slug: string): ModelConfig | null {
  return (MODEL_CONFIGS as Record<string, ModelConfig>)[slug] ?? null
}
