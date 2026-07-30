// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useKeyedDebounce } from '@/hooks/use-keyed-debounce'

describe('useKeyedDebounce', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('keeps one timer per key so a second edit cannot cancel the first', () => {
    const a = vi.fn()
    const b = vi.fn()
    const { result } = renderHook(() => useKeyedDebounce(500))

    act(() => {
      result.current.schedule('grade:1', a)
      result.current.schedule('grade:2', b)
      vi.advanceTimersByTime(500)
    })

    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('re-scheduling the same key replaces its timer', () => {
    const run = vi.fn()
    const { result } = renderHook(() => useKeyedDebounce(500))

    act(() => {
      result.current.schedule('grade:1', run)
      vi.advanceTimersByTime(300)
      result.current.schedule('grade:1', run)
      vi.advanceTimersByTime(300)
    })
    expect(run).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(200))
    expect(run).toHaveBeenCalledTimes(1)
  })

  /**
   * The page turns `pendingCount` into "Nicht gespeichert" and an unload
   * warning. A debounced *read* — the Sokrates status refresh queued after a
   * successful grade POST — writes nothing, so counting it meant every save
   * was followed by half a second of "unsaved" and a spurious unload prompt.
   */
  it('excludes non-persisting work from pendingCount', () => {
    const { result } = renderHook(() => useKeyedDebounce(500))

    act(() => {
      result.current.schedule('sokrates-refresh', vi.fn(), { persists: false })
    })
    expect(result.current.pendingCount).toBe(0)

    act(() => {
      result.current.schedule('grade:1', vi.fn())
    })
    expect(result.current.pendingCount).toBe(1)

    act(() => vi.advanceTimersByTime(500))
    expect(result.current.pendingCount).toBe(0)
  })

  /**
   * "Speichern" has to mean saved. Without a flush, a value typed into a
   * debounced field and followed straight away by the button was written by its
   * timer *after* the save had already gone out.
   */
  it('flushAll runs pending work immediately and clears the count', () => {
    const run = vi.fn()
    const { result } = renderHook(() => useKeyedDebounce(500))

    act(() => {
      result.current.schedule('sitzplatz:1', run)
      result.current.schedule('sitzplatz:2', run)
    })
    expect(run).not.toHaveBeenCalled()

    act(() => result.current.flushAll())
    expect(run).toHaveBeenCalledTimes(2)
    expect(result.current.pendingCount).toBe(0)

    // The timers are gone, so nothing fires a second time.
    act(() => vi.advanceTimersByTime(500))
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('cancelAll clears every timer and the count', () => {
    const run = vi.fn()
    const { result } = renderHook(() => useKeyedDebounce(500))

    act(() => {
      result.current.schedule('grade:1', run)
      result.current.schedule('grade:2', run)
    })
    expect(result.current.pendingCount).toBe(2)

    act(() => {
      result.current.cancelAll()
      vi.advanceTimersByTime(500)
    })
    expect(result.current.pendingCount).toBe(0)
    expect(run).not.toHaveBeenCalled()
  })
})
