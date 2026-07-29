'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { apiFetch, apiSend, errorMessageOf } from '@/lib/api-client'

/**
 * The preview -> select -> apply state machine shared by the directory sync
 * dialogs.
 *
 * Both dialogs had grown their own copy of this: the same stage union, the same
 * `Record<id, boolean>` selection buckets, the same two fetches, the same toast
 * and the same "which tab should open first" heuristic. Only the tables in the
 * middle actually differ.
 */

export type SyncStage = 'loading' | 'preview' | 'applying' | 'done' | 'error'

/** One selectable bucket, keyed by whatever identifies a row in it. */
export type SelectionBucket = Record<string, boolean>

export type SelectionState<TKeys extends string> = Record<TKeys, SelectionBucket>

export interface UseSyncPreviewOptions<TDiff, TSummary, TKeys extends string> {
  previewUrl: string
  applyUrl: string
  /** Everything is selected by default; this describes what "everything" is. */
  buildSelection: (diff: TDiff) => SelectionState<TKeys>
  /** Turns the current selection into the apply request body. */
  buildPayload: (selection: SelectionState<TKeys>, diff: TDiff) => unknown
  /** Human summary for the success toast. */
  describeSummary: (summary: TSummary) => string
  /** Called after a successful apply, e.g. to invalidate queries. */
  onCompleted?: () => void
  /** Load the preview when this becomes true, and reset when it goes false. */
  open: boolean
}

export interface SyncPreviewController<TDiff, TSummary, TKeys extends string> {
  stage: SyncStage
  diff: TDiff | null
  summary: TSummary | null
  error: string | null
  selection: SelectionState<TKeys>
  /** Toggle a single row. */
  toggle: (bucket: TKeys, key: string | number, checked: boolean) => void
  /** Select or clear a whole bucket at once. */
  setBucket: (bucket: TKeys, keys: Array<string | number>, checked: boolean) => void
  /** True when every key in the bucket is selected. */
  isBucketFull: (bucket: TKeys, keys: Array<string | number>) => boolean
  selectedCount: number
  reload: () => Promise<void>
  apply: () => Promise<void>
  /** Blocks closing mid-apply. */
  canClose: boolean
}

function countSelected(selection: Record<string, SelectionBucket>): number {
  return Object.values(selection).reduce(
    (total, bucket) => total + Object.values(bucket).filter(Boolean).length,
    0,
  )
}

export function useSyncPreview<TDiff, TSummary, TKeys extends string>(
  options: UseSyncPreviewOptions<TDiff, TSummary, TKeys>,
): SyncPreviewController<TDiff, TSummary, TKeys> {
  const {
    previewUrl,
    applyUrl,
    buildSelection,
    buildPayload,
    describeSummary,
    onCompleted,
    open,
  } = options

  const [stage, setStage] = useState<SyncStage>('loading')
  const [diff, setDiff] = useState<TDiff | null>(null)
  const [summary, setSummary] = useState<TSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] = useState<SelectionState<TKeys>>(
    {} as SelectionState<TKeys>,
  )

  const reload = useCallback(async () => {
    setStage('loading')
    setError(null)
    try {
      const data = await apiFetch<TDiff>(previewUrl, {
        method: 'POST',
        errorMessage: 'Vorschau fehlgeschlagen',
      })
      setDiff(data)
      setSelection(buildSelection(data))
      setStage('preview')
    } catch (err) {
      setError(errorMessageOf(err, 'Vorschau fehlgeschlagen'))
      setStage('error')
    }
  }, [previewUrl, buildSelection])

  useEffect(() => {
    if (!open) return
    setSummary(null)
    void reload()
  }, [open, reload])

  const apply = useCallback(async () => {
    if (!diff) return
    setStage('applying')
    setError(null)
    try {
      const result = await apiSend<TSummary>(applyUrl, 'POST', buildPayload(selection, diff), {
        errorMessage: 'Anwenden fehlgeschlagen',
      })
      setSummary(result)
      setStage('done')
      toast.success(describeSummary(result))
      onCompleted?.()
    } catch (err) {
      const message = errorMessageOf(err, 'Anwenden fehlgeschlagen')
      setError(message)
      setStage('error')
      toast.error(message)
    }
  }, [diff, applyUrl, buildPayload, selection, describeSummary, onCompleted])

  const toggle = useCallback((bucket: TKeys, key: string | number, checked: boolean) => {
    setSelection(prev => ({
      ...prev,
      [bucket]: { ...prev[bucket], [String(key)]: checked },
    }))
  }, [])

  const setBucket = useCallback(
    (bucket: TKeys, keys: Array<string | number>, checked: boolean) => {
      setSelection(prev => ({
        ...prev,
        [bucket]: {
          ...prev[bucket],
          ...Object.fromEntries(keys.map(key => [String(key), checked])),
        },
      }))
    },
    [],
  )

  const isBucketFull = useCallback(
    (bucket: TKeys, keys: Array<string | number>) =>
      keys.length > 0 && keys.every(key => selection[bucket]?.[String(key)] !== false),
    [selection],
  )

  const selectedCount = useMemo(() => countSelected(selection), [selection])

  return {
    stage,
    diff,
    summary,
    error,
    selection,
    toggle,
    setBucket,
    isBucketFull,
    selectedCount,
    reload,
    apply,
    canClose: stage !== 'applying',
  }
}

/** Marks every row in a bucket as selected. */
export function selectAll<T>(rows: T[], key: (row: T) => string | number): SelectionBucket {
  return Object.fromEntries(rows.map(row => [String(key(row)), true]))
}

/** Extracts the checked keys of a bucket, for the apply payload. */
export function checkedKeys(bucket: SelectionBucket | undefined): string[] {
  return Object.entries(bucket ?? {})
    .filter(([, checked]) => checked)
    .map(([key]) => key)
}

/** Same as {@link checkedKeys}, for buckets keyed by a numeric row id. */
export function checkedNumericKeys(bucket: SelectionBucket | undefined): number[] {
  return checkedKeys(bucket).map(Number)
}
