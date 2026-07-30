import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

/**
 * Symmetric encryption for secrets stored at rest (e.g. the Notenmanagement
 * service-account password in {@link NotenmanagementSettings}).
 *
 * The key is derived from `NEXTAUTH_SECRET` — already required for auth and
 * stable across restarts — via scrypt with a fixed application salt. Rotating
 * `NEXTAUTH_SECRET` therefore invalidates stored secrets by design; an admin
 * simply re-enters them (the same trade-off `src/lib/auth.ts` already documents
 * for session tokens).
 *
 * Format: base64 of `iv(12) | authTag(16) | ciphertext`, so a value is fully
 * self-describing and needs no side-channel to decrypt.
 */

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16
const KEY_SALT = 'wechselplan.secret.v1'

let cachedKey: Buffer | null = null

function getKey(): Buffer {
  if (cachedKey) return cachedKey
  const secret = process.env.NEXTAUTH_SECRET?.trim()
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is not set; cannot encrypt/decrypt stored secrets.')
  }
  cachedKey = scryptSync(secret, KEY_SALT, 32)
  return cachedKey
}

/** Encrypts a UTF-8 string, returning a self-describing base64 token. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

/** Reverses {@link encryptSecret}. Throws if the token is malformed or tampered. */
export function decryptSecret(token: string): string {
  const buf = Buffer.from(token, 'base64')
  if (buf.length < IV_BYTES + TAG_BYTES) {
    throw new Error('Encrypted secret is malformed (too short).')
  }
  const iv = buf.subarray(0, IV_BYTES)
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
  const data = buf.subarray(IV_BYTES + TAG_BYTES)
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}
