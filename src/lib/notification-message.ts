import deCommon from '../../public/locales/de/common.json'
import {
  isKnownNotificationType,
  NOTIFICATION_MESSAGE_KEYS,
  type NotificationType,
} from '@/types/notifications'

/**
 * Renders a stored notification (type + params) to a German sentence, server
 * side, for the e-mail digest (issue #96).
 *
 * The bell renders the same rows in the browser through i18next; the digest is
 * sent from a cron with no request and no i18n instance, so it reads the German
 * catalogue directly. It reuses {@link NOTIFICATION_MESSAGE_KEYS} to choose the
 * key, so the two renderers cannot drift on which key a type maps to. German is
 * hard-wired: a digest has no reader locale to consult, and the school is
 * German-speaking.
 */

// The `notifications` block of the German catalogue, flattened to a lookup.
const CATALOGUE = deCommon.notifications as Record<string, string>

const semesterLabel = (semester: unknown): string =>
  semester === 'first' ? '1. Semester' : semester === 'second' ? '2. Semester' : String(semester)

/** Fills `{{name}}` placeholders from a values bag. */
function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) =>
    key in values ? String(values[key]) : `{{${key}}}`,
  )
}

/** The catalogue key (from the notifications block) for one type + params. */
function resolveKey(type: NotificationType, params: Record<string, unknown>): string | null {
  // Widen the per-type tuple union to a uniform shape so `entries[1]`/`.plural`
  // are addressable without the tuple's heterogeneous element types fighting us.
  const entries = NOTIFICATION_MESSAGE_KEYS[type] as readonly { key: string; plural?: boolean }[]
  // Types whose wording depends on a param list more than one key; pick by scope
  // (lock/unlock) exactly as the bell does. Everything else has a single key.
  let entry = entries[0]
  if ((type === 'sokrates-locked' || type === 'sokrates-unlocked') && params.scope !== 'all') {
    entry = entries[1] ?? entries[0]
  }
  if (!entry) return null

  // Strip the `notifications.` prefix used in the message-key registry: this
  // module already looks inside the notifications block.
  const bareKey = entry.key.replace(/^notifications\./, '')
  if (entry.plural) {
    const count = typeof params.count === 'number' ? params.count : 0
    const suffixed = `${bareKey}${count === 1 ? '_one' : '_other'}`
    return suffixed in CATALOGUE ? suffixed : bareKey
  }
  return bareKey
}

/**
 * @returns the rendered German line, or null for a type this bundle does not
 * know (a row written by a newer deployment) — the digest simply skips those.
 */
export function renderNotificationLine(type: string, rawParams: unknown): string | null {
  if (!isKnownNotificationType(type)) return null
  const params = (rawParams ?? {}) as Record<string, unknown>

  const key = resolveKey(type, params)
  if (!key) return null
  const template = CATALOGUE[key]
  if (!template) return null

  const values: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'number') values[k] = v
    else if (typeof v === 'string') values[k] = k === 'semester' ? semesterLabel(v) : v
  }

  return interpolate(template, values)
}
