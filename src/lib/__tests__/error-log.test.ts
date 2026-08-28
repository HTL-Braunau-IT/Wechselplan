import { describe, test, expect, vi } from 'vitest'

// vitest.setup.ts globally stubs the sink to a no-op; this file tests the real
// redaction, so opt back into the actual module.
vi.unmock('@/lib/error-log')

const { redactContext } = await vi.importActual<typeof import('../error-log')>('../error-log')

describe('redactContext', () => {
  test('redacts sensitive top-level keys', () => {
    const out = redactContext({ password: 'hunter2', token: 'abc', classId: 5 })
    expect(out).toEqual({ password: '[redacted]', token: '[redacted]', classId: 5 })
  })

  test('redacts sensitive keys nested inside an object (e.g. requestData)', () => {
    const out = redactContext({
      requestData: { classId: 3, password: 'secret', token: 'bearer-xyz', username: 'a.b' },
    })
    expect(out).toEqual({
      requestData: { classId: 3, password: '[redacted]', token: '[redacted]', username: 'a.b' },
    })
  })

  test('redacts sensitive keys nested inside arrays', () => {
    const out = redactContext({
      requestData: { finalGrades: [{ studentId: 1, grade: 5 }] },
    })
    expect(out).toEqual({
      requestData: { finalGrades: [{ studentId: 1, grade: '[redacted]' }] },
    })
  })

  test('caps long strings at any depth', () => {
    const long = 'x'.repeat(600)
    const out = redactContext({ nested: { note: long } }) as {
      nested: { note: string }
    }
    expect(out.nested.note).toHaveLength(501) // 500 chars + ellipsis
    expect(out.nested.note.endsWith('…')).toBe(true)
  })

  test('bounds recursion depth', () => {
    // Deeper than MAX_REDACT_DEPTH — the tail is truncated rather than walked.
    const deep = { a: { b: { c: { d: { e: { f: { g: 'deep' } } } } } } }
    const out = JSON.stringify(redactContext(deep))
    expect(out).toContain('[truncated]')
  })

  test('returns null for empty context', () => {
    expect(redactContext(null)).toBeNull()
    expect(redactContext(undefined)).toBeNull()
  })
})
