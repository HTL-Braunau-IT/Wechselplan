// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement, type ReactNode } from 'react'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const apiSend = vi.fn().mockResolvedValue({})

vi.mock('@/lib/api-client', () => ({
  apiSend: (...args: unknown[]) => apiSend(...args),
  apiFetch: vi.fn().mockResolvedValue([]),
}))

import { useAdminModelMutations } from '../use-admin-model'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return createElement(QueryClientProvider, { client }, children)
}

describe('useAdminModelMutations', () => {
  beforeEach(() => apiSend.mockClear())

  // Regression: update used to PUT to /api/admin/data?model=… with no id, and
  // the handler answers "Model and ID parameters are required" → every edit
  // (school years included) failed. The id must ride in the query string.
  it('update PUTs to the row addressed by id', async () => {
    const { result } = renderHook(() => useAdminModelMutations('schoolYear'), { wrapper })

    await act(async () => {
      await result.current.update({ id: 7, label: '2025/2026' })
    })

    expect(apiSend).toHaveBeenCalledTimes(1)
    const [url, method] = apiSend.mock.calls[0] as [string, string]
    expect(method).toBe('PUT')
    expect(url).toContain('model=schoolYear')
    expect(url).toContain('id=7')
  })

  it('remove DELETEs the row addressed by id', async () => {
    const { result } = renderHook(() => useAdminModelMutations('schoolYear'), { wrapper })

    await act(async () => {
      await result.current.remove(7)
    })

    const [url, method] = apiSend.mock.calls[0] as [string, string]
    expect(method).toBe('DELETE')
    expect(url).toContain('id=7')
  })
})
