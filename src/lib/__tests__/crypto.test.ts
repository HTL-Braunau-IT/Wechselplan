import { beforeAll, describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret } from '@/lib/crypto'

describe('crypto', () => {
  beforeAll(() => {
    process.env.NEXTAUTH_SECRET = 'test-secret-for-crypto-unit'
  })

  it('round-trips a secret', () => {
    const plain = 'sup3r-secret-pässwört!'
    const token = encryptSecret(plain)
    expect(token).not.toContain(plain)
    expect(decryptSecret(token)).toBe(plain)
  })

  it('produces a different ciphertext each time (random IV)', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'))
  })

  it('rejects a tampered token', () => {
    const token = encryptSecret('hello')
    const buf = Buffer.from(token, 'base64')
    const last = buf.length - 1
    buf[last] = (buf[last] ?? 0) ^ 0xff // flip a ciphertext bit
    expect(() => decryptSecret(buf.toString('base64'))).toThrow()
  })

  it('rejects a malformed (too short) token', () => {
    expect(() => decryptSecret(Buffer.from([1, 2, 3]).toString('base64'))).toThrow()
  })
})
