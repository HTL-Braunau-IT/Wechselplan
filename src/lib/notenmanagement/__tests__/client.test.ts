import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NmAuthRequiredError, NmError, formatNmError, nmRequest } from '../client'
import { clearToken, getStoredToken, storeToken } from '@/lib/notenmanagement-token'

vi.mock('@/lib/notenmanagement-token', () => ({
  getStoredToken: vi.fn(),
  storeToken: vi.fn(),
  clearToken: vi.fn(),
}))

const mockGetStoredToken = vi.mocked(getStoredToken)
const mockStoreToken = vi.mocked(storeToken)
const mockClearToken = vi.mocked(clearToken)

/** Queue one JSON response per expected fetch call. */
function mockFetchSequence(responses: Array<{ ok: boolean; body: unknown }>) {
  const fetchMock = vi.fn()
  for (const { ok, body } of responses) {
    fetchMock.mockResolvedValueOnce({
      ok,
      json: () => Promise.resolve(body),
    })
  }
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function bodyOf(fetchMock: ReturnType<typeof vi.fn>, call: number): Record<string, unknown> {
  const init = fetchMock.mock.calls[call]?.[1] as { body: string }
  return JSON.parse(init.body) as Record<string, unknown>
}

describe('nmRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetStoredToken.mockReturnValue(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the password when no token is stored', async () => {
    const fetchMock = mockFetchSequence([{ ok: true, body: { success: true } }])

    const result = await nmRequest('/api/x', { classId: 1 }, { username: 'Ada', password: 'pw' })

    expect(result).toEqual({ success: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(bodyOf(fetchMock, 0)).toEqual({
      classId: 1,
      username: 'ada',
      password: 'pw',
    })
  })

  it('normalises the username before sending it', async () => {
    const fetchMock = mockFetchSequence([{ ok: true, body: {} }])

    await nmRequest('/api/x', {}, { username: 'Ada.Lovelace@htl-braunau.at', password: 'pw' })

    expect(bodyOf(fetchMock, 0).username).toBe('ada.lovelace')
  })

  it('reuses a stored token belonging to the same user', async () => {
    mockGetStoredToken.mockReturnValue({
      token: 'tok',
      expiresAt: Date.now() + 60_000,
      username: 'ada',
    })
    const fetchMock = mockFetchSequence([{ ok: true, body: {} }])

    await nmRequest('/api/x', {}, { username: 'ada', password: 'pw' })

    const body = bodyOf(fetchMock, 0)
    expect(body.token).toBe('tok')
    expect(body.password).toBeUndefined()
  })

  it('ignores a stored token belonging to a different user', async () => {
    mockGetStoredToken.mockReturnValue({
      token: 'tok',
      expiresAt: Date.now() + 60_000,
      username: 'grace',
    })
    const fetchMock = mockFetchSequence([{ ok: true, body: {} }])

    await nmRequest('/api/x', {}, { username: 'ada', password: 'pw' })

    const body = bodyOf(fetchMock, 0)
    expect(body.token).toBeUndefined()
    expect(body.password).toBe('pw')
  })

  it('persists a token returned by the server', async () => {
    mockFetchSequence([{ ok: true, body: { token: 'fresh', tokenExpiresIn: 3600 } }])

    await nmRequest('/api/x', {}, { username: 'Ada', password: 'pw' })

    expect(mockStoreToken).toHaveBeenCalledWith('fresh', 3600, 'ada')
  })

  it('does not persist a partial token payload', async () => {
    mockFetchSequence([{ ok: true, body: { token: 'fresh' } }])

    await nmRequest('/api/x', {}, { username: 'ada', password: 'pw' })

    expect(mockStoreToken).not.toHaveBeenCalled()
  })

  it('clears a rejected token and retries once with the password', async () => {
    mockGetStoredToken.mockReturnValue({
      token: 'stale',
      expiresAt: Date.now() + 60_000,
      username: 'ada',
    })
    const fetchMock = mockFetchSequence([
      { ok: false, body: { error: 'Unauthorized' } },
      { ok: true, body: { success: true, token: 'fresh', tokenExpiresIn: 60 } },
    ])

    const result = await nmRequest('/api/x', { classId: 7 }, { username: 'ada', password: 'pw' })

    expect(result).toEqual({ success: true, token: 'fresh', tokenExpiresIn: 60 })
    expect(mockClearToken).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // The retry carries the same payload, swapping token for password.
    const retryBody = bodyOf(fetchMock, 1)
    expect(retryBody).toEqual({ classId: 7, username: 'ada', password: 'pw' })
    expect(mockStoreToken).toHaveBeenCalledWith('fresh', 60, 'ada')
  })

  it('throws NmAuthRequiredError when a token is rejected and no password is available', async () => {
    mockGetStoredToken.mockReturnValue({
      token: 'stale',
      expiresAt: Date.now() + 60_000,
      username: 'ada',
    })
    const fetchMock = mockFetchSequence([{ ok: false, body: { error: 'Unauthorized' } }])

    await expect(nmRequest('/api/x', {}, { username: 'ada' })).rejects.toBeInstanceOf(
      NmAuthRequiredError,
    )

    expect(mockClearToken).toHaveBeenCalledTimes(1)
    // No retry is possible without a password.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not retry when the password attempt itself fails', async () => {
    const fetchMock = mockFetchSequence([{ ok: false, body: { error: 'Bad credentials' } }])

    await expect(nmRequest('/api/x', {}, { username: 'ada', password: 'wrong' })).rejects.toThrow(
      'Bad credentials',
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mockClearToken).not.toHaveBeenCalled()
  })

  it('surfaces the upstream detail when the retry also fails', async () => {
    mockGetStoredToken.mockReturnValue({
      token: 'stale',
      expiresAt: Date.now() + 60_000,
      username: 'ada',
    })
    mockFetchSequence([
      { ok: false, body: { error: 'Unauthorized' } },
      {
        ok: false,
        body: { error: 'Transfer failed', details: { error_description: 'LF locked' } },
      },
    ])

    await expect(nmRequest('/api/x', {}, { username: 'ada', password: 'pw' })).rejects.toThrow(
      'Transfer failed — LF locked',
    )
  })

  it('prefers an explicitly supplied token over storage', async () => {
    mockGetStoredToken.mockReturnValue({
      token: 'stored',
      expiresAt: Date.now() + 60_000,
      username: 'ada',
    })
    const fetchMock = mockFetchSequence([{ ok: true, body: {} }])

    await nmRequest('/api/x', {}, { username: 'ada', token: 'explicit' })

    expect(bodyOf(fetchMock, 0).token).toBe('explicit')
    expect(mockGetStoredToken).not.toHaveBeenCalled()
  })

  it('attaches details to the thrown NmError', async () => {
    mockFetchSequence([{ ok: false, body: { error: 'Nope', details: { code: 42 } } }])

    const err = await nmRequest('/api/x', {}, { username: 'ada', password: 'pw' }).catch(
      (e: unknown) => e,
    )

    expect(err).toBeInstanceOf(NmError)
    expect((err as NmError).details).toEqual({ code: 42 })
  })
})

describe('formatNmError', () => {
  it('joins error and string detail', () => {
    expect(formatNmError({ error: 'Failed', details: 'upstream down' })).toBe(
      'Failed — upstream down',
    )
  })

  it('prefers error_description from an object detail', () => {
    expect(
      formatNmError({ error: 'Failed', details: { error_description: 'bad grant', error: 'x' } }),
    ).toBe('Failed — bad grant')
  })

  it('falls back to the nested error field', () => {
    expect(formatNmError({ error: 'Failed', details: { error: 'nested' } })).toBe('Failed — nested')
  })

  it('stringifies an unrecognised detail shape', () => {
    expect(formatNmError({ error: 'Failed', details: { a: 1 } })).toBe('Failed — {"a":1}')
  })

  it('returns the error alone when there is no detail', () => {
    expect(formatNmError({ error: 'Failed' })).toBe('Failed')
  })

  it('falls back to a default when the envelope is empty', () => {
    expect(formatNmError({})).toBe('Transfer failed')
  })
})
