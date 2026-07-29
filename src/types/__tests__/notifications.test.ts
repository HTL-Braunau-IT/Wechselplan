import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isKnownNotificationType,
  NOTIFICATION_MESSAGE_KEYS,
  NOTIFICATION_TYPES,
} from '@/types/notifications'

/**
 * A notification is stored as a type plus params and only becomes a sentence
 * when the bell renders it. A type whose message is missing from the catalogue
 * therefore fails at read time, in production, months after it was written —
 * and to the one person who needed to see it. These tests move that failure to
 * CI.
 */

const LOCALES = ['de', 'en'] as const

function loadCatalogue(locale: string): Record<string, unknown> {
  const file = path.resolve(__dirname, '../../../public/locales', locale, 'common.json')
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    notifications?: Record<string, unknown>
  }
  return parsed.notifications ?? {}
}

/** i18next resolves a `count` message through its `_one`/`_other` suffixes. */
function expectedKeys(entry: { key: string; plural?: boolean }): string[] {
  const bare = entry.key.replace(/^notifications\./, '')
  return entry.plural ? [`${bare}_one`, `${bare}_other`] : [bare]
}

describe('notification message catalogue', () => {
  it.each(LOCALES)('%s has a message for every notification type', locale => {
    const catalogue = loadCatalogue(locale)
    const missing: string[] = []

    for (const type of NOTIFICATION_TYPES) {
      for (const entry of NOTIFICATION_MESSAGE_KEYS[type]) {
        for (const key of expectedKeys(entry)) {
          if (typeof catalogue[key] !== 'string') missing.push(`${type} → notifications.${key}`)
        }
      }
    }

    expect(missing).toEqual([])
  })

  it.each(LOCALES)('%s carries the bell chrome strings', locale => {
    const catalogue = loadCatalogue(locale)
    for (const key of ['title', 'empty', 'markRead', 'markAllRead']) {
      expect(typeof catalogue[key], `notifications.${key}`).toBe('string')
    }
  })

  it('interpolates the same placeholders in every language', () => {
    const placeholders = (value: string) =>
      [...value.matchAll(/\{\{(\w+)}}/g)].map(m => m[1]!).sort()
    const de = loadCatalogue('de')
    const en = loadCatalogue('en')

    for (const key of Object.keys(de)) {
      const german = de[key]
      const english = en[key]
      if (typeof german !== 'string' || typeof english !== 'string') continue
      expect(placeholders(english), `notifications.${key}`).toEqual(placeholders(german))
    }
  })
})

describe('isKnownNotificationType', () => {
  it('accepts every declared type', () => {
    for (const type of NOTIFICATION_TYPES) expect(isKnownNotificationType(type)).toBe(true)
  })

  it('rejects a type this bundle predates', () => {
    expect(isKnownNotificationType('something-invented-later')).toBe(false)
  })
})
