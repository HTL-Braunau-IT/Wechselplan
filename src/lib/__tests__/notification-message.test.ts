import { describe, expect, it } from 'vitest'
import { renderNotificationLine } from '@/lib/notification-message'

describe('renderNotificationLine', () => {
  it('renders a singular count line', () => {
    expect(renderNotificationLine('grades-entered', { className: '1AHIT', count: 1 })).toBe(
      '1 Note in 1AHIT eingetragen',
    )
  })

  it('renders a plural count line', () => {
    expect(renderNotificationLine('grades-entered', { className: '1AHIT', count: 3 })).toBe(
      '3 Noten in 1AHIT eingetragen',
    )
  })

  it('maps the semester code to a German label', () => {
    expect(
      renderNotificationLine('sokrates-change', {
        className: '1AHIT',
        semester: 'first',
        count: 2,
      }),
    ).toBe('2 Notenänderungen in 1AHIT (1. Semester) nach der Sokrates-Übertragung')
  })

  it('picks the whole-class wording for a lock covering everyone', () => {
    expect(
      renderNotificationLine('sokrates-locked', {
        className: '1AHIT',
        semester: 'second',
        scope: 'all',
      }),
    ).toBe('Alle Noten in 1AHIT (2. Semester) sind gesperrt')
  })

  it('picks the own-column wording for a teacher-scoped lock', () => {
    expect(
      renderNotificationLine('sokrates-locked', {
        className: '1AHIT',
        semester: 'first',
        scope: 'teacher',
      }),
    ).toBe('Deine Noten in 1AHIT (1. Semester) sind gesperrt')
  })

  it('renders the new student-change line', () => {
    expect(renderNotificationLine('schedule-students-changed', { className: '2BHIT' })).toBe(
      'Schüleränderung in 2BHIT (Ein-/Austritt oder Gruppenwechsel)',
    )
  })

  it('renders the acknowledge-back line with a plural count', () => {
    expect(
      renderNotificationLine('sokrates-change-acknowledged', {
        className: '1AHIT',
        semester: 'first',
        count: 2,
      }),
    ).toBe('Klassenvorstand hat 2 Notenänderungen in 1AHIT (1. Semester) bestätigt')
  })

  it('returns null for a type this bundle does not know', () => {
    expect(renderNotificationLine('some-future-type', { className: 'X' })).toBeNull()
  })
})
