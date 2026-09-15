import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// jose is mocked so verification does not hit the network JWKS.
const jwtVerify = vi.fn()
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'jwks'),
  jwtVerify: (...args: unknown[]) => jwtVerify(...args),
}))

import { getBearerToken, isBearerAuthEnabled, verifyBearerToken } from '@/lib/bearer-auth'

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  jwtVerify.mockReset()
  process.env.ENTRA_TENANT_ID = 'tenant-123'
  process.env.ENTRA_CLIENT_ID = 'client-abc'
  process.env.AUTH_BEARER_ENABLED = 'true'
  delete process.env.ENTRA_API_AUDIENCE
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('getBearerToken', () => {
  it('extracts the token from a Bearer header, case-insensitively', () => {
    expect(getBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi')
    expect(getBearerToken('bearer  xyz')).toBe('xyz')
  })

  it('returns null for a missing or non-Bearer header', () => {
    expect(getBearerToken(null)).toBeNull()
    expect(getBearerToken('')).toBeNull()
    expect(getBearerToken('Basic abc')).toBeNull()
    expect(getBearerToken('Bearer ')).toBeNull()
  })
})

describe('isBearerAuthEnabled', () => {
  it('is on only when AUTH_BEARER_ENABLED=true and a tenant is set', () => {
    expect(isBearerAuthEnabled()).toBe(true)

    process.env.AUTH_BEARER_ENABLED = 'false'
    expect(isBearerAuthEnabled()).toBe(false)

    process.env.AUTH_BEARER_ENABLED = 'true'
    delete process.env.ENTRA_TENANT_ID
    expect(isBearerAuthEnabled()).toBe(false)
  })
})

describe('verifyBearerToken', () => {
  it('returns null when Bearer auth is disabled without verifying', async () => {
    process.env.AUTH_BEARER_ENABLED = 'false'
    expect(await verifyBearerToken('some.token')).toBeNull()
    expect(jwtVerify).not.toHaveBeenCalled()
  })

  it('returns the claims for a valid token carrying an oid', async () => {
    jwtVerify.mockResolvedValue({ payload: { oid: 'oid-1', name: 'Anna Müller' } })
    const claims = await verifyBearerToken('good.token')
    expect(claims?.oid).toBe('oid-1')
    // Verified against tenant issuer + the client id (and its api:// URI) audience.
    expect(jwtVerify).toHaveBeenCalledWith('good.token', 'jwks', {
      issuer: 'https://login.microsoftonline.com/tenant-123/v2.0',
      audience: ['client-abc', 'api://client-abc'],
    })
  })

  it('honours ENTRA_API_AUDIENCE override', async () => {
    process.env.ENTRA_API_AUDIENCE = 'api://custom-api'
    jwtVerify.mockResolvedValue({ payload: { oid: 'oid-1' } })
    await verifyBearerToken('good.token')
    expect(jwtVerify).toHaveBeenCalledWith(
      'good.token',
      'jwks',
      expect.objectContaining({ audience: ['api://custom-api'] }),
    )
  })

  it('rejects a token without an oid', async () => {
    jwtVerify.mockResolvedValue({ payload: { sub: 'no-oid' } })
    expect(await verifyBearerToken('token')).toBeNull()
  })

  it('returns null (never throws) when verification fails', async () => {
    jwtVerify.mockRejectedValue(new Error('bad signature'))
    expect(await verifyBearerToken('token')).toBeNull()
  })
})
